"use client";

import { RotateCcw } from "lucide-react";
import { useRef, useState } from "react";

import { type CanalDaCurva, CURVA_NEUTRA, type Curvas, CURVAS_NEUTRAS, PONTOS_MAXIMOS_DA_CURVA, type PontoDaCurva, valorDaCurva } from "@/lib/projeto/cor";

type Props = {
  curvas: Curvas;
  desativado: boolean;
  /** Durante o arrasto; `null` desiste da mudança. */
  aoPrever: (curvas: Curvas | null) => void;
  aoConfirmar: (curvas: Curvas) => void;
};

const CANAIS: { id: CanalDaCurva; nome: string; cor: string }[] = [
  { id: "rgb", nome: "RGB", cor: "#e5e7eb" },
  { id: "r", nome: "R", cor: "#f87171" },
  { id: "g", nome: "G", cor: "#4ade80" },
  { id: "b", nome: "B", cor: "#60a5fa" },
];
const LADO = 200;
/** Distância mínima entre dois pontos, no eixo x. */
const VAO = 0.02;
/** Quão perto (em pixels) o clique precisa estar de um ponto para pegar nele. */
const RAIO_DO_PONTO = 8;

const limitar = (v: number, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, v));

/**
 * Curvas de cor: um gráfico por canal, de 0 a 1 nos dois eixos. Arrastar move um ponto, clicar fora
 * dos pontos cria um, duplo clique apaga. As pontas só sobem e descem.
 */
export function EditorDeCurva({ curvas, desativado, aoPrever, aoConfirmar }: Props) {
  const [canal, setCanal] = useState<CanalDaCurva>("rgb");
  const svgRef = useRef<SVGSVGElement>(null);
  const arrasto = useRef<{ indice: number; pontos: PontoDaCurva[] } | null>(null);
  const pontos = curvas[canal] ?? CURVA_NEUTRA;
  const corDoCanal = CANAIS.find((item) => item.id === canal)!.cor;

  const comCanal = (novos: PontoDaCurva[]): Curvas => ({ ...CURVAS_NEUTRAS, ...curvas, [canal]: novos });
  const noGrafico = (evento: React.PointerEvent | React.MouseEvent): [number, number] => {
    const caixa = svgRef.current!.getBoundingClientRect();
    return [limitar((evento.clientX - caixa.left) / caixa.width, 0, 1), limitar(1 - (evento.clientY - caixa.top) / caixa.height, 0, 1)];
  };
  const pontoPerto = (evento: React.PointerEvent | React.MouseEvent) => {
    const caixa = svgRef.current!.getBoundingClientRect();
    return pontos.findIndex(([x, y]) => Math.hypot(x * caixa.width - (evento.clientX - caixa.left), (1 - y) * caixa.height - (evento.clientY - caixa.top)) <= RAIO_DO_PONTO);
  };

  /** O ponto `indice` levado para (x, y), sem passar dos vizinhos; as pontas ficam em x = 0 e x = 1. */
  function mover(base: PontoDaCurva[], indice: number, [x, y]: [number, number]): PontoDaCurva[] {
    const novos = base.map((p) => [...p] as PontoDaCurva);
    const ponta = indice === 0 || indice === base.length - 1;
    novos[indice] = [ponta ? base[indice][0] : limitar(x, base[indice - 1][0] + VAO, base[indice + 1][0] - VAO), y];
    return novos;
  }

  function apertar(evento: React.PointerEvent<SVGSVGElement>) {
    if (desativado || evento.button !== 0) return;
    let indice = pontoPerto(evento);
    let base = pontos;
    if (indice < 0) {
      // Um ponto novo, na posição do clique, entre os vizinhos
      if (pontos.length >= PONTOS_MAXIMOS_DA_CURVA) return;
      const [x, y] = noGrafico(evento);
      indice = pontos.findIndex((p) => p[0] > x);
      if (indice <= 0 || x - pontos[indice - 1][0] < VAO || pontos[indice][0] - x < VAO) return;
      base = [...pontos.slice(0, indice), [x, y], ...pontos.slice(indice)];
      aoPrever(comCanal(base));
    }
    arrasto.current = { indice, pontos: base };
    evento.currentTarget.setPointerCapture(evento.pointerId);
  }

  function mexer(evento: React.PointerEvent<SVGSVGElement>) {
    const atual = arrasto.current;
    if (!atual) return;
    atual.pontos = mover(atual.pontos, atual.indice, noGrafico(evento));
    aoPrever(comCanal(atual.pontos));
  }

  function soltar() {
    const atual = arrasto.current;
    arrasto.current = null;
    if (atual) aoConfirmar(comCanal(atual.pontos));
  }

  function apagar(evento: React.MouseEvent<SVGSVGElement>) {
    const indice = pontoPerto(evento);
    if (desativado || indice <= 0 || indice >= pontos.length - 1) return;
    aoConfirmar(comCanal(pontos.filter((_, i) => i !== indice)));
  }

  // A curva desenhada com 64 trechos, pela mesma conta que a prévia e o render usam
  const caminho = Array.from({ length: 65 }, (_, i) => {
    const x = i / 64;
    return `${i ? "L" : "M"}${(x * LADO).toFixed(1)},${((1 - valorDaCurva(pontos, x)) * LADO).toFixed(1)}`;
  }).join(" ");
  const neutro = pontos.length === 2 && pontos[0][1] === 0 && pontos[1][1] === 1;

  return (
    <div className="mt-1">
      <div className="mb-1 flex items-center gap-1">
        {CANAIS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={canal === item.id}
            onClick={() => setCanal(item.id)}
            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${canal === item.id ? "bg-painel-2 text-texto" : "text-suave hover:text-texto"}`}
            style={{ color: canal === item.id ? item.cor : undefined }}
          >
            {item.nome}
          </button>
        ))}
        <button
          type="button"
          className="botao-icone ml-auto size-6"
          disabled={desativado || neutro}
          onClick={() => aoConfirmar(comCanal(CURVA_NEUTRA))}
          aria-label="Voltar esta curva ao normal"
          title="Voltar esta curva ao normal"
        >
          <RotateCcw className="size-3.5" aria-hidden />
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${LADO} ${LADO}`}
        className={`aspect-square w-full touch-none rounded-md border border-borda bg-black/40 ${desativado ? "opacity-50" : "cursor-crosshair"}`}
        role="img"
        aria-label={`Curva ${CANAIS.find((item) => item.id === canal)!.nome}. Clique para criar um ponto, arraste para mover, duplo clique para apagar.`}
        onPointerDown={apertar}
        onPointerMove={mexer}
        onPointerUp={soltar}
        onPointerCancel={() => {
          arrasto.current = null;
          aoPrever(null);
        }}
        onDoubleClick={apagar}
      >
        {[0.25, 0.5, 0.75].map((v) => (
          <g key={v} stroke="rgba(255,255,255,0.08)">
            <line x1={v * LADO} y1={0} x2={v * LADO} y2={LADO} />
            <line x1={0} y1={v * LADO} x2={LADO} y2={v * LADO} />
          </g>
        ))}
        <line x1={0} y1={LADO} x2={LADO} y2={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
        <path d={caminho} fill="none" stroke={corDoCanal} strokeWidth={2} />
        {pontos.map(([x, y], i) => (
          <circle key={i} cx={x * LADO} cy={(1 - y) * LADO} r={4} fill="#111" stroke={corDoCanal} strokeWidth={2} />
        ))}
      </svg>
    </div>
  );
}
