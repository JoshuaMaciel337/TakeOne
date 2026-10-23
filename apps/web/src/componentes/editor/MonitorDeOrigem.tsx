"use client";

import { ArrowDownToLine, Film, Pause, Play, Replace, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import { formatarTimecodeLongo, segundosParaTicks, type Taxa, type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

/** A duração de uma imagem na fonte (ela não tem fim): a mesma com que entra na linha do tempo. */
export const DURACAO_DA_IMAGEM_NA_FONTE = 5 * TICKS_POR_SEGUNDO;

export function duracaoNaFonte(midia: Midia): Tick {
  return midia.imagem || !midia.duracao ? DURACAO_DA_IMAGEM_NA_FONTE : segundosParaTicks(midia.duracao);
}

type Props = {
  midia: Midia | null;
  taxa: Taxa;
  entrada: Tick | null;
  saida: Tick | null;
  aoMarcar: (qual: "entrada" | "saida", t: Tick | null) => void;
  /** Inserir (,) ou sobrescrever (.) o trecho entre a entrada e a saída no cursor da linha do tempo. */
  aoPor: (modo: "inserir" | "sobrescrever") => void;
};

/**
 * O monitor de origem (Fonte), como nos editores de vídeo profissionais: a mídia escolhida no painel Projeto (duplo
 * clique) toca aqui, com a entrada e a saída dela, e Inserir ou Sobrescrever põem esse trecho no cursor da linha do
 * tempo. Com o foco no monitor, I, O, espaço, as setas, a vírgula e o ponto valem para ele.
 */
export function MonitorDeOrigem({ midia, taxa, entrada, saida, aoMarcar, aoPor }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [agora, setAgora] = useState(0);
  const [tocando, setTocando] = useState(false);
  const quadro = (TICKS_POR_SEGUNDO * taxa.den) / taxa.num;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !tocando) return;
    let pedido = 0;
    const andar = () => {
      setAgora(segundosParaTicks(video.currentTime));
      pedido = requestAnimationFrame(andar);
    };
    pedido = requestAnimationFrame(andar);
    return () => cancelAnimationFrame(pedido);
  }, [tocando]);

  if (!midia) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Film className="size-6 text-suave" aria-hidden />
        <p className="text-xs text-suave">Dê dois cliques numa mídia do painel Projeto para vê-la aqui, marcar a entrada e a saída e pôr o trecho na linha do tempo.</p>
      </div>
    );
  }
  const duracao = duracaoNaFonte(midia);
  const imagem = Boolean(midia.imagem);
  const so_som = !midia.video;
  const arquivo = imagem ? "proxy.webp" : midia.arquivos.includes("proxy.mp4") ? "proxy.mp4" : "proxy.m4a";
  const ir = (t: Tick) => {
    const alvo = Math.min(Math.max(0, t), duracao);
    setAgora(alvo);
    if (videoRef.current) videoRef.current.currentTime = alvo / TICKS_POR_SEGUNDO;
  };
  const alternar = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setTocando(true);
    } else {
      video.pause();
      setTocando(false);
    }
  };
  const de = entrada ?? 0;
  const ate = saida ?? duracao;
  const fracao = (t: Tick) => `${(Math.min(Math.max(t / duracao, 0), 1) * 100).toFixed(3)}%`;

  return (
    <div
      className="flex h-full min-h-0 flex-col outline-none focus-visible:ring-1 focus-visible:ring-codigo"
      tabIndex={0}
      aria-label={`Fonte: ${midia.nome}`}
      onKeyDown={(evento) => {
        const tecla = evento.key.toLowerCase();
        let feito = true;
        if (tecla === "i" && !evento.shiftKey) aoMarcar("entrada", agora);
        else if (tecla === "o" && !evento.shiftKey) aoMarcar("saida", Math.min(agora + quadro, duracao));
        else if (tecla === " ") alternar();
        else if (tecla === "arrowleft") ir(agora - quadro * (evento.shiftKey ? 5 : 1));
        else if (tecla === "arrowright") ir(agora + quadro * (evento.shiftKey ? 5 : 1));
        else if (evento.key === ",") aoPor("inserir");
        else if (evento.key === ".") aoPor("sobrescrever");
        else feito = false;
        if (feito) {
          // A tecla é da fonte: o teclado da linha do tempo não a vê
          evento.preventDefault();
          evento.stopPropagation();
        }
      }}
    >
      <div className="relative min-h-0 flex-1 bg-black">
        {imagem ? (
          // eslint-disable-next-line @next/next/no-img-element -- cópia leve da API com a sessão do cookie
          <img src={arquivoDaMidia(midia.id, arquivo)} alt={midia.nome} className="size-full object-contain" />
        ) : (
          <video
            ref={videoRef}
            key={midia.id}
            src={arquivoDaMidia(midia.id, arquivo)}
            className={`size-full object-contain ${so_som ? "opacity-0" : ""}`}
            preload="metadata"
            onEnded={() => setTocando(false)}
            onSeeked={(evento) => setAgora(segundosParaTicks(evento.currentTarget.currentTime))}
          />
        )}
        {so_som ? <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-white/70">{midia.nome}</p> : null}
      </div>
      <div
        className="relative h-4 shrink-0 cursor-pointer bg-painel-2"
        onPointerDown={(evento) => {
          const caixa = evento.currentTarget.getBoundingClientRect();
          ir(((evento.clientX - caixa.left) / caixa.width) * duracao);
        }}
        title="Clique para andar pela mídia"
      >
        {entrada !== null || saida !== null ? <span className="pointer-events-none absolute inset-y-0 border-x-2 border-codigo bg-codigo/25" style={{ left: fracao(de), width: `calc(${fracao(ate)} - ${fracao(de)})` }} aria-hidden /> : null}
        <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-texto" style={{ left: fracao(agora) }} aria-hidden />
      </div>
      <div className="flex h-9 shrink-0 items-center gap-1 border-t border-borda px-2">
        <span className="w-24 font-mono text-sm tabular-nums text-codigo">{formatarTimecodeLongo(agora, taxa)}</span>
        <div className="flex flex-1 items-center justify-center gap-0.5">
          <button type="button" className="botao-icone size-7 font-mono text-sm" onClick={() => aoMarcar("entrada", agora)} aria-label="Marcar entrada da fonte" title="Marcar entrada (I)">
            {"{"}
          </button>
          <button type="button" className="botao-icone size-7 font-mono text-sm" onClick={() => aoMarcar("saida", Math.min(agora + quadro, duracao))} aria-label="Marcar saída da fonte" title="Marcar saída (O)">
            {"}"}
          </button>
          <span className="mx-1 h-4 w-px bg-borda" aria-hidden />
          <button type="button" className="botao-icone size-7" disabled={imagem} onClick={() => ir(agora - quadro)} aria-label="Voltar um quadro na fonte" title="Voltar um quadro">
            <SkipBack className="size-4" aria-hidden />
          </button>
          <button type="button" className="botao-icone size-8" disabled={imagem} onClick={alternar} aria-label={tocando ? "Pausar a fonte" : "Reproduzir a fonte"} title={tocando ? "Parar (espaço)" : "Reproduzir (espaço)"}>
            {tocando ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
          </button>
          <button type="button" className="botao-icone size-7" disabled={imagem} onClick={() => ir(agora + quadro)} aria-label="Avançar um quadro na fonte" title="Avançar um quadro">
            <SkipForward className="size-4" aria-hidden />
          </button>
          <span className="mx-1 h-4 w-px bg-borda" aria-hidden />
          <button type="button" className="botao-icone size-7" onClick={() => aoPor("inserir")} aria-label="Inserir" title="Inserir no cursor: abre o espaço na linha do tempo (,)">
            <ArrowDownToLine className="size-4" aria-hidden />
          </button>
          <button type="button" className="botao-icone size-7" onClick={() => aoPor("sobrescrever")} aria-label="Sobrescrever" title="Sobrescrever no cursor: cobre o que estava (.)">
            <Replace className="size-4" aria-hidden />
          </button>
        </div>
        <span className="w-24 text-right font-mono text-xs tabular-nums text-suave" title="Duração entre a entrada e a saída">
          {formatarTimecodeLongo(ate - de, taxa)}
        </span>
      </div>
    </div>
  );
}
