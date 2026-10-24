"use client";

// O clique e o arrasto das ferramentas que agem num ponto ou numa reta da imagem (ADR 0003, onda 13.5): o Balde de
// tinta e a Borracha mágica (um clique) e o Degradê (do começo ao fim do arrasto, com a reta na tela; Shift prende
// a 45°). Os pontos vão em pixels do documento.
import { useState } from "react";

import type { Tamanho } from "@/lib/projeto/geometria";
import { pontoNoElemento } from "./pontoNaVista";

type Ponto = { x: number; y: number };

export function PontoNaPrevia({
  modo,
  quadro,
  documento,
  aoClicar,
  aoArrastar,
  aoArrastando,
  alcas,
}: {
  modo: "clique" | "arrasto";
  quadro: Tamanho;
  documento: Tamanho;
  aoClicar?: (ponto: Ponto, teclas: { shift: boolean; alt: boolean }) => void;
  aoArrastar?: (de: Ponto, ate: Ponto) => void;
  /** A cada movimento do arrasto (o degradê da camada de preenchimento muda ao vivo). */
  aoArrastando?: (de: Ponto, ate: Ponto) => void;
  /** A linha que já existe (as alças do degradê da camada de preenchimento), em pixels do documento. */
  alcas?: { de: Ponto; ate: Ponto } | null;
}) {
  const escala = documento.largura / Math.max(1, quadro.largura);
  const [arrasto, setArrasto] = useState<{ de: Ponto; ate: Ponto } | null>(null);
  const paraDocumento = (evento: { clientX: number; clientY: number }, elemento: Element): Ponto => {
    const p = pontoNoElemento(evento, elemento);
    return { x: p.x * escala, y: p.y * escala };
  };
  /** Com Shift, a reta fica nos múltiplos de 45°. */
  const preso = (de: Ponto, ate: Ponto, shift: boolean): Ponto => {
    if (!shift) return ate;
    const angulo = Math.round(Math.atan2(ate.y - de.y, ate.x - de.x) / (Math.PI / 4)) * (Math.PI / 4);
    const d = Math.hypot(ate.x - de.x, ate.y - de.y);
    return { x: de.x + Math.cos(angulo) * d, y: de.y + Math.sin(angulo) * d };
  };
  return (
    <div
      className="absolute inset-0 z-20 touch-none"
      style={{ cursor: "crosshair" }}
      aria-label="Área da ferramenta"
      onPointerDown={(evento) => {
        if (evento.button !== 0) return;
        evento.stopPropagation();
        const p = paraDocumento(evento, evento.currentTarget);
        if (modo === "clique") {
          aoClicar?.(p, { shift: evento.shiftKey, alt: evento.altKey });
          return;
        }
        evento.currentTarget.setPointerCapture(evento.pointerId);
        setArrasto({ de: p, ate: p });
      }}
      onPointerMove={(evento) => {
        if (!arrasto) return;
        const ate = preso(arrasto.de, paraDocumento(evento, evento.currentTarget), evento.shiftKey);
        setArrasto({ ...arrasto, ate });
        if (Math.hypot(ate.x - arrasto.de.x, ate.y - arrasto.de.y) >= 1) aoArrastando?.(arrasto.de, ate);
      }}
      onPointerUp={(evento) => {
        if (!arrasto) return;
        const ate = preso(arrasto.de, paraDocumento(evento, evento.currentTarget), evento.shiftKey);
        setArrasto(null);
        if (Math.hypot(ate.x - arrasto.de.x, ate.y - arrasto.de.y) >= 1) aoArrastar?.(arrasto.de, ate);
      }}
    >
      {(() => {
        const linha = arrasto ?? alcas;
        return linha ? (
          <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
            <line x1={linha.de.x / escala} y1={linha.de.y / escala} x2={linha.ate.x / escala} y2={linha.ate.y / escala} stroke="#000" strokeWidth={3} strokeOpacity={0.5} />
            <line x1={linha.de.x / escala} y1={linha.de.y / escala} x2={linha.ate.x / escala} y2={linha.ate.y / escala} stroke="#fff" strokeWidth={1} />
            <circle cx={linha.de.x / escala} cy={linha.de.y / escala} r={3} fill="#fff" stroke="#000" />
            <circle cx={linha.ate.x / escala} cy={linha.ate.y / escala} r={3} fill="#fff" stroke="#000" />
          </svg>
        ) : null;
      })()}
    </div>
  );
}
