import assert from "node:assert/strict";
import { test } from "node:test";

import { segundosParaTicks } from "../tempo.ts";
import { aCada, batidasNaLinha } from "./ritmo.ts";

const S = segundosParaTicks(1);

test("batidas da música no tempo da linha: só as do trecho tocado, pela velocidade do clipe", () => {
  const clipe = { inicio: 10 * S, duracao: 4 * S, entrada: 2 * S, velocidade: 2, curva_velocidade: null };
  // O clipe toca a mídia de 2 s a 10 s, em dobro: 6 s da mídia viram 12 s da linha
  assert.deepEqual(batidasNaLinha(clipe, [1, 2, 6, 10, 11]), [10 * S, 12 * S, 14 * S]);
  assert.deepEqual(batidasNaLinha({ ...clipe, curva_velocidade: [[0, 1], [1, 1]] as [number, number][] }, [6]), []);
  assert.deepEqual(aCada([1, 2, 3, 4, 5], 2), [1, 3, 5]);
  assert.deepEqual(aCada([1, 2, 3], 0), [1, 2, 3]);
});
