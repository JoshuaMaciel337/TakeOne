// A base dos efeitos da Galeria de filtros (ADR 0003, onda 13.11): a imagem em cor reta (sem o alfa) em planos de
// 0 a 1, o desfoque que não escurece a borda, o gradiente, os traços numa direção, a luz de um relevo e as texturas
// (tijolo, aniagem, tela, arenito, blocos, fosco e lentes) desenhadas por contas, presas ao documento, sem imagens.
import { type ContextoDoFiltro, desfocarPlano, type ImagemDoFiltro, limitar, lerPlano, sorteio } from "../comum.ts";
import { fractal } from "../renderizacao.ts";

/** A imagem em cor reta: r, g, b de 0 a 1 e o alfa (o efeito muda a cor; o alfa volta como estava). */
export type Reta = { largura: number; altura: number; r: Float32Array; g: Float32Array; b: Float32Array; a: Float32Array };

export function reta(imagem: ImagemDoFiltro): Reta {
  const { largura, altura, dados } = imagem;
  const n = largura * altura;
  const saida: Reta = { largura, altura, r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), a: new Float32Array(n) };
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const a = dados[i + 3];
    saida.a[p] = a / 255;
    if (!a) continue;
    saida.r[p] = dados[i] / a;
    saida.g[p] = dados[i + 1] / a;
    saida.b[p] = dados[i + 2] / a;
  }
  return saida;
}

/** De volta ao pré-multiplicado, com o alfa de `a` (ou o da imagem reta). */
export function deReta(c: { r: Float32Array; g: Float32Array; b: Float32Array }, largura: number, altura: number, a: Float32Array): ImagemDoFiltro {
  const n = largura * altura;
  const dados = new Uint8ClampedArray(n * 4);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const alfa = limitar(a[p]);
    dados[i] = Math.round(limitar(c.r[p]) * alfa * 255);
    dados[i + 1] = Math.round(limitar(c.g[p]) * alfa * 255);
    dados[i + 2] = Math.round(limitar(c.b[p]) * alfa * 255);
    dados[i + 3] = Math.round(alfa * 255);
  }
  return { largura, altura, dados };
}

export function luz(img: { r: Float32Array; g: Float32Array; b: Float32Array }): Float32Array {
  const saida = new Float32Array(img.r.length);
  for (let p = 0; p < saida.length; p++) saida[p] = 0.299 * img.r[p] + 0.587 * img.g[p] + 0.114 * img.b[p];
  return saida;
}

/** O desfoque gaussiano que conta só o que existe (o de fora não puxa a borda para o preto). */
export function borrar(plano: Float32Array, largura: number, altura: number, sigma: number): Float32Array {
  if (sigma < 0.3) return plano.slice();
  const valor = desfocarPlano(plano, largura, altura, sigma);
  const um = desfocarPlano(new Float32Array(plano.length).fill(1), largura, altura, sigma);
  for (let p = 0; p < valor.length; p++) valor[p] = um[p] > 1e-6 ? valor[p] / um[p] : plano[p];
  return valor;
}

export function borrarCor(img: { r: Float32Array; g: Float32Array; b: Float32Array }, largura: number, altura: number, sigma: number) {
  return { r: borrar(img.r, largura, altura, sigma), g: borrar(img.g, largura, altura, sigma), b: borrar(img.b, largura, altura, sigma) };
}

/** O gradiente de Sobel (gx, gy) e o tamanho dele, com a borda repetida. */
export function gradiente(plano: Float32Array, largura: number, altura: number): { gx: Float32Array; gy: Float32Array; m: Float32Array } {
  const n = largura * altura;
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  const m = new Float32Array(n);
  const v = (x: number, y: number) => plano[Math.min(altura - 1, Math.max(0, y)) * largura + Math.min(largura - 1, Math.max(0, x))];
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const p = y * largura + x;
      gx[p] = (v(x + 1, y - 1) + 2 * v(x + 1, y) + v(x + 1, y + 1) - v(x - 1, y - 1) - 2 * v(x - 1, y) - v(x - 1, y + 1)) / 4;
      gy[p] = (v(x - 1, y + 1) + 2 * v(x, y + 1) + v(x + 1, y + 1) - v(x - 1, y - 1) - 2 * v(x, y - 1) - v(x + 1, y - 1)) / 4;
      m[p] = Math.hypot(gx[p], gy[p]);
    }
  }
  return { gx, gy, m };
}

/** A média ao longo de uma reta no ângulo (graus; 0 na horizontal, 45 sobe para a direita), de `comprimento` pixels. */
export function tracar(plano: Float32Array, largura: number, altura: number, angulo: number, comprimento: number): Float32Array {
  if (comprimento < 1) return plano.slice();
  const r = (angulo * Math.PI) / 180;
  const dx = Math.cos(r);
  const dy = -Math.sin(r);
  const n = Math.max(2, Math.min(48, Math.ceil(comprimento)));
  const saida = new Float32Array(plano.length);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      let soma = 0;
      let pesos = 0;
      for (let j = 0; j < n; j++) {
        const t = (j / (n - 1) - 0.5) * comprimento;
        const xx = x + 0.5 + dx * t;
        const yy = y + 0.5 + dy * t;
        if (xx < 0 || yy < 0 || xx > largura || yy > altura) continue;
        soma += lerPlano(plano, largura, altura, Math.min(largura - 0.5, Math.max(0.5, xx)), Math.min(altura - 0.5, Math.max(0.5, yy)));
        pesos++;
      }
      saida[y * largura + x] = pesos ? soma / pesos : plano[y * largura + x];
    }
  }
  return saida;
}

/** O ponto do documento de um pixel da imagem do filtro. */
export const noDocumento = (x: number, y: number, ctx: ContextoDoFiltro): [number, number] => [ctx.origem.x + (x + 0.5) / ctx.escala, ctx.origem.y + (y + 0.5) / ctx.escala];

/** Um plano por uma conta do ponto do documento. */
export function porDocumento(largura: number, altura: number, ctx: ContextoDoFiltro, f: (x: number, y: number) => number): Float32Array {
  const saida = new Float32Array(largura * altura);
  for (let y = 0, p = 0; y < altura; y++)
    for (let x = 0; x < largura; x++, p++) {
      const [dx, dy] = noDocumento(x, y, ctx);
      saida[p] = f(dx, dy);
    }
  return saida;
}

/** O ruído fino (um sorteio por pixel do documento), de 0 a 1. */
export const graoNoDocumento = (x: number, y: number, semente = 0) => sorteio(Math.floor(x), Math.floor(y), 7 + semente);

/** O ruído suave de 0 a 1 no tamanho pedido (pixels do documento). */
export const suaveNoDocumento = (x: number, y: number, tamanho: number, semente = 0, oitavas = 4) => fractal(x, y, Math.max(0.6, tamanho), 11 + semente, oitavas);

/** A luz de um relevo (a altura, de 0 a 1): 1 no plano, mais claro de frente para a luz. */
export function luzDoRelevo(altura_: Float32Array, largura: number, altura: number, relevo: number, direcao: string): Float32Array {
  const angulos: Record<string, number> = { baixo: 270, baixo_esquerda: 225, esquerda: 180, cima_esquerda: 135, cima: 90, cima_direita: 45, direita: 0, baixo_direita: 315 };
  const a = ((angulos[direcao] ?? 135) * Math.PI) / 180;
  const lx = Math.cos(a);
  const ly = -Math.sin(a);
  const { gx, gy } = gradiente(altura_, largura, altura);
  const saida = new Float32Array(altura_.length);
  for (let p = 0; p < saida.length; p++) saida[p] = 1 + relevo * (-gx[p] * lx - gy[p] * ly) * 4;
  return saida;
}

export const DIRECOES_DA_LUZ: [string, string][] = [
  ["cima_esquerda", "Em cima à esquerda"],
  ["cima", "Em cima"],
  ["cima_direita", "Em cima à direita"],
  ["direita", "À direita"],
  ["baixo_direita", "Embaixo à direita"],
  ["baixo", "Embaixo"],
  ["baixo_esquerda", "Embaixo à esquerda"],
  ["esquerda", "À esquerda"],
];
export const TEXTURAS_DA_GALERIA: [string, string][] = [
  ["tela", "Tela"],
  ["tijolo", "Tijolo"],
  ["aniagem", "Aniagem"],
  ["arenito", "Arenito"],
];

/** A altura de uma textura (0 a 1) no ponto do documento, na escala (100 é o tamanho natural). */
export function textura(tipo: string, x: number, y: number, escala = 100): number {
  const e = Math.max(0.1, escala / 100);
  const u = x / e;
  const v = y / e;
  if (tipo === "tijolo") {
    // Fileiras de 18 pixels, tijolos de 44, meia volta a cada fileira; o rejunte é baixo
    const fileira = Math.floor(v / 18);
    const uu = u + (fileira % 2 ? 22 : 0);
    const bx = uu - Math.floor(uu / 44) * 44;
    const by = v - fileira * 18;
    const borda = Math.min(bx, 44 - bx, by, 18 - by);
    const rejunte = limitar((borda - 1) / 2);
    return 0.25 + 0.6 * rejunte + 0.15 * fractal(u, v, 6, 3, 3);
  }
  if (tipo === "aniagem") {
    // Fios grossos trançados: a altura de cada fio sobe e desce em cima do outro
    const fx = 0.5 + 0.5 * Math.sin((u / 6) * Math.PI);
    const fy = 0.5 + 0.5 * Math.sin((v / 6) * Math.PI);
    const cruz = (Math.floor(u / 6) + Math.floor(v / 6)) % 2 ? fx : fy;
    return 0.2 + 0.6 * cruz + 0.2 * fractal(u, v, 3, 5, 2);
  }
  if (tipo === "arenito") return 0.3 * fractal(u, v, 18, 7, 3) + 0.7 * sorteio(Math.floor(u), Math.floor(v), 9) ** 2;
  if (tipo === "blocos") {
    const bx = u - Math.floor(u / 24) * 24;
    const by = v - Math.floor(v / 24) * 24;
    return 0.5 + 0.5 * Math.sin((bx / 24) * Math.PI) * Math.sin((by / 24) * Math.PI);
  }
  if (tipo === "fosco") return fractal(u, v, 4, 13, 3);
  if (tipo === "lentes") {
    // Lentes pequenas: cúpulas redondas numa grade desencontrada
    const fileira = Math.floor(v / 10);
    const uu = u + (fileira % 2 ? 5 : 0);
    const cx = uu - Math.floor(uu / 10) * 10 - 5;
    const cy = v - fileira * 10 - 5;
    return Math.sqrt(Math.max(0, 1 - (cx * cx + cy * cy) / 25));
  }
  // Tela: a trama fina dos fios
  const tx = 0.5 + 0.5 * Math.sin((u / 2) * Math.PI);
  const ty = 0.5 + 0.5 * Math.sin((v / 2) * Math.PI);
  return 0.35 * tx + 0.35 * ty + 0.3 * sorteio(Math.floor(u), Math.floor(v), 4);
}

/** O plano de uma textura. */
export function planoDaTextura(tipo: string, escala: number, largura: number, altura: number, ctx: ContextoDoFiltro): Float32Array {
  return porDocumento(largura, altura, ctx, (x, y) => textura(tipo, x, y, escala));
}

/** Leva a cor por um fator (a luz de um relevo, por exemplo). */
export function multiplicar(c: { r: Float32Array; g: Float32Array; b: Float32Array }, fator: Float32Array) {
  const n = fator.length;
  const saida = { r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n) };
  for (let p = 0; p < n; p++) {
    saida.r[p] = c.r[p] * fator[p];
    saida.g[p] = c.g[p] * fator[p];
    saida.b[p] = c.b[p] * fator[p];
  }
  return saida;
}

/** A cor de duas tintas misturadas por um plano de 0 (a primeira) a 1 (a segunda). */
export function duasCores(t: Float32Array, a: [number, number, number], b: [number, number, number]) {
  const n = t.length;
  const saida = { r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n) };
  for (let p = 0; p < n; p++) {
    const k = limitar(t[p]);
    saida.r[p] = a[0] + (b[0] - a[0]) * k;
    saida.g[p] = a[1] + (b[1] - a[1]) * k;
    saida.b[p] = a[2] + (b[2] - a[2]) * k;
  }
  return saida;
}

/** Uma cópia da cor reta. */
export const copiaDaCor = (c: { r: Float32Array; g: Float32Array; b: Float32Array }) => ({ r: c.r.slice(), g: c.g.slice(), b: c.b.slice() });

/** O contraste em volta do meio (k > 1 aumenta). */
export const contraste = (v: number, k: number) => limitar((v - 0.5) * k + 0.5);
