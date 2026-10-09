import assert from "node:assert/strict";
import { test } from "node:test";

import { segundosParaTicks } from "../tempo.ts";
import { desfazer, executarComando, iniciarHistorico, refazer, registrar } from "./comandos.ts";
import type { Contexto } from "./edicao.ts";
import { encaixarIntervalo, pontosDeEncaixe } from "./ima.ts";
import type { Projeto } from "./modelo.ts";

const S = segundosParaTicks(1);

const ctx: Contexto = (() => {
  let n = 0;
  return { novoId: () => `n${++n}`, midia: () => ({ duracao: 10 * S, video: true, audio: true }) };
})();

const vazio: Projeto = {
  id: "p", nome: "Teste", proporcao: "9:16", taxa: { num: 30, den: 1 }, fundo: { cor: "#000000" },
  faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
  versao: 1, duracao: 0, criado_em: "", atualizado_em: "",
};

test("desfazer e refazer passam pelas versões do projeto", () => {
  let historico = iniciarHistorico(vazio);
  const adicionado = executarComando(historico.presente, { comando: "clipe.adicionar", parametros: { midiaId: "m" } }, ctx);
  assert.deepEqual(adicionado.selecao, [adicionado.projeto.faixas[0].clipes[0].id]);
  historico = registrar(historico, adicionado.projeto, "adicionar clipe");
  const dividido = executarComando(historico.presente, { comando: "linha.dividir", parametros: { tempo: 4 * S, clipeIds: [] } }, ctx);
  historico = registrar(historico, dividido.projeto, "dividir");
  assert.equal(historico.presente.faixas[0].clipes.length, 2);

  historico = desfazer(historico);
  assert.equal(historico.presente.faixas[0].clipes.length, 1);
  assert.equal(historico.futuro[0].nome, "dividir");
  historico = desfazer(historico);
  assert.equal(historico.presente, vazio);
  assert.equal(desfazer(historico), historico, "nada para desfazer");

  historico = refazer(refazer(historico));
  assert.equal(historico.presente.faixas[0].clipes.length, 2);

  // Comando novo depois de desfazer apaga o que dava para refazer
  historico = registrar(desfazer(historico), vazio, "apagar");
  assert.equal(historico.futuro.length, 0);
});

test("ímã gruda o começo ou o fim no ponto mais perto", () => {
  const { projeto } = executarComando(vazio, { comando: "clipe.adicionar", parametros: { midiaId: "m" } }, ctx);
  const pontos = pontosDeEncaixe(projeto, 3 * S, new Set());
  assert.deepEqual(pontos.sort((a, b) => a - b), [0, 3 * S, 10 * S]);
  assert.deepEqual(encaixarIntervalo(9.9 * S, 2 * S, pontos, 0.2 * S), { inicio: 10 * S, guia: 10 * S });
  assert.deepEqual(encaixarIntervalo(1.1 * S, 2 * S, pontos, 0.2 * S), { inicio: 1 * S, guia: 3 * S });
  assert.deepEqual(encaixarIntervalo(5 * S, 2 * S, pontos, 0.2 * S), { inicio: 5 * S, guia: null });
});
