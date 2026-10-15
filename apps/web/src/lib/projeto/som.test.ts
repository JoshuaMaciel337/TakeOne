import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { type Clipe, fatorDosFades } from "./modelo.ts";
import { type CurvaDoFade, ganhoDoFade, ganhoParaIgualar } from "./som.ts";

// Os mesmos casos que tests/test_som.py confere na fórmula e no FFmpeg
const { casos } = JSON.parse(readFileSync(new URL("../../../../../tests/casos/fades.json", import.meta.url), "utf-8")) as {
  casos: { curva: CurvaDoFade; p: number; ganho: number }[];
};

for (const caso of casos) {
  test(`fade ${caso.curva} em ${caso.p}`, () => {
    assert.ok(Math.abs(ganhoDoFade(caso.curva, caso.p) - caso.ganho) < 1e-12);
  });
}

test("os dois fades do clipe usam o formato escolhido", () => {
  const S = TICKS_POR_SEGUNDO;
  const clipe = { inicio: S, duracao: 4 * S, fade_entrada: S, fade_saida: 2 * S, curva_fade: "s" } as Clipe;
  assert.ok(Math.abs(fatorDosFades(clipe, 1.5 * S) - 0.5) < 1e-12);
  assert.ok(Math.abs(fatorDosFades(clipe, 4 * S) - ganhoDoFade("s", 0.5)) < 1e-12);
  assert.equal(fatorDosFades(clipe, 2.5 * S), 1);
});

test("igualar leva a -14 LUFS, com limite, como core/utils/som.py", () => {
  assert.equal(ganhoParaIgualar(-23), 9);
  assert.equal(ganhoParaIgualar(-8.5), -5.5);
  assert.equal(ganhoParaIgualar(-60), 20);
  assert.equal(ganhoParaIgualar(undefined), 0);
  assert.equal(ganhoParaIgualar(-80), 0);
});
