// O Deformar (ADR 0003, onda 13.6): a malha é uma grade de retalhos de Bézier bicúbicos, cada um com o pedaço da
// imagem que cobre (os cortes, de 0 a 1 em cada eixo). Dividir na vertical, na horizontal ou em cruz parte os retalhos
// pelo de Casteljau, sem mudar a forma; os estilos prontos (arco, bandeira, onda, peixe…) são contas no quadrado da
// imagem, com dobra e distorções, que viram um retalho só pelos 16 pontos que ele precisa atravessar.
import { homografia, type Mapa, type Ponto, type Quadrilatero } from "./malha.ts";

export type Malha = {
  /** Os pontos de controle, linha a linha: (3 × retalhos na horizontal + 1) por linha. */
  pontos: Ponto[];
  /** Onde cada retalho começa e termina na imagem, de 0 a 1 (o primeiro é 0, o último é 1). */
  cortesU: number[];
  cortesV: number[];
};

export const colunasDa = (malha: Malha) => 3 * (malha.cortesU.length - 1) + 1;
export const linhasDa = (malha: Malha) => 3 * (malha.cortesV.length - 1) + 1;

/** Os índices dos quatro cantos da malha, na ordem do quadrilátero. */
export function cantosDaMalha(malha: Malha): [number, number, number, number] {
  const nx = colunasDa(malha);
  const ny = linhasDa(malha);
  return [0, nx - 1, (ny - 1) * nx + nx - 1, (ny - 1) * nx];
}

/** A malha de um retalho só sobre o quadrilátero. */
export function malhaDoQuad(q: Quadrilatero): Malha {
  const mapa = homografia(q);
  const pontos: Ponto[] = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) pontos.push(mapa(i / 3, j / 3));
  return { pontos, cortesU: [0, 1], cortesV: [0, 1] };
}

const bernstein = (t: number): [number, number, number, number] => {
  const s = 1 - t;
  return [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
};

/** Em que retalho cai a coordenada, e onde dentro dele. */
function noCorte(cortes: number[], t: number): [number, number] {
  let k = 0;
  while (k < cortes.length - 2 && t > cortes[k + 1]) k++;
  const largura = cortes[k + 1] - cortes[k] || 1;
  return [k, Math.min(1, Math.max(0, (t - cortes[k]) / largura))];
}

/** O mapa da imagem (u, v de 0 a 1) para o documento, pela grade de retalhos. */
export function mapaDaMalha(malha: Malha): Mapa {
  const nx = colunasDa(malha);
  return (u, v) => {
    const [ki, s] = noCorte(malha.cortesU, u);
    const [kj, t] = noCorte(malha.cortesV, v);
    const bu = bernstein(s);
    const bv = bernstein(t);
    let x = 0;
    let y = 0;
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        const p = malha.pontos[(kj * 3 + j) * nx + ki * 3 + i];
        const peso = bu[i] * bv[j];
        x += p.x * peso;
        y += p.y * peso;
      }
    }
    return { x, y };
  };
}

/** Os 4 pontos de uma cúbica partidos em t (de Casteljau): os 7 das duas metades. */
function partirCubica(p: Ponto[], t: number): Ponto[] {
  const l = (a: Ponto, b: Ponto) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const a = l(p[0], p[1]);
  const b = l(p[1], p[2]);
  const c = l(p[2], p[3]);
  const d = l(a, b);
  const e = l(b, c);
  const f = l(d, e);
  return [p[0], a, d, f, e, c, p[3]];
}

/** Parte a malha numa linha vertical (u) e (ou) numa horizontal (v), da imagem; a forma não muda. */
export function dividirMalha(malha: Malha, u: number | null, v: number | null): Malha {
  let atual = malha;
  if (u !== null && u > 0.001 && u < 0.999 && !malha.cortesU.some((corte) => Math.abs(corte - u) < 0.001)) {
    const nx = colunasDa(atual);
    const ny = linhasDa(atual);
    const [k, t] = noCorte(atual.cortesU, u);
    const pontos: Ponto[] = [];
    for (let j = 0; j < ny; j++) {
      const linha = atual.pontos.slice(j * nx, (j + 1) * nx);
      const partida = partirCubica(linha.slice(k * 3, k * 3 + 4), t);
      pontos.push(...linha.slice(0, k * 3), ...partida, ...linha.slice(k * 3 + 4));
    }
    const cortesU = [...atual.cortesU.slice(0, k + 1), u, ...atual.cortesU.slice(k + 1)];
    atual = { pontos, cortesU, cortesV: atual.cortesV };
  }
  if (v !== null && v > 0.001 && v < 0.999 && !malha.cortesV.some((corte) => Math.abs(corte - v) < 0.001)) {
    const nx = colunasDa(atual);
    const ny = linhasDa(atual);
    const [k, t] = noCorte(atual.cortesV, v);
    const colunas: Ponto[][] = [];
    for (let i = 0; i < nx; i++) {
      const coluna = Array.from({ length: ny }, (_, j) => atual.pontos[j * nx + i]);
      colunas.push([...coluna.slice(0, k * 3), ...partirCubica(coluna.slice(k * 3, k * 3 + 4), t), ...coluna.slice(k * 3 + 4)]);
    }
    const novasLinhas = ny + 3;
    const pontos: Ponto[] = [];
    for (let j = 0; j < novasLinhas; j++) for (let i = 0; i < nx; i++) pontos.push(colunas[i][j]);
    const cortesV = [...atual.cortesV.slice(0, k + 1), v, ...atual.cortesV.slice(k + 1)];
    atual = { pontos, cortesU: atual.cortesU, cortesV };
  }
  return atual;
}

/**
 * Arrastar um ponto da malha: um ponto de canto de retalho (de ancoragem) leva junto as alças em volta, para a curva
 * continuar lisa ali; uma alça anda sozinha.
 */
export function moverPontoDaMalha(malha: Malha, indice: number, deslocamento: Ponto): Malha {
  const nx = colunasDa(malha);
  const ny = linhasDa(malha);
  const i = indice % nx;
  const j = Math.floor(indice / nx);
  const pontos = [...malha.pontos];
  const andar = (ii: number, jj: number) => {
    if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) return;
    const k = jj * nx + ii;
    pontos[k] = { x: pontos[k].x + deslocamento.x, y: pontos[k].y + deslocamento.y };
  };
  if (i % 3 === 0 && j % 3 === 0) {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) andar(i + di, j + dj);
  } else andar(i, j);
  return { ...malha, pontos };
}

export const ESTILOS_DE_DEFORMACAO = [
  { id: "arco", nome: "Arco" },
  { id: "arcoInferior", nome: "Arco inferior" },
  { id: "arcoSuperior", nome: "Arco superior" },
  { id: "arcada", nome: "Arcada" },
  { id: "bojo", nome: "Bojo" },
  { id: "conchaInferior", nome: "Concha inferior" },
  { id: "conchaSuperior", nome: "Concha superior" },
  { id: "bandeira", nome: "Bandeira" },
  { id: "onda", nome: "Onda" },
  { id: "peixe", nome: "Peixe" },
  { id: "ascendente", nome: "Ascendente" },
  { id: "olhoDePeixe", nome: "Olho de peixe" },
  { id: "inflar", nome: "Inflar" },
  { id: "espremer", nome: "Espremer" },
  { id: "torcer", nome: "Torcer" },
] as const;
export type EstiloDeDeformacao = (typeof ESTILOS_DE_DEFORMACAO)[number]["id"];
export type OpcoesDoEstilo = { estilo: EstiloDeDeformacao; vertical: boolean; dobra: number; distorcaoH: number; distorcaoV: number };

/**
 * O estilo no quadrado da imagem, com x e y de −1 a 1 (na horizontal; na vertical os eixos trocam): o ponto para onde
 * cada ponto vai, com a dobra (−1 a 1) e as distorções (−1 a 1, a perspectiva de cada eixo).
 */
export function pontoDoEstilo(x0: number, y0: number, opcoes: OpcoesDoEstilo): Ponto {
  const vertical = opcoes.vertical;
  let x = vertical ? y0 : x0;
  let y = vertical ? x0 : y0;
  const b = opcoes.dobra;
  const curva = 1 - x * x;
  switch (opcoes.estilo) {
    case "arco":
      y -= b * curva * 0.5;
      break;
    case "arcoInferior":
      y -= b * curva * 0.5 * ((y + 1) / 2);
      break;
    case "arcoSuperior":
      y -= b * curva * 0.5 * ((1 - y) / 2);
      break;
    case "arcada":
      y -= b * curva * 0.5;
      x *= 1 - b * 0.15 * (1 - y) * 0.5;
      break;
    case "bojo":
      y *= 1 + b * curva * 0.5;
      break;
    case "conchaInferior":
      y += b * x * x * 0.5 * ((y + 1) / 2);
      break;
    case "conchaSuperior":
      y -= b * x * x * 0.5 * ((1 - y) / 2);
      break;
    case "bandeira":
      y -= b * 0.4 * Math.sin(Math.PI * x);
      break;
    case "onda":
      y -= b * 0.3 * Math.sin(Math.PI * x) * (1 - 0.6 * y);
      break;
    case "peixe":
      y *= 1 + b * 0.5 * Math.cos((Math.PI * (x + 1)) / 2 - Math.PI / 2) * curva * 2;
      break;
    case "ascendente":
      y -= b * 0.5 * x;
      break;
    case "olhoDePeixe": {
      const r = Math.min(1, (x * x + y * y) / 2);
      const k = 1 + b * 0.5 * (1 - r);
      x *= k;
      y *= k;
      break;
    }
    case "inflar": {
      const k = 1 + b * 0.4 * curva * (1 - y * y);
      x *= k;
      y *= k;
      break;
    }
    case "espremer":
      y *= 1 - b * 0.5 * curva;
      x *= 1 + b * 0.2 * (1 - y * y);
      break;
    case "torcer": {
      const r = Math.min(1, Math.hypot(x, y) / Math.SQRT2);
      const a = b * (Math.PI / 2) * (1 - r);
      const cos = Math.cos(a);
      const sen = Math.sin(a);
      [x, y] = [x * cos - y * sen, x * sen + y * cos];
      break;
    }
  }
  // As distorções: a perspectiva de cada eixo (um lado maior que o outro)
  y *= 1 + opcoes.distorcaoH * 0.5 * x;
  x *= 1 + opcoes.distorcaoV * 0.5 * y;
  return vertical ? { x: y, y: x } : { x, y };
}

/** A inversa da matriz de Bernstein nos pontos 0, 1/3, 2/3 e 1 (para o retalho atravessar 16 pontos). */
const INVERSA_DE_BERNSTEIN = (() => {
  const m = [0, 1 / 3, 2 / 3, 1].map((t) => bernstein(t));
  // Gauss-Jordan numa 4 × 4
  const a = m.map((linha, i) => [...linha, ...[0, 1, 2, 3].map((j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    const pivo = a[c][c];
    for (let k = 0; k < 8; k++) a[c][k] /= pivo;
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = a[r][c];
      for (let k = 0; k < 8; k++) a[r][k] -= f * a[c][k];
    }
  }
  return a.map((linha) => linha.slice(4));
})();

/** O retalho de um estilo sobre o quadrilátero: os 16 pontos do estilo, atravessados pela malha. */
export function malhaDoEstilo(q: Quadrilatero, opcoes: OpcoesDoEstilo): Malha {
  const mapa = homografia(q);
  const alvo: Ponto[][] = [0, 1, 2, 3].map((j) =>
    [0, 1, 2, 3].map((i) => {
      const p = pontoDoEstilo((i / 3) * 2 - 1, (j / 3) * 2 - 1, opcoes);
      return mapa((p.x + 1) / 2, (p.y + 1) / 2);
    }),
  );
  // P = B⁻¹ · S · B⁻ᵀ, nas duas coordenadas
  const inv = INVERSA_DE_BERNSTEIN;
  const pontos: Ponto[] = [];
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      let x = 0;
      let y = 0;
      for (let jj = 0; jj < 4; jj++) {
        for (let ii = 0; ii < 4; ii++) {
          const peso = inv[j][jj] * inv[i][ii];
          x += alvo[jj][ii].x * peso;
          y += alvo[jj][ii].y * peso;
        }
      }
      pontos.push({ x, y });
    }
  }
  return { pontos, cortesU: [0, 1], cortesV: [0, 1] };
}

/** O ponto da imagem (u, v) que o mapa leva para perto de `p`: o mais perto numa grade e alguns passos de Newton. */
export function inversaDoMapa(mapa: Mapa, p: Ponto): { u: number; v: number } {
  let melhor = { u: 0.5, v: 0.5 };
  let menor = Infinity;
  const n = 48;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const q = mapa(i / n, j / n);
      const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      if (d < menor) {
        menor = d;
        melhor = { u: i / n, v: j / n };
      }
    }
  }
  let { u, v } = melhor;
  const h = 1e-4;
  for (let passo = 0; passo < 8; passo++) {
    const q = mapa(u, v);
    const qu = mapa(u + h, v);
    const qv = mapa(u, v + h);
    const a = (qu.x - q.x) / h;
    const b = (qv.x - q.x) / h;
    const c = (qu.y - q.y) / h;
    const d = (qv.y - q.y) / h;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-12) break;
    const ex = p.x - q.x;
    const ey = p.y - q.y;
    u = Math.min(1, Math.max(0, u + (d * ex - b * ey) / det));
    v = Math.min(1, Math.max(0, v + (-c * ex + a * ey) / det));
  }
  return { u, v };
}
