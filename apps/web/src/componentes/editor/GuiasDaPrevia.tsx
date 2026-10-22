"use client";

import { desenhoDasGuias, type ModoDasGuias } from "@/lib/projeto/margens";
import type { Tamanho } from "@/lib/projeto/geometria";

/** As guias por cima da prévia (só na tela: o canvas, que é o que vai para a tela cheia, fica sem elas). */
export function GuiasDaPrevia({ modo, quadro, emPe }: { modo: ModoDasGuias; quadro: Tamanho; emPe: boolean }) {
  const desenho = desenhoDasGuias(modo, emPe);
  const { largura: l, altura: a } = quadro;
  if (modo === "desligadas" || !l || !a) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${l} ${a}`} aria-hidden>
      {desenho.cobertas.map((area) => (
        <g key={area.nome}>
          <rect x={area.x * l} y={area.y * a} width={area.largura * l} height={area.altura * a} fill="rgb(0 0 0 / 0.45)" stroke="rgb(255 255 255 / 0.5)" strokeDasharray="4 3" />
          <text x={(area.x + area.largura / 2) * l} y={(area.y + area.altura / 2) * a} fill="rgb(255 255 255 / 0.75)" fontSize={10} textAnchor="middle" dominantBaseline="middle">
            {area.nome}
          </text>
        </g>
      ))}
      {desenho.contornos.map((area, indice) => (
        <rect key={indice} x={area.x * l} y={area.y * a} width={area.largura * l} height={area.altura * a} fill="none" stroke="rgb(255 255 255 / 0.6)" strokeDasharray="5 4" />
      ))}
      {desenho.linhas.map((linha, indice) => (
        <line key={indice} x1={linha.x1 * l} y1={linha.y1 * a} x2={linha.x2 * l} y2={linha.y2 * a} stroke="rgb(255 255 255 / 0.45)" />
      ))}
    </svg>
  );
}
