// Texto › Deformar texto (ADR 0003, onda 13.8): os 15 estilos dos editores de imagem, com a curvatura e as distorções
// horizontal e vertical de -100 a 100. A deformação leva cada ponto do retângulo das letras (as unidades do texto) a
// outro lugar; as letras são achatadas em polígonos finos, com os lados retos divididos, e cada ponto é levado. Na
// vertical, o estilo vale com os eixos trocados. A curvatura positiva curva para cima (o arco vira um ∩).
import { achatar } from "../vetor/contorno.ts";
import type { Subcaminho } from "../vetor/modelo.ts";

export type EstiloDaDeformacao =
  | "arco"
  | "arcoInferior"
  | "arcoSuperior"
  | "arcada"
  | "saliencia"
  | "conchaInferior"
  | "conchaSuperior"
  | "bandeira"
  | "onda"
  | "peixe"
  | "elevar"
  | "olhoDePeixe"
  | "inflar"
  | "espremer"
  | "torcao";

export type Deformacao = { estilo: EstiloDaDeformacao; vertical: boolean; curvatura: number; distorcaoH: number; distorcaoV: number };

export const ESTILOS_DA_DEFORMACAO: { id: EstiloDaDeformacao; nome: string }[] = [
  { id: "arco", nome: "Arco" },
  { id: "arcoInferior", nome: "Arco inferior" },
  { id: "arcoSuperior", nome: "Arco superior" },
  { id: "arcada", nome: "Arcada" },
  { id: "saliencia", nome: "Saliência" },
  { id: "conchaInferior", nome: "Concha inferior" },
  { id: "conchaSuperior", nome: "Concha superior" },
  { id: "bandeira", nome: "Bandeira" },
  { id: "onda", nome: "Onda" },
  { id: "peixe", nome: "Peixe" },
  { id: "elevar", nome: "Elevar" },
  { id: "olhoDePeixe", nome: "Olho de peixe" },
  { id: "inflar", nome: "Inflar" },
  { id: "espremer", nome: "Espremer" },
  { id: "torcao", nome: "Torção" },
];

export type Retangulo = { x0: number; y0: number; x1: number; y1: number };
type Ponto = { x: number; y: number };

/** Se a deformação muda alguma coisa. */
export const deforma = (d: Deformacao | null | undefined): d is Deformacao => Boolean(d && (d.curvatura || d.distorcaoH || d.distorcaoV));

/**
 * O estilo em coordenadas do retângulo: u e v de -1 a 1 (v para baixo), a meia largura e a meia altura em unidades
 * (para as contas que precisam de círculos de verdade). `b` é a curvatura de -1 a 1.
 */
function estilo(nome: EstiloDaDeformacao, u: number, v: number, b: number, mx: number, my: number): Ponto {
  const curva = 1 - u * u;
  switch (nome) {
    case "arco": {
      // As letras seguem um arco de círculo: a linha do meio vira um arco de comprimento igual à largura
      if (Math.abs(b) < 1e-6) return { x: u, y: v };
      const angulo = (b * Math.PI) / 2;
      const raio = mx / Math.abs(angulo);
      const s = Math.sign(b);
      const r = raio - s * v * my;
      const fi = (u * mx) / raio;
      return { x: (r * Math.sin(fi)) / mx, y: (s * (raio - r * Math.cos(fi))) / my };
    }
    case "arcoInferior":
      return { x: u, y: v + b * curva * ((v + 1) / 2) };
    case "arcoSuperior":
      return { x: u, y: v - b * curva * ((1 - v) / 2) };
    case "arcada":
      return { x: u, y: v - b * curva };
    case "saliencia":
      return { x: u, y: v * (1 + b * curva) };
    case "conchaInferior": {
      // A base curva e os lados se aproximam em cima
      const largura = 1 - 0.5 * Math.max(0, b) * ((1 - v) / 2) + 0.5 * Math.max(0, -b) * ((1 - v) / 2);
      return { x: u * largura, y: v + b * curva * ((v + 1) / 2) };
    }
    case "conchaSuperior": {
      const largura = 1 - 0.5 * Math.max(0, b) * ((v + 1) / 2) + 0.5 * Math.max(0, -b) * ((v + 1) / 2);
      return { x: u * largura, y: v - b * curva * ((1 - v) / 2) };
    }
    case "bandeira":
      return { x: u, y: v - b * Math.sin(Math.PI * u) };
    case "onda":
      return { x: u, y: v - b * Math.sin(Math.PI * (u + v * 0.5)) };
    case "peixe": {
      // A cabeça cresce à esquerda e a cauda se abre na ponta direita
      const corpo = u <= 0.6 ? 1 + b * 0.6 * Math.cos((Math.PI * (u + 0.2)) / 1.6) : 1 + b * ((u - 0.6) / 0.4) ** 2;
      return { x: u, y: v * corpo };
    }
    case "elevar":
      return { x: u, y: v - b * Math.sin((Math.PI * u) / 2) };
    case "olhoDePeixe": {
      const r = Math.min(1, Math.hypot(u, v) / Math.SQRT2);
      const k = 1 + b * 0.6 * (1 - r * r);
      return { x: u * k, y: v * k };
    }
    case "inflar":
      return { x: u * (1 + b * 0.4 * (1 - v * v)), y: v * (1 + b * 0.4 * curva) };
    case "espremer":
      return { x: u * (1 - b * 0.4 * (1 - v * v)), y: v * (1 + b * 0.4 * curva) };
    case "torcao": {
      // Gira mais no meio do que nas pontas (em unidades de verdade, para o giro ser redondo)
      const x = u * mx;
      const y = v * my;
      const r = Math.min(1, Math.hypot(u, v) / Math.SQRT2);
      const a = (b * Math.PI) / 2 * (1 - r);
      return { x: (x * Math.cos(a) - y * Math.sin(a)) / mx, y: (x * Math.sin(a) + y * Math.cos(a)) / my };
    }
  }
}

/** Leva um ponto (unidades do texto) pela deformação, dentro do retângulo de referência. */
export function deformarPonto(p: Ponto, r: Retangulo, d: Deformacao): Ponto {
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  let mx = Math.max(1e-6, (r.x1 - r.x0) / 2);
  let my = Math.max(1e-6, (r.y1 - r.y0) / 2);
  let u = (p.x - cx) / mx;
  let v = (p.y - cy) / my;
  // Na vertical, a mesma conta com os eixos trocados (a "largura" é a altura)
  if (d.vertical) {
    [u, v] = [v, -u];
    [mx, my] = [my, mx];
  }
  let q = estilo(d.estilo, u, v, d.curvatura / 100, mx, my);
  // As distorções: a horizontal aumenta um lado e diminui o outro (como uma perspectiva), a vertical o de cima e o de baixo
  const h = d.distorcaoH / 100;
  const w = d.distorcaoV / 100;
  q = { x: q.x * (1 + w * q.y * 0.5), y: q.y * (1 + h * q.x * 0.5) };
  if (d.vertical) {
    q = { x: -q.y, y: q.x };
    [mx, my] = [my, mx];
  }
  return { x: cx + q.x * mx, y: cy + q.y * my };
}

/**
 * Os caminhos achatados e levados pela deformação: um polígono por componente (o sentido fica, então o enrolamento
 * não nulo continua valendo). Os lados longos são divididos antes, para curvarem junto.
 */
export function deformarCaminhos(caminhos: Subcaminho[], r: Retangulo, d: Deformacao | null, tolerancia: number, f?: (p: Ponto) => Ponto): Ponto[][] {
  // A conta: a deformação no retângulo, ou uma função pronta (a do texto, com a referência e o encaixe dele)
  const levar = f ?? ((p: Ponto) => (d ? deformarPonto(p, r, d) : p));
  const passo = f ? tolerancia * 4 : Math.max(tolerancia * 4, Math.min(r.x1 - r.x0, r.y1 - r.y0) / 60);
  return caminhos.map((sub) => {
    const pontos = achatar({ ...sub, fechado: true }, tolerancia);
    const divididos: Ponto[] = [];
    for (let i = 0; i < pontos.length; i++) {
      const a = pontos[i];
      const b = pontos[(i + 1) % pontos.length];
      const partes = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / passo));
      for (let k = 0; k < partes; k++) divididos.push({ x: a.x + ((b.x - a.x) * k) / partes, y: a.y + ((b.y - a.y) * k) / partes });
    }
    return divididos.map(levar);
  });
}

/** O retângulo que os polígonos ocupam. */
export function limitesDosPoligonos(poligonos: Ponto[][]): Retangulo | null {
  let r: Retangulo | null = null;
  for (const poligono of poligonos) {
    for (const p of poligono) r = r ? { x0: Math.min(r.x0, p.x), y0: Math.min(r.y0, p.y), x1: Math.max(r.x1, p.x), y1: Math.max(r.y1, p.y) } : { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  }
  return r;
}
