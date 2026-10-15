import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { fatorNaCurva, fracaoNaMidia, pedacoComCurva, type PontoDeVelocidade, tempoNaMidiaComCurva, velocidadeNaCurva } from "./velocidade.ts";

// Os mesmos casos que tests/test_velocidade.py confere no render
const { casos } = JSON.parse(readFileSync(new URL("../../../../../tests/casos/velocidade.json", import.meta.url), "utf-8")) as {
  casos: { nome: string; pontos: PontoDeVelocidade[]; u: number[]; fator: number[]; fracao: number[]; velocidade_2x: number[] }[];
};
const S = TICKS_POR_SEGUNDO;
const perto = (a: number, b: number, folga = 1e-12) => Math.abs(a - b) < folga;

for (const caso of casos) {
  test(`velocidade: ${caso.nome}`, () => {
    caso.u.forEach((u, i) => {
      assert.ok(perto(fatorNaCurva(caso.pontos, u), caso.fator[i]), `fator em ${u}`);
      assert.ok(perto(fracaoNaMidia(caso.pontos, u), caso.fracao[i]), `fração em ${u}`);
      assert.ok(perto(velocidadeNaCurva(caso.pontos, 2, u), caso.velocidade_2x[i]), `velocidade em ${u}`);
    });
  });
}

test("dividir um clipe com curva não muda o que aparece em cada instante", () => {
  const clipe = { inicio: 2 * S, duracao: 4 * S, entrada: 1 * S, velocidade: 2, curva_velocidade: casos[0].pontos };
  const corte = 4.5 * S;
  const esquerda = { ...clipe, duracao: corte - clipe.inicio, ...pedacoComCurva(clipe, clipe.inicio, corte) };
  const direita = { ...clipe, inicio: corte, duracao: clipe.inicio + clipe.duracao - corte, ...pedacoComCurva(clipe, corte, clipe.inicio + clipe.duracao) };
  for (const t of [2.5, 3.9, 4.4]) assert.ok(Math.abs(tempoNaMidiaComCurva(esquerda, t * S) - tempoNaMidiaComCurva(clipe, t * S)) <= 2, `${t}`);
  for (const t of [4.6, 5.2, 5.9]) assert.ok(Math.abs(tempoNaMidiaComCurva(direita, t * S) - tempoNaMidiaComCurva(clipe, t * S)) <= 2, `${t}`);
  // O trecho da mídia todo continua o mesmo: 8 s
  assert.ok(Math.abs(esquerda.velocidade * esquerda.duracao + direita.velocidade * direita.duracao - 8 * S) < 2);
});
