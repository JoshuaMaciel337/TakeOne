"use client";

// A ferramenta Malha de degradê na prévia (ADR 0003, onda 13.16): na forma escolhida sem malha, o clique cria a malha
// (com a cor de primeiro plano no ponto mais perto); com a malha, as linhas e os pontos aparecem, o clique num ponto o
// pinta com a cor de primeiro plano e o arrasto o leva para outro lugar (a cor vai junto).
import { useState } from "react";

import type { Tamanho } from "@/lib/projeto/geometria";
import type { MalhaDeDegrade } from "@/lib/vetor/malhaDeDegrade";
import { pontoNoElemento } from "./pontoNaVista";

type Ponto = { x: number; y: number };

type Props = {
  quadro: Tamanho;
  documento: Tamanho;
  malha: MalhaDeDegrade | null;
  /** Das frações da caixa da forma para a imagem, e de volta. */
  paraImagem: (p: Ponto) => Ponto;
  daImagem: (p: Ponto) => Ponto;
  cor: string;
  aoCriar: (onde: Ponto) => void;
  aoMudar: (malha: MalhaDeDegrade, provisorio: boolean) => void;
};

export function MalhaNaPrevia({ quadro, documento, malha, paraImagem, daImagem, cor, aoCriar, aoMudar }: Props) {
  const escala = quadro.largura / documento.largura;
  const [arrasto, setArrasto] = useState<{ indice: number; andou: boolean; inicio: Ponto; ultimo: MalhaDeDegrade | null } | null>(null);
  const noDocumento = (evento: React.PointerEvent<HTMLDivElement>) => {
    const p = pontoNoElemento(evento, evento.currentTarget);
    return { x: p.x / escala, y: p.y / escala };
  };
  // O ponto da malha perto do ponteiro (8 pixels da tela)
  const perto = (p: Ponto) => {
    if (!malha) return -1;
    let melhor = -1;
    let menor = 8;
    malha.pontos.forEach((q, i) => {
      const naImagem = paraImagem(q);
      const d = Math.hypot(naImagem.x - p.x, naImagem.y - p.y) * escala;
      if (d <= menor) [melhor, menor] = [i, d];
    });
    return melhor;
  };
  const colunas = malha ? malha.colunas + 1 : 0;
  const linhas: Ponto[][] = [];
  if (malha) {
    for (let l = 0; l <= malha.linhas; l++) linhas.push(Array.from({ length: colunas }, (_, c) => paraImagem(malha.pontos[l * colunas + c])));
    for (let c = 0; c < colunas; c++) linhas.push(Array.from({ length: malha.linhas + 1 }, (_, l) => paraImagem(malha.pontos[l * colunas + c])));
  }
  return (
    <div
      className="absolute inset-0 touch-none"
      style={{ cursor: "crosshair" }}
      data-malha-de-degrade
      onPointerDown={(evento) => {
        if (evento.button !== 0) return;
        evento.stopPropagation();
        const p = noDocumento(evento);
        if (!malha) return aoCriar(daImagem(p));
        const indice = perto(p);
        if (indice < 0) return;
        evento.currentTarget.setPointerCapture(evento.pointerId);
        setArrasto({ indice, andou: false, inicio: p, ultimo: null });
      }}
      onPointerMove={(evento) => {
        if (!arrasto || !malha) return;
        const p = noDocumento(evento);
        if (!arrasto.andou && Math.hypot(p.x - arrasto.inicio.x, p.y - arrasto.inicio.y) * escala < 3) return;
        const onde = daImagem(p);
        const nova = { ...malha, pontos: malha.pontos.map((q, i) => (i === arrasto.indice ? { ...q, x: onde.x, y: onde.y } : q)) };
        setArrasto({ ...arrasto, andou: true, ultimo: nova });
        aoMudar(nova, true);
      }}
      onPointerUp={() => {
        if (arrasto && malha) {
          // O clique sem arrastar pinta o ponto com a cor de primeiro plano
          if (!arrasto.andou) aoMudar({ ...malha, pontos: malha.pontos.map((q, i) => (i === arrasto.indice ? { ...q, cor } : q)) }, false);
          else if (arrasto.ultimo) aoMudar(arrasto.ultimo, false);
        }
        setArrasto(null);
      }}
    >
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        <g transform={`scale(${escala})`}>
          {linhas.map((linha, i) => (
            <polyline key={i} points={linha.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#2f80ff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
        {malha?.pontos.map((q, i) => {
          const p = paraImagem(q);
          return <circle key={i} cx={p.x * escala} cy={p.y * escala} r={4.5} fill={q.cor} stroke="#fff" strokeWidth={1.5} data-ponto-da-malha />;
        })}
      </svg>
    </div>
  );
}
