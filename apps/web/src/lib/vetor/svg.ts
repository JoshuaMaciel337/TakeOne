// O atributo `d` de um caminho SVG em caminhos do editor (ADR 0003, onda 13.7): M, L, H, V, C, S, Q, T, A e Z, nas
// formas absoluta e relativa. As quadráticas viram cúbicas (as alças a 2/3 do ponto de controle) e os arcos viram
// cúbicas de até 90° cada (k = 4/3 · tan(θ/4)). A biblioteca de formas é escrita assim, e as formas importadas também.
import type { No, Subcaminho } from "./modelo.ts";

type Ponto = { x: number; y: number };

/** Os comandos e os números do texto. */
function fichas(d: string): (string | number)[] {
  const saida: (string | number)[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) saida.push(m[1] ?? Number(m[2]));
  return saida;
}

/** O arco do SVG (do ponto `de` ao `ate`) em cúbicas: os pontos de controle e o fim de cada uma. */
export function arcoEmCubicas(de: Ponto, rx: number, ry: number, rotacao: number, grande: boolean, horario: boolean, ate: Ponto): [Ponto, Ponto, Ponto][] {
  if (rx === 0 || ry === 0 || (de.x === ate.x && de.y === ate.y)) return [[de, ate, ate]];
  const fi = (rotacao * Math.PI) / 180;
  const cos = Math.cos(fi);
  const sen = Math.sin(fi);
  // Do ponto final ao centro (SVG 1.1, apêndice F.6.5)
  const dx = (de.x - ate.x) / 2;
  const dy = (de.y - ate.y) / 2;
  const x1 = cos * dx + sen * dy;
  const y1 = -sen * dx + cos * dy;
  let a = Math.abs(rx);
  let b = Math.abs(ry);
  const lambda = (x1 * x1) / (a * a) + (y1 * y1) / (b * b);
  if (lambda > 1) {
    a *= Math.sqrt(lambda);
    b *= Math.sqrt(lambda);
  }
  const num = a * a * b * b - a * a * y1 * y1 - b * b * x1 * x1;
  const den = a * a * y1 * y1 + b * b * x1 * x1;
  let raiz = Math.sqrt(Math.max(0, num / den));
  if (grande === horario) raiz = -raiz;
  const cx1 = (raiz * a * y1) / b;
  const cy1 = (-raiz * b * x1) / a;
  const cx = cos * cx1 - sen * cy1 + (de.x + ate.x) / 2;
  const cy = sen * cx1 + cos * cy1 + (de.y + ate.y) / 2;
  const angulo = (ux: number, uy: number, vx: number, vy: number) => {
    const sinal = ux * vy - uy * vx < 0 ? -1 : 1;
    const ponto = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))));
    return sinal * Math.acos(ponto);
  };
  const t1 = angulo(1, 0, (x1 - cx1) / a, (y1 - cy1) / b);
  let dt = angulo((x1 - cx1) / a, (y1 - cy1) / b, (-x1 - cx1) / a, (-y1 - cy1) / b);
  if (!horario && dt > 0) dt -= 2 * Math.PI;
  else if (horario && dt < 0) dt += 2 * Math.PI;
  const partes = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const passo = dt / partes;
  const k = (4 / 3) * Math.tan(passo / 4);
  const naElipse = (t: number) => ({ x: cx + a * Math.cos(t) * cos - b * Math.sin(t) * sen, y: cy + a * Math.cos(t) * sen + b * Math.sin(t) * cos });
  const derivada = (t: number) => ({ x: -a * Math.sin(t) * cos - b * Math.cos(t) * sen, y: -a * Math.sin(t) * sen + b * Math.cos(t) * cos });
  const saida: [Ponto, Ponto, Ponto][] = [];
  for (let i = 0; i < partes; i++) {
    const ta = t1 + passo * i;
    const tb = ta + passo;
    const pa = naElipse(ta);
    const pb = i === partes - 1 ? ate : naElipse(tb);
    const da = derivada(ta);
    const db = derivada(tb);
    saida.push([
      { x: pa.x + k * da.x, y: pa.y + k * da.y },
      { x: pb.x - k * db.x, y: pb.y - k * db.y },
      pb,
    ]);
  }
  return saida;
}

/** O `d` em caminhos (cada M começa um; Z fecha). As operações vêm de quem chama (todas somam). */
export function caminhosDoSvg(d: string): Subcaminho[] {
  const f = fichas(d);
  const saida: Subcaminho[] = [];
  let nos: No[] = [];
  let atual: Ponto = { x: 0, y: 0 };
  let inicio: Ponto = { x: 0, y: 0 };
  let ultimoControle: Ponto | null = null;
  let ultimoQuad: Ponto | null = null;
  let comando = "";
  let i = 0;
  const fechar = (fechado: boolean) => {
    if (nos.length > 1) {
      // Fechado com o último nó em cima do primeiro: o último vira o primeiro (com a alça de entrada dele)
      if (fechado) {
        const ultimo = nos[nos.length - 1];
        if (Math.abs(ultimo.x - nos[0].x) < 1e-6 && Math.abs(ultimo.y - nos[0].y) < 1e-6) {
          nos.pop();
          if (ultimo.ex !== undefined) nos[0] = { ...nos[0], ex: ultimo.ex, ey: ultimo.ey };
        }
      }
      if (nos.length > 1) saida.push({ nos, fechado, operacao: "somar" });
    }
    nos = [];
  };
  const num = () => {
    const v = f[i++];
    if (typeof v !== "number") throw new Error("Caminho SVG com número faltando.");
    return v;
  };
  const curva = (c1: Ponto, c2: Ponto, fim: Ponto) => {
    nos[nos.length - 1] = { ...nos[nos.length - 1], sx: c1.x, sy: c1.y };
    nos.push({ x: fim.x, y: fim.y, ex: c2.x, ey: c2.y });
    atual = fim;
  };
  while (i < f.length) {
    if (typeof f[i] === "string") comando = f[i++] as string;
    const rel = comando === comando.toLowerCase();
    const base = rel ? atual : { x: 0, y: 0 };
    const C = comando.toUpperCase();
    if (C === "Z") {
      fechar(true);
      atual = inicio;
      ultimoControle = ultimoQuad = null;
      continue;
    }
    if (C === "M") {
      fechar(false);
      atual = { x: base.x + num(), y: base.y + num() };
      inicio = atual;
      nos = [{ x: atual.x, y: atual.y }];
      // Os pares seguintes de um M são linhas
      comando = rel ? "l" : "L";
      ultimoControle = ultimoQuad = null;
      continue;
    }
    if (!nos.length) nos = [{ x: atual.x, y: atual.y }];
    if (C === "L" || C === "H" || C === "V") {
      if (C === "L") atual = { x: base.x + num(), y: base.y + num() };
      else if (C === "H") atual = { x: base.x + num(), y: atual.y };
      else atual = { x: atual.x, y: base.y + num() };
      nos.push({ x: atual.x, y: atual.y });
      ultimoControle = ultimoQuad = null;
    } else if (C === "C") {
      const c1 = { x: base.x + num(), y: base.y + num() };
      const c2 = { x: base.x + num(), y: base.y + num() };
      const fim = { x: base.x + num(), y: base.y + num() };
      curva(c1, c2, fim);
      ultimoControle = c2;
      ultimoQuad = null;
    } else if (C === "S") {
      const c1 = ultimoControle ? { x: 2 * atual.x - ultimoControle.x, y: 2 * atual.y - ultimoControle.y } : atual;
      const c2 = { x: base.x + num(), y: base.y + num() };
      const fim = { x: base.x + num(), y: base.y + num() };
      curva(c1, c2, fim);
      ultimoControle = c2;
      ultimoQuad = null;
    } else if (C === "Q" || C === "T") {
      const q: Ponto = C === "Q" ? { x: base.x + num(), y: base.y + num() } : ultimoQuad ? { x: 2 * atual.x - ultimoQuad.x, y: 2 * atual.y - ultimoQuad.y } : atual;
      const fim = { x: base.x + num(), y: base.y + num() };
      const de = atual;
      curva({ x: de.x + (2 / 3) * (q.x - de.x), y: de.y + (2 / 3) * (q.y - de.y) }, { x: fim.x + (2 / 3) * (q.x - fim.x), y: fim.y + (2 / 3) * (q.y - fim.y) }, fim);
      ultimoQuad = q;
      ultimoControle = null;
    } else if (C === "A") {
      const rx = num();
      const ry = num();
      const rotacao = num();
      const grande = num() !== 0;
      const horario = num() !== 0;
      const fim = { x: base.x + num(), y: base.y + num() };
      for (const [c1, c2, p] of arcoEmCubicas(atual, rx, ry, rotacao, grande, horario, fim)) curva(c1, c2, p);
      ultimoControle = ultimoQuad = null;
    } else {
      throw new Error(`Comando de caminho SVG desconhecido: ${comando}`);
    }
  }
  fechar(false);
  return saida;
}
