// O que os filtros do editor de imagem (ADR 0003, onda 13.11) dividem: a imagem que passa de um para o outro (RGBA de
// 8 bits com o alfa pré-multiplicado, como sai do framebuffer da prévia: fora da camada é transparente, e desfocar ou
// deslocar assim não puxa o preto dos pixels vazios para a borda), os planos em ponto flutuante, os desfoques e a
// leitura entre pixels. As medidas das opções são em pixels do documento; `escala` diz quantos pixels da imagem há em
// cada um (a prévia com zoom é menor que o documento).
import { desfocar } from "../efeitos.ts";

export type ImagemDoFiltro = { largura: number; altura: number; dados: Uint8ClampedArray };
export type Rgb = [number, number, number];
export type ContextoDoFiltro = {
  escala: number;
  primeiroPlano: Rgb;
  fundo: Rgb;
  /** Onde fica, em pixels do documento, o canto da imagem (o ruído e as texturas ficam presos ao documento). */
  origem: { x: number; y: number };
  /** O tamanho do documento, em pixels (os filtros que dependem do meio dele). */
  documento: { largura: number; altura: number };
  /** Um mapa de cinza (0 a 1) do tamanho da imagem, de fora dela: a máscara da camada, a profundidade da foto
   * (`profundidade`, 1 perto) ou um canal alfa (`canal:<id>`). */
  mapa?: (fonte: string) => Float32Array | null;
};
export type Planos = [Float32Array, Float32Array, Float32Array, Float32Array];

export const limitar = (v: number, minimo = 0, maximo = 1) => Math.min(maximo, Math.max(minimo, v));

/** Os quatro canais (pré-multiplicados) em planos de 0 a 1. */
export function paraPlanos(imagem: ImagemDoFiltro): Planos {
  const n = imagem.largura * imagem.altura;
  const planos: Planos = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let p = 0, i = 0; p < n; p++, i += 4) for (let k = 0; k < 4; k++) planos[k][p] = imagem.dados[i + k] / 255;
  return planos;
}

export function dePlanos(planos: Planos, largura: number, altura: number): ImagemDoFiltro {
  const n = largura * altura;
  const dados = new Uint8ClampedArray(n * 4);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const a = limitar(planos[3][p]);
    dados[i + 3] = Math.round(a * 255);
    // A cor pré-multiplicada não passa do alfa
    for (let k = 0; k < 3; k++) dados[i + k] = Math.round(Math.min(limitar(planos[k][p]), a) * 255);
  }
  return { largura, altura, dados };
}

/** Um plano desfocado pela gaussiana de desvio `sigma` (fora da imagem conta como transparente). */
export function desfocarPlano(plano: Float32Array, largura: number, altura: number, sigma: number): Float32Array {
  return desfocar({ largura, altura, dados: plano }, sigma).dados;
}

/** A média numa caixa de lado 2·raio+1, em duas passadas (fora da imagem conta como zero). */
export function caixaNoPlano(plano: Float32Array, largura: number, altura: number, raio: number): Float32Array {
  const r = Math.max(0, Math.round(raio));
  if (r === 0) return plano.slice();
  const meio = new Float32Array(plano.length);
  const saida = new Float32Array(plano.length);
  const lado = 2 * r + 1;
  for (let y = 0; y < altura; y++) {
    let soma = 0;
    const base = y * largura;
    for (let x = -r; x <= r; x++) if (x >= 0 && x < largura) soma += plano[base + x];
    for (let x = 0; x < largura; x++) {
      meio[base + x] = soma / lado;
      const sai = x - r;
      const entra = x + r + 1;
      if (sai >= 0) soma -= plano[base + sai];
      if (entra < largura) soma += plano[base + entra];
    }
  }
  for (let x = 0; x < largura; x++) {
    let soma = 0;
    for (let y = -r; y <= r; y++) if (y >= 0 && y < altura) soma += meio[y * largura + x];
    for (let y = 0; y < altura; y++) {
      saida[y * largura + x] = soma / lado;
      const sai = y - r;
      const entra = y + r + 1;
      if (sai >= 0) soma -= meio[sai * largura + x];
      if (entra < altura) soma += meio[entra * largura + x];
    }
  }
  return saida;
}

/** A leitura bilinear de um plano em (x, y), em pixels (o centro do pixel 0 em 0,5); fora da imagem, zero. */
export function lerPlano(plano: Float32Array, largura: number, altura: number, x: number, y: number): number {
  const fx = x - 0.5;
  const fy = y - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const v = (xi: number, yi: number) => (xi < 0 || yi < 0 || xi >= largura || yi >= altura ? 0 : plano[yi * largura + xi]);
  return (v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx) * (1 - ty) + (v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx) * ty;
}

/** Passa a cor reta (sem o alfa) de cada pixel opaco por `f`; o alfa não muda. */
export function porPixelReto(imagem: ImagemDoFiltro, f: (r: number, g: number, b: number, x: number, y: number) => Rgb): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const dados = new Uint8ClampedArray(imagem.dados.length);
  for (let y = 0, i = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++, i += 4) {
      const a = imagem.dados[i + 3];
      dados[i + 3] = a;
      if (!a) continue;
      const k = 255 / a;
      const [r, g, b] = f((imagem.dados[i] * k) / 255, (imagem.dados[i + 1] * k) / 255, (imagem.dados[i + 2] * k) / 255, x, y);
      dados[i] = Math.round(limitar(r) * a);
      dados[i + 1] = Math.round(limitar(g) * a);
      dados[i + 2] = Math.round(limitar(b) * a);
    }
  }
  return { largura, altura, dados };
}

/** Um sorteio de 0 a 1 preso a um ponto inteiro (e um canal): o mesmo em qualquer zoom e na exportação. */
export function sorteio(x: number, y: number, canal = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(canal + 1, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A luminância de um pixel reto de 0 a 1. */
export const lumaDe = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

export function hexParaRgb(cor: string): Rgb {
  const valor = Number.parseInt(cor.replace("#", "").slice(0, 6).padEnd(6, "0"), 16);
  return [((valor >> 16) & 255) / 255, ((valor >> 8) & 255) / 255, (valor & 255) / 255];
}
