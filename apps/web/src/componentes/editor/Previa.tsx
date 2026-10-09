"use client";

import { Maximize, Music, Pause, Play } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import { formatarTempo } from "@/lib/formatar";
import type { Midia } from "@/lib/tipos";

import { type Proporcao, razao } from "./proporcoes";

type Props = {
  proporcao: Proporcao;
  midia: Midia | null;
  /** O elemento de vídeo ou áudio, para a linha do tempo poder mover o cursor. */
  reprodutorRef: RefObject<HTMLMediaElement | null>;
  tempo: number;
  aoMudarTempo: (segundos: number) => void;
  className?: string;
};

/** Mede a área livre e calcula o maior quadro na proporção do projeto que cabe nela. */
function useQuadro(proporcao: Proporcao) {
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

export function Previa({ proporcao, midia, reprodutorRef, tempo, aoMudarTempo, className = "" }: Props) {
  const { areaRef, tamanho } = useQuadro(proporcao);
  const quadroRef = useRef<HTMLDivElement>(null);
  const [tocando, setTocando] = useState(false);

  const pronta = midia?.status === "pronta";
  const temVideo = pronta && midia.arquivos.includes("proxy.mp4");
  const temAudio = pronta && !temVideo && midia.arquivos.includes("proxy.m4a");
  const duracao = pronta ? (midia.duracao ?? 0) : 0;

  // Enquanto toca, acompanha o tempo a cada quadro da tela, para o cursor da linha do tempo não pular
  useEffect(() => {
    if (!tocando) return;
    let pedido = 0;
    const acompanhar = () => {
      if (reprodutorRef.current) aoMudarTempo(reprodutorRef.current.currentTime);
      pedido = requestAnimationFrame(acompanhar);
    };
    pedido = requestAnimationFrame(acompanhar);
    return () => cancelAnimationFrame(pedido);
  }, [tocando, reprodutorRef, aoMudarTempo]);

  // Espaço toca e pausa, menos quando a pessoa está digitando
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      const alvo = evento.target as HTMLElement | null;
      if (evento.code !== "Space" || alvo?.closest("input, textarea, select, [contenteditable]")) return;
      const elemento = reprodutorRef.current;
      if (!elemento) return;
      evento.preventDefault();
      if (elemento.paused) void elemento.play();
      else elemento.pause();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [reprodutorRef]);

  const eventos = {
    onPlay: () => setTocando(true),
    onPause: () => setTocando(false),
    onEnded: () => setTocando(false),
    onSeeked: (evento: React.SyntheticEvent<HTMLMediaElement>) => aoMudarTempo(evento.currentTarget.currentTime),
    onLoadedMetadata: () => aoMudarTempo(0),
  };

  return (
    <section aria-label="Prévia" className={`flex min-h-0 min-w-0 flex-col bg-fundo ${className}`}>
      <div ref={areaRef} className="relative min-h-0 flex-1 p-4">
        <div className="absolute inset-4 flex items-center justify-center">
          <div
            ref={quadroRef}
            className="relative flex items-center justify-center overflow-hidden bg-black shadow-lg shadow-black/40"
            style={{ width: tamanho.largura, height: tamanho.altura }}
          >
            {temVideo ? (
              <video
                key={midia.id}
                ref={reprodutorRef as RefObject<HTMLVideoElement | null>}
                src={arquivoDaMidia(midia.id, "proxy.mp4")}
                className="size-full object-contain"
                playsInline
                preload="auto"
                {...eventos}
              />
            ) : temAudio ? (
              <>
                <Music className="size-10 text-suave" aria-hidden />
                <audio
                  key={midia.id}
                  ref={reprodutorRef as RefObject<HTMLAudioElement | null>}
                  src={arquivoDaMidia(midia.id, "proxy.m4a")}
                  preload="auto"
                  {...eventos}
                />
              </>
            ) : (
              <p className="max-w-[80%] text-center text-xs text-suave">
                {midia && !pronta ? "Esta mídia ainda está sendo preparada." : "Escolha uma mídia no painel para ver aqui."}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex h-11 shrink-0 items-center gap-3 border-t border-borda px-3">
        <span className="w-28 text-xs tabular-nums text-suave">
          <span className="text-texto">{formatarTempo(tempo)}</span> / {formatarTempo(duracao || null)}
        </span>
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            className="botao-icone size-9"
            disabled={!temVideo && !temAudio}
            onClick={() => {
              const elemento = reprodutorRef.current;
              if (!elemento) return;
              if (elemento.paused) void elemento.play();
              else elemento.pause();
            }}
            aria-label={tocando ? "Pausar" : "Reproduzir"}
            title={tocando ? "Pausar (espaço)" : "Reproduzir (espaço)"}
          >
            {tocando ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
          </button>
        </div>
        <div className="flex w-28 justify-end">
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
