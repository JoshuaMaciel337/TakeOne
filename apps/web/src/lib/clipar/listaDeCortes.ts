// A lista de cortes (ADR 0004, 14.4): os filtros e a busca, as legendas de um corte antes de montar (a prévia do
// cartão e o .srt) e o tempo da prévia, que anda pelos trechos do corte um depois do outro. Contas puras.
import type { Corte } from "../clipagens.ts";
import { ESTILOS_DE_LEGENDA, escreverSrt, type Legenda } from "../projeto/legendas.ts";
import { legendasDaFala, opcoesParaOQuadro } from "../projeto/legendasDaFala.ts";
import type { Clipe } from "../projeto/modelo.ts";
import { TICKS_POR_SEGUNDO } from "../tempo.ts";

export type FiltroDaAvaliacao = "todas" | "gostei" | "nao_gostei" | "sem";
export type FiltroDaDuracao = "todas" | "ate30" | "ate60" | "ate90" | "mais";
export type Filtro = { avaliacao: FiltroDaAvaliacao; duracao: FiltroDaDuracao; busca: string };
export const FILTRO_PADRAO: Filtro = { avaliacao: "todas", duracao: "todas", busca: "" };

export const DURACOES_DO_FILTRO: { id: FiltroDaDuracao; nome: string; de: number; ate: number }[] = [
  { id: "todas", nome: "Qualquer duração", de: 0, ate: Infinity },
  { id: "ate30", nome: "Até 30 s", de: 0, ate: 30 },
  { id: "ate60", nome: "30 s a 1 min", de: 30, ate: 60 },
  { id: "ate90", nome: "1 a 1,5 min", de: 60, ate: 90 },
  { id: "mais", nome: "Mais de 1,5 min", de: 90, ate: Infinity },
];

/** Sem acento e em minúsculas, para a busca achar "acao" em "Ação". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** Os cortes que passam pelos filtros; a busca procura todas as palavras no título, no resumo e na fala. */
export function filtrarCortes(cortes: Corte[], filtro: Filtro): Corte[] {
  const faixa = DURACOES_DO_FILTRO.find((item) => item.id === filtro.duracao) ?? DURACOES_DO_FILTRO[0];
  const termos = normalizar(filtro.busca).split(/\s+/).filter(Boolean);
  return cortes.filter((corte) => {
    if (filtro.avaliacao === "sem" ? corte.avaliacao : filtro.avaliacao !== "todas" && corte.avaliacao !== filtro.avaliacao) return false;
    if (corte.duracao < faixa.de || corte.duracao >= faixa.ate) return false;
    if (!termos.length) return true;
    const onde = normalizar(`${corte.titulo} ${corte.resumo} ${corte.texto ?? ""}`);
    return termos.every((termo) => onde.includes(termo));
  });
}

/** Um trecho de fala com o tempo na mídia, como a API devolve. */
export type PalavraDaMidia = { texto: string; inicio: number; fim: number };

/**
 * Os trechos do corte como clipes encostados (o corte antes da limpeza das pausas), que as legendas da fala
 * entendem. Só os campos que a fala lê.
 */
export function clipesDoCorte(corte: Pick<Corte, "trechos">, midiaId: string): Clipe[] {
  let inicio = 0;
  return corte.trechos.map((trecho, i) => {
    const duracao = Math.round((trecho.fim - trecho.inicio) * TICKS_POR_SEGUNDO);
    const clipe = { id: `t${i}`, midia_id: midiaId, inicio, duracao, entrada: Math.round(trecho.inicio * TICKS_POR_SEGUNDO), velocidade: 1 } as Clipe;
    inicio += duracao;
    return clipe;
  });
}

/**
 * As legendas do corte no tempo dele, quebradas como na montagem (o estilo "Palavra falada", no formato pedido):
 * a prévia do cartão mostra a palavra falada de cada uma, e o .srt sai delas.
 */
export function legendasDoCorte(corte: Pick<Corte, "trechos">, midiaId: string, palavras: PalavraDaMidia[], formato: string): Legenda[] {
  const estilo = ESTILOS_DE_LEGENDA.find((item) => item.id === "palavra")!.texto;
  return legendasDaFala(clipesDoCorte(corte, midiaId), new Map([[midiaId, palavras]]), opcoesParaOQuadro(formato, estilo));
}

export function srtDoCorte(corte: Pick<Corte, "trechos">, midiaId: string, palavras: PalavraDaMidia[], formato: string): string {
  return escreverSrt(legendasDoCorte(corte, midiaId, palavras, formato));
}

/** Um nome de arquivo a partir do título: sem acento, sem sinais, com hífens. */
export function nomeDeArquivo(titulo: string, extensao: string): string {
  const base = normalizar(titulo)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base || "corte"}.${extensao}`;
}

/** Onde está o instante `t` do corte (segundos desde o começo dele): o trecho e o segundo da mídia. */
export function instanteNaMidia(corte: Pick<Corte, "trechos">, t: number): { trecho: number; midia: number } | null {
  let antes = 0;
  for (let i = 0; i < corte.trechos.length; i++) {
    const { inicio, fim } = corte.trechos[i];
    if (t < antes + (fim - inicio)) return { trecho: i, midia: inicio + Math.max(0, t - antes) };
    antes += fim - inicio;
  }
  return null;
}

/** O instante do corte (segundos desde o começo dele) em que está o segundo `s` da mídia, dentro do trecho `trecho`. */
export function instanteNoCorte(corte: Pick<Corte, "trechos">, trecho: number, s: number): number {
  let antes = 0;
  for (let i = 0; i < trecho; i++) antes += corte.trechos[i].fim - corte.trechos[i].inicio;
  return antes + (s - corte.trechos[trecho].inicio);
}

/** A palavra falada agora, numa legenda com os tempos (o índice, ou -1 antes da primeira). */
export function palavraFalada(legenda: Legenda, tick: number): number {
  const tempos = legenda.tempos ?? [];
  let atual = -1;
  for (let i = 0; i < tempos.length; i++) if (tempos[i] <= tick) atual = i;
  return atual;
}

/** Uma amostra do rosto da busca de sempre: o centro (x, y) em frações da imagem, no segundo t, e a área. */
export type AmostraDoRosto = { t: number; x: number; y: number; a: number };

/** O meio do rosto num trecho: a mediana das amostras dele (sem rosto, o meio da imagem). Parado, como a montagem. */
export function centroDoRosto(amostras: AmostraDoRosto[], inicio: number, fim: number): { x: number; y: number } {
  const dentro = amostras.filter((amostra) => amostra.t >= inicio && amostra.t <= fim);
  if (!dentro.length) return { x: 0.5, y: 0.5 };
  const mediana = (valores: number[]) => {
    const ordem = [...valores].sort((a, b) => a - b);
    const meio = Math.floor(ordem.length / 2);
    return ordem.length % 2 ? ordem[meio] : (ordem[meio - 1] + ordem[meio]) / 2;
  };
  return { x: mediana(dentro.map((amostra) => amostra.x)), y: mediana(dentro.map((amostra) => amostra.y)) };
}

/**
 * A imagem cobrindo a caixa da prévia (em pixels da tela) com o centro pedido no meio dela, sem sobrar borda: o
 * tamanho da imagem e o canto dela, relativos à caixa (negativos ou zero).
 */
export function enquadrarNaCaixa(
  caixa: { largura: number; altura: number },
  fonte: { largura: number; altura: number },
  centro: { x: number; y: number },
): { largura: number; altura: number; x: number; y: number } {
  const escala = Math.max(caixa.largura / fonte.largura, caixa.altura / fonte.altura);
  const largura = fonte.largura * escala;
  const altura = fonte.altura * escala;
  const preso = (valor: number, minimo: number) => Math.min(0, Math.max(minimo, valor));
  return {
    largura,
    altura,
    x: preso(caixa.largura / 2 - centro.x * largura, caixa.largura - largura),
    y: preso(caixa.altura / 2 - centro.y * altura, caixa.altura - altura),
  };
}

/** As palavras de ênfase (o começo, em segundos da mídia) no tempo do corte, em ticks, para achar nas legendas. */
export function enfaseNoCorte(corte: Pick<Corte, "trechos" | "enfase">): number[] {
  return (corte.enfase ?? []).flatMap((s) => {
    const trecho = corte.trechos.findIndex((item) => s >= item.inicio && s < item.fim);
    return trecho < 0 ? [] : [Math.round(instanteNoCorte(corte, trecho, s) * TICKS_POR_SEGUNDO)];
  });
}
