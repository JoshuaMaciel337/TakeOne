import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { type Animacoes, limitarAnimacoes, transformacaoAnimada } from "./animacao.ts";
import type { Transformacao } from "./modelo.ts";

type Caso = {
  nome: string;
  clipe: { inicio: number; duracao: number; transformacao: Transformacao; animacao: Animacoes };
  t: number;
  esperado: Transformacao;
};

// Os mesmos casos que tests/test_animacao.py confere no render
const { casos } = JSON.parse(readFileSync(new URL("../../../../../tests/casos/animacao.json", import.meta.url), "utf-8")) as { casos: Caso[] };
const S = TICKS_POR_SEGUNDO;

for (const caso of casos) {
  test(`animação: ${caso.nome}`, () => {
    const { clipe } = caso;
    const animacao = {
      entrada: { ...clipe.animacao.entrada, duracao: clipe.animacao.entrada.duracao * S },
      saida: { ...clipe.animacao.saida, duracao: clipe.animacao.saida.duracao * S },
    };
    const resultado = transformacaoAnimada({ ...clipe, inicio: clipe.inicio * S, duracao: clipe.duracao * S, animacao }, caso.t * S);
    for (const chave of Object.keys(caso.esperado) as (keyof Transformacao)[]) {
      assert.ok(Math.abs(resultado[chave] - caso.esperado[chave]) < 1e-9, `${chave}: ${resultado[chave]} ≠ ${caso.esperado[chave]}`);
    }
  });
}

test("as durações das animações nunca passam do clipe", () => {
  const limitadas = limitarAnimacoes({ entrada: { tipo: "zoom", duracao: 3 * S }, saida: { tipo: "subir", duracao: 3 * S } }, 4 * S);
  assert.equal(limitadas.entrada.duracao, 3 * S);
  assert.equal(limitadas.saida.duracao, 1 * S);
});
