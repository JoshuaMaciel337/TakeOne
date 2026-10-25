"use client";

// As ferramentas Girar, Refletir, Escalar e Inclinar na prévia (ADR 0003, onda 13.16): a mira da origem (no meio do
// que está escolhido até o clique mudá-la), o arrasto que mostra as caixas levadas pela afim e, ao soltar, a aplica
// (com Alt, numa cópia). Alt + clique sem arrastar abre os números, com a origem no ponto do clique.
import { useState } from "react";

import type { Tamanho } from "@/lib/projeto/geometria";
import { afimDoGesto, aplicarAfim, type Afim, type FerramentaDeTransformar } from "@/lib/transformar/ferramentas";
import { pontoNoElemento } from "./pontoNaVista";

type Ponto = { x: number; y: number };

type Props = {
  ferramenta: FerramentaDeTransformar;
  quadro: Tamanho;
  documento: Tamanho;
  /** As caixas das camadas escolhidas (os quatro cantos, em pixels da imagem). */
  caixas: Ponto[][];
  /** A origem escolhida pelo clique, ou null (o meio das caixas). */
  origem: Ponto | null;
  aoMudarOrigem: (origem: Ponto) => void;
  aoAplicar: (afim: Afim, copiar: boolean) => void;
  /** Alt + clique: os números, com a origem no ponto. */
  aoNumeros: (origem: Ponto) => void;
};

/** O meio das caixas (o retângulo em volta de todas). */
export function meioDasCaixas(caixas: Ponto[][]): Ponto | null {
  const pontos = caixas.flat();
  if (!pontos.length) return null;
  const xs = pontos.map((p) => p.x);
  const ys = pontos.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

export function TransformarNaPrevia({ ferramenta, quadro, documento, caixas, origem, aoMudarOrigem, aoAplicar, aoNumeros }: Props) {
  const escala = quadro.largura / documento.largura;
  const [arrasto, setArrasto] = useState<{ de: Ponto; ate: Ponto; shift: boolean; alt: boolean; andou: boolean } | null>(null);
  const centro = origem ?? meioDasCaixas(caixas);
  const noDocumento = (evento: React.PointerEvent<HTMLDivElement>) => {
    const p = pontoNoElemento(evento, evento.currentTarget);
    return { x: p.x / escala, y: p.y / escala };
  };
  const afim = arrasto && centro && arrasto.andou ? afimDoGesto(ferramenta, centro, arrasto.de, arrasto.ate, arrasto.shift) : null;
  return (
    <div
      className="absolute inset-0 touch-none"
      style={{ cursor: "crosshair" }}
      data-transformar={ferramenta}
      onPointerDown={(evento) => {
        if (evento.button !== 0) return;
        evento.stopPropagation();
        evento.currentTarget.setPointerCapture(evento.pointerId);
        const p = noDocumento(evento);
        setArrasto({ de: p, ate: p, shift: evento.shiftKey, alt: evento.altKey, andou: false });
      }}
      onPointerMove={(evento) => {
        if (!arrasto) return;
        const p = noDocumento(evento);
        const andou = arrasto.andou || Math.hypot(p.x - arrasto.de.x, p.y - arrasto.de.y) * escala > 3;
        setArrasto({ ...arrasto, ate: p, shift: evento.shiftKey, alt: evento.altKey, andou });
      }}
      onPointerUp={() => {
        if (!arrasto) return;
        setArrasto(null);
        // O clique sem arrastar muda a origem (com Alt, abre os números)
        if (!arrasto.andou) return arrasto.alt ? aoNumeros(arrasto.de) : aoMudarOrigem(arrasto.de);
        if (afim) aoAplicar(afim, arrasto.alt);
      }}
      onPointerCancel={() => setArrasto(null)}
    >
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        <g transform={`scale(${escala})`}>
          {afim
            ? caixas.map((caixa, i) => (
                <polygon key={i} points={caixa.map((p) => aplicarAfim(afim, p)).map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#2f80ff" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" data-caixa-transformada />
              ))
            : null}
          {ferramenta === "refletir" && arrasto?.andou && centro ? (
            <line x1={centro.x} y1={centro.y} x2={arrasto.ate.x} y2={arrasto.ate.y} stroke="#2f80ff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ) : null}
        </g>
        {centro ? (
          <g transform={`translate(${centro.x * escala} ${centro.y * escala})`} data-origem>
            <circle r={5} fill="none" stroke="#000" strokeWidth={3} strokeOpacity={0.5} />
            <circle r={5} fill="none" stroke="#2f80ff" strokeWidth={1.5} />
            <path d="M -9 0 H 9 M 0 -9 V 9" stroke="#2f80ff" strokeWidth={1.5} />
          </g>
        ) : null}
      </svg>
    </div>
  );
}
