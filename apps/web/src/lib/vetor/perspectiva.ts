// A grade de perspectiva do editor vetorial (ADR 0003, onda 13.16): de um, dois ou três pontos de fuga, com os planos
// esquerdo, direito e o chão. Cada plano é uma homografia das coordenadas dele (a pelo chão ou pela profundidade, b pela
// altura ou pela outra direção do chão, em pixels na linha da origem) para a imagem; as formas desenhadas com a grade
// à vista vão para o plano ativo, e a Seleção de perspectiva leva uma camada para ele. As contas são puras.
import type { No, Subcaminho } from "./modelo.ts";

type Ponto = { x: number; y: number };
type H = [number, number, number, number, number, number, number, number, number];

export type PlanoDaPerspectiva = "esquerdo" | "direito" | "chao";

export type GradeDePerspectiva = {
  tipo: 1 | 2 | 3;
  /** A altura do horizonte, em pixels da imagem. */
  horizonte: number;
  /** Os pontos de fuga: o do meio (1), o da esquerda e o da direita (2 e 3), e o de cima ou de baixo (3). */
  fuga: Ponto[];
  /** O pé da grade (onde os planos se encontram no chão). */
  origem: Ponto;
  /** Quanto o primeiro passo para o fundo encolhe: a profundidade, em pixels, em que tudo fica com a metade. */
  distancia: number;
  /** O lado de cada quadrado da grade e até onde ela vai (nas unidades dos planos). */
  celula: number;
  extensao: number;
  visivel: boolean;
  plano: PlanoDaPerspectiva;
};

export function gradePadrao(tipo: 1 | 2 | 3, largura: number, altura: number): GradeDePerspectiva {
  const horizonte = Math.round(altura * 0.45);
  const fuga =
    tipo === 1
      ? [{ x: largura / 2, y: horizonte }]
      : [{ x: largura * 0.04, y: horizonte }, { x: largura * 0.96, y: horizonte }, ...(tipo === 3 ? [{ x: largura / 2, y: altura * 0.04 }] : [])];
  return { tipo, horizonte, fuga, origem: { x: largura / 2, y: Math.round(altura * 0.85) }, distancia: Math.round(largura / 2), celula: 50, extensao: 1000, visivel: true, plano: tipo === 1 ? "chao" : "esquerdo" };
}

/** A homografia do plano (as colunas: a direção de a, a de b e a origem, em coordenadas homogêneas). */
export function homografiaDoPlano(grade: GradeDePerspectiva, plano: PlanoDaPerspectiva): H {
  const d = Math.max(1e-6, grade.distancia);
  const fundo = (p: Ponto): [number, number, number] => [p.x / d, p.y / d, 1 / d];
  const vertical: [number, number, number] = grade.tipo === 3 && grade.fuga[2] ? fundo(grade.fuga[2]) : [0, -1, 0];
  let colunas: [[number, number, number], [number, number, number], [number, number, number]];
  if (grade.tipo === 1) {
    const meio = grade.fuga[0];
    const metade = grade.extensao / 4;
    if (plano === "chao") colunas = [[1, 0, 0], fundo(meio), [grade.origem.x, grade.origem.y, 1]];
    else {
      // As paredes de lado do chão, indo para o fundo
      const x = grade.origem.x + (plano === "esquerdo" ? -metade : metade);
      colunas = [fundo(meio), vertical, [x, grade.origem.y, 1]];
    }
  } else {
    const [esquerda, direita] = grade.fuga;
    const origem: [number, number, number] = [grade.origem.x, grade.origem.y, 1];
    colunas = plano === "esquerdo" ? [fundo(esquerda), vertical, origem] : plano === "direito" ? [fundo(direita), vertical, origem] : [fundo(direita), fundo(esquerda), origem];
  }
  const [c0, c1, c2] = colunas;
  return [c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]];
}

export function aplicarH(h: H, a: number, b: number): Ponto {
  const w = h[6] * a + h[7] * b + h[8];
  return { x: (h[0] * a + h[1] * b + h[2]) / w, y: (h[3] * a + h[4] * b + h[5]) / w };
}

export function inversaH(h: H): H {
  const [a, b, c, d, e, f, g, i, j] = h;
  const A = e * j - f * i;
  const B = -(d * j - f * g);
  const C = d * i - e * g;
  const det = a * A + b * B + c * C || 1e-12;
  return [A / det, -(b * j - c * i) / det, (b * f - c * e) / det, B / det, (a * j - c * g) / det, -(a * f - c * d) / det, C / det, -(a * i - b * g) / det, (a * e - b * d) / det];
}

/** O ponto da imagem nas coordenadas do plano. */
export function noPlano(grade: GradeDePerspectiva, plano: PlanoDaPerspectiva, p: Ponto): { a: number; b: number } {
  const q = aplicarH(inversaH(homografiaDoPlano(grade, plano)), p.x, p.y);
  return { a: q.x, b: q.y };
}

/** Os caminhos (nas coordenadas do plano) levados para a imagem: os nós e as alças pela homografia. */
export function caminhosDoPlano(grade: GradeDePerspectiva, plano: PlanoDaPerspectiva, caminhos: Subcaminho[]): Subcaminho[] {
  const h = homografiaDoPlano(grade, plano);
  const levar = (x: number, y: number) => aplicarH(h, x, y);
  return caminhos.map((sub) => ({
    ...sub,
    nos: sub.nos.map((no) => {
      const p = levar(no.x, no.y);
      const saida: No = { x: p.x, y: p.y };
      if (no.ex !== undefined && no.ey !== undefined) {
        const e = levar(no.ex, no.ey);
        Object.assign(saida, { ex: e.x, ey: e.y });
      }
      if (no.sx !== undefined && no.sy !== undefined) {
        const s = levar(no.sx, no.sy);
        Object.assign(saida, { sx: s.x, sy: s.y });
      }
      return saida;
    }),
  }));
}

/**
 * O retângulo da forma no plano a partir de dois cantos arrastados na imagem: a caixa nas coordenadas do plano e como
 * levar um ponto da forma (x para a direita, y para baixo, de 0 à largura e à altura) para elas (nas paredes, a altura
 * sobe).
 */
export function retanguloNoPlano(grade: GradeDePerspectiva, plano: PlanoDaPerspectiva, de: Ponto, ate: Ponto) {
  const p0 = noPlano(grade, plano, de);
  const p1 = noPlano(grade, plano, ate);
  const a0 = Math.min(p0.a, p1.a);
  const b0 = Math.min(p0.b, p1.b);
  const largura = Math.abs(p1.a - p0.a);
  const altura = Math.abs(p1.b - p0.b);
  // Na parede da esquerda, a cresce para a esquerda: a forma não sai espelhada
  const espelhar = plano === "esquerdo" && grade.tipo !== 1;
  const paraPlano = (x: number, y: number) => ({ x: espelhar ? a0 + largura - x : a0 + x, y: plano === "chao" ? b0 + altura - y : b0 + altura - y });
  return { largura, altura, paraPlano };
}

/** As linhas da grade de um plano (na imagem), do pé até a extensão, a cada célula. */
export function linhasDaGrade(grade: GradeDePerspectiva, plano: PlanoDaPerspectiva): [Ponto, Ponto][] {
  const h = homografiaDoPlano(grade, plano);
  const n = Math.max(1, Math.min(200, Math.round(grade.extensao / Math.max(1, grade.celula))));
  const fim = n * grade.celula;
  const linhas: [Ponto, Ponto][] = [];
  // No plano do chão de um ponto, a vai para os dois lados
  const de = grade.tipo === 1 && plano === "chao" ? -fim / 2 : 0;
  const ate = grade.tipo === 1 && plano === "chao" ? fim / 2 : fim;
  for (let k = 0; k <= n; k++) {
    const a = de + ((ate - de) * k) / n;
    linhas.push([aplicarH(h, a, 0), aplicarH(h, a, fim)]);
    const b = (fim * k) / n;
    linhas.push([aplicarH(h, de, b), aplicarH(h, ate, b)]);
  }
  return linhas;
}

/** Os planos da grade (o chão sempre; as paredes, nas de dois e três pontos, e nas de um ponto). */
export const PLANOS: PlanoDaPerspectiva[] = ["esquerdo", "direito", "chao"];
