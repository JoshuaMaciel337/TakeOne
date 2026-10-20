import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { transformacaoAnimada } from "./animacao.ts";
import {
  deslocarExpressoes,
  deslocarKeyframes,
  type Expressao,
  type Keyframe,
  keyframeEm,
  type PropriedadeAnimavel,
  transformacaoNoTempo,
  transformacaoParaEditar,
  valorComExpressao,
  valorNoTempo,
} from "./keyframes.ts";
import type { Clipe, Transformacao } from "./modelo.ts";

const S = TICKS_POR_SEGUNDO;
type Dados = {
  valores: { nome: string; pontos: Keyframe[]; t: number; valor: number }[];
  transformacoes: { nome: string; clipe: Clipe; t: number; esperado: Transformacao }[];
};
// Os mesmos casos que o render confere em tests/test_keyframes.py
const dados = JSON.parse(readFileSync(new URL("../../../../../tests/casos/keyframes.json", import.meta.url), "utf-8")) as Dados;

for (const caso of dados.valores) {
  test(`keyframes: ${caso.nome}`, () => {
    const pontos = caso.pontos.map((p) => ({ ...p, t: p.t * S }));
    assert.ok(Math.abs(valorNoTempo(pontos, caso.t * S) - caso.valor) < 1e-9);
  });
}

for (const caso of dados.transformacoes) {
  test(`keyframes com animação: ${caso.nome}`, () => {
    // Os casos estão em segundos: a conta não depende da unidade, desde que seja a mesma em tudo
    const resultado = transformacaoAnimada(caso.clipe, caso.t);
    for (const chave of Object.keys(caso.esperado) as (keyof Transformacao)[]) {
      assert.ok(Math.abs(resultado[chave] - caso.esperado[chave]) < 1e-9, `${chave}: ${resultado[chave]} ≠ ${caso.esperado[chave]}`);
    }
  });
}

test("keyframes: o ponto no instante e o deslocamento ao aparar", () => {
  const pontos: Keyframe[] = [
    { t: 0, valor: 1, curva: "linear" },
    { t: 2 * S, valor: 2, curva: "suave" },
  ];
  assert.equal(keyframeEm(pontos, 2 * S + 10, S / 60)?.valor, 2);
  assert.equal(keyframeEm(pontos, S, S / 60), undefined);
  assert.deepEqual(deslocarKeyframes({ escala: pontos }, S)?.escala?.map((p) => p.t), [-S, S]);
});

type CasoDeExpressao = {
  nome: string;
  pontos: Keyframe[] | null;
  fixo: number;
  expressao: Expressao;
  propriedade: PropriedadeAnimavel;
  t: number;
  valor: number;
};
// Em segundos, como os outros casos: o período e o deslocamento do tremido estão na mesma unidade
for (const caso of (dados as Dados & { expressoes: CasoDeExpressao[] }).expressoes) {
  test(`expressão: ${caso.nome}`, () => {
    const valor = valorComExpressao(caso.pontos ?? undefined, caso.fixo, caso.expressao, caso.propriedade, caso.t);
    assert.ok(Math.abs(valor - caso.valor) < 1e-9, `${valor} ≠ ${caso.valor}`);
  });
}

test("expressão: o tremido continua igual depois de aparar o começo", () => {
  const clipe = {
    inicio: 0,
    transformacao: { x: 0, y: 0, escala: 1, rotacao: 0, opacidade: 1 },
    keyframes: null,
    expressoes: { x: { tremer: { periodo: S / 2, amplitude: 0.05, deslocamento: 0 } } },
  };
  const aparado = { ...clipe, inicio: S, expressoes: deslocarExpressoes(clipe.expressoes, S) };
  assert.ok(Math.abs(transformacaoNoTempo(clipe, 1.7 * S).x - transformacaoNoTempo(aparado, 1.7 * S).x) < 1e-12);
  // Para editar, o tremido sai: o ponto novo não leva o ruído do instante
  assert.equal(transformacaoParaEditar(clipe, 1.7 * S).x, 0);
});
