import assert from "node:assert/strict";
import { test } from "node:test";

import { executarComando } from "../projeto/comandos.ts";
import type { Contexto } from "../projeto/edicao.ts";
import type { Projeto } from "../projeto/modelo.ts";
import { OPCOES_DAS_FORMAS_PADRAO, opcoesDaVariante } from "./arrasto.ts";
import { caixaDosCaminhos, camadaDosCaminhos } from "./modelo.ts";
import { camadasDoReflexo, REFLEXO_PADRAO } from "./reflexo.ts";

const ctx: Contexto = { novoId: (() => {
  let n = 0;
  return () => `r${++n}`;
})(), midia: () => null };

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

test("o reflexo: halo, raios com o meio no centro, o centro e os anéis até o fim, sempre iguais com o mesmo sorteio", () => {
  const centro = { x: 200, y: 150 };
  const fim = { x: 500, y: 350 };
  const camadas = camadasDoReflexo(centro, fim, REFLEXO_PADRAO);
  assert.deepEqual(camadas.map((c) => c.nome), ["Halo", "Raios", "Centro", "Anéis"]);
  const raios = camadas[1];
  assert.equal(raios.caminhos.length, 16);
  // Os raios vêm em pares opostos: a caixa tem o meio no centro (o degradê radial sai dele)
  const caixa = caixaDosCaminhos(raios.caminhos)!;
  assert.ok(Math.abs((caixa.x0 + caixa.x1) / 2 - centro.x) < 1e-6 && Math.abs((caixa.y0 + caixa.y1) / 2 - centro.y) < 1e-6);
  // O raio mais longo chega a 1,5 diâmetro (300%) no máximo, e o degradê termina na ponta dele
  const pontas = raios.caminhos.map((sub) => Math.hypot(sub.nos[1].x - centro.x, sub.nos[1].y - centro.y));
  assert.ok(Math.max(...pontas) <= 150 + 1e-6 && Math.min(...pontas) >= 150 * 0.35 - 1e-6);
  assert.equal(raios.preenchimento.tipo, "degrade");
  // O último anel é o maior, no fim
  const aneis = camadas[3];
  assert.equal(aneis.caminhos.length, 10);
  const ultimo = caixaDosCaminhos([aneis.caminhos[9]])!;
  assert.deepEqual([(ultimo.x0 + ultimo.x1) / 2, (ultimo.y0 + ultimo.y1) / 2, ultimo.x1 - ultimo.x0], [500, 350, 50]);
  assert.deepEqual(camadasDoReflexo(centro, fim, REFLEXO_PADRAO), camadas);
  assert.notDeepEqual(camadasDoReflexo(centro, fim, { ...REFLEXO_PADRAO, semente: 2 })[1], raios);
});

test("o reflexo entra como um grupo de camadas em tela, num passo só", () => {
  const camadas = camadasDoReflexo({ x: 300, y: 300 }, { x: 500, y: 400 }, REFLEXO_PADRAO).map((camada) => ({ ...camadaDosCaminhos(camada.caminhos, camada.preenchimento, null), nome: camada.nome, opacidade: camada.opacidade }));
  const { projeto, selecao } = executarComando(vazio(), { comando: "imagem.adicionarReflexo", parametros: { camadas, nome: "Reflexo 1" } }, ctx);
  const pasta = projeto.faixas.find((faixa) => faixa.clipes[0]?.pasta)!;
  assert.equal(pasta.nome, "Reflexo 1");
  assert.equal(selecao?.[0], pasta.clipes[0].id);
  const dentro = projeto.faixas.filter((faixa) => faixa.pai === pasta.id);
  // De cima para baixo: anéis, centro, raios e halo
  assert.deepEqual(dentro.map((faixa) => faixa.nome), ["Anéis", "Centro", "Raios", "Halo"]);
  assert.ok(dentro.every((faixa) => faixa.clipes[0].mesclagem === "tela"));
  assert.equal(dentro[0].clipes[0].transformacao.opacidade, 0.3);
});

test("o retângulo arredondado e a estrela usam as medidas delas", () => {
  const opcoes = { ...OPCOES_DAS_FORMAS_PADRAO, raio: 0, raioArredondado: 20, lados: 6, estrela: 0, pontas: 7, reentrancia: 0.4 };
  assert.equal(opcoesDaVariante("retanguloArredondado", opcoes).raio, 20);
  const estrela = opcoesDaVariante("estrela", opcoes);
  assert.deepEqual([estrela.lados, estrela.estrela], [7, 0.4]);
  assert.equal(opcoesDaVariante(null, opcoes), opcoes);
  assert.equal(opcoesDaVariante("estrela", { ...opcoes, reentrancia: 0 }).estrela, 0.01, "a estrela sempre entra um pouco");
});
