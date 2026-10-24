// O texto num caminho (ADR 0003, onda 13.8): o texto é disposto numa linha só e cada letra vai para o ponto do caminho
// a que o meio dela chega, girada pela tangente (rígida, como nos editores de imagem); o cursor, a seleção e os riscos
// acompanham a curva. `inicio` é a fração do comprimento onde o texto começa; `inverter` passa o texto para o outro
// lado (o caminho é percorrido ao contrário). Num caminho aberto, o que passa do fim não aparece; no fechado, dá a
// volta. As coordenadas do caminho são as do texto (sem a origem).
import { achatar } from "../vetor/contorno.ts";
import type { No } from "../vetor/modelo.ts";

export type CaminhoDoTexto = { tipo: "linha" | "area"; nos: No[]; fechado: boolean; inicio: number; inverter: boolean };

type Ponto = { x: number; y: number };
export type Percurso = { pontos: Ponto[]; acumulado: number[]; total: number; fechado: boolean };

const PERCURSOS = new WeakMap<CaminhoDoTexto, Percurso>();

/** A linha do caminho achatada, com o comprimento acumulado (guardada por caminho). */
export function percurso(caminho: CaminhoDoTexto): Percurso {
  const guardado = PERCURSOS.get(caminho);
  if (guardado) return guardado;
  let pontos = achatar({ nos: caminho.nos, fechado: caminho.fechado, operacao: "somar" }, 0.1);
  if (caminho.fechado && pontos.length) pontos = [...pontos, pontos[0]];
  if (caminho.inverter) pontos = [...pontos].reverse();
  const acumulado = [0];
  for (let i = 1; i < pontos.length; i++) acumulado.push(acumulado[i - 1] + Math.hypot(pontos[i].x - pontos[i - 1].x, pontos[i].y - pontos[i - 1].y));
  const resultado = { pontos, acumulado, total: acumulado[acumulado.length - 1] ?? 0, fechado: caminho.fechado };
  PERCURSOS.set(caminho, resultado);
  return resultado;
}

/** O ponto e a direção (unitária) no comprimento `s`; null fora de um caminho aberto. */
export function noComprimento(p: Percurso, s: number): { x: number; y: number; tx: number; ty: number } | null {
  if (p.pontos.length < 2 || p.total <= 0) return null;
  let d = s;
  if (p.fechado) d = ((d % p.total) + p.total) % p.total;
  else if (d < -1e-6 || d > p.total + 1e-6) return null;
  // Busca binária no acumulado
  let a = 0;
  let b = p.acumulado.length - 1;
  while (b - a > 1) {
    const m = (a + b) >> 1;
    if (p.acumulado[m] <= d) a = m;
    else b = m;
  }
  const comprimento = p.acumulado[b] - p.acumulado[a] || 1;
  const t = Math.max(0, Math.min(1, (d - p.acumulado[a]) / comprimento));
  const pa = p.pontos[a];
  const pb = p.pontos[b];
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const n = Math.hypot(dx, dy) || 1;
  return { x: pa.x + dx * t, y: pa.y + dy * t, tx: dx / n, ty: dy / n };
}

/** O começo do texto no caminho (em unidades de comprimento). */
export const comecoNoCaminho = (caminho: CaminhoDoTexto, p: Percurso) => caminho.inicio * p.total;

/**
 * A curva do texto: o ponto (x ao longo da linha, y a partir da linha de base, para baixo) levado ao caminho, com o y
 * no sentido da normal. Para o cursor, a seleção e os riscos; as letras vão rígidas (`glifoNoCaminho`).
 */
export function funcaoDoCaminho(caminho: CaminhoDoTexto): ((q: Ponto) => Ponto) | null {
  const p = percurso(caminho);
  if (p.total <= 0) return null;
  const s0 = comecoNoCaminho(caminho, p);
  return (q) => {
    const no = noComprimento(p, s0 + q.x) ?? noComprimento(p, q.x + s0 < 0 ? 0 : p.total)!;
    // A normal para baixo do texto é a direção girada 90° (no sentido horário da tela)
    return { x: no.x - no.ty * q.y, y: no.y + no.tx * q.y };
  };
}

/** A conta rígida de uma letra cujo meio está em `centro` (x da linha): null quando ela cai fora do caminho aberto. */
export function glifoNoCaminho(caminho: CaminhoDoTexto, centro: number): ((q: Ponto) => Ponto) | null {
  const p = percurso(caminho);
  const no = noComprimento(p, comecoNoCaminho(caminho, p) + centro);
  if (!no) return null;
  return (q) => {
    const dx = q.x - centro;
    return { x: no.x + no.tx * dx - no.ty * q.y, y: no.y + no.ty * dx + no.tx * q.y };
  };
}

/** O ponto mais perto do caminho (fração do comprimento e a distância), para o clique da ferramenta Texto. */
export function pontoMaisPerto(caminho: CaminhoDoTexto, alvo: Ponto): { fracao: number; distancia: number } {
  const p = percurso({ ...caminho, inverter: false });
  let melhor = { fracao: 0, distancia: Infinity };
  for (let i = 1; i < p.pontos.length; i++) {
    const a = p.pontos[i - 1];
    const b = p.pontos[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((alvo.x - a.x) * dx + (alvo.y - a.y) * dy) / l2));
    const d = Math.hypot(a.x + dx * t - alvo.x, a.y + dy * t - alvo.y);
    if (d < melhor.distancia) melhor = { fracao: p.total ? (p.acumulado[i - 1] + Math.sqrt(l2) * t) / p.total : 0, distancia: d };
  }
  return melhor;
}

const POLIGONOS = new WeakMap<CaminhoDoTexto, Ponto[]>();

/** O contorno da área (o texto dentro de uma forma), achatado. */
export function poligonoDaArea(caminho: CaminhoDoTexto): Ponto[] {
  let poligono = POLIGONOS.get(caminho);
  if (!poligono) {
    poligono = achatar({ nos: caminho.nos, fechado: true, operacao: "somar" }, 0.25);
    POLIGONOS.set(caminho, poligono);
  }
  return poligono;
}

/** Os trechos [x0, x1] de dentro do polígono na altura y (par-ímpar). */
export function intervalosNaAltura(poligono: Ponto[], y: number): [number, number][] {
  const xs: number[] = [];
  for (let i = 0; i < poligono.length; i++) {
    const a = poligono[i];
    const b = poligono[(i + 1) % poligono.length];
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  xs.sort((p, q) => p - q);
  const intervalos: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) intervalos.push([xs[i], xs[i + 1]]);
  return intervalos;
}

/**
 * O trecho de dentro da forma para uma linha que vai de `topo` a `baixo`: o mais largo no meio, cortado pelo que cabe
 * em cima e embaixo (a linha inteira tem de caber). Null quando a linha não cabe nessa altura.
 */
export function faixaNaArea(poligono: Ponto[], topo: number, baixo: number): { x0: number; x1: number } | null {
  const meio = intervalosNaAltura(poligono, (topo + baixo) / 2);
  if (!meio.length) return null;
  let [x0, x1] = meio.reduce((maior, atual) => (atual[1] - atual[0] > maior[1] - maior[0] ? atual : maior));
  for (const y of [topo, baixo]) {
    const cruzam = intervalosNaAltura(poligono, y).filter(([a, b]) => b > x0 && a < x1);
    if (!cruzam.length) return null;
    const melhor = cruzam.reduce((maior, atual) => (Math.min(atual[1], x1) - Math.max(atual[0], x0) > Math.min(maior[1], x1) - Math.max(maior[0], x0) ? atual : maior));
    x0 = Math.max(x0, melhor[0]);
    x1 = Math.min(x1, melhor[1]);
  }
  return x1 > x0 ? { x0, x1 } : null;
}
