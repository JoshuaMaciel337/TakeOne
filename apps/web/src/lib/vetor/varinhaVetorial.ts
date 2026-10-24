// A Varinha mágica vetorial do editor de imagem (ADR 0003, onda 13.16): o clique numa camada escolhe todas as
// camadas parecidas com ela, pelas medidas ligadas nas opções (a cor do preenchimento e a do traço, a largura do
// traço, a opacidade e a mesclagem), cada uma com a tolerância dela, como lá.
import type { Clipe, Projeto } from "../projeto/modelo.ts";

export type OpcoesDaVarinhaVetorial = {
  preenchimento: { usar: boolean; tolerancia: number };
  traco: { usar: boolean; tolerancia: number };
  largura: { usar: boolean; tolerancia: number };
  opacidade: { usar: boolean; tolerancia: number };
  mesclagem: { usar: boolean };
};

export const VARINHA_VETORIAL_PADRAO: OpcoesDaVarinhaVetorial = {
  preenchimento: { usar: true, tolerancia: 32 },
  traco: { usar: false, tolerancia: 32 },
  largura: { usar: false, tolerancia: 5 },
  opacidade: { usar: false, tolerancia: 5 },
  mesclagem: { usar: false },
};

type Rgb = [number, number, number];
const rgb = (cor: string): Rgb | null => (/^#[0-9a-f]{6}$/i.test(cor) ? [1, 3, 5].map((i) => parseInt(cor.slice(i, i + 2), 16)) as Rgb : null);
/** A maior diferença entre os canais (de 0 a 255). */
const distancia = (a: Rgb, b: Rgb) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

/** O que a varinha compara numa camada: a cor do preenchimento (formas e textos), a do traço e a largura dele. */
export function atributosDaCamada(clipe: Clipe) {
  const vetor = clipe.vetor;
  const preenchimento = vetor ? (vetor.preenchimento.tipo === "cor" ? rgb(vetor.preenchimento.cor) : null) : clipe.texto_rico ? rgb(clipe.texto_rico.estilo.cor) : null;
  const traco = vetor?.traco && vetor.traco.tinta.tipo === "cor" ? rgb(vetor.traco.tinta.cor) : null;
  return { preenchimento, traco, largura: vetor?.traco ? vetor.traco.largura : null, opacidade: Math.round(clipe.transformacao.opacidade * 100), mesclagem: clipe.mesclagem ?? "normal" };
}

/** Os clipes das camadas parecidas com a do clipe dado (ele junto). As pastas e a principal não entram. */
export function camadasParecidas(projeto: Projeto, clipeId: string, opcoes: OpcoesDaVarinhaVetorial): string[] {
  const todos = projeto.faixas.flatMap((faixa) => (faixa.tipo !== "principal" && faixa.clipes[0] && !faixa.clipes[0].pasta ? [faixa.clipes[0]] : []));
  const base = todos.find((clipe) => clipe.id === clipeId);
  if (!base) return [];
  const a = atributosDaCamada(base);
  const ligadas = [opcoes.preenchimento.usar, opcoes.traco.usar, opcoes.largura.usar, opcoes.opacidade.usar, opcoes.mesclagem.usar].some(Boolean);
  if (!ligadas) return [clipeId];
  return todos
    .filter((clipe) => {
      const b = atributosDaCamada(clipe);
      if (opcoes.preenchimento.usar && !(a.preenchimento && b.preenchimento && distancia(a.preenchimento, b.preenchimento) <= opcoes.preenchimento.tolerancia)) return false;
      if (opcoes.traco.usar && !(a.traco && b.traco && distancia(a.traco, b.traco) <= opcoes.traco.tolerancia)) return false;
      if (opcoes.largura.usar && !(a.largura !== null && b.largura !== null && Math.abs(a.largura - b.largura) <= opcoes.largura.tolerancia)) return false;
      if (opcoes.opacidade.usar && Math.abs(a.opacidade - b.opacidade) > opcoes.opacidade.tolerancia) return false;
      if (opcoes.mesclagem.usar && a.mesclagem !== b.mesclagem) return false;
      return true;
    })
    .map((clipe) => clipe.id);
}
