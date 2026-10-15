// Efeitos de vídeo do clipe. Espelha core/utils/efeitos.py: os mesmos números para o compositor da
// prévia e o render. Um efeito por clipe, com intensidade de 0 a 1.
//   - desfoque: o mesmo desfoque gaussiano das transições (sigma em frações da altura do clipe);
//   - brilho: o clipe desfocado somado a ele mesmo em "tela" (a luz se espalha em volta dos claros);
//   - distorção: lente de olho de peixe (a do lenscorrection do FFmpeg), com zoom para não sobrar canto vazio;
//   - VHS e glitch: veja abaixo.
import type { AjustesCor } from "./cor.ts";

export type TipoEfeito = "desfoque" | "brilho" | "distorcao" | "vhs" | "glitch";
export type Efeito = { tipo: TipoEfeito; intensidade: number };

export const EFEITOS: { id: TipoEfeito; nome: string; descricao: string }[] = [
  { id: "desfoque", nome: "Desfoque", descricao: "Deixa a imagem toda fora de foco" },
  { id: "brilho", nome: "Brilho", descricao: "A luz dos claros se espalha em volta deles" },
  { id: "distorcao", nome: "Olho de peixe", descricao: "Estufa o meio da imagem como uma lente grande-angular" },
  { id: "vhs", nome: "VHS", descricao: "Fita antiga: cores separadas, linhas e cor desbotada" },
  { id: "glitch", nome: "Glitch", descricao: "As cores saltam para os lados em alguns quadros" },
];

/** Com intensidade 1. */
export const DESFOQUE_MAXIMO = 0.025;
export const BRILHO_SIGMA = 0.02;
export const DISTORCAO_MAXIMA = 0.5;
export const INTENSIDADE_PADRAO = 0.6;

export function efeitoAtivo(efeito: Efeito | null | undefined): efeito is Efeito {
  return !!efeito && EFEITOS.some((item) => item.id === efeito.tipo) && efeito.intensidade > 0;
}

/** Sigma do desfoque do efeito, em frações da altura do clipe (0 sem ele). */
export function desfoqueDoEfeito(efeito: Efeito | null | undefined): number {
  return efeitoAtivo(efeito) && efeito.tipo === "desfoque" ? DESFOQUE_MAXIMO * efeito.intensidade : 0;
}

/** Quanto da luz desfocada soma ao clipe (0 sem brilho). */
export function brilhoDoEfeito(efeito: Efeito | null | undefined): number {
  return efeitoAtivo(efeito) && efeito.tipo === "brilho" ? efeito.intensidade : 0;
}

/** O k1 da lente (0 sem distorção). */
export function distorcaoDoEfeito(efeito: Efeito | null | undefined): number {
  return efeitoAtivo(efeito) && efeito.tipo === "distorcao" ? DISTORCAO_MAXIMA * efeito.intensidade : 0;
}

// -----------------------------------------------
// VHS e glitch: as cores separadas (vermelho para um lado, azul para o outro), as linhas do VHS e,
// no glitch, saltos de alguns quadros. O sorteio é um hash de inteiros: o mesmo no TS e no Python.
// -----------------------------------------------
export const VHS_DESVIO = 0.004;
export const VHS_LINHAS = 0.18;
export const LINHAS_POR_ALTURA = 270;
export const GLITCH_DESVIO = 0.04;
export const GLITCH_QUADROS = 3;
export const GLITCH_CHANCE = 0.35;

/** Hash de inteiros (lowbias32): espalha os bits de n; o mesmo resultado em qualquer linguagem. */
export function hash32(n: number): number {
  let x = n >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/** Um número de 0 a 1 sorteado pelo inteiro n. */
export function sorteio(n: number): number {
  return hash32(n) / 2 ** 32;
}

/** Quanto o vermelho anda para a direita (e o azul para a esquerda), em frações da largura, no quadro dado. */
export function desvioDeCor(efeito: Efeito | null | undefined, quadro: number): number {
  if (!efeitoAtivo(efeito) || (efeito.tipo !== "vhs" && efeito.tipo !== "glitch")) return 0;
  if (efeito.tipo === "vhs") return VHS_DESVIO * efeito.intensidade;
  const bloco = Math.floor(quadro / GLITCH_QUADROS);
  if (sorteio(bloco) >= GLITCH_CHANCE * efeito.intensidade) return 0;
  return (sorteio(bloco * 7 + 1) * 2 - 1) * GLITCH_DESVIO * efeito.intensidade;
}

/** Quanto as linhas escuras do VHS escurecem (0 sem linhas). */
export function linhasDoEfeito(efeito: Efeito | null | undefined): number {
  return efeitoAtivo(efeito) && efeito.tipo === "vhs" ? VHS_LINHAS * efeito.intensidade : 0;
}

/** O que o efeito soma aos ajustes de cor (o VHS desbota, perde contraste e esquenta). */
export function ajustesDoEfeito(efeito: Efeito | null | undefined): Partial<AjustesCor> {
  if (!efeitoAtivo(efeito) || efeito.tipo !== "vhs") return {};
  const i = efeito.intensidade;
  return { saturacao: -0.35 * i, contraste: -0.12 * i, temperatura: 0.12 * i };
}
