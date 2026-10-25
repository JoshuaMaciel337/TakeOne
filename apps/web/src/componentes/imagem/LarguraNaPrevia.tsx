"use client";

// A ferramenta Largura do traço na prévia (ADR 0003, onda 13.16): os pontos de largura da forma escolhida aparecem no
// caminho, com as duas bordas; arrastar a partir do caminho põe (ou muda) um ponto com a largura até o ponteiro, nos
// dois lados (com Alt, só no lado arrastado), e o clique duplo num ponto o tira.
import { useState } from "react";

import type { Tamanho } from "@/lib/projeto/geometria";
import { svgDosCaminhos } from "@/lib/vetor/contorno";
import { comPontoDeLargura, larguraEm, pontosComT, type PontoDeLargura, tNoCaminho } from "@/lib/vetor/largura";
import type { Subcaminho } from "@/lib/vetor/modelo";
import { pontoNoElemento } from "./pontoNaVista";

type Ponto = { x: number; y: number };

type Props = {
  quadro: Tamanho;
  documento: Tamanho;
  /** Os caminhos da forma escolhida, em pixels da imagem. */
  caminhos: Subcaminho[];
  /** A largura do traço, em pixels da imagem. */
  largura: number;
  perfil: PontoDeLargura[];
  aoMudar: (perfil: PontoDeLargura[], provisorio: boolean) => void;
};

/** O ponto e a normal (para a esquerda de quem anda) do caminho em t. */
function noCaminho(sub: Subcaminho, t: number): { p: Ponto; normal: Ponto } | null {
  const lista = pontosComT(sub);
  if (lista.length < 2) return null;
  const i = Math.max(1, lista.findIndex((item) => item.t >= t));
  const a = lista[i - 1];
  const b = lista[Math.min(lista.length - 1, i)];
  const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  const dx = b.p.x - a.p.x;
  const dy = b.p.y - a.p.y;
  const d = Math.hypot(dx, dy) || 1;
  return { p: { x: a.p.x + dx * f, y: a.p.y + dy * f }, normal: { x: dy / d, y: -dx / d } };
}

export function LarguraNaPrevia({ quadro, documento, caminhos, largura, perfil, aoMudar }: Props) {
  const escala = quadro.largura / documento.largura;
  const [arrasto, setArrasto] = useState<{ t: number; p: Ponto; normal: Ponto; alt: boolean; inicial: PontoDeLargura[]; ultimo: PontoDeLargura[] | null } | null>(null);
  const noDocumento = (evento: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    const p = pontoNoElemento(evento, evento.currentTarget);
    return { x: p.x / escala, y: p.y / escala };
  };
  const meia = largura / 2;
  // O ponto de largura de t perto de q (na tela, a 8 pixels)
  const pontoPerto = (q: Ponto) =>
    perfil.findIndex((ponto) =>
      caminhos.some((sub) => {
        const em = noCaminho(sub, ponto.t);
        return em && Math.hypot(em.p.x - q.x, em.p.y - q.y) * escala < 8;
      }),
    );
  return (
    <div
      className="absolute inset-0 touch-none"
      style={{ cursor: "crosshair" }}
      data-largura-do-traco
      onPointerDown={(evento) => {
        if (evento.button !== 0) return;
        evento.stopPropagation();
        const q = noDocumento(evento);
        const perto = tNoCaminho(caminhos, q);
        // Perto do caminho ou da borda do traço
        if (!perto || (perto.distancia - meia * 4) * escala > 10) return;
        const existente = pontoPerto(q);
        const t = existente >= 0 ? perfil[existente].t : perto.t;
        const em = noCaminho(caminhos[perto.sub], t);
        if (!em) return;
        evento.currentTarget.setPointerCapture(evento.pointerId);
        setArrasto({ t, p: em.p, normal: em.normal, alt: evento.altKey, inicial: perfil, ultimo: null });
      }}
      onPointerMove={(evento) => {
        if (!arrasto) return;
        const q = noDocumento(evento);
        // A largura até o ponteiro, pela normal (o lado é o sinal)
        const lado = (q.x - arrasto.p.x) * arrasto.normal.x + (q.y - arrasto.p.y) * arrasto.normal.y;
        const fator = Math.abs(lado) / Math.max(1e-6, meia);
        const atual = larguraEm(arrasto.inicial, arrasto.t);
        const novo = arrasto.alt ? (lado >= 0 ? comPontoDeLargura(arrasto.inicial, arrasto.t, fator, atual.direita) : comPontoDeLargura(arrasto.inicial, arrasto.t, atual.esquerda, fator)) : comPontoDeLargura(arrasto.inicial, arrasto.t, fator, fator);
        setArrasto({ ...arrasto, ultimo: novo });
        aoMudar(novo, true);
      }}
      onPointerUp={() => {
        if (arrasto?.ultimo) aoMudar(arrasto.ultimo, false);
        setArrasto(null);
      }}
      onDoubleClick={(evento) => {
        const i = pontoPerto(noDocumento(evento));
        if (i >= 0) aoMudar(perfil.filter((_, k) => k !== i), false);
      }}
    >
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        <g transform={`scale(${escala})`}>
          <path d={svgDosCaminhos(caminhos)} fill="none" stroke="#2f80ff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {perfil.flatMap((ponto, i) =>
            caminhos.map((sub, s) => {
              const em = noCaminho(sub, ponto.t);
              if (!em) return null;
              const esquerda = { x: em.p.x + em.normal.x * meia * ponto.esquerda, y: em.p.y + em.normal.y * meia * ponto.esquerda };
              const direita = { x: em.p.x - em.normal.x * meia * ponto.direita, y: em.p.y - em.normal.y * meia * ponto.direita };
              return (
                <g key={`${i}-${s}`} data-ponto-de-largura>
                  <line x1={esquerda.x} y1={esquerda.y} x2={direita.x} y2={direita.y} stroke="#2f80ff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <rect x={em.p.x - 3 / escala} y={em.p.y - 3 / escala} width={6 / escala} height={6 / escala} transform={`rotate(45 ${em.p.x} ${em.p.y})`} fill="#fff" stroke="#2f80ff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <circle cx={esquerda.x} cy={esquerda.y} r={2.5 / escala} fill="#2f80ff" />
                  <circle cx={direita.x} cy={direita.y} r={2.5 / escala} fill="#2f80ff" />
                </g>
              );
            }),
          )}
        </g>
      </svg>
    </div>
  );
}
