"use client";

// A Régua (I) (ADR 0003, onda 13.6), em pixels da imagem: arrastar mede; as pontas da medida arrastam de novo.
import { useRef } from "react";

import type { Medida } from "./OpcoesDaGeometria";

type Props = { medida: Medida | null; escala: number; aoMudar: (medida: Medida) => void };

export function ReguaNaPrevia({ medida, escala, aoMudar }: Props) {
  const pegada = useRef<{ ponta: "de" | "ate"; fixa: { x: number; y: number } } | null>(null);
  const paraImagem = (evento: React.PointerEvent) => {
    const r = (evento.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (evento.clientX - r.left) / escala, y: (evento.clientY - r.top) / escala };
  };
  function apertar(evento: React.PointerEvent) {
    if (evento.button !== 0) return;
    evento.stopPropagation();
    (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
    const p = paraImagem(evento);
    const perto = (q: { x: number; y: number }) => Math.hypot((q.x - p.x) * escala, (q.y - p.y) * escala) <= 8;
    if (medida && perto(medida.de)) pegada.current = { ponta: "de", fixa: medida.ate };
    else if (medida && perto(medida.ate)) pegada.current = { ponta: "ate", fixa: medida.de };
    else {
      pegada.current = { ponta: "ate", fixa: p };
      aoMudar({ de: p, ate: p });
    }
  }
  function mover(evento: React.PointerEvent) {
    const atual = pegada.current;
    if (!atual) return;
    let p = paraImagem(evento);
    // Shift prende a 45°
    if (evento.shiftKey) {
      const dx = p.x - atual.fixa.x;
      const dy = p.y - atual.fixa.y;
      const angulo = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const comprimento = Math.hypot(dx, dy);
      p = { x: atual.fixa.x + Math.cos(angulo) * comprimento, y: atual.fixa.y + Math.sin(angulo) * comprimento };
    }
    aoMudar(atual.ponta === "ate" ? { de: atual.fixa, ate: p } : { de: p, ate: atual.fixa });
  }
  function soltar() {
    pegada.current = null;
  }
  const k = escala;
  return (
    <div className="absolute inset-0 z-20 cursor-crosshair touch-none" onPointerDown={apertar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} aria-label="Régua">
      {medida ? (
        <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
          <line x1={medida.de.x * k} y1={medida.de.y * k} x2={medida.ate.x * k} y2={medida.ate.y * k} stroke="#000" strokeOpacity={0.6} strokeWidth={3} />
          <line x1={medida.de.x * k} y1={medida.de.y * k} x2={medida.ate.x * k} y2={medida.ate.y * k} stroke="#fff" strokeWidth={1} />
          {[medida.de, medida.ate].map((p, i) => (
            <g key={i} transform={`translate(${p.x * k} ${p.y * k})`}>
              <path d="M -6 0 H 6 M 0 -6 V 6" stroke="#000" strokeWidth={3} strokeOpacity={0.6} />
              <path d="M -6 0 H 6 M 0 -6 V 6" stroke="#fff" strokeWidth={1} />
            </g>
          ))}
        </svg>
      ) : null}
    </div>
  );
}
