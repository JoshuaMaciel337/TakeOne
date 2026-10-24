"use client";

// A caixa do Corte (ADR 0003, onda 13.6), em pixels da imagem: dentro arrasta, os cantos e os meios dos lados mudam o
// tamanho (com a proporção presa, se houver; Shift prende a do momento, Alt parte do centro), fora gira (Shift de 15 em
// 15°) e, no Endireitar, uma linha arrastada sobre o horizonte acerta o giro. Fora da caixa, o escudo escurece (ou
// esconde) o que sai. As sobreposições ajudam a enquadrar.
import { useRef, useState } from "react";

import type { CaixaDoCorte, TamanhoDaImagem } from "@/lib/projeto/imagem";
import { pontoNoElemento } from "./pontoNaVista";

export type SobreposicaoDoCorte = "nenhuma" | "tercos" | "grade" | "diagonal" | "triangulo" | "aurea" | "espiral";
export const SOBREPOSICOES_DO_CORTE: { id: SobreposicaoDoCorte; nome: string }[] = [
  { id: "tercos", nome: "Regra dos terços" },
  { id: "grade", nome: "Grade" },
  { id: "diagonal", nome: "Diagonal" },
  { id: "triangulo", nome: "Triângulo" },
  { id: "aurea", nome: "Proporção áurea" },
  { id: "espiral", nome: "Espiral áurea" },
  { id: "nenhuma", nome: "Nenhuma" },
];

type Props = {
  caixa: CaixaDoCorte;
  imagem: TamanhoDaImagem;
  /** Pixels da tela por pixel da imagem. */
  escala: number;
  /** Largura sobre altura presa; null é livre. */
  proporcao: number | null;
  sobreposicao: SobreposicaoDoCorte;
  /** A espiral áurea: de 0 a 3 (as quatro orientações). */
  orientacaoDaEspiral: number;
  escudo: { ligado: boolean; opacidade: number };
  mostrarCortada: boolean;
  endireitando: boolean;
  aoMudar: (caixa: CaixaDoCorte) => void;
  aoEndireitar: (angulo: number) => void;
};

type Pegada = { tipo: "mover" } | { tipo: "girar" } | { tipo: "alca"; u: number; v: number } | { tipo: "linha" };
const MINIMO = 16;
const ALCAS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
] as const;

const graus = (r: number) => (r * 180) / Math.PI;
const radianos = (g: number) => (g * Math.PI) / 180;

/** O ponto no referencial da caixa (sem o giro, a partir do centro). */
function naCaixa(caixa: CaixaDoCorte, p: { x: number; y: number }) {
  const r = radianos(-caixa.angulo);
  const dx = p.x - caixa.cx;
  const dy = p.y - caixa.cy;
  return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
}
function doReferencial(caixa: CaixaDoCorte, p: { x: number; y: number }) {
  const r = radianos(caixa.angulo);
  return { x: caixa.cx + p.x * Math.cos(r) - p.y * Math.sin(r), y: caixa.cy + p.x * Math.sin(r) + p.y * Math.cos(r) };
}

/** As linhas da sobreposição, no referencial da caixa (de 0 a largura e de 0 a altura). */
function linhasDaSobreposicao(tipo: SobreposicaoDoCorte, l: number, a: number): [number, number, number, number][] {
  const linhas: [number, number, number, number][] = [];
  if (tipo === "tercos" || tipo === "aurea") {
    const cortes = tipo === "tercos" ? [1 / 3, 2 / 3] : [0.382, 0.618];
    for (const t of cortes) {
      linhas.push([l * t, 0, l * t, a]);
      linhas.push([0, a * t, l, a * t]);
    }
  } else if (tipo === "grade") {
    const passo = Math.max(l, a) / 12;
    for (let x = passo; x < l; x += passo) linhas.push([x, 0, x, a]);
    for (let y = passo; y < a; y += passo) linhas.push([0, y, l, y]);
  } else if (tipo === "diagonal") {
    const m = Math.min(l, a);
    linhas.push([0, 0, m, m], [l, 0, l - m, m], [0, a, m, a - m], [l, a, l - m, a - m]);
  } else if (tipo === "triangulo") {
    // A diagonal e as perpendiculares a ela que saem dos outros dois cantos
    linhas.push([0, a, l, 0]);
    const d2 = l * l + a * a;
    const pe = (px: number, py: number): [number, number] => {
      const t = ((px - 0) * l + (py - a) * -a) / d2;
      return [t * l, a - t * a];
    };
    const [x1, y1] = pe(0, 0);
    const [x2, y2] = pe(l, a);
    linhas.push([0, 0, x1, y1], [l, a, x2, y2]);
  }
  return linhas;
}


const FI = (1 + Math.sqrt(5)) / 2;

/**
 * A espiral áurea num retângulo de φ × 1: os quadrados que saem dele (à esquerda, em cima, à direita, embaixo, de novo)
 * e um quarto de círculo em cada, emendados. Na tela, o grupo é esticado até a caixa e espelhado pela orientação.
 */
function espiralAurea(): { linhas: [number, number, number, number][]; caminho: string } {
  const linhas: [number, number, number, number][] = [];
  const partes: string[] = [];
  let x = 0;
  let y = 0;
  let w = FI;
  let h = 1;
  for (let k = 0; k < 10; k++) {
    if (k % 2 === 0) {
      const s = h;
      if (k % 4 === 0) {
        partes.push(`${k ? "L" : "M"} ${x} ${y + h} A ${s} ${s} 0 0 1 ${x + s} ${y}`);
        linhas.push([x + s, y, x + s, y + h]);
        x += s;
      } else {
        partes.push(`L ${x + w} ${y} A ${s} ${s} 0 0 1 ${x + w - s} ${y + h}`);
        linhas.push([x + w - s, y, x + w - s, y + h]);
      }
      w -= s;
    } else {
      const s = w;
      if (k % 4 === 1) {
        partes.push(`L ${x} ${y} A ${s} ${s} 0 0 1 ${x + s} ${y + s}`);
        linhas.push([x, y + s, x + w, y + s]);
        y += s;
      } else {
        partes.push(`L ${x + w} ${y + h} A ${s} ${s} 0 0 1 ${x} ${y + h - s}`);
        linhas.push([x, y + h - s, x + w, y + h - s]);
      }
      h -= s;
    }
  }
  return { linhas, caminho: partes.join(" ") };
}
const ESPIRAL = espiralAurea();

export function RecorteNaPrevia({ caixa, imagem, escala, proporcao, sobreposicao, orientacaoDaEspiral, escudo, mostrarCortada, endireitando, aoMudar, aoEndireitar }: Props) {
  const inicio = useRef<{ p: { x: number; y: number }; caixa: CaixaDoCorte; pegada: Pegada; anguloInicial: number } | null>(null);
  const [linha, setLinha] = useState<{ de: { x: number; y: number }; ate: { x: number; y: number } } | null>(null);
  const [cursor, setCursor] = useState("move");
  const paraImagem = (evento: React.PointerEvent) => {
    const p = pontoNoElemento(evento, evento.currentTarget as HTMLElement);
    return { x: p.x / escala, y: p.y / escala };
  };
  const pegadaEm = (p: { x: number; y: number }): Pegada => {
    if (endireitando) return { tipo: "linha" };
    const local = naCaixa(caixa, p);
    for (const [u, v] of ALCAS) {
      if (Math.hypot((local.x - (u * caixa.largura) / 2) * escala, (local.y - (v * caixa.altura) / 2) * escala) <= 9) return { tipo: "alca", u, v };
    }
    const dentro = Math.abs(local.x) <= caixa.largura / 2 && Math.abs(local.y) <= caixa.altura / 2;
    return dentro ? { tipo: "mover" } : { tipo: "girar" };
  };

  function apertar(evento: React.PointerEvent) {
    if (evento.button !== 0) return;
    evento.stopPropagation();
    (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
    const p = paraImagem(evento);
    const pegada = pegadaEm(p);
    inicio.current = { p, caixa, pegada, anguloInicial: Math.atan2(p.y - caixa.cy, p.x - caixa.cx) };
    if (pegada.tipo === "linha") setLinha({ de: p, ate: p });
  }

  function mover(evento: React.PointerEvent) {
    const p = paraImagem(evento);
    const atual = inicio.current;
    if (!atual) {
      const pegada = pegadaEm(p);
      setCursor(pegada.tipo === "mover" ? "move" : pegada.tipo === "girar" ? "alias" : "crosshair");
      return;
    }
    const c = atual.caixa;
    if (atual.pegada.tipo === "linha") {
      setLinha({ de: atual.p, ate: p });
      return;
    }
    if (atual.pegada.tipo === "mover") {
      aoMudar({ ...c, cx: c.cx + p.x - atual.p.x, cy: c.cy + p.y - atual.p.y });
      return;
    }
    if (atual.pegada.tipo === "girar") {
      let angulo = c.angulo + graus(Math.atan2(p.y - c.cy, p.x - c.cx) - atual.anguloInicial);
      if (evento.shiftKey) angulo = Math.round(angulo / 15) * 15;
      aoMudar({ ...c, angulo: ((((angulo + 180) % 360) + 360) % 360) - 180 });
      return;
    }
    // Uma alça: o lado (ou o canto) oposto fica parado (ou o centro, com Alt)
    const { u, v } = atual.pegada;
    const local = naCaixa(c, p);
    const doCentro = evento.altKey;
    const fixoX = doCentro ? 0 : (-u * c.largura) / 2;
    const fixoY = doCentro ? 0 : (-v * c.altura) / 2;
    let largura = u ? Math.max(MINIMO, Math.abs(local.x - fixoX) * (doCentro ? 2 : 1)) : c.largura;
    let altura = v ? Math.max(MINIMO, Math.abs(local.y - fixoY) * (doCentro ? 2 : 1)) : c.altura;
    const presa = proporcao ?? (evento.shiftKey ? c.largura / c.altura : null);
    if (presa) {
      if (u && v) {
        if (largura / altura > presa) altura = largura / presa;
        else largura = altura * presa;
      } else if (u) altura = largura / presa;
      else largura = altura * presa;
    }
    // O novo centro, no referencial da caixa: a partir do ponto fixo
    const centroLocal = doCentro ? { x: 0, y: 0 } : { x: u ? fixoX + (u * largura) / 2 : 0, y: v ? fixoY + (v * altura) / 2 : 0 };
    const centro = doReferencial(c, centroLocal);
    aoMudar({ ...c, cx: centro.x, cy: centro.y, largura, altura });
  }

  function soltar() {
    const atual = inicio.current;
    inicio.current = null;
    if (atual?.pegada.tipo === "linha" && linha) {
      const dx = linha.ate.x - linha.de.x;
      const dy = linha.ate.y - linha.de.y;
      setLinha(null);
      if (Math.hypot(dx, dy) * escala < 8) return;
      // A linha vira horizontal (ou vertical, se ela é mais em pé)
      let angulo = graus(Math.atan2(dy, dx));
      if (angulo > 45 && angulo <= 135) angulo -= 90;
      else if (angulo < -45 && angulo >= -135) angulo += 90;
      else if (angulo > 135) angulo -= 180;
      else if (angulo < -135) angulo += 180;
      aoEndireitar(angulo);
    }
  }

  // Na tela
  const k = escala;
  const cantos = ALCAS.filter(([u, v]) => u && v).map(([u, v]) => doReferencial(caixa, { x: (u * caixa.largura) / 2, y: (v * caixa.altura) / 2 }));
  const ordem = [cantos[0], cantos[1], cantos[2], cantos[3]];
  const poligono = ordem.map((p) => `${p.x * k},${p.y * k}`).join(" ");
  const fora = `M ${-10000} ${-10000} H ${imagem.largura * k + 10000} V ${imagem.altura * k + 10000} H ${-10000} Z M ${ordem.map((p) => `${p.x * k} ${p.y * k}`).join(" L ")} Z`;
  const linhas = linhasDaSobreposicao(sobreposicao, caixa.largura * k, caixa.altura * k);
  // A espiral: no retângulo de φ × 1, esticada até a caixa e espelhada pela orientação
  const espiral = `${orientacaoDaEspiral & 1 ? `translate(${caixa.largura * k} 0) scale(-1 1)` : ""} ${orientacaoDaEspiral & 2 ? `translate(0 ${caixa.altura * k}) scale(1 -1)` : ""} scale(${(caixa.largura * k) / FI} ${caixa.altura * k})`;
  const transformacaoLocal = `translate(${caixa.cx * k} ${caixa.cy * k}) rotate(${caixa.angulo}) translate(${(-caixa.largura * k) / 2} ${(-caixa.altura * k) / 2})`;
  return (
    <div className="absolute inset-0 z-20 touch-none" style={{ cursor: endireitando ? "crosshair" : cursor }} onPointerDown={apertar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar} aria-label="Área que fica">
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        {escudo.ligado || !mostrarCortada ? <path d={fora} fillRule="evenodd" fill={mostrarCortada ? "#000" : "var(--to-fundo, #111)"} fillOpacity={mostrarCortada ? escudo.opacidade : 1} /> : null}
        <polygon points={poligono} fill="none" stroke="#fff" strokeWidth={1.5} />
        <g transform={transformacaoLocal}>
          {linhas.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeOpacity={0.55} strokeWidth={1} />
          ))}
          {sobreposicao === "espiral" ? (
            <g transform={espiral}>
              {ESPIRAL.linhas.map(([x1, y1, x2, y2], i) => (
                <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeOpacity={0.45} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
              <path d={ESPIRAL.caminho} fill="none" stroke="#fff" strokeOpacity={0.8} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
            </g>
          ) : null}
        </g>
        {ALCAS.map(([u, v]) => {
          const p = doReferencial(caixa, { x: (u * caixa.largura) / 2, y: (v * caixa.altura) / 2 });
          return <rect key={`${u}${v}`} x={p.x * k - 5} y={p.y * k - 5} width={10} height={10} fill="#fff" stroke="#000" strokeWidth={1} transform={`rotate(${caixa.angulo} ${p.x * k} ${p.y * k})`} />;
        })}
        {linha ? <line x1={linha.de.x * k} y1={linha.de.y * k} x2={linha.ate.x * k} y2={linha.ate.y * k} stroke="#fff" strokeWidth={1.5} strokeDasharray="4 3" /> : null}
      </svg>
    </div>
  );
}
