// Os caminhos do painel Caminhos (ADR 0003, onda 13.7), em pixels do documento: o caminho de trabalho (o que a caneta
// faz quando nenhum caminho está escolhido; um novo substitui o anterior), os salvos e o de recorte.
import type { Subcaminho } from "./modelo.ts";

export type CaminhoDoDocumento = { id: string; nome: string; subcaminhos: Subcaminho[]; trabalho?: boolean; recorte?: boolean };

export const NOME_DO_TRABALHO = "Caminho de trabalho";

/** O próximo nome livre ("Caminho 1", "Caminho 2"...). */
export function nomeLivre(caminhos: CaminhoDoDocumento[], base = "Caminho"): string {
  const usados = new Set(caminhos.map((caminho) => caminho.nome));
  for (let n = 1; ; n++) if (!usados.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** A lista com o caminho trocado (pelo id) ou acrescentado no fim. */
export function comCaminho(caminhos: CaminhoDoDocumento[], caminho: CaminhoDoDocumento): CaminhoDoDocumento[] {
  return caminhos.some((item) => item.id === caminho.id) ? caminhos.map((item) => (item.id === caminho.id ? caminho : item)) : [...caminhos, caminho];
}

/**
 * Onde a caneta põe um caminho novo: no escolhido (que ganha mais um componente) ou num caminho de trabalho novo, que
 * substitui o anterior (como lá: o caminho de trabalho não salvo é um só). Devolve a lista e o id que fica escolhido.
 */
export function porNoCaminho(caminhos: CaminhoDoDocumento[], escolhido: string | null, sub: Subcaminho, novoId: () => string): { caminhos: CaminhoDoDocumento[]; id: string } {
  const atual = escolhido ? caminhos.find((item) => item.id === escolhido) : undefined;
  if (atual) return { caminhos: comCaminho(caminhos, { ...atual, subcaminhos: [...atual.subcaminhos, sub] }), id: atual.id };
  const id = novoId();
  return { caminhos: [...caminhos.filter((item) => !item.trabalho), { id, nome: NOME_DO_TRABALHO, subcaminhos: [sub], trabalho: true }], id };
}

/** Salva o caminho de trabalho com um nome (ele deixa de ser o de trabalho). */
export function salvarTrabalho(caminhos: CaminhoDoDocumento[], id: string, nome: string): CaminhoDoDocumento[] {
  return caminhos.map((item) => (item.id === id ? { ...item, nome, trabalho: false } : item));
}

/** Liga (ou desliga, com null) o caminho de recorte: um só no documento. */
export function caminhoDeRecorte(caminhos: CaminhoDoDocumento[], id: string | null): CaminhoDoDocumento[] {
  return caminhos.map((item) => ({ ...item, recorte: item.id === id }));
}
