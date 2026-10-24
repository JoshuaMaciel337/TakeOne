"use client";

// O Amostrador de cor (I) do editor de imagem (ADR 0003, onda 13.14): até 10 pontos fixos na imagem, cada um com o
// número dele, cujas cores o painel Informações mostra. O clique põe um ponto, arrastar um ponto o leva, Alt + clique
// num ponto o tira. Os pontos ficam em pixels do documento; fora da ferramenta, aparecem sem receber o mouse.
import { useRef } from "react";

import { MAXIMO_DE_AMOSTRADORES } from "@/lib/imagem/informacoes";

import { pontoNoElemento } from "./pontoNaVista";

type Ponto = { x: number; y: number };
type Props = { pontos: Ponto[]; escala: number; ativo: boolean; aoMudar: (pontos: Ponto[]) => void; aoCheio?: () => void };

export function AmostradoresNaPrevia({ pontos, escala, ativo, aoMudar, aoCheio }: Props) {
  const pegado = useRef<number | null>(null);
  const paraImagem = (evento: React.PointerEvent) => {
    const p = pontoNoElemento(evento, evento.currentTarget as HTMLElement);
    return { x: Math.floor(p.x / escala), y: Math.floor(p.y / escala) };
  };
  function apertar(evento: React.PointerEvent) {
    if (evento.button !== 0) return;
    evento.stopPropagation();
    const p = paraImagem(evento);
    const perto = pontos.findIndex((q) => Math.hypot((q.x + 0.5) * escala - (p.x + 0.5) * escala, (q.y + 0.5) * escala - (p.y + 0.5) * escala) <= Math.max(7, escala));
    if (perto >= 0 && evento.altKey) {
      aoMudar(pontos.filter((_, i) => i !== perto));
      return;
    }
    (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
    if (perto >= 0) {
      pegado.current = perto;
      return;
    }
    if (pontos.length >= MAXIMO_DE_AMOSTRADORES) {
      aoCheio?.();
      return;
    }
    pegado.current = pontos.length;
    aoMudar([...pontos, p]);
  }
  function mover(evento: React.PointerEvent) {
    const i = pegado.current;
    if (i === null) return;
    const p = paraImagem(evento);
    aoMudar(pontos.map((q, j) => (j === i ? p : q)));
  }
  function soltar() {
    pegado.current = null;
  }
  return (
    <div
      className={`absolute inset-0 z-20 touch-none ${ativo ? "cursor-crosshair" : "pointer-events-none"}`}
      onPointerDown={ativo ? apertar : undefined}
      onPointerMove={ativo ? mover : undefined}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      aria-label={ativo ? "Amostrador de cor" : undefined}
    >
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        {pontos.map((p, i) => (
          <g key={i} transform={`translate(${(p.x + 0.5) * escala} ${(p.y + 0.5) * escala})`} data-amostrador={i + 1}>
            <circle r={5} fill="none" stroke="#000" strokeOpacity={0.6} strokeWidth={3} />
            <circle r={5} fill="none" stroke="#fff" strokeWidth={1} />
            <path d="M -9 0 H -5 M 5 0 H 9 M 0 -9 V -5 M 0 5 V 9" stroke="#fff" strokeWidth={1} />
            <text x={8} y={18} fontSize={11} fontWeight={600} fill="#fff" stroke="#000" strokeOpacity={0.7} strokeWidth={3} paintOrder="stroke">
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
