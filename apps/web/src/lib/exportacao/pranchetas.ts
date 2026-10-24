// As pranchetas do documento (ADR 0003, onda 13.7): cada uma sai sozinha (só ela e o que está dentro dela, como nos
// editores profissionais: o que fica fora das pranchetas e as outras pranchetas não entram), recortada no retângulo
// dela. A exportação em arquivos e em PDF está em varios.ts.
import { comDescendentes } from "../projeto/arvore";
import { retanguloDaPrancheta, tamanhoDaImagem } from "../projeto/imagem";
import type { Projeto } from "../projeto/modelo";

/** As pranchetas do projeto (visíveis ou não), de cima para baixo, com o nome e o retângulo em pixels do documento. */
export function pranchetasDoProjeto(projeto: Projeto): { faixaId: string; clipeId: string; nome: string; retangulo: { x: number; y: number; largura: number; altura: number } }[] {
  const quadro = tamanhoDaImagem(projeto);
  return projeto.faixas.flatMap((faixa) => {
    const clipe = faixa.clipes[0];
    const retangulo = clipe ? retanguloDaPrancheta(clipe, quadro) : null;
    return clipe && retangulo ? [{ faixaId: faixa.id, clipeId: clipe.id, nome: faixa.nome ?? "Prancheta", retangulo }] : [];
  });
}

/** O projeto só com a prancheta (e o que está dentro dela), visível, sobre o fundo transparente. */
export function soAPrancheta(projeto: Projeto, faixaId: string): Projeto {
  const dela = new Set(comDescendentes(projeto, faixaId).map((faixa) => faixa.id));
  return {
    ...projeto,
    fundo: { ...projeto.fundo, transparente: true },
    faixas: projeto.faixas.filter((faixa) => faixa.tipo === "principal" || dela.has(faixa.id)).map((faixa) => (faixa.id === faixaId ? { ...faixa, oculta: false } : faixa)),
  };
}
