// O painel Informações e o Amostrador de cor do editor de imagem (ADR 0003, onda 13.14): a cor da imagem num ponto
// (a média do quadrado da amostra, como o conta-gotas), as leituras dela (RGB, hexadecimal, CMYK pela separação do
// modo, Lab, HSB e cinza) e as medidas na unidade das réguas.
import { CMYK_PADRAO, type ModoDeCor, rgbParaCmyk, rgbParaLab } from "./modos.ts";
import { pixelsDaUnidade, UNIDADES_DA_REGUA, type UnidadeDaRegua } from "./vista.ts";

export type ImagemDasInformacoes = { largura: number; altura: number; dados: Uint8ClampedArray | Uint8Array };

/** O tamanho da amostra: o lado do quadrado em pixels do documento, em volta do ponto. */
export const TAMANHOS_DA_AMOSTRA: { lado: number; nome: string }[] = [
  { lado: 1, nome: "Ponto" },
  { lado: 3, nome: "Média 3 × 3" },
  { lado: 5, nome: "Média 5 × 5" },
  { lado: 11, nome: "Média 11 × 11" },
  { lado: 31, nome: "Média 31 × 31" },
  { lado: 51, nome: "Média 51 × 51" },
  { lado: 101, nome: "Média 101 × 101" },
];

/** O máximo de amostradores de cor de um documento, como lá. */
export const MAXIMO_DE_AMOSTRADORES = 10;

export type CorLida = { r: number; g: number; b: number; a: number };

/**
 * A média do quadrado de `lado` pixels em volta do pixel do ponto (pixels do documento), cortado pela imagem. A cor é
 * pesada pelo alfa (um pixel transparente não puxa a cor para o preto); o alfa é a média simples. Fora da imagem, null.
 */
export function corNoPonto(imagem: ImagemDasInformacoes, x: number, y: number, lado = 1): CorLida | null {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= imagem.largura || cy >= imagem.altura) return null;
  const raio = Math.floor(Math.max(1, lado) / 2);
  const x0 = Math.max(0, cx - raio);
  const x1 = Math.min(imagem.largura - 1, cx + raio);
  const y0 = Math.max(0, cy - raio);
  const y1 = Math.min(imagem.altura - 1, cy + raio);
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let n = 0;
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const i = (yy * imagem.largura + xx) * 4;
      const alfa = imagem.dados[i + 3];
      r += imagem.dados[i] * alfa;
      g += imagem.dados[i + 1] * alfa;
      b += imagem.dados[i + 2] * alfa;
      a += alfa;
      n++;
    }
  }
  if (!a) return { r: 0, g: 0, b: 0, a: 0 };
  return { r: Math.round(r / a), g: Math.round(g / a), b: Math.round(b / a), a: Math.round(a / n) };
}

export type LeiturasDaCor = {
  hex: string;
  rgb: [number, number, number];
  /** Em % (0 a 100), pela separação do modo CMYK do documento (ou a padrão). */
  cmyk: [number, number, number, number];
  lab: [number, number, number];
  /** Matiz em graus, saturação e brilho em %. */
  hsb: [number, number, number];
  /** A tinta preta em % no cinza (a luz pela regra do modo Cinza). */
  cinza: number;
};

export function leiturasDaCor(cor: CorLida, modo?: ModoDeCor | null): LeiturasDaCor {
  const { r, g, b } = cor;
  const separacao = modo?.tipo === "cmyk" ? modo : CMYK_PADRAO;
  const cmyk = rgbParaCmyk(r / 255, g / 255, b / 255, separacao.preto, separacao.limite).map((v) => Math.round(v * 100)) as [number, number, number, number];
  const lab = rgbParaLab(r / 255, g / 255, b / 255).map((v) => Math.round(v)) as [number, number, number];
  const maior = Math.max(r, g, b);
  const menor = Math.min(r, g, b);
  const d = maior - menor;
  let h = 0;
  if (d) {
    if (maior === r) h = ((g - b) / d) % 6;
    else if (maior === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  return {
    hex,
    rgb: [r, g, b],
    cmyk,
    lab: [lab[0] + 0, lab[1] + 0, lab[2] + 0],
    hsb: [Math.round(h), maior ? Math.round((d / maior) * 100) : 0, Math.round((maior / 255) * 100)],
    cinza: Math.round((1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255) * 100),
  };
}

/** Uma medida em pixels do documento na unidade das réguas ("12,5 cm"); a porcentagem é do lado dado. */
export function naUnidade(pixels: number, unidade: UnidadeDaRegua, ppi: number, lado: number): string {
  const valor = pixels / pixelsDaUnidade(unidade, ppi, lado);
  const casas = unidade === "px" ? 0 : unidade === "pol" || unidade === "pica" ? 3 : unidade === "pct" ? 1 : 2;
  const sigla = UNIDADES_DA_REGUA.find((u) => u.id === unidade)?.sigla ?? unidade;
  return `${(Math.round(valor * 10 ** casas) / 10 ** casas + 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })} ${sigla}`;
}
