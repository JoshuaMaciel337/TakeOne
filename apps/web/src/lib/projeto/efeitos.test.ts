import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ajustesDoEfeito, desvioDeCor, type Efeito, hash32, linhasDoEfeito } from "./efeitos.ts";

// Os mesmos casos que tests/test_efeitos.py confere no render
const casos = JSON.parse(readFileSync(new URL("../../../../../tests/casos/efeitos.json", import.meta.url), "utf-8")) as {
  hash: [number, number][];
  glitch: { efeito: Efeito; quadros: number[]; desvios: number[] };
  vhs: { efeito: Efeito; desvio: number; linhas: number; ajustes: Record<string, number> };
};

test("hash de inteiros igual ao do render", () => {
  assert.deepEqual(
    casos.hash.map(([n]) => hash32(n)),
    casos.hash.map(([, h]) => h),
  );
});

test("glitch salta nos mesmos quadros que o render", () => {
  casos.glitch.quadros.forEach((q, i) => assert.ok(Math.abs(desvioDeCor(casos.glitch.efeito, q) - casos.glitch.desvios[i]) < 1e-12, `quadro ${q}`));
});

test("VHS: desvio fixo, linhas e cor iguais aos do render", () => {
  assert.equal(desvioDeCor(casos.vhs.efeito, 10), casos.vhs.desvio);
  assert.equal(linhasDoEfeito(casos.vhs.efeito), casos.vhs.linhas);
  assert.deepEqual(ajustesDoEfeito(casos.vhs.efeito), casos.vhs.ajustes);
});
