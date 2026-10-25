"use client";

// A grade de perspectiva na prévia (ADR 0003, onda 13.16): as linhas dos planos (o ativo mais forte), o horizonte e os
// pontos de fuga. Com a ferramenta Grade de perspectiva, as alças mudam os pontos de fuga (pelo horizonte; o terceiro,
// livre), o horizonte e o pé da grade. Com a Seleção de perspectiva, o arrasto leva a camada escolhida para o plano ativo
// (o ponteiro é o canto de baixo dela) e solta ao largar.
import { useState } from "react";

import type { Tamanho } from "@/lib/projeto/geometria";
import { aplicarH, type GradeDePerspectiva, homografiaDoPlano, linhasDaGrade, noPlano, PLANOS, type PlanoDaPerspectiva } from "@/lib/vetor/perspectiva";
import { pontoNoElemento } from "./pontoNaVista";

type Ponto = { x: number; y: number };
type Alca = { tipo: "fuga"; indice: number } | { tipo: "horizonte" } | { tipo: "origem" };

type Props = {
  quadro: Tamanho;
  documento: Tamanho;
  grade: GradeDePerspectiva;
  /** "editar" mostra as alças; "levar" leva a camada escolhida; "ver" só mostra a grade. */
  modo: "editar" | "levar" | "ver";
  /** O tamanho da camada escolhida (pixels da imagem), para a Seleção de perspectiva. */
  tamanhoDaCamada?: { largura: number; altura: number } | null;
  aoMudar?: (grade: GradeDePerspectiva, provisorio: boolean) => void;
  /** A Seleção de perspectiva: o lugar no plano ativo (as coordenadas do canto de baixo). */
  aoLevar?: (plano: PlanoDaPerspectiva, a: number, b: number) => void;
};

const COR_DO_PLANO: Record<PlanoDaPerspectiva, string> = { esquerdo: "#3b82f6", direito: "#f97316", chao: "#22c55e" };

/** Os cantos da camada no plano, com o canto de baixo em (a, b) (na parede da esquerda, a cresce para a esquerda). */
export function cantosNoPlano(grade: GradeDePerspectiva, plano: PlanoDaPerspectiva, a: number, b: number, largura: number, altura: number): Ponto[] {
  const h = homografiaDoPlano(grade, plano);
  const espelhar = plano === "esquerdo" && grade.tipo !== 1;
  const em = (x: number, y: number) => aplicarH(h, espelhar ? a - x : a + x, b + altura - y);
  return [em(0, 0), em(largura, 0), em(largura, altura), em(0, altura)];
}

export function PerspectivaNaPrevia({ quadro, documento, grade, modo, tamanhoDaCamada, aoMudar, aoLevar }: Props) {
  const escala = quadro.largura / documento.largura;
  const [alca, setAlca] = useState<Alca | null>(null);
  const [levando, setLevando] = useState<{ a: number; b: number } | null>(null);
  const noDocumento = (evento: React.PointerEvent<HTMLDivElement>) => {
    const p = pontoNoElemento(evento, evento.currentTarget);
    return { x: p.x / escala, y: p.y / escala };
  };
  const planos = PLANOS;
  const alcas: { alca: Alca; p: Ponto }[] = [
    ...grade.fuga.map((p, indice) => ({ alca: { tipo: "fuga" as const, indice }, p })),
    { alca: { tipo: "horizonte" }, p: { x: documento.largura / 2, y: grade.horizonte } },
    { alca: { tipo: "origem" }, p: grade.origem },
  ];
  const mover = (a: Alca, p: Ponto): GradeDePerspectiva => {
    if (a.tipo === "origem") return { ...grade, origem: p };
    if (a.tipo === "horizonte") {
      const dy = p.y - grade.horizonte;
      // Os pontos de fuga do horizonte vão junto (o terceiro fica)
      return { ...grade, horizonte: p.y, fuga: grade.fuga.map((f, i) => (grade.tipo === 3 && i === 2 ? f : { ...f, y: f.y + dy })) };
    }
    return { ...grade, fuga: grade.fuga.map((f, i) => (i !== a.indice ? f : grade.tipo === 3 && i === 2 ? p : { x: p.x, y: grade.horizonte })) };
  };
  const interativo = modo !== "ver";
  return (
    <div
      className={`absolute inset-0 ${interativo ? "touch-none" : "pointer-events-none"}`}
      style={{ cursor: modo === "levar" ? "move" : alca ? "grabbing" : "default" }}
      data-grade-de-perspectiva={modo}
      onPointerDown={(evento) => {
        if (!interativo || evento.button !== 0) return;
        evento.stopPropagation();
        const p = noDocumento(evento);
        evento.currentTarget.setPointerCapture(evento.pointerId);
        if (modo === "levar") {
          const q = noPlano(grade, grade.plano, p);
          setLevando(q);
          return;
        }
        const perto = alcas.find(({ p: q }) => Math.hypot(q.x - p.x, q.y - p.y) * escala < 9);
        if (perto) setAlca(perto.alca);
      }}
      onPointerMove={(evento) => {
        const p = noDocumento(evento);
        if (levando) setLevando(noPlano(grade, grade.plano, p));
        else if (alca) aoMudar?.(mover(alca, p), true);
      }}
      onPointerUp={(evento) => {
        const p = noDocumento(evento);
        if (levando) {
          const q = noPlano(grade, grade.plano, p);
          aoLevar?.(grade.plano, q.a, q.b);
        } else if (alca) aoMudar?.(mover(alca, p), false);
        setLevando(null);
        setAlca(null);
      }}
    >
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        <g transform={`scale(${escala})`}>
          {planos.map((plano) =>
            linhasDaGrade(grade, plano).map(([a, b], i) => (
              <line key={`${plano}-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COR_DO_PLANO[plano]} strokeOpacity={plano === grade.plano ? 0.7 : 0.25} strokeWidth={1} vectorEffect="non-scaling-stroke" data-linha-da-grade={plano} />
            )),
          )}
          <line x1={-documento.largura} y1={grade.horizonte} x2={documento.largura * 2} y2={grade.horizonte} stroke="#94a3b8" strokeWidth={1} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          {modo === "levar" && levando && tamanhoDaCamada ? (
            <polygon points={cantosNoPlano(grade, grade.plano, levando.a, levando.b, tamanhoDaCamada.largura, tamanhoDaCamada.altura).map((q) => `${q.x},${q.y}`).join(" ")} fill={COR_DO_PLANO[grade.plano]} fillOpacity={0.2} stroke={COR_DO_PLANO[grade.plano]} strokeWidth={1.5} vectorEffect="non-scaling-stroke" data-camada-no-plano />
          ) : null}
        </g>
        {modo === "editar"
          ? alcas.map(({ alca: a, p }, i) => (
              <circle key={i} cx={p.x * escala} cy={p.y * escala} r={5} fill="#fff" stroke={a.tipo === "origem" ? "#22c55e" : a.tipo === "horizonte" ? "#94a3b8" : "#e11d48"} strokeWidth={2} data-alca-da-grade={a.tipo} />
            ))
          : null}
      </svg>
    </div>
  );
}
