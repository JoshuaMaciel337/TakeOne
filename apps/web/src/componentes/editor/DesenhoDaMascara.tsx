"use client";

import { createContext, useEffect, useRef, useState } from "react";

import { PONTOS_MAXIMOS_DO_DESENHO } from "@/lib/projeto/modelo";

/** Começa o desenho da máscara de um clipe na prévia (o Editor fornece; o painel chama). */
export const IniciarDesenhoDaMascara = createContext<((clipeId: string) => void) | null>(null);

type Props = {
  /** Os pontos em pixels da prévia; quem chama leva para as frações do clipe. */
  aoConcluir: (pontos: { x: number; y: number }[]) => void;
  aoCancelar: () => void;
};

/**
 * Por cima da prévia enquanto a pessoa desenha a máscara: cada clique põe um ponto do polígono. Enter (ou "Pronto")
 * fecha o desenho, Backspace tira o último ponto e Esc cancela.
 */
export function DesenhoDaMascara({ aoConcluir, aoCancelar }: Props) {
  const [pontos, setPontos] = useState<{ x: number; y: number }[]>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const atual = useRef({ pontos, aoConcluir, aoCancelar });
  useEffect(() => {
    atual.current = { pontos, aoConcluir, aoCancelar };
  });
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") atual.current.aoCancelar();
      else if (evento.key === "Enter" && atual.current.pontos.length >= 3) atual.current.aoConcluir(atual.current.pontos);
      else if (evento.key === "Backspace") setPontos((lista) => lista.slice(0, -1));
      else return;
      evento.preventDefault();
      evento.stopPropagation();
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, []);

  const ponto = (evento: React.PointerEvent<HTMLDivElement>) => {
    const caixa = evento.currentTarget.getBoundingClientRect();
    return { x: evento.clientX - caixa.left, y: evento.clientY - caixa.top };
  };
  const linha = [...pontos, ...(cursor && pontos.length ? [cursor] : [])].map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div
      className="absolute inset-0 z-10 cursor-crosshair"
      role="application"
      aria-label="Desenhar a máscara: clique para pôr cada ponto"
      onPointerDown={(evento) => {
        if (evento.button !== 0) return;
        evento.stopPropagation();
        // O ponto lido agora: dentro da função do estado, o evento já passou
        const novo = ponto(evento);
        if (pontos.length < PONTOS_MAXIMOS_DO_DESENHO) setPontos((lista) => [...lista, novo]);
      }}
      onPointerMove={(evento) => setCursor(ponto(evento))}
      onPointerLeave={() => setCursor(null)}
    >
      <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
        {pontos.length >= 3 ? <polygon points={pontos.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(255,98,74,0.2)" /> : null}
        <polyline points={linha} fill="none" stroke="#ff624a" strokeWidth={2} />
        {pontos.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4} fill={i === 0 ? "#ffffff" : "#ff624a"} stroke="#000" strokeWidth={1} />
        ))}
      </svg>
      <div className="absolute inset-x-2 top-2 flex flex-wrap items-center justify-center gap-2" onPointerDown={(evento) => evento.stopPropagation()}>
        <span className="rounded bg-black/70 px-2 py-1 text-[11px] text-white">
          {pontos.length < 3 ? "Clique em volta do que vai aparecer (pelo menos 3 pontos)" : `${pontos.length} pontos · Enter fecha o desenho`}
        </span>
        <button type="button" className="botao-secundario px-2 py-1 text-xs" disabled={!pontos.length} onClick={() => setPontos((lista) => lista.slice(0, -1))}>
          Desfazer ponto
        </button>
        <button type="button" className="botao-secundario px-2 py-1 text-xs" onClick={aoCancelar}>
          Cancelar
        </button>
        <button type="button" className="botao-principal px-2 py-1 text-xs" disabled={pontos.length < 3} onClick={() => aoConcluir(pontos)}>
          Pronto
        </button>
      </div>
    </div>
  );
}
