"use client";

import { useRef } from "react";

type Props = {
  /** "coluna": barra em pé entre dois painéis lado a lado. "linha": barra deitada entre cima e baixo. */
  direcao: "coluna" | "linha";
  valor: number;
  minimo: number;
  maximo: number;
  aoMudar: (valor: number) => void;
  /** -1 quando o painel que cresce fica depois da barra (à direita ou embaixo). */
  sentido?: 1 | -1;
  rotulo: string;
  className?: string;
};

const PASSO_TECLADO = 16;

/** Barra que redimensiona um painel arrastando com o mouse, o dedo ou as setas do teclado. */
export function Divisor({ direcao, valor, minimo, maximo, aoMudar, sentido = 1, rotulo, className = "" }: Props) {
  const inicio = useRef<{ posicao: number; valor: number } | null>(null);
  const coluna = direcao === "coluna";

  return (
    <div
      role="separator"
      aria-orientation={coluna ? "vertical" : "horizontal"}
      aria-label={rotulo}
      aria-valuenow={valor}
      aria-valuemin={minimo}
      aria-valuemax={maximo}
      tabIndex={0}
      onPointerDown={(evento) => {
        evento.currentTarget.setPointerCapture(evento.pointerId);
        inicio.current = { posicao: coluna ? evento.clientX : evento.clientY, valor };
      }}
      onPointerMove={(evento) => {
        if (!inicio.current) return;
        const posicao = coluna ? evento.clientX : evento.clientY;
        aoMudar(inicio.current.valor + (posicao - inicio.current.posicao) * sentido);
      }}
      onPointerUp={() => {
        inicio.current = null;
      }}
      onPointerCancel={() => {
        inicio.current = null;
      }}
      onKeyDown={(evento) => {
        const menos = coluna ? "ArrowLeft" : "ArrowUp";
        const mais = coluna ? "ArrowRight" : "ArrowDown";
        if (evento.key === menos) aoMudar(valor - PASSO_TECLADO * sentido);
        else if (evento.key === mais) aoMudar(valor + PASSO_TECLADO * sentido);
        else return;
        evento.preventDefault();
      }}
      className={`group relative z-10 shrink-0 touch-none select-none outline-none ${
        coluna ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
      } bg-borda transition hover:bg-destaque/60 focus-visible:bg-destaque ${className}`}
    >
      <span className={`absolute ${coluna ? "inset-y-0 -inset-x-1.5" : "inset-x-0 -inset-y-1.5"}`} aria-hidden />
    </div>
  );
}
