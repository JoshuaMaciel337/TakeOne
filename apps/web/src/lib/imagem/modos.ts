// Os modos de cor do documento (Imagem › Modo, ADR 0003, onda 13.13). O TakeOne desenha em RGB de 8 bits; o modo é um
// passo no fim, com a mesma conta na prévia (sobre o que o compositor desenhou) e nos arquivos exportados:
// - Escala de cinza: a luz de cada pixel (0,299 R + 0,587 G + 0,114 B);
// - Bitmap: preto e branco, por limiar, padrão (Bayer 8 × 8), difusão (Floyd–Steinberg) ou meio-tom (a retícula com
//   a frequência em linhas por polegada, o ângulo e a forma do ponto), sobre o branco;
// - Duotone: de uma a quatro tintas sobre o cinza, cada uma com a curva dela, impressas uma sobre a outra;
// - Cores indexadas: a paleta guardada no documento (a tabela de cores), com o pontilhado;
// - CMYK: a separação (com a geração de preto e o limite de tinta) e a prova na tela, pelas cores das tintas de
//   impressão sobre o papel; não há perfil ICC, então é uma aproximação. O TIFF e o PDF saem em CMYK;
// - Lab: a imagem não muda na tela; o TIFF e o PDF saem em L*a*b* (D65).
import { valorDaCurva } from "../projeto/cor.ts";
import { mapearNaPaleta, type Pontilhado, type Rgb, rgbaDaIndexada } from "../exportacao/formatos/quantizar.ts";

export type FormaDoPonto = "redondo" | "elipse" | "linha" | "quadrado" | "losango" | "cruz";
export type TintaDoDuotone = { nome: string; cor: string; /** A tinta (0 a 100) em 0, 25, 50, 75 e 100% do cinza. */ curva: number[] };
export type GeracaoDoPreto = "nenhuma" | "leve" | "media" | "pesada" | "maxima";

export type ModoDeCor =
  | { tipo: "rgb" }
  | { tipo: "cinza" }
  | { tipo: "bitmap"; metodo: "limiar" | "padrao" | "difusao" | "meio_tom"; limiar: number; frequencia: number; angulo: number; forma: FormaDoPonto }
  | { tipo: "duotone"; tintas: TintaDoDuotone[] }
  | { tipo: "indexadas"; paleta: Rgb[]; pontilhado: Pontilhado; quantidade: number; transparencia: boolean }
  | { tipo: "cmyk"; preto: GeracaoDoPreto; limite: number }
  | { tipo: "lab" };

export const CURVA_LINEAR = [0, 25, 50, 75, 100];

export const BITMAP_PADRAO: Extract<ModoDeCor, { tipo: "bitmap" }> = { tipo: "bitmap", metodo: "difusao", limiar: 128, frequencia: 53, angulo: 45, forma: "redondo" };
export const CMYK_PADRAO: Extract<ModoDeCor, { tipo: "cmyk" }> = { tipo: "cmyk", preto: "media", limite: 300 };

/** Os duotones prontos (desenhados aqui, com nomes descritivos). */
export const DUOTONES_PRONTOS: { nome: string; tintas: TintaDoDuotone[] }[] = [
  { nome: "Sépia", tintas: [{ nome: "Preto", cor: "#000000", curva: [0, 20, 45, 72, 100] }, { nome: "Marrom", cor: "#a0703c", curva: [0, 35, 60, 80, 90] }] },
  { nome: "Azul noturno", tintas: [{ nome: "Preto", cor: "#000000", curva: [0, 18, 42, 70, 100] }, { nome: "Azul", cor: "#2d5f9a", curva: [0, 38, 62, 82, 95] }] },
  { nome: "Verde-oliva", tintas: [{ nome: "Preto", cor: "#000000", curva: [0, 20, 45, 72, 100] }, { nome: "Oliva", cor: "#7a7a3a", curva: [0, 30, 55, 78, 90] }] },
  { nome: "Tritom quente", tintas: [{ nome: "Preto", cor: "#000000", curva: [0, 12, 35, 65, 100] }, { nome: "Vermelho", cor: "#b8483a", curva: [0, 25, 45, 60, 70] }, { nome: "Amarelo", cor: "#e8c46a", curva: [0, 30, 50, 55, 50] }] },
  { nome: "Quadritom frio", tintas: [{ nome: "Preto", cor: "#000000", curva: [0, 10, 32, 62, 100] }, { nome: "Azul", cor: "#3b6fa8", curva: [0, 25, 45, 62, 75] }, { nome: "Ciano", cor: "#5fb3c9", curva: [0, 22, 38, 48, 50] }, { nome: "Cinza", cor: "#9aa3ab", curva: [0, 20, 32, 40, 40] }] },
  { nome: "Monotom de vinho", tintas: [{ nome: "Vinho", cor: "#5b1a2c", curva: CURVA_LINEAR }] },
];

const limitar = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const corEmRgb = (cor: string): Rgb => [1, 3, 5].map((i) => parseInt(cor.slice(i, i + 2), 16) || 0) as Rgb;
export const luz = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** A tabela do duotone: para cada cinza (0 a 255), a cor das tintas sobrepostas. */
export function tabelaDoDuotone(tintas: TintaDoDuotone[]): Uint8ClampedArray {
  const tabela = new Uint8ClampedArray(256 * 3);
  const prontas = tintas.slice(0, 4).map((tinta) => ({
    cor: corEmRgb(tinta.cor).map((v) => v / 255),
    pontos: (tinta.curva.length === 5 ? tinta.curva : CURVA_LINEAR).map((y, i) => [i / 4, limitar(y / 100)] as [number, number]),
  }));
  for (let g = 0; g < 256; g++) {
    const tinta = 1 - g / 255;
    const cor = [1, 1, 1];
    for (const { cor: c, pontos } of prontas) {
      const a = limitar(valorDaCurva(pontos, tinta));
      for (let e = 0; e < 3; e++) cor[e] *= 1 - a * (1 - c[e]);
    }
    for (let e = 0; e < 3; e++) tabela[g * 3 + e] = Math.round(cor[e] * 255);
  }
  return tabela;
}

// ——— Bitmap ———
const BAYER8 = (() => {
  const m = [[0]];
  let atual = m;
  for (let n = 1; n < 8; n *= 2) {
    const novo: number[][] = Array.from({ length: n * 2 }, () => new Array(n * 2).fill(0));
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = atual[y][x] * 4;
        novo[y][x] = v;
        novo[y][x + n] = v + 2;
        novo[y + n][x] = v + 3;
        novo[y + n][x + n] = v + 1;
      }
    atual = novo;
  }
  return atual.flat().map((v) => (v + 0.5) / 64);
})();

/** O valor da forma do ponto em (u, v) da célula, de -1 a 1: quanto menor, mais cedo o ponto pega a tinta. */
function valorDaForma(forma: FormaDoPonto, u: number, v: number): number {
  switch (forma) {
    case "redondo":
      return u * u + v * v;
    case "elipse":
      return u * u + (v * 1.4) * (v * 1.4);
    case "linha":
      return Math.abs(v);
    case "quadrado":
      return Math.max(Math.abs(u), Math.abs(v));
    case "losango":
      return Math.abs(u) + Math.abs(v);
    case "cruz":
      return Math.min(Math.abs(u), Math.abs(v));
  }
}

const tabelasDaForma = new Map<FormaDoPonto, Float64Array>();

/**
 * A ordem em que os pontos da célula pegam tinta, de 0 a 1 (a posição de cada valor da forma entre todos os da
 * célula): assim a tinta cresce na proporção do cinza, qualquer que seja a forma.
 */
function ordemDaForma(forma: FormaDoPonto): (valor: number) => number {
  let valores = tabelasDaForma.get(forma);
  if (!valores) {
    const lado = 128;
    valores = new Float64Array(lado * lado);
    for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) valores[y * lado + x] = valorDaForma(forma, ((x + 0.5) / lado) * 2 - 1, ((y + 0.5) / lado) * 2 - 1);
    valores.sort();
    tabelasDaForma.set(forma, valores);
  }
  const lista = valores;
  return (valor) => {
    let baixo = 0;
    let alto = lista.length;
    while (baixo < alto) {
      const meio = (baixo + alto) >> 1;
      if (lista[meio] < valor) baixo = meio + 1;
      else alto = meio;
    }
    return (baixo + 0.5) / lista.length;
  };
}

/** O cinza (0 a 1, o branco por baixo do que é transparente) de cada pixel. */
function cinzaSobreBranco(dados: Uint8ClampedArray, total: number): Float32Array {
  const cinza = new Float32Array(total);
  for (let p = 0; p < total; p++) {
    const a = dados[p * 4 + 3] / 255;
    cinza[p] = (luz(dados[p * 4], dados[p * 4 + 1], dados[p * 4 + 2]) * a + 255 * (1 - a)) / 255;
  }
  return cinza;
}

function bitmap(dados: Uint8ClampedArray, largura: number, altura: number, modo: Extract<ModoDeCor, { tipo: "bitmap" }>, pixelsPorPolegada: number) {
  const total = largura * altura;
  const cinza = cinzaSobreBranco(dados, total);
  const preto = new Uint8Array(total);
  if (modo.metodo === "limiar") for (let p = 0; p < total; p++) preto[p] = cinza[p] * 255 < modo.limiar ? 1 : 0;
  else if (modo.metodo === "padrao") for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) preto[y * largura + x] = cinza[y * largura + x] < BAYER8[(y & 7) * 8 + (x & 7)] ? 1 : 0;
  else if (modo.metodo === "difusao") {
    for (let y = 0; y < altura; y++)
      for (let x = 0; x < largura; x++) {
        const p = y * largura + x;
        const escuro = cinza[p] < 0.5;
        preto[p] = escuro ? 1 : 0;
        const erro = cinza[p] - (escuro ? 0 : 1);
        if (x + 1 < largura) cinza[p + 1] += (erro * 7) / 16;
        if (y + 1 < altura) {
          if (x > 0) cinza[p + largura - 1] += (erro * 3) / 16;
          cinza[p + largura] += (erro * 5) / 16;
          if (x + 1 < largura) cinza[p + largura + 1] += erro / 16;
        }
      }
  } else {
    // A retícula: células de (pixels por polegada / linhas por polegada) pixels, giradas pelo ângulo
    const celula = Math.max(2, pixelsPorPolegada / Math.max(1, modo.frequencia));
    const angulo = (modo.angulo * Math.PI) / 180;
    const cos = Math.cos(angulo);
    const sen = Math.sin(angulo);
    const ordem = ordemDaForma(modo.forma);
    for (let y = 0; y < altura; y++)
      for (let x = 0; x < largura; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const a = (px * cos + py * sen) / celula;
        const b = (-px * sen + py * cos) / celula;
        const u = (a - Math.floor(a)) * 2 - 1;
        const v = (b - Math.floor(b)) * 2 - 1;
        preto[y * largura + x] = 1 - cinza[y * largura + x] > ordem(valorDaForma(modo.forma, u, v)) ? 1 : 0;
      }
  }
  for (let p = 0; p < total; p++) {
    const v = preto[p] ? 0 : 255;
    dados[p * 4] = v;
    dados[p * 4 + 1] = v;
    dados[p * 4 + 2] = v;
    dados[p * 4 + 3] = 255;
  }
}

// ——— CMYK e Lab ———
const FATOR_DO_PRETO: Record<GeracaoDoPreto, number> = { nenhuma: 0, leve: 0.4, media: 0.7, pesada: 0.9, maxima: 1 };

/** A separação de uma cor (0 a 1) em C, M, Y e K (0 a 1), com a geração de preto e o limite de tinta (em %). */
export function rgbParaCmyk(r: number, g: number, b: number, preto: GeracaoDoPreto, limite: number): [number, number, number, number] {
  const kMaximo = 1 - Math.max(r, g, b);
  const k = kMaximo * FATOR_DO_PRETO[preto];
  const resto = 1 - k;
  let c = resto > 1e-6 ? limitar((1 - r - k) / resto) : 0;
  let m = resto > 1e-6 ? limitar((1 - g - k) / resto) : 0;
  let y = resto > 1e-6 ? limitar((1 - b - k) / resto) : 0;
  // O limite de tinta: o que passa sai das três cores, na proporção delas
  const soma = c + m + y;
  const sobra = limite / 100 - k;
  if (soma > sobra && soma > 0) {
    const f = Math.max(0, sobra) / soma;
    c *= f;
    m *= f;
    y *= f;
  }
  return [c, m, y, k];
}

// As tintas de impressão sobre o papel branco, como aparecem na tela (sRGB aproximado das tintas de processo)
const TINTAS: Rgb[] = [
  [0, 158, 224],
  [226, 0, 122],
  [255, 237, 0],
  [35, 31, 32],
];

/** A prova: as tintas impressas uma sobre a outra (cada uma filtra a luz que sobra). */
export function cmykNaTela(c: number, m: number, y: number, k: number): Rgb {
  const quantidades = [c, m, y, k];
  const saida: Rgb = [255, 255, 255];
  for (let e = 0; e < 3; e++) {
    let v = 1;
    for (let i = 0; i < 4; i++) v *= 1 - quantidades[i] * (1 - TINTAS[i][e] / 255);
    saida[e] = Math.round(v * 255);
  }
  return saida;
}

const paraLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fLab = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** sRGB (0 a 1) → L*a*b* com o branco D65 (L de 0 a 100, a e b de cerca de -128 a 127). */
export function rgbParaLab(r: number, g: number, b: number): [number, number, number] {
  const [lr, lg, lb] = [paraLinear(r), paraLinear(g), paraLinear(b)];
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047;
  const yy = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb;
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883;
  const [fx, fy, fz] = [fLab(x), fLab(yy), fLab(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** As amostras de 8 bits da imagem em CMYK (4 por pixel) ou Lab (3: L em 0 a 255 e a, b com sinal), sobre o branco. */
export function amostrasDoEspaco(dados: Uint8ClampedArray, total: number, espaco: "cmyk" | "lab", modo?: ModoDeCor): Uint8Array {
  const cmyk = modo?.tipo === "cmyk" ? modo : CMYK_PADRAO;
  const canais = espaco === "cmyk" ? 4 : 3;
  const saida = new Uint8Array(total * canais);
  for (let p = 0; p < total; p++) {
    const a = dados[p * 4 + 3] / 255;
    const [r, g, b] = [0, 1, 2].map((e) => (dados[p * 4 + e] * a + 255 * (1 - a)) / 255);
    if (espaco === "cmyk") {
      const tintas = rgbParaCmyk(r, g, b, cmyk.preto, cmyk.limite);
      for (let e = 0; e < 4; e++) saida[p * 4 + e] = Math.round(tintas[e] * 255);
    } else {
      const [l, la, lb] = rgbParaLab(r, g, b);
      saida[p * 3] = Math.round((Math.max(0, Math.min(100, l)) * 255) / 100);
      saida[p * 3 + 1] = Math.max(-128, Math.min(127, Math.round(la))) & 255;
      saida[p * 3 + 2] = Math.max(-128, Math.min(127, Math.round(lb))) & 255;
    }
  }
  return saida;
}

/**
 * O modo aplicado aos pixels (RGBA, em lugar). `pixelsPorPolegada` é a resolução destes pixels (a do documento vezes a
 * escala em que foram desenhados): o meio-tom mede a célula por ela.
 */
export function aplicarModo(dados: Uint8ClampedArray, largura: number, altura: number, modo: ModoDeCor | null | undefined, pixelsPorPolegada = 72) {
  if (!modo || modo.tipo === "rgb" || modo.tipo === "lab") return;
  const total = largura * altura;
  switch (modo.tipo) {
    case "cinza":
      for (let p = 0; p < total; p++) {
        const v = Math.round(luz(dados[p * 4], dados[p * 4 + 1], dados[p * 4 + 2]));
        dados[p * 4] = v;
        dados[p * 4 + 1] = v;
        dados[p * 4 + 2] = v;
      }
      return;
    case "duotone": {
      const tabela = tabelaDoDuotone(modo.tintas);
      for (let p = 0; p < total; p++) {
        const g = Math.round(luz(dados[p * 4], dados[p * 4 + 1], dados[p * 4 + 2]));
        dados[p * 4] = tabela[g * 3];
        dados[p * 4 + 1] = tabela[g * 3 + 1];
        dados[p * 4 + 2] = tabela[g * 3 + 2];
      }
      return;
    }
    case "bitmap":
      return bitmap(dados, largura, altura, modo, pixelsPorPolegada);
    case "indexadas": {
      const indexada = mapearNaPaleta(dados, largura, altura, modo.paleta, { pontilhado: modo.pontilhado, quantidade: modo.quantidade, transparencia: modo.transparencia, fosco: [255, 255, 255] });
      const volta = rgbaDaIndexada(indexada);
      // Sem transparência no modo, tudo fica opaco (sobre o branco, como o mapeamento fez)
      dados.set(volta);
      return;
    }
    case "cmyk":
      for (let p = 0; p < total; p++) {
        const [c, m, y, k] = rgbParaCmyk(dados[p * 4] / 255, dados[p * 4 + 1] / 255, dados[p * 4 + 2] / 255, modo.preto, modo.limite);
        const [r, g, b] = cmykNaTela(c, m, y, k);
        dados[p * 4] = r;
        dados[p * 4 + 1] = g;
        dados[p * 4 + 2] = b;
      }
      return;
  }
}

/** O nome do modo (o menu marca o atual). */
export const NOMES_DOS_MODOS: Record<ModoDeCor["tipo"], string> = {
  rgb: "Cor RGB",
  cinza: "Escala de cinza",
  bitmap: "Bitmap",
  duotone: "Duotone",
  indexadas: "Cores indexadas",
  cmyk: "Cor CMYK",
  lab: "Cor Lab",
};

/** A sigla do modo na aba do documento ("RGB/8", "Cinza/8"). */
export const SIGLAS_DOS_MODOS: Record<ModoDeCor["tipo"], string> = { rgb: "RGB", cinza: "Cinza", bitmap: "Bitmap", duotone: "Duotone", indexadas: "Indexadas", cmyk: "CMYK", lab: "Lab" };
