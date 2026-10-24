import assert from "node:assert/strict";
import { test } from "node:test";

import { deslocar, unidadesDaSelecao } from "./alinhar.ts";
import { executarComando } from "./comandos.ts";
import type { Contexto } from "./edicao.ts";
import { retanguloDaPrancheta, tamanhoDaImagem } from "./imagem.ts";
import type { Projeto } from "./modelo.ts";
import { TEXTO_PADRAO } from "./texto.ts";

function contexto(): Contexto {
  let n = 0;
  return { novoId: () => `n${++n}`, midia: () => null };
}
function vazio(): Projeto {
  return {
    id: "p",
    nome: "Imagem",
    proporcao: "16:9",
    tipo: "imagem",
    tamanho: { largura: 800, altura: 600 },
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#ffffff" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
}
const BRANCO = { cor: "#ffffff", transparente: false };

test("a prancheta fora da tela faz a tela crescer, sem tirar nada do lugar; o fundo do documento fica transparente", () => {
  const ctx = contexto();
  let projeto = executarComando(vazio(), { comando: "imagem.adicionarTexto", parametros: { texto: TEXTO_PADRAO, transformacao: { x: -0.25, y: 0 } } }, ctx).projeto;
  const texto = projeto.faixas[0].clipes[0];
  const antes = { x: (0.5 + texto.transformacao.x) * 800, y: (0.5 + texto.transformacao.y) * 600 };
  const resultado = executarComando(projeto, { comando: "imagem.adicionarPrancheta", parametros: { retangulo: { x: 700, y: 100, largura: 300, altura: 200 }, nome: "Prancheta 1", fundo: BRANCO, tamanhos: {} } }, ctx);
  projeto = resultado.projeto;
  assert.deepEqual(tamanhoDaImagem(projeto), { largura: 1000, altura: 600 });
  assert.equal(projeto.fundo.transparente, true);
  const prancheta = projeto.faixas.find((faixa) => faixa.clipes[0]?.prancheta)!.clipes[0];
  assert.deepEqual(retanguloDaPrancheta(prancheta, tamanhoDaImagem(projeto)), { x: 700, y: 100, largura: 300, altura: 200 });
  const textoDepois = projeto.faixas.find((faixa) => faixa.clipes[0]?.texto)!.clipes[0];
  assert.ok(Math.abs((0.5 + textoDepois.transformacao.x) * 1000 - antes.x) < 1e-6, "o texto ficou no mesmo pixel");
  // Mudar o tamanho guarda o canto de cima à esquerda
  projeto = executarComando(projeto, { comando: "imagem.prancheta", parametros: { clipeId: prancheta.id, mudanca: { largura: 200 }, tamanhos: {} } }, ctx).projeto;
  const mudada = projeto.faixas.find((faixa) => faixa.clipes[0]?.prancheta)!.clipes[0];
  assert.deepEqual(retanguloDaPrancheta(mudada, tamanhoDaImagem(projeto)), { x: 700, y: 100, largura: 200, altura: 200 });
});

test("a prancheta a partir das camadas agrupa e recorta; mover a prancheta leva o que está dentro", () => {
  const ctx = contexto();
  let projeto = executarComando(vazio(), { comando: "imagem.adicionarTexto", parametros: { texto: TEXTO_PADRAO } }, ctx).projeto;
  const faixaDoTexto = projeto.faixas[0];
  projeto = executarComando(projeto, { comando: "imagem.pranchetaDeCamadas", parametros: { faixaIds: [faixaDoTexto.id], retangulo: { x: 100, y: 100, largura: 400, altura: 300 }, nome: "Capa", fundo: BRANCO, tamanhos: {} } }, ctx).projeto;
  const pasta = projeto.faixas.find((faixa) => faixa.clipes[0]?.prancheta)!;
  assert.equal(pasta.nome, "Capa");
  assert.equal(projeto.faixas.find((faixa) => faixa.id === faixaDoTexto.id)!.pai, pasta.id);
  assert.equal(pasta.clipes[0].mesclagem, "normal", "a prancheta isola (sem a passagem)");
  // A unidade da prancheta inclui o clipe dela (o meio) e o do texto
  const unidade = unidadesDaSelecao(projeto, [pasta.clipes[0].id]);
  assert.equal(unidade[0].clipeIds.length, 2);
  const mudancas = deslocar(projeto, unidade[0].clipeIds, 0.1, 0);
  projeto = executarComando(projeto, { comando: "imagem.posicoes", parametros: { mudancas } }, ctx).projeto;
  const depois = projeto.faixas.find((faixa) => faixa.clipes[0]?.prancheta)!.clipes[0];
  assert.deepEqual(retanguloDaPrancheta(depois, tamanhoDaImagem(projeto)), { x: 180, y: 100, largura: 400, altura: 300 });
  // A prancheta não entra em outra pasta
  assert.throws(() => executarComando(projeto, { comando: "imagem.agrupar", parametros: { faixaIds: [pasta.id] } }, ctx), /raiz/);
});
