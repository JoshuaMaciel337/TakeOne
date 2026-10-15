// Efeitos de vídeo do clipe. Espelha core/utils/efeitos.py: os mesmos números para o compositor da
// prévia e o render. Um efeito por clipe, com intensidade de 0 a 1.
//   - desfoque: o mesmo desfoque gaussiano das transições (sigma em frações da altura do clipe);
//   - brilho: o clipe desfocado somado a ele mesmo em "tela" (a luz se espalha em volta dos claros);
//   - distorção: lente de olho de peixe (a do lenscorrection do FFmpeg), com zoom para não sobrar canto vazio;
//   - VHS, glitch, luz e granulação: veja abaixo.
import type { AjustesCor } from "./cor.ts";

export type TipoEfeito = "desfoque" | "brilho" | "distorcao" | "vhs" | "glitch" | "luz" | "granulacao";
export type Efeito = { tipo: TipoEfeito; intensidade: number };

export const EFEITOS: { id: TipoEfeito; nome: string; descricao: string }[] = [
  { id: "desfoque", nome: "Desfoque", descricao: "Deixa a imagem toda fora de foco" },
  { id: "brilho", nome: "Brilho", descricao: "A luz dos claros se espalha em volta deles" },
  { id: "distorcao", nome: "Olho de peixe", descricao: "Estufa o meio da imagem como uma lente grande-angular" },
  { id: "vhs", nome: "VHS", descricao: "Fita antiga: cores separadas, linhas e cor desbotada" },
  { id: "glitch", nome: "Glitch", descricao: "As cores saltam para os lados em alguns quadros" },
  { id: "luz", nome: "Luz", descricao: "Uma faixa de luz quente atravessa a imagem" },
  { id: "granulacao", nome: "Granulação", descricao: "Grão de filme sobre a imagem" },
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

// -----------------------------------------------
// Luz e granulação (só em clipes de mídia: com transparência, a mistura não fecharia). Os mesmos
// números de core/utils/efeitos.py: a faixa de luz que atravessa o clipe a cada 4 s, somada em
// "tela", e o grão por célula (540 linhas de células), recortado num lugar sorteado a cada quadro de
// uma imagem fixa de 2048 × 1080 células.
// -----------------------------------------------
export const LUZ_PERIODO = 4;
export const LUZ_LARGURA = 0.25;
export const LUZ_COR: [number, number, number] = [1, 0.55, 0.2];
export const LUZ_FORCA = 0.8;
export const GRAO_LINHAS = 540;
export const GRAO_FORCA = 0.25;
export const GRAO_TEXTURA: [number, number] = [2048, 1080];
/** Efeitos que não valem em textos. */
export const SO_EM_MIDIA: TipoEfeito[] = ["luz", "granulacao"];

/** O centro da faixa de luz, em frações da largura do clipe (de -0,3 a 1,3). */
export function posicaoDaLuz(segundosNoClipe: number): number {
  const ciclo = segundosNoClipe / LUZ_PERIODO;
  return -0.3 + 1.6 * (ciclo - Math.floor(ciclo));
}

export function luzDoEfeito(efeito: Efeito | null | undefined, ehTexto = false): number {
  return efeitoAtivo(efeito) && efeito.tipo === "luz" && !ehTexto ? LUZ_FORCA * efeito.intensidade : 0;
}

export function graoDoEfeito(efeito: Efeito | null | undefined, ehTexto = false): number {
  return efeitoAtivo(efeito) && efeito.tipo === "granulacao" && !ehTexto ? GRAO_FORCA * efeito.intensidade : 0;
}

/** Quantas células de grão na largura do clipe (as linhas são sempre GRAO_LINHAS). */
export function colunasDoGrao(largura: number, altura: number): number {
  return Math.max(1, Math.min(Math.round((GRAO_LINHAS * largura) / altura), GRAO_TEXTURA[0] / 2));
}

/** Onde o recorte do grão começa na imagem fixa, sorteado pelo quadro. */
export function deslocamentoDoGrao(quadro: number, colunas: number): [number, number] {
  return [hash32(quadro * 2 + 1) % (GRAO_TEXTURA[0] - colunas), hash32(quadro * 2 + 2) % (GRAO_TEXTURA[1] - GRAO_LINHAS)];
}

/** A imagem fixa do grão (0 a 255 por célula), linha por linha: sorteio(linha × 2048 + coluna). */
export function valoresDoGrao(): Uint8Array {
  const [largura, altura] = GRAO_TEXTURA;
  const valores = new Uint8Array(largura * altura);
  for (let i = 0; i < valores.length; i++) valores[i] = Math.round(sorteio(i) * 255);
  return valores;
}
