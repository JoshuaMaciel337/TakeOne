import assert from "node:assert/strict";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { executarComando } from "./comandos.ts";
import type { Contexto } from "./edicao.ts";
import { ErroEdicao } from "./edicao.ts";
import { animarLegendas, faixaDasLegendas, pedidoDasLegendas } from "./legendaAnimada.ts";
import { ESTILO_LEGENDA, POSICAO_LEGENDA } from "./legendas.ts";
import type { Projeto } from "./modelo.ts";

const S = TICKS_POR_SEGUNDO;

function contexto(): Contexto {
  let n = 0;
  return {
    novoId: () => `n${++n}`,
    midia: (id) => (id === "trilha" ? { duracao: 4 * S, video: true, audio: false, transparente: true } : null),
  };
}

// Um contexto só: os ids dos clipes não podem repetir entre as legendas e a trilha
const CTX = contexto();

function comLegendas(): Projeto {
  const vazio: Projeto = {
    id: "p",
    nome: "Corte",
    proporcao: "9:16",
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#000000" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
  const legendas = [
    { inicio: 1 * S, fim: 2 * S, conteudo: "Quanto menos\ncontato", tempos: [1 * S, 1.3 * S, 1.6 * S], palavras_chave: [2] },
    { inicio: 2.5 * S, fim: 3.5 * S, conteudo: "sem tempos aqui" },
  ];
  const estilo = { ...ESTILO_LEGENDA, cor: "#ffffff", cor_chave: "#f5c84b" };
  return executarComando(vazio, { comando: "legenda.importar", parametros: { legendas, estilo } }, CTX).projeto;
}

test("as legendas viram palavras no tempo da trilha, com a ênfase, as cores e o lugar", () => {
  const pedido = pedidoDasLegendas(comLegendas());
  assert.equal(pedido.inicio, 1 * S);
  assert.equal(pedido.duracao, 2.8);
  assert.deepEqual(
    pedido.palavras.slice(0, 3).map((p) => [p.texto, p.inicio, p.fim, p.enfase]),
    [
      ["Quanto", 0, 0.3, false],
      ["menos", 0.3, 0.6, false],
      ["contato", 0.6, 1, true],
    ],
  );
  // Sem os tempos, as palavras dividem a legenda pelas letras: "sem"(3) "tempos"(6) "aqui"(4)
  const resto = pedido.palavras.slice(3);
  assert.deepEqual(
    resto.map((p) => p.texto),
    ["sem", "tempos", "aqui"],
  );
  assert.equal(resto[0].inicio, 1.5);
  assert.ok(Math.abs(resto[1].inicio - (1.5 + 3 / 13)) < 0.001);
  assert.equal(resto[2].fim, 2.5);
  assert.deepEqual(pedido.cores, { texto: "#ffffff", enfase: "#f5c84b" });
  assert.equal(pedido.posicao, Math.round((0.5 + POSICAO_LEGENDA) * 1000) / 1000);
});

test("a trilha entra por cima e esconde as legendas, num passo só", () => {
  const projeto = comLegendas();
  const faixa = faixaDasLegendas(projeto)!;
  const { projeto: novo, clipeId } = animarLegendas(projeto, CTX, "trilha", 1 * S, faixa.id);
  const legendas = novo.faixas.find((item) => item.id === faixa.id)!;
  assert.equal(legendas.oculta, true);
  const trilha = novo.faixas.find((item) => item.clipes.some((clipe) => clipe.id === clipeId))!;
  assert.equal(trilha.tipo, "video");
  const clipe = trilha.clipes[0];
  assert.equal(clipe.inicio, 1 * S);
  assert.equal(clipe.remover_fundo, true);
  // Escondida, a faixa não vira trilha de novo
  assert.equal(faixaDasLegendas(novo), null);
  assert.throws(() => pedidoDasLegendas(novo), ErroEdicao);
});
