// A pilha de filtros inteligentes de uma camada (ADR 0003, onda 13.11): cada filtro ligado passa o que chega por ele e
// mistura o resultado com o que chegou, no modo e na opacidade dele (as opções de mesclagem do filtro, de lá). O
// mesmo caminho serve ao filtro gravado nos pixels (uma pilha de um).
import { misturar } from "../../pintura/mesclar.ts";
import type { ModoDaPintura } from "../../pintura/traco.ts";
import type { Mesclagem } from "../../projeto/modelo.ts";
import { FILTRO_POR_ID, type Valores, valoresDoFiltro } from "./catalogo.ts";
import type { ContextoDoFiltro, ImagemDoFiltro } from "./comum.ts";

export type FiltroInteligente = { id: string; tipo: string; opcoes: Valores; ligado: boolean; modo: Exclude<Mesclagem, "passagem">; opacidade: number };
export type FiltrosInteligentes = { filtros: FiltroInteligente[]; ligado?: boolean; mascara?: import("../../projeto/mascaraDePixels.ts").MascaraDePixels | null };

/** Os filtros que valem (ligados, numa pilha ligada, de tipo conhecido). */
export const filtrosQueValem = (pilha: FiltrosInteligentes | null | undefined): FiltroInteligente[] =>
  pilha && pilha.ligado !== false ? pilha.filtros.filter((filtro) => filtro.ligado && FILTRO_POR_ID.has(filtro.tipo)) : [];

/** Os canais alfa que os filtros leem (o mapa de profundidade do desfoque de lente), pelo id. */
export const canaisDaPilha = (filtros: FiltroInteligente[]): string[] =>
  [...new Set(filtros.flatMap((filtro) => (typeof filtro.opcoes.fonte === "string" && filtro.opcoes.fonte.startsWith("canal:") ? [filtro.opcoes.fonte.slice(6)] : [])))];

/** Se algum filtro lê a profundidade da foto (o desfoque de lente com a fonte da IA). */
export const usaProfundidade = (filtros: FiltroInteligente[]): boolean => filtros.some((filtro) => filtro.opcoes.fonte === "profundidade");

/** Quanto a pilha pode passar da camada, em pixels do documento (as margens se somam). */
export function margemDaPilha(filtros: FiltroInteligente[]): number {
  let margem = 0;
  for (const filtro of filtros) {
    const definicao = FILTRO_POR_ID.get(filtro.tipo);
    if (definicao?.margem) margem += Math.max(0, definicao.margem(valoresDoFiltro(definicao, filtro.opcoes)));
  }
  return Math.min(4000, Math.ceil(margem));
}

/** Mistura o resultado do filtro com o que chegou, no modo e na opacidade (como uma camada por cima, no alfa de cada um). */
export function mesclarResultado(antes: ImagemDoFiltro, depois: ImagemDoFiltro, modo: string, opacidade: number): ImagemDoFiltro {
  if (modo === "normal" && opacidade >= 1) return depois;
  const dados = new Uint8ClampedArray(antes.dados.length);
  for (let i = 0; i < dados.length; i += 4) {
    const ab = antes.dados[i + 3] / 255;
    const as = (depois.dados[i + 3] / 255) * opacidade;
    const b: [number, number, number] = ab > 0 ? [antes.dados[i] / 255 / ab, antes.dados[i + 1] / 255 / ab, antes.dados[i + 2] / 255 / ab] : [0, 0, 0];
    const sr = depois.dados[i + 3] > 0 ? depois.dados[i + 3] / 255 : 1;
    const s: [number, number, number] = [depois.dados[i] / 255 / sr, depois.dados[i + 1] / 255 / sr, depois.dados[i + 2] / 255 / sr];
    const m = modo === "normal" ? s : misturar(modo as ModoDaPintura, b, s);
    // A fórmula da composição por cima com o modo (a cor misturada onde os dois existem)
    const a = as + ab * (1 - as);
    dados[i + 3] = Math.round(a * 255);
    for (let k = 0; k < 3; k++) {
      const misturada = (1 - ab) * s[k] + ab * m[k];
      dados[i + k] = Math.round((as * misturada + ab * b[k] * (1 - as)) * 255);
    }
  }
  return { ...antes, dados };
}

/** Um filtro sobre a imagem (as opções completas pelo catálogo). */
export function aplicarFiltro(imagem: ImagemDoFiltro, tipo: string, opcoes: Valores, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const definicao = FILTRO_POR_ID.get(tipo);
  if (!definicao) return imagem;
  return definicao.aplicar(imagem, valoresDoFiltro(definicao, opcoes), ctx);
}

/** A pilha inteira, de baixo para cima. */
export function aplicarPilha(imagem: ImagemDoFiltro, filtros: FiltroInteligente[], ctx: ContextoDoFiltro): ImagemDoFiltro {
  let atual = imagem;
  for (const filtro of filtros) atual = mesclarResultado(atual, aplicarFiltro(atual, filtro.tipo, filtro.opcoes, ctx), filtro.modo, filtro.opacidade);
  return atual;
}
