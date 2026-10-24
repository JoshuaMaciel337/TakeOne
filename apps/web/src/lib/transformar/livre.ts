// A transformação livre das camadas (ADR 0003, onda 13.6): os números da barra (posição do ponto de referência, largura
// e altura em %, giro e inclinações) em relação ao começo da transformação, o reconhecimento do que cabe na posição da
// camada (mover, girar, escalar por igual e virar: a camada continua editável) e a reamostragem exata do resto, pela
// homografia inversa, no vizinho mais próximo, bilinear ou bicúbico.
import { coeficientesDaHomografia, type Ponto, type Quadrilatero } from "./malha.ts";

export type Interpolacao = "vizinho" | "bilinear" | "bicubica";
export type NumerosDaTransformacao = { x: number; y: number; largura: number; altura: number; giro: number; inclinacaoH: number; inclinacaoV: number };
/** O ponto de referência no retângulo do começo: 0, 0,5 ou 1 em cada eixo. */
export type Referencia = { u: number; v: number };

const menos = (a: Ponto, b: Ponto): Ponto => ({ x: a.x - b.x, y: a.y - b.y });
const graus = (r: number) => (r * 180) / Math.PI;
const radianos = (g: number) => (g * Math.PI) / 180;
/** O ângulo em graus, entre -180 e 180. */
const normalizar = (g: number) => ((((g + 180) % 360) + 360) % 360) - 180;

/** Os lados do quadrilátero a partir do primeiro canto (U para o segundo, V para o quarto). */
const lados = (q: Quadrilatero) => ({ u: menos(q[1], q[0]), v: menos(q[3], q[0]) });

export function ehParalelogramo(q: Quadrilatero): boolean {
  const escala = Math.max(Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y), Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y), 1);
  return Math.hypot(q[0].x + q[2].x - q[1].x - q[3].x, q[0].y + q[2].y - q[1].y - q[3].y) < 1e-6 * escala;
}

/** A parte linear (a, b, c, d: x' = a·x + b·y) que leva os lados do primeiro paralelogramo aos do segundo. */
export function linearEntre(inicial: Quadrilatero, quad: Quadrilatero): [number, number, number, number] {
  const { u: u0, v: v0 } = lados(inicial);
  const { u, v } = lados(quad);
  const det = u0.x * v0.y - v0.x * u0.y || 1e-12;
  // [u v] · [u0 v0]⁻¹
  const i00 = v0.y / det;
  const i01 = -v0.x / det;
  const i10 = -u0.y / det;
  const i11 = u0.x / det;
  return [u.x * i00 + v.x * i10, u.x * i01 + v.x * i11, u.y * i00 + v.y * i10, u.y * i01 + v.y * i11];
}

/** O que a transformação faz com um ponto do documento (só para paralelogramos). */
export function afimEntre(inicial: Quadrilatero, quad: Quadrilatero): (p: Ponto) => Ponto {
  const [a, b, c, d] = linearEntre(inicial, quad);
  return (p) => {
    const dx = p.x - inicial[0].x;
    const dy = p.y - inicial[0].y;
    return { x: quad[0].x + a * dx + b * dy, y: quad[0].y + c * dx + d * dy };
  };
}

/**
 * A transformação é só mover, girar, escalar por igual e (ou) espelhar: a escala, o giro em graus (no documento) e se
 * espelha. Null quando estica, inclina, distorce ou deforma (aí vai para os pixels).
 */
export function semelhanca(inicial: Quadrilatero, quad: Quadrilatero): { escala: number; giro: number; espelhado: boolean } | null {
  if (!ehParalelogramo(inicial) || !ehParalelogramo(quad)) return null;
  const [a, b, c, d] = linearEntre(inicial, quad);
  const escala = Math.sqrt(Math.abs(a * d - b * c));
  if (escala < 1e-9) return null;
  const tolerancia = 1e-3 * escala;
  if (Math.abs(a - d) < tolerancia && Math.abs(b + c) < tolerancia) return { escala, giro: graus(Math.atan2(c, a)), espelhado: false };
  // s·R(φ)·F, com F o espelho no eixo x: a = −s·cos φ, c = −s·sen φ
  if (Math.abs(a + d) < tolerancia && Math.abs(b - c) < tolerancia) return { escala, giro: graus(Math.atan2(-c, -a)), espelhado: true };
  return null;
}

/** O ponto (u, v) do paralelogramo. */
function emUV(q: Quadrilatero, u: number, v: number): Ponto {
  const { u: lu, v: lv } = lados(q);
  return { x: q[0].x + lu.x * u + lv.x * v, y: q[0].y + lu.y * u + lv.y * v };
}

/**
 * Os números da barra para o quadrilátero de agora (um paralelogramo), em relação ao do começo: a posição do ponto de
 * referência (pixels do documento), a largura e a altura em %, o giro e a inclinação horizontal (a vertical fica 0:
 * as duas com o giro dariam o mesmo quadrilátero de mais de um jeito).
 */
export function numerosDoQuad(inicial: Quadrilatero, quad: Quadrilatero, referencia: Referencia): NumerosDaTransformacao | null {
  if (!ehParalelogramo(quad)) return null;
  const { u: u0, v: v0 } = lados(inicial);
  const largura0 = Math.hypot(u0.x, u0.y) || 1;
  const altura0 = Math.hypot(v0.x, v0.y) || 1;
  const e1 = { x: u0.x / largura0, y: u0.y / largura0 };
  const e2 = { x: -e1.y, y: e1.x };
  const { u, v } = lados(quad);
  // As colunas da matriz no referencial do começo, por unidade de medida do começo
  const m00 = (u.x * e1.x + u.y * e1.y) / largura0;
  const m10 = (u.x * e2.x + u.y * e2.y) / largura0;
  const m01 = (v.x * e1.x + v.y * e1.y) / altura0;
  const m11 = (v.x * e2.x + v.y * e2.y) / altura0;
  const giro = Math.atan2(m10, m00);
  const sx = Math.hypot(m00, m10);
  // A segunda coluna sem o giro: (sy·tg(kh), sy)
  const cx = m01 * Math.cos(giro) + m11 * Math.sin(giro);
  const sy = -m01 * Math.sin(giro) + m11 * Math.cos(giro);
  const ponto = emUV(quad, referencia.u, referencia.v);
  return { x: ponto.x, y: ponto.y, largura: sx * 100, altura: sy * 100, giro: normalizar(graus(giro)), inclinacaoH: Math.abs(sy) > 1e-9 ? graus(Math.atan(cx / sy)) : 0, inclinacaoV: 0 };
}

/** O quadrilátero dos números: M = R(giro) · [[1, tg(kh)], [tg(kv), 1]] · diag(largura, altura), em volta da referência. */
export function quadDosNumeros(inicial: Quadrilatero, numeros: NumerosDaTransformacao, referencia: Referencia): Quadrilatero {
  const { u: u0, v: v0 } = lados(inicial);
  const largura0 = Math.hypot(u0.x, u0.y) || 1;
  const altura0 = Math.hypot(v0.x, v0.y) || 1;
  const e1 = { x: u0.x / largura0, y: u0.y / largura0 };
  const e2 = { x: -e1.y, y: e1.x };
  const sx = numeros.largura / 100;
  const sy = numeros.altura / 100;
  const th = Math.tan(radianos(numeros.inclinacaoH));
  const tv = Math.tan(radianos(numeros.inclinacaoV));
  const r = radianos(numeros.giro);
  const cos = Math.cos(r);
  const sen = Math.sin(r);
  const canto = (a: number, b: number): Ponto => {
    // No referencial do começo, a partir da referência
    const x0 = (a - referencia.u) * largura0 * sx;
    const y0 = (b - referencia.v) * altura0 * sy;
    const x1 = x0 + th * y0;
    const y1 = tv * x0 + y0;
    const x2 = x1 * cos - y1 * sen;
    const y2 = x1 * sen + y1 * cos;
    return { x: numeros.x + x2 * e1.x + y2 * e2.x, y: numeros.y + x2 * e1.y + y2 * e2.y };
  };
  return [canto(0, 0), canto(1, 0), canto(1, 1), canto(0, 1)];
}

/** Os pontos no referencial do quadrilátero do começo (u, v), para repetir a transformação noutra caixa. */
export function noReferencial(inicial: Quadrilatero, pontos: Ponto[]): Ponto[] {
  const { u, v } = lados(inicial);
  const det = u.x * v.y - v.x * u.y || 1e-12;
  return pontos.map((p) => {
    const d = menos(p, inicial[0]);
    return { x: (d.x * v.y - v.x * d.y) / det, y: (u.x * d.y - d.x * u.y) / det };
  });
}

/** O contrário: os pontos (u, v) levados ao quadrilátero. */
export function doReferencial(quad: Quadrilatero, pontos: Ponto[]): Ponto[] {
  return pontos.map((p) => emUV(quad, p.x, p.y));
}

type Imagem = { dados: Uint8ClampedArray; largura: number; altura: number };

/** O peso de Keys (a = −0,5), o bicúbico de sempre. */
function keys(t: number): number {
  const x = Math.abs(t);
  if (x <= 1) return 1.5 * x * x * x - 2.5 * x * x + 1;
  if (x < 2) return -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2;
  return 0;
}

/**
 * O leitor da origem: lê no ponto (sx, sy) da origem (os centros dos pixels nos inteiros), no alfa pré-multiplicado (a
 * cor dos transparentes não vaza), e escreve no pixel `k` da saída. Fora da origem não escreve; a borda fica suave pela
 * própria interpolação.
 */
function leitor(origem: Imagem, interpolacao: Interpolacao) {
  const { dados, largura: lo, altura: ao } = origem;
  const pre = new Float32Array(4);
  const ler = (sx: number, sy: number, peso: number) => {
    if (sx < 0 || sy < 0 || sx >= lo || sy >= ao || peso === 0) return;
    const i = (sy * lo + sx) * 4;
    const alfa = dados[i + 3] * peso;
    pre[0] += dados[i] * alfa;
    pre[1] += dados[i + 1] * alfa;
    pre[2] += dados[i + 2] * alfa;
    pre[3] += alfa;
  };
  return (sx: number, sy: number, saida: Uint8ClampedArray, k: number) => {
    if (sx < -2 || sy < -2 || sx > lo + 1 || sy > ao + 1) return;
    pre.fill(0);
    if (interpolacao === "vizinho") ler(Math.round(sx), Math.round(sy), 1);
    else if (interpolacao === "bilinear") {
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      const fx = sx - ix;
      const fy = sy - iy;
      ler(ix, iy, (1 - fx) * (1 - fy));
      ler(ix + 1, iy, fx * (1 - fy));
      ler(ix, iy + 1, (1 - fx) * fy);
      ler(ix + 1, iy + 1, fx * fy);
    } else {
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      for (let j = -1; j <= 2; j++) {
        const wy = keys(sy - (iy + j));
        for (let i = -1; i <= 2; i++) ler(ix + i, iy + j, keys(sx - (ix + i)) * wy);
      }
    }
    const alfa = pre[3];
    if (alfa <= 0) return;
    saida[k] = pre[0] / alfa;
    saida[k + 1] = pre[1] / alfa;
    saida[k + 2] = pre[2] / alfa;
    saida[k + 3] = alfa;
  };
}

/** A imagem levada ao quadrilátero (pixels do destino), lendo cada pixel do destino na origem pela homografia inversa. */
export function reamostrar(origem: Imagem, quad: Quadrilatero, destino: { largura: number; altura: number }, interpolacao: Interpolacao): Uint8ClampedArray<ArrayBuffer> {
  const saida = new Uint8ClampedArray(destino.largura * destino.altura * 4);
  const [a, b, c, d, e, f, g, h] = coeficientesDaHomografia(quad);
  // A inversa da matriz [[a b c] [d e f] [g h 1]]
  const A = e - f * h;
  const B = c * h - b;
  const C = b * f - c * e;
  const D = f * g - d;
  const E = a - c * g;
  const F = c * d - a * f;
  const G = d * h - e * g;
  const H = b * g - a * h;
  const I = a * e - b * d;
  const x0 = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.x))) - 2);
  const x1 = Math.min(destino.largura, Math.ceil(Math.max(...quad.map((p) => p.x))) + 2);
  const y0 = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.y))) - 2);
  const y1 = Math.min(destino.altura, Math.ceil(Math.max(...quad.map((p) => p.y))) + 2);
  const ler = leitor(origem, interpolacao);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w = G * px + H * py + I;
      if (Math.abs(w) < 1e-12) continue;
      ler(((A * px + B * py + C) / w) * origem.largura - 0.5, ((D * px + E * py + F) / w) * origem.altura - 0.5, saida, (y * destino.largura + x) * 4);
    }
  }
  return saida;
}

const areaAssinada = (p: Ponto, q: Ponto, r: Ponto) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);

/**
 * A imagem levada por um mapa qualquer (a malha do Deformar): a imagem é dividida numa grade de `divisoes` ×
 * `divisoes`, cada quadradinho em dois triângulos, e cada pixel do destino coberto por um triângulo lê a origem no
 * ponto (u, v) dele (as coordenadas baricêntricas). Sem emendas: o pixel é escrito, não misturado, e o da beira entre
 * dois triângulos fica num deles.
 */
export function reamostrarPeloMapa(origem: Imagem, mapa: (u: number, v: number) => Ponto, destino: { largura: number; altura: number }, interpolacao: Interpolacao, divisoes = 48): Uint8ClampedArray<ArrayBuffer> {
  const saida = new Uint8ClampedArray(destino.largura * destino.altura * 4);
  const n = divisoes;
  const pontos: Ponto[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pontos.push(mapa(i / n, j / n));
  const ler = leitor(origem, interpolacao);
  const triangulo = (ia: number, ja: number, ib: number, jb: number, ic: number, jc: number) => {
    const a = pontos[ja * (n + 1) + ia];
    const b = pontos[jb * (n + 1) + ib];
    const c = pontos[jc * (n + 1) + ic];
    const area = areaAssinada(a, b, c);
    if (Math.abs(area) < 1e-9) return;
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
    const x1 = Math.min(destino.largura - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
    const y1 = Math.min(destino.altura - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const p = { x: x + 0.5, y: y + 0.5 };
        const wa = areaAssinada(b, c, p) / area;
        const wb = areaAssinada(c, a, p) / area;
        const wc = 1 - wa - wb;
        if (wa < -1e-9 || wb < -1e-9 || wc < -1e-9) continue;
        const u = (wa * ia + wb * ib + wc * ic) / n;
        const v = (wa * ja + wb * jb + wc * jc) / n;
        ler(u * origem.largura - 0.5, v * origem.altura - 0.5, saida, (y * destino.largura + x) * 4);
      }
    }
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      triangulo(i, j, i + 1, j, i + 1, j + 1);
      triangulo(i, j, i + 1, j + 1, i, j + 1);
    }
  }
  return saida;
}
