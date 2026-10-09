"use client";

import { Copy, Film, Magnet, Music, Scissors, Trash2, Type, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { formatarTempo } from "@/lib/formatar";

type Props = {
  /** Duração mostrada na régua. Sem clipes, é a da mídia na prévia. */
  duracao: number;
  tempo: number;
  aoBuscar: (segundos: number) => void;
  className?: string;
  style?: React.CSSProperties;
};

const ZOOM_MINIMO = 10; // pixels por segundo
const ZOOM_MAXIMO = 240;
const LARGURA_ROTULOS = 88;
// Intervalos possíveis entre as marcas da régua, em segundos
const INTERVALOS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const DISTANCIA_MINIMA_MARCAS = 70; // pixels

const FAIXAS = [
  { id: "texto", nome: "Texto", icone: Type, altura: "h-8" },
  { id: "principal", nome: "Principal", icone: Film, altura: "h-14" },
  { id: "audio", nome: "Áudio", icone: Music, altura: "h-10" },
];

export function LinhaDoTempo({ duracao, tempo, aoBuscar, className = "", style }: Props) {
  const [zoom, setZoom] = useState(40);
  const rolagem = useRef<HTMLDivElement>(null);
  const [larguraVisivel, setLarguraVisivel] = useState(0);

  useEffect(() => {
    const elemento = rolagem.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => setLarguraVisivel(entrada.contentRect.width));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  // A régua sempre cobre a área visível, mesmo sem nada na linha do tempo
  const total = Math.max(duracao + 5, (larguraVisivel - LARGURA_ROTULOS) / zoom, 10);
  const largura = total * zoom;
  const intervalo = INTERVALOS.find((valor) => valor * zoom >= DISTANCIA_MINIMA_MARCAS) ?? INTERVALOS.at(-1)!;
  const marcas = Array.from({ length: Math.floor(total / intervalo) + 1 }, (_, i) => i * intervalo);

  function buscarPeloClique(evento: React.PointerEvent<HTMLDivElement>) {
    const caixa = evento.currentTarget.getBoundingClientRect();
    aoBuscar(Math.min(Math.max((evento.clientX - caixa.left) / zoom, 0), duracao));
  }

  return (
    <section aria-label="Linha do tempo" style={style} className={`flex min-h-0 shrink-0 flex-col bg-painel ${className}`}>
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-borda px-2">
        <button type="button" className="botao-icone" disabled title="Dividir (S)" aria-label="Dividir">
          <Scissors className="size-4" aria-hidden />
        </button>
        <button type="button" className="botao-icone" disabled title="Apagar (Delete)" aria-label="Apagar">
          <Trash2 className="size-4" aria-hidden />
        </button>
        <button type="button" className="botao-icone" disabled title="Duplicar (Ctrl+D)" aria-label="Duplicar">
          <Copy className="size-4" aria-hidden />
        </button>
        <button type="button" className="botao-icone" disabled title="Ímã" aria-label="Ímã">
          <Magnet className="size-4" aria-hidden />
        </button>
        <span className="ml-2 hidden text-xs text-suave sm:inline">A edição na linha do tempo chega na fase 1.</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            className="botao-icone"
            onClick={() => setZoom((valor) => Math.max(ZOOM_MINIMO, Math.round(valor / 1.5)))}
            aria-label="Diminuir o zoom"
          >
            <ZoomOut className="size-4" aria-hidden />
          </button>
          <input
            type="range"
            min={ZOOM_MINIMO}
            max={ZOOM_MAXIMO}
            value={zoom}
            onChange={(evento) => setZoom(Number(evento.target.value))}
            className="hidden w-24 accent-[var(--to-destaque)] sm:block"
            aria-label="Zoom da linha do tempo"
          />
          <button
            type="button"
            className="botao-icone"
            onClick={() => setZoom((valor) => Math.min(ZOOM_MAXIMO, Math.round(valor * 1.5)))}
            aria-label="Aumentar o zoom"
          >
            <ZoomIn className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div ref={rolagem} className="min-h-0 flex-1 overflow-auto">
        <div className="relative flex min-h-full" style={{ width: largura + LARGURA_ROTULOS }}>
          <div className="sticky left-0 z-20 flex w-[88px] shrink-0 flex-col border-r border-borda bg-painel">
            <div className="h-6 shrink-0 border-b border-borda" />
            {FAIXAS.map(({ id, nome, icone: Icone, altura }) => (
              <div key={id} className={`flex ${altura} items-center gap-1.5 border-b border-borda/60 px-2 text-[11px] text-suave`}>
                <Icone className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{nome}</span>
              </div>
            ))}
          </div>

          <div className="relative flex-1" style={{ width: largura }}>
            <div
              className="relative h-6 cursor-pointer select-none border-b border-borda"
              onPointerDown={buscarPeloClique}
              title="Clique para mover o cursor"
            >
              {marcas.map((segundo) => (
                <span
                  key={segundo}
                  className="absolute top-0 flex h-full flex-col justify-end border-l border-borda pl-1 text-[10px] tabular-nums text-suave"
                  style={{ left: segundo * zoom }}
                >
                  {formatarTempo(segundo)}
                </span>
              ))}
            </div>
            {FAIXAS.map(({ id, altura }) => (
              <div key={id} className={`relative ${altura} border-b border-borda/60`}>
                {id === "principal" ? (
                  <div className="absolute inset-y-1.5 left-1.5 flex items-center rounded-md border border-dashed border-borda px-3 text-[11px] text-suave" style={{ width: Math.max(Math.min(largura - 12, 420), 200) }}>
                    Aqui ficam os clipes do vídeo
                  </div>
                ) : null}
              </div>
            ))}

            <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white" style={{ left: tempo * zoom }} aria-hidden>
              <span className="absolute -left-[5px] top-0 size-[11px] rounded-sm bg-white" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
