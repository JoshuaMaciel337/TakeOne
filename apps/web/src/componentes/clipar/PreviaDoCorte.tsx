"use client";

// A prévia do corte no cartão (ADR 0004, 14.4): a cópia leve do vídeo no formato do corte, com o rosto no meio
// (a mediana do rosto de cada trecho, parada, como a montagem), o título nos primeiros 3 s com as palavras de foco
// na cor da marca e as legendas da fala com a palavra falada acesa e a ênfase pintada. É desenhada por cima do
// vídeo, sem montar o projeto: a montagem de verdade sai do "Montar e abrir no editor". Parada, mostra o quadro
// do começo do corte (o sprite das miniaturas). Uma prévia toca de cada vez, com o som desligado até o clique.
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import { type Corte, pedacosDoTitulo } from "@/lib/clipagens";
import {
  type AmostraDoRosto,
  centroDoRosto,
  enfaseNoCorte,
  enquadrarNaCaixa,
  instanteNoCorte,
  palavraFalada,
} from "@/lib/clipar/listaDeCortes";
import type { Legenda } from "@/lib/projeto/legendas";
import { TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

/** Quanto tempo o título fica, como na montagem. */
const DURACAO_DO_TITULO_S = 3;
const COR_DA_FALA = "#2ee6a6";

type Props = {
  corte: Corte;
  midia: Midia;
  formato: string;
  rosto: AmostraDoRosto[];
  /** As legendas do corte no tempo dele (null enquanto a fala não chegou). */
  legendas: Legenda[] | null;
  corDestaque: string;
  tocando: boolean;
  aoTocar: (tocar: boolean) => void;
};

function useTamanho(ref: React.RefObject<HTMLElement | null>) {
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 });
  useLayoutEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => setTamanho({ largura: entrada.contentRect.width, altura: entrada.contentRect.height }));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [ref]);
  return tamanho;
}

export function PreviaDoCorte({ corte, midia, formato, rosto, legendas, corDestaque, tocando, aoTocar }: Props) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const caixa = useTamanho(caixaRef);
  const [largura, altura] = formato.split(":").map(Number);
  const fonte = { largura: midia.video?.largura ?? 16, altura: midia.video?.altura ?? 9 };
  const [instante, setInstante] = useState(0);
  const [trecho, setTrecho] = useState(0);
  const [comSom, setComSom] = useState(false);
  const centros = useMemo(() => corte.trechos.map((item) => centroDoRosto(rosto, item.inicio, item.fim)), [corte.trechos, rosto]);
  const enfase = useMemo(() => enfaseNoCorte(corte), [corte]);

  // Tocando: começa do início do corte, passa de trecho em trecho e volta ao começo no fim
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!tocando) {
      video.pause();
      return;
    }
    let atual = 0;
    let quadro = 0;
    video.currentTime = corte.trechos[0].inicio;
    void video.play().catch(() => undefined);
    const passo = () => {
      const fim = corte.trechos[atual].fim;
      if (video.currentTime >= fim - 0.03) {
        atual = (atual + 1) % corte.trechos.length;
        video.currentTime = corte.trechos[atual].inicio;
      }
      setTrecho(atual);
      setInstante(instanteNoCorte(corte, atual, Math.max(corte.trechos[atual].inicio, video.currentTime)));
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => {
      cancelAnimationFrame(quadro);
      video.pause();
    };
  }, [tocando, corte]);

  const enquadramento = caixa.largura ? enquadrarNaCaixa(caixa, fonte, centros[tocando ? trecho : 0]) : null;
  const tick = instante * TICKS_POR_SEGUNDO;
  const legenda = tocando && legendas ? legendas.find((item) => item.inicio <= tick && tick < item.fim) : undefined;
  const falada = legenda ? palavraFalada(legenda, tick) : -1;
  const plano = midia.miniaturas;
  const comSprite = plano && midia.arquivos.includes("miniaturas.jpg") && enquadramento;
  const indice = plano ? Math.min(plano.total - 1, Math.floor((corte.trechos[0].inicio + 1) / plano.intervalo)) : 0;
  const tamanhoDaLetra = Math.max(9, caixa.largura * 0.075);

  return (
    <div
      ref={caixaRef}
      className="relative w-full overflow-hidden rounded-lg bg-black"
      style={{ aspectRatio: `${largura} / ${altura}` }}
      onPointerEnter={(evento) => evento.pointerType === "mouse" && aoTocar(true)}
      onPointerLeave={(evento) => evento.pointerType === "mouse" && aoTocar(false)}
      // No toque não há "passar o mouse": um toque liga e outro desliga
      onPointerUp={(evento) => evento.pointerType !== "mouse" && aoTocar(!tocando)}
    >
      {comSprite ? (
        <div
          className="absolute"
          aria-hidden
          style={{
            left: enquadramento.x,
            top: enquadramento.y,
            width: enquadramento.largura,
            height: enquadramento.altura,
            backgroundImage: `url(${arquivoDaMidia(midia.id, "miniaturas.jpg")})`,
            backgroundSize: `${plano.colunas * enquadramento.largura}px ${plano.linhas * enquadramento.altura}px`,
            backgroundPosition: `-${(indice % plano.colunas) * enquadramento.largura}px -${Math.floor(indice / plano.colunas) * enquadramento.altura}px`,
          }}
        />
      ) : null}
      {enquadramento ? (
        <video
          ref={videoRef}
          src={arquivoDaMidia(midia.id, "proxy.mp4")}
          muted={!comSom}
          playsInline
          preload="none"
          className={`absolute max-w-none ${tocando ? "" : "invisible"}`}
          style={{ left: enquadramento.x, top: enquadramento.y, width: enquadramento.largura, height: enquadramento.altura }}
        />
      ) : null}
      {instante < DURACAO_DO_TITULO_S || !tocando ? (
        <p
          className="pointer-events-none absolute inset-x-[8%] text-center font-display font-black uppercase leading-tight text-white"
          style={{ top: "12%", fontSize: tamanhoDaLetra, textShadow: "0 1px 3px rgba(0,0,0,.9)" }}
        >
          {pedacosDoTitulo(corte.titulo, corte.foco).map((pedaco, i) => (
            <span key={i} style={pedaco.foco ? { color: corDestaque } : undefined}>
              {pedaco.texto}
            </span>
          ))}
        </p>
      ) : null}
      {legenda ? (
        <p
          className="pointer-events-none absolute inset-x-[6%] whitespace-pre-line text-center font-display font-bold uppercase leading-tight text-white"
          style={{ top: "80%", fontSize: tamanhoDaLetra * 0.9, textShadow: "0 0 3px #000, 0 1px 3px #000" }}
        >
          {legenda.conteudo.split(/(\s+)/).reduce<{ partes: React.ReactNode[]; n: number }>(
            (acc, parte, i) => {
              if (/^\s+$/.test(parte)) {
                acc.partes.push(parte.includes("\n") ? "\n" : " ");
                return acc;
              }
              const n = acc.n++;
              const comeco = legenda.tempos?.[n];
              const forte = comeco !== undefined && enfase.some((t) => Math.abs(t - comeco) < 0.02 * TICKS_POR_SEGUNDO);
              const cor = n === falada ? COR_DA_FALA : forte ? corDestaque : undefined;
              acc.partes.push(
                <span key={i} style={cor ? { color: cor } : undefined}>
                  {parte}
                </span>,
              );
              return acc;
            },
            { partes: [], n: 0 },
          ).partes}
        </p>
      ) : null}
      {tocando ? (
        <button
          type="button"
          className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white"
          aria-label={comSom ? "Desligar o som" : "Ligar o som"}
          onPointerUp={(evento) => evento.stopPropagation()}
          onClick={(evento) => {
            evento.stopPropagation();
            setComSom((som) => !som);
          }}
        >
          {comSom ? <Volume2 className="size-3.5" aria-hidden /> : <VolumeX className="size-3.5" aria-hidden />}
        </button>
      ) : null}
    </div>
  );
}
