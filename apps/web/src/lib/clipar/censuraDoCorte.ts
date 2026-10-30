// A censura de palavras no corte (ADR 0004, 14.8): acha na fala da principal as palavras da lista do espaço (o kit
// de marca), pede o bipe (um efeito sonoro desenhado aqui) quando é o modo, espera e põe pela conta de
// lib/projeto/censura.ts.
import { contextoDasMidias } from "@/componentes/editor/contexto";
import { chamarApi } from "@/lib/api";
import { comCensura, type ModoDaCensura, trechosCensurados } from "@/lib/projeto/censura";
import { falaDosClipes, type Palavra, palavrasDaLinha } from "@/lib/projeto/fala";
import type { Projeto } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

import { esperarProntas } from "./aplicarPregacao";

/**
 * O projeto com as palavras censuradas, e quantas foram. `palavras` é a fala de cada mídia da principal. Devolve null
 * se a pessoa saiu no meio da espera pelo bipe.
 */
export async function censuraNoProjeto(opcoes: {
  projeto: Projeto;
  midias: Map<string, Midia>;
  palavras: Map<string, Palavra[]>;
  lista: string[];
  modo: ModoDaCensura;
  aoAndamento: (texto: string) => void;
  ativo: () => boolean;
}): Promise<{ projeto: Projeto; quantas: number } | null> {
  const { projeto, palavras, lista, modo, aoAndamento, ativo } = opcoes;
  const principal = projeto.faixas.find((faixa) => faixa.tipo === "principal")?.clipes ?? [];
  const trechos = trechosCensurados(palavrasDaLinha(falaDosClipes(principal, palavras)), lista);
  if (!trechos.length) return { projeto, quantas: 0 };
  const midias = new Map(opcoes.midias);
  let bipeId: string | null = null;
  if (modo === "bipe") {
    aoAndamento("Preparando o bipe");
    const pedido = await chamarApi<Midia>("/efeitos-sonoros/bipe", { metodo: "POST" });
    const prontas = await esperarProntas([pedido.id], aoAndamento, ativo, "Preparando o bipe");
    if (!prontas) return null;
    const bipe = prontas.get(pedido.id);
    if (!bipe) throw new Error("O bipe não ficou pronto.");
    midias.set(bipe.id, bipe);
    bipeId = bipe.id;
  }
  return { projeto: comCensura(projeto, contextoDasMidias(midias), trechos, lista, modo, bipeId), quantas: trechos.length };
}
