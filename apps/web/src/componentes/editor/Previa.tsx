"use client";

import { Maximize, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import { type Clipe, type Faixa, fimDoClipe, type Projeto, tempoNaMidia } from "@/lib/projeto/modelo";
import { formatarTimecode, type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

import { razao } from "./proporcoes";

type Props = {
  projeto: Projeto;
  midias: ReadonlyMap<string, Midia>;
  tempo: Tick;
  tocando: boolean;
  aoAlternar: () => void;
  className?: string;
};

/** Diferença, em segundos, entre o vídeo e o relógio do editor a partir da qual o vídeo é reposicionado. */
const DESVIO_MAXIMO = 0.3;
/** O próximo clipe da faixa começa a carregar quando falta isto para ele entrar. */
const ANTECEDENCIA = 2 * TICKS_POR_SEGUNDO;

/** Mede a área livre e calcula o maior quadro na proporção do projeto que cabe nela. */
function useQuadro(proporcao: Projeto["proporcao"]) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 });

  useEffect(() => {
    const elemento = areaRef.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => {
      const { width, height } = entrada.contentRect;
      const largura = Math.min(width, height * razao(proporcao));
      setTamanho({ largura: Math.floor(largura), altura: Math.floor(largura / razao(proporcao)) });
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [proporcao]);

  return { areaRef, tamanho };
}

type Item = { chave: string; clipe: Clipe; faixa: Faixa; midia: Midia; ativo: boolean };

/**
 * Clipes que precisam de um elemento agora: o que está sob o cursor e o próximo da mesma faixa, para
 * ele já estar carregado quando entrar. A chave é faixa + mídia: depois de dividir um clipe, as duas
 * metades usam o mesmo elemento e o vídeo segue sem engasgar.
 */
function itensNoTempo(faixas: Faixa[], midias: ReadonlyMap<string, Midia>, tempo: Tick): Item[] {
  const itens: Item[] = [];
  for (const faixa of faixas) {
    const chaves = new Set<string>();
    const atual = faixa.clipes.find((clipe) => clipe.inicio <= tempo && tempo < fimDoClipe(clipe));
    const proximo = faixa.clipes.find((clipe) => clipe.inicio > tempo && clipe.inicio - tempo <= ANTECEDENCIA && clipe.midia_id !== atual?.midia_id);
    for (const [clipe, ativo] of [
      [atual, true],
      [proximo, false],
    ] as const) {
      const midia = clipe ? midias.get(clipe.midia_id) : undefined;
      if (!clipe || midia?.status !== "pronta") continue;
      const chave = `${faixa.id}:${clipe.midia_id}`;
      if (chaves.has(chave)) continue;
      chaves.add(chave);
      itens.push({ chave, clipe, faixa, midia, ativo });
    }
  }
  return itens;
}

export function Previa({ projeto, midias, tempo, tocando, aoAlternar, className = "" }: Props) {
  const { areaRef, tamanho } = useQuadro(projeto.proporcao);
  const quadroRef = useRef<HTMLDivElement>(null);

  // A primeira faixa da lista é a de cima; na tela ela tem que ser desenhada por último
  const visuais = itensNoTempo(
    projeto.faixas.filter((faixa) => faixa.tipo !== "audio" && !faixa.oculta).reverse(),
    midias,
    tempo,
  );
  const sons = itensNoTempo(
    projeto.faixas.filter((faixa) => faixa.tipo === "audio"),
    midias,
    tempo,
  );
  const vazio = projeto.faixas.every((faixa) => faixa.clipes.length === 0);

  return (
    <section aria-label="Prévia" className={`flex min-h-0 min-w-0 flex-col bg-fundo ${className}`}>
      <div ref={areaRef} className="relative min-h-0 flex-1 p-4">
        <div className="absolute inset-4 flex items-center justify-center">
          <div
            ref={quadroRef}
            className="relative flex items-center justify-center overflow-hidden shadow-lg shadow-black/40"
            style={{ width: tamanho.largura, height: tamanho.altura, backgroundColor: projeto.fundo.cor }}
          >
            {visuais.map((item) => (
              <ElementoDoClipe key={item.chave} item={item} tempo={tempo} tocando={tocando} tipo="video" />
            ))}
            {sons.map((item) => (
              <ElementoDoClipe key={item.chave} item={item} tempo={tempo} tocando={tocando} tipo="audio" />
            ))}
            {vazio ? (
              <p className="max-w-[80%] text-center text-xs text-suave">Arraste mídias da biblioteca para a linha do tempo para ver aqui.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex h-11 shrink-0 items-center gap-3 border-t border-borda px-3">
        <span className="w-40 text-xs tabular-nums text-suave">
          <span className="text-texto">{formatarTimecode(tempo, projeto.taxa)}</span> / {formatarTimecode(projeto.duracao, projeto.taxa)}
        </span>
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            className="botao-icone size-9"
            disabled={vazio}
            onClick={aoAlternar}
            aria-label={tocando ? "Pausar" : "Reproduzir"}
            title={tocando ? "Pausar (espaço)" : "Reproduzir (espaço)"}
          >
            {tocando ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
          </button>
        </div>
        <div className="flex w-40 justify-end">
          <button
            type="button"
            className="botao-icone"
            onClick={() => void quadroRef.current?.requestFullscreen()}
            aria-label="Tela cheia"
            title="Tela cheia"
          >
            <Maximize className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}

/** Um vídeo ou áudio que segue o relógio do editor. */
function ElementoDoClipe({ item, tempo, tocando, tipo }: { item: Item; tempo: Tick; tocando: boolean; tipo: "video" | "audio" }) {
  const elementoRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const { clipe, faixa, midia, ativo } = item;
  const alvo = (ativo ? tempoNaMidia(clipe, tempo) : clipe.entrada) / TICKS_POR_SEGUNDO;
  const tocar = ativo && tocando;

  useEffect(() => {
    const elemento = elementoRef.current;
    if (!elemento) return;
    elemento.muted = faixa.muda || !midia.audio;
    elemento.volume = Math.min(1, Math.max(0, clipe.volume));
    elemento.playbackRate = clipe.velocidade;
    const desvio = Math.abs(elemento.currentTime - alvo);
    if (tocar) {
      if (elemento.paused) {
        if (desvio > 0.05) elemento.currentTime = alvo;
        elemento.play().catch(() => {});
      } else if (!elemento.seeking && elemento.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && desvio > DESVIO_MAXIMO * clipe.velocidade) {
        elemento.currentTime = alvo;
      }
    } else {
      if (!elemento.paused) elemento.pause();
      if (desvio > 0.01) elemento.currentTime = alvo;
    }
  }, [alvo, tocar, faixa.muda, midia.audio, clipe.volume, clipe.velocidade]);

  if (tipo === "audio") {
    return <audio ref={elementoRef} src={arquivoDaMidia(midia.id, "proxy.m4a")} preload="auto" />;
  }
  return (
    <video
      ref={elementoRef}
      src={arquivoDaMidia(midia.id, midia.arquivos.includes("proxy.mp4") ? "proxy.mp4" : "proxy.m4a")}
      className={`absolute inset-0 size-full object-contain ${ativo ? "" : "invisible"}`}
      playsInline
      preload="auto"
    />
  );
}
