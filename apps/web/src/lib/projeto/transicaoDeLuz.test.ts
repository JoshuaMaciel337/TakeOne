import assert from "node:assert/strict";
import { test } from "node:test";

import { duracaoDoQuadro, TICKS_POR_SEGUNDO } from "../tempo.ts";
import { expandirParaDesenhar } from "./fundoDesfocado.ts";
import type { Clipe, Projeto } from "./modelo.ts";
import { janelasDaPrincipal } from "./transicao.ts";
import { comAsLuzesDasTransicoes, janelaDaLuz } from "./transicaoDeLuz.ts";

const S = TICKS_POR_SEGUNDO;
const TAXA = { num: 30, den: 1 };
const QUADRO = duracaoDoQuadro(TAXA);

function clipe(id: string, inicio: number, transicao: Clipe["transicao"] = null): Clipe {
  return { id, midia_id: "m", inicio, duracao: S, entrada: 0, velocidade: 1, volume: 1, fade_entrada: 0, fade_saida: 0, transformacao: { x: 0, y: 0, escala: 1, rotacao: 0, opacidade: 1 }, recorte: { x: 0, y: 0, largura: 1, altura: 1 }, transicao };
}

function projeto(tipo: "flash" | "clarao"): Projeto {
  return {
    id: "p",
    nome: "Luz",
    proporcao: "16:9",
    taxa: TAXA,
    fundo: { cor: "#000000" },
    faixas: [
      { id: "t", tipo: "texto", oculta: false, muda: false, travada: false, clipes: [] },
      { id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [clipe("a", 0, { tipo, duracao: S / 2 }), clipe("b", S)] },
    ],
    versao: 1,
    duracao: 2 * S,
    criado_em: "",
    atualizado_em: "",
  };
}

test("a janela da luz fica em quadros inteiros, com a metade de baixo antes do corte", () => {
  // Os mesmos números de tests/test_transicao.py
  assert.deepEqual(janelaDaLuz(S, S / 2, QUADRO), { inicio: S - 7 * QUADRO, duracao: 15 * QUADRO, antes: 7 * QUADRO });
  assert.deepEqual(janelaDaLuz(2 * QUADRO, 10 * QUADRO, QUADRO), { inicio: 0, duracao: 10 * QUADRO, antes: 2 * QUADRO });
});

test("o flash corta seco e põe a camada de ajuste branca por cima dos vídeos, embaixo dos textos", () => {
  const original = projeto("flash");
  const janelas = janelasDaPrincipal(original.faixas[1].clipes, QUADRO);
  assert.equal(janelas.get("a")!.fim, S, "o clipe que sai não continua depois do corte");
  assert.equal(janelas.get("b")!.inicio, S);
  const desenhado = expandirParaDesenhar(original);
  assert.deepEqual(desenhado.faixas.map((faixa) => faixa.id), ["t", "~luzes", "principal"]);
  const luz = desenhado.faixas[1].clipes[0];
  assert.equal(luz.ajuste, true);
  assert.equal(luz.inicio, S - 7 * QUADRO);
  assert.equal(luz.duracao, 15 * QUADRO);
  assert.deepEqual(luz.animacao, { entrada: { tipo: "aparecer", duracao: 7 * QUADRO }, saida: { tipo: "aparecer", duracao: 8 * QUADRO } });
  assert.deepEqual(luz.cor?.curvas?.rgb, [[0, 1], [1, 1]]);
  assert.equal(luz.mascara, null);
});

test("o clarão tem a máscara do canto e sem transição de luz o projeto fica como está", () => {
  const luz = comAsLuzesDasTransicoes(projeto("clarao")).faixas[1].clipes[0];
  assert.equal(luz.mascara?.forma, "elipse");
  assert.ok((luz.cor?.exposicao ?? 0) > 0);
  const sem = { ...projeto("flash"), faixas: projeto("flash").faixas.map((faixa) => ({ ...faixa, clipes: faixa.clipes.map((c) => ({ ...c, transicao: null })) })) };
  assert.equal(comAsLuzesDasTransicoes(sem), sem);
});
