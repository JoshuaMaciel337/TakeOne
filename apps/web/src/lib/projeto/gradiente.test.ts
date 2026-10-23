import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { corNoDegrade, type Degrade, tNoPixel } from "./gradiente.ts";

const CASOS = JSON.parse(readFileSync(new URL("../../../../../tests/casos/gradiente.json", import.meta.url), "utf8")).casos as {
  degrade: Degrade;
  t: number[];
  cores: number[][];
  caixa: [number, number, number, number];
  pixels: { x: number; y: number; t: number }[];
}[];

test("a conta do degradê é a do Python (tests/casos/gradiente.json)", () => {
  for (const caso of CASOS) {
    caso.t.forEach((t, i) => corNoDegrade(caso.degrade, t).forEach((valor, c) => assert.ok(Math.abs(valor - caso.cores[i][c]) < 1e-6, `${caso.degrade.tipo} t=${t}`)));
    for (const { x, y, t } of caso.pixels) assert.ok(Math.abs(tNoPixel(caso.degrade, x, y, caso.caixa) - t) < 1e-9, `${caso.degrade.tipo} (${x}, ${y})`);
  }
});
