// O histograma do editor de imagem (ADR 0003, onda 13.10): a contagem dos 256 tons de cada canal e da luminância,
// com a média, o desvio, a mediana e os pixels, como no painel Histograma; e as contas dos automáticos (tom,
// contraste e cor) que partem dele, para Níveis, Curvas e Brilho/Contraste.
import type { NiveisDoCanal } from "./ajustes.ts";

export type CanalDoHistograma = "luma" | "r" | "g" | "b";
export type Histogramas = Record<CanalDoHistograma, Uint32Array> & { pixels: number };
export type Estatisticas = { media: number; desvio: number; mediana: number; pixels: number };

/** Os histogramas de pixels RGBA de 8 bits; os transparentes (alfa 0) ficam de fora. */
export function histogramas(dados: Uint8ClampedArray | Uint8Array): Histogramas {
  const h = { luma: new Uint32Array(256), r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), pixels: 0 };
  for (let i = 0; i < dados.length; i += 4) {
    if (dados[i + 3] === 0) continue;
    const r = dados[i];
    const g = dados[i + 1];
    const b = dados[i + 2];
    h.r[r]++;
    h.g[g]++;
    h.b[b]++;
    // A luminância da tabela pela luminância (ajustes.ts), no tom mais perto
    h.luma[Math.min(255, Math.floor(0.299 * r + 0.587 * g + 0.114 * b + 0.5))]++;
    h.pixels++;
  }
  return h;
}

/** Média, desvio-padrão e mediana de um histograma (no intervalo [de, ate], que o painel escolhe arrastando). */
export function estatisticas(contagem: Uint32Array, de = 0, ate = 255): Estatisticas {
  let pixels = 0;
  let soma = 0;
  for (let i = de; i <= ate; i++) {
    pixels += contagem[i];
    soma += i * contagem[i];
  }
  if (!pixels) return { media: 0, desvio: 0, mediana: 0, pixels: 0 };
  const media = soma / pixels;
  let variancia = 0;
  let acumulado = 0;
  let mediana = -1;
  for (let i = de; i <= ate; i++) {
    variancia += contagem[i] * (i - media) ** 2;
    acumulado += contagem[i];
    if (mediana < 0 && acumulado * 2 >= pixels) mediana = i;
  }
  return { media, desvio: Math.sqrt(variancia / pixels), mediana, pixels };
}

/** O tom em que a contagem acumulada passa de `fracao` dos pixels, de baixo (ou de cima, com `deCima`). */
export function percentil(contagem: Uint32Array, fracao: number, deCima = false): number {
  const total = contagem.reduce((soma, v) => soma + v, 0);
  if (!total) return deCima ? 255 : 0;
  const limite = total * fracao;
  let acumulado = 0;
  for (let k = 0; k < 256; k++) {
    const i = deCima ? 255 - k : k;
    acumulado += contagem[i];
    if (acumulado > limite) return i;
  }
  return deCima ? 0 : 255;
}

/** Os pontos de preto e branco que cortam `recorte` (0,1% por padrão) de cada ponta, com o branco acima do preto. */
export function pontasDoHistograma(contagem: Uint32Array, recorte = 0.001): [number, number] {
  const preto = percentil(contagem, recorte);
  const branco = percentil(contagem, recorte, true);
  return branco - preto >= 2 ? [preto, branco] : [Math.max(0, Math.min(preto, 253)), Math.min(255, Math.max(preto, 253) + 2)];
}

const niveis = (preto: number, branco: number, gama = 1): NiveisDoCanal => ({ preto, branco, gama, saida_preto: 0, saida_branco: 255 });

/**
 * Os automáticos: o tom estica cada canal sozinho (tira dominantes de cor nas pontas), o contraste estica os três
 * juntos (a cor fica), e a cor estica cada canal e leva a média dos meios-tons ao cinza pela gama de cada canal.
 */
export function niveisAutomaticos(h: Histogramas, jeito: "tom" | "contraste" | "cor"): Partial<Record<"rgb" | "r" | "g" | "b", NiveisDoCanal>> {
  if (jeito === "contraste") {
    const juntos = new Uint32Array(256);
    for (let i = 0; i < 256; i++) juntos[i] = h.r[i] + h.g[i] + h.b[i];
    const [preto, branco] = pontasDoHistograma(juntos);
    return { rgb: niveis(preto, branco) };
  }
  const canais = {} as Record<"r" | "g" | "b", NiveisDoCanal>;
  for (const canal of ["r", "g", "b"] as const) {
    const [preto, branco] = pontasDoHistograma(h[canal]);
    canais[canal] = niveis(preto, branco);
  }
  if (jeito === "tom") return canais;
  // A cor: depois de esticar, a gama de cada canal leva a mediana dele à mediana da luminância
  const alvo = Math.max(1, Math.min(254, estatisticas(h.luma).mediana));
  for (const canal of ["r", "g", "b"] as const) {
    const n = canais[canal];
    const mediana = estatisticas(h[canal]).mediana;
    const x = Math.min(0.99, Math.max(0.01, (mediana - n.preto) / (n.branco - n.preto)));
    const y = alvo / 255;
    // x^(1/gama) = y  →  gama = ln(x) / ln(y)
    n.gama = Math.min(9.99, Math.max(0.1, Math.log(x) / Math.log(y)));
  }
  return canais;
}
