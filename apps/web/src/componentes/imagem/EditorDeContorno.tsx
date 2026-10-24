"use client";

// O editor de contorno dos estilos de camada (ADR 0003, onda 13.9): a curva que diz o que a borda do efeito faz, de 0 a
// 1 nos dois eixos. Clicar cria um ponto, arrastar move, duplo clique apaga; o ponto escolhido pode virar canto (a
// curva quebra nele) e ter a entrada e a saída digitadas. As pontas só sobem e descem.
import { useRef, useState } from "react";

import { tabelaDoContorno } from "@/lib/imagem/efeitos";
import type { ContornoDoEfeito, PontoDoContorno } from "@/lib/imagem/estiloDeCamada";
import { Moldura } from "./JanelasDePixels";

const LADO = 200;
const VAO = 0.02;
const RAIO = 8;
const PONTOS_MAXIMOS = 32;
const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function JanelaEditorDeContorno({ inicial, aoConfirmar, aoCancelar }: { inicial: ContornoDoEfeito; aoConfirmar: (contorno: ContornoDoEfeito) => void; aoCancelar: () => void }) {
  const [pontos, setPontos] = useState<PontoDoContorno[]>(inicial.pontos.map((p) => ({ ...p })));
  const [escolhido, setEscolhido] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const arrasto = useRef<number | null>(null);
  const noGrafico = (evento: React.PointerEvent | React.MouseEvent) => {
    const caixa = svgRef.current!.getBoundingClientRect();
    return { x: limitar((evento.clientX - caixa.left) / caixa.width, 0, 1), y: limitar(1 - (evento.clientY - caixa.top) / caixa.height, 0, 1) };
  };
  const perto = (evento: React.PointerEvent | React.MouseEvent) => {
    const caixa = svgRef.current!.getBoundingClientRect();
    return pontos.findIndex((p) => Math.hypot(p.x * caixa.width - (evento.clientX - caixa.left), (1 - p.y) * caixa.height - (evento.clientY - caixa.top)) <= RAIO);
  };
  const mover = (base: PontoDoContorno[], i: number, alvo: { x: number; y: number }) =>
    base.map((p, k) => (k !== i ? p : { ...p, x: k === 0 || k === base.length - 1 ? p.x : limitar(alvo.x, base[k - 1].x + VAO, base[k + 1].x - VAO), y: alvo.y }));
  const tabela = tabelaDoContorno({ pontos });
  const caminho = Array.from({ length: 65 }, (_, i) => `${i ? "L" : "M"}${((i / 64) * LADO).toFixed(1)},${((1 - tabela[Math.round((i / 64) * 255)]) * LADO).toFixed(1)}`).join(" ");
  const atual = pontos[escolhido];
  return (
    <Moldura titulo="Editor de contorno" aoFechar={aoCancelar} aoConfirmar={() => aoConfirmar({ nome: "Personalizado", pontos })}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${LADO} ${LADO}`}
        className="aspect-square w-full touch-none rounded-md border border-borda bg-black/40 cursor-crosshair"
        role="img"
        aria-label="Contorno. Clique para criar um ponto, arraste para mover, duplo clique para apagar."
        onPointerDown={(evento) => {
          if (evento.button !== 0) return;
          let i = perto(evento);
          let base = pontos;
          if (i < 0) {
            if (pontos.length >= PONTOS_MAXIMOS) return;
            const p = noGrafico(evento);
            i = pontos.findIndex((q) => q.x > p.x);
            if (i <= 0 || p.x - pontos[i - 1].x < VAO || pontos[i].x - p.x < VAO) return;
            base = [...pontos.slice(0, i), p, ...pontos.slice(i)];
            setPontos(base);
          }
          setEscolhido(i);
          arrasto.current = i;
          evento.currentTarget.setPointerCapture(evento.pointerId);
        }}
        onPointerMove={(evento) => {
          const i = arrasto.current;
          if (i === null) return;
          setPontos((base) => mover(base, i, noGrafico(evento)));
        }}
        onPointerUp={() => (arrasto.current = null)}
        onDoubleClick={(evento) => {
          const i = perto(evento);
          if (i <= 0 || i >= pontos.length - 1) return;
          setPontos((base) => base.filter((_, k) => k !== i));
          setEscolhido(0);
        }}
      >
        {[0.25, 0.5, 0.75].map((v) => (
          <g key={v} stroke="rgba(255,255,255,0.08)">
            <line x1={v * LADO} y1={0} x2={v * LADO} y2={LADO} />
            <line x1={0} y1={v * LADO} x2={LADO} y2={v * LADO} />
          </g>
        ))}
        <path d={caminho} fill="none" stroke="#e5e7eb" strokeWidth={2} />
        {pontos.map((p, i) =>
          p.canto ? (
            <rect key={i} x={p.x * LADO - 4} y={(1 - p.y) * LADO - 4} width={8} height={8} fill={i === escolhido ? "#2f80ff" : "#111"} stroke="#e5e7eb" strokeWidth={2} />
          ) : (
            <circle key={i} cx={p.x * LADO} cy={(1 - p.y) * LADO} r={4} fill={i === escolhido ? "#2f80ff" : "#111"} stroke="#e5e7eb" strokeWidth={2} />
          ),
        )}
      </svg>
      {atual ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-suave">
          <label className="flex items-center gap-1">
            Entrada
            <input aria-label="Entrada do ponto" className="w-14 rounded border border-borda bg-painel-2 px-1 text-right text-texto" value={Math.round(atual.x * 100)} disabled={escolhido === 0 || escolhido === pontos.length - 1} onChange={(evento) => setPontos((base) => mover(base, escolhido, { x: Number(evento.currentTarget.value) / 100, y: atual.y }))} />%
          </label>
          <label className="flex items-center gap-1">
            Saída
            <input aria-label="Saída do ponto" className="w-14 rounded border border-borda bg-painel-2 px-1 text-right text-texto" value={Math.round(atual.y * 100)} onChange={(evento) => setPontos((base) => mover(base, escolhido, { x: atual.x, y: limitar(Number(evento.currentTarget.value) / 100, 0, 1) }))} />%
          </label>
          <label className="flex items-center gap-1 text-texto">
            <input type="checkbox" checked={Boolean(atual.canto)} disabled={escolhido === 0 || escolhido === pontos.length - 1} onChange={(evento) => {
              const canto = evento.currentTarget.checked;
              setPontos((base) => base.map((p, k) => (k === escolhido ? { ...p, canto } : p)));
            }} />
            Canto
          </label>
        </div>
      ) : null}
    </Moldura>
  );
}
