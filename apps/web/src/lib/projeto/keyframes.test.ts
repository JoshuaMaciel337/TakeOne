import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { transformacaoAnimada } from "./animacao.ts";
import { deslocarKeyframes, type Keyframe, keyframeEm, valorNoTempo } from "./keyframes.ts";
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
