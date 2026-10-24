"use client";

// O Corte de perspectiva (ADR 0003, onda 13.6), em pixels da imagem: arrastar desenha o retângulo, os quatro cantos
// vão para os cantos do que deveria ser reto (a fachada, o quadro, a folha), dentro arrasta tudo; a grade mostra o
// plano como vai ficar. Clique duplo ou Enter confirma.
import { useRef, useState } from "react";

import type { TamanhoDaImagem } from "@/lib/projeto/imagem";
import { homografia, type Ponto, type Quadrilatero } from "@/lib/transformar/malha";

type Props = {
  quad: Quadrilatero | null;
  imagem: TamanhoDaImagem;
  /** Pixels da tela por pixel da imagem. */
  escala: number;
  grade: boolean;
  aoMudar: (quad: Quadrilatero) => void;
  aoConfirmar: () => void;
};

type Pegada = { tipo: "novo"; inicio: Ponto } | { tipo: "canto"; i: number; quad: Quadrilatero; inicio: Ponto } | { tipo: "mover"; quad: Quadrilatero; inicio: Ponto };

function dentroDe(q: Quadrilatero, p: Ponto): boolean {
  let dentro = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const a = q[i];
    const b = q[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

export function CortePerspectivaNaPrevia({ quad, imagem, escala, grade, aoMudar, aoConfirmar }: Props) {
  const pegada = useRef<Pegada | null>(null);
  const [cursor, setCursor] = useState("crosshair");
  const paraImagem = (evento: React.PointerEvent) => {
    const r = (evento.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (evento.clientX - r.left) / escala, y: (evento.clientY - r.top) / escala };
  };
  const cantoEm = (p: Ponto) => (quad ? quad.findIndex((c) => Math.hypot((c.x - p.x) * escala, (c.y - p.y) * escala) <= 9) : -1);

  function apertar(evento: React.PointerEvent) {
    if (evento.button !== 0) return;
    evento.stopPropagation();
    if (evento.detail >= 2 && quad) return aoConfirmar();
    (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
    const p = paraImagem(evento);
    const i = cantoEm(p);
    if (quad && i >= 0) pegada.current = { tipo: "canto", i, quad, inicio: p };
    else if (quad && dentroDe(quad, p)) pegada.current = { tipo: "mover", quad, inicio: p };
    else pegada.current = { tipo: "novo", inicio: p };
  }
  function mover(evento: React.PointerEvent) {
    const p = paraImagem(evento);
    const atual = pegada.current;
    if (!atual) {
      setCursor(cantoEm(p) >= 0 ? "move" : quad && dentroDe(quad, p) ? "move" : "crosshair");
      return;
    }
    if (atual.tipo === "novo") {
      const x0 = Math.min(atual.inicio.x, p.x);
      const y0 = Math.min(atual.inicio.y, p.y);
      const x1 = Math.max(atual.inicio.x, p.x);
      const y1 = Math.max(atual.inicio.y, p.y);
      if ((x1 - x0) * escala < 4 || (y1 - y0) * escala < 4) return;
      aoMudar([
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ]);
      return;
    }
    const dx = p.x - atual.inicio.x;
    const dy = p.y - atual.inicio.y;
    if (atual.tipo === "mover") return aoMudar(atual.quad.map((c) => ({ x: c.x + dx, y: c.y + dy })) as Quadrilatero);
    const novo = [...atual.quad] as Quadrilatero;
    novo[atual.i] = { x: atual.quad[atual.i].x + dx, y: atual.quad[atual.i].y + dy };
    aoMudar(novo);
  }
  function soltar() {
    pegada.current = null;
  }

  const k = escala;
  const linhas: Ponto[][] = [];
  if (quad && grade) {
    const mapa = homografia(quad);
    for (let i = 1; i < 8; i++) {
      linhas.push(Array.from({ length: 17 }, (_, j) => mapa(i / 8, j / 16)));
      linhas.push(Array.from({ length: 17 }, (_, j) => mapa(j / 16, i / 8)));
    }
  }
  const pontos = (lista: Ponto[]) => lista.map((p) => `${p.x * k},${p.y * k}`).join(" ");
  return (
    <div className="absolute inset-0 z-20 touch-none" style={{ cursor }} onPointerDown={apertar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} aria-label="Corte de perspectiva">
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        {quad ? (
          <>
            <path d={`M -10000 -10000 H ${imagem.largura * k + 10000} V ${imagem.altura * k + 10000} H -10000 Z M ${quad.map((p) => `${p.x * k} ${p.y * k}`).join(" L ")} Z`} fillRule="evenodd" fill="#000" fillOpacity={0.55} />
            {linhas.map((linha, i) => (
              <polyline key={i} points={pontos(linha)} fill="none" stroke="#fff" strokeOpacity={0.45} strokeWidth={1} />
            ))}
            <polygon points={pontos(quad)} fill="none" stroke="#fff" strokeWidth={1.5} />
            {quad.map((p, i) => (
              <rect key={i} x={p.x * k - 5} y={p.y * k - 5} width={10} height={10} fill="#fff" stroke="#000" strokeWidth={1} />
            ))}
          </>
        ) : null}
      </svg>
    </div>
  );
}
