import assert from "node:assert/strict";
import { test } from "node:test";

import { alturaDoVolume, fadeArrastado, textoDoVolume, volumeDaAltura } from "./linhaDeVolume.ts";

test("a linha de volume vai e volta pelo mesmo caminho", () => {
  for (const volume of [0.1, 0.25, 0.5, 2, 3.5]) assert.ok(Math.abs(volumeDaAltura(alturaDoVolume(volume)) - volume) < 0.01, String(volume));
  assert.equal(alturaDoVolume(0), 0);
  assert.equal(volumeDaAltura(0), 0);
  assert.equal(alturaDoVolume(4), 1);
  assert.equal(volumeDaAltura(1), 3.98);
});

test("perto de 0 dB a linha gruda no volume original", () => {
  const zero = alturaDoVolume(1);
  assert.equal(volumeDaAltura(zero + 0.015), 1);
  assert.equal(volumeDaAltura(zero - 0.015), 1);
  assert.notEqual(volumeDaAltura(zero + 0.05), 1);
});

test("o texto do volume em dB", () => {
  assert.equal(textoDoVolume(0), "mudo");
  assert.equal(textoDoVolume(1), "0 dB");
  assert.equal(textoDoVolume(0.5), "−6,0 dB");
  assert.equal(textoDoVolume(2), "+6,0 dB");
});

test("o fade arrastado fica entre zero e o que o outro fade deixa, em quadros", () => {
  const quadro = 100;
  assert.equal(fadeArrastado(0, 250, 1000, 0, quadro), 300);
  assert.equal(fadeArrastado(500, -900, 1000, 0, quadro), 0);
  assert.equal(fadeArrastado(0, 2000, 1000, 400, quadro), 600);
});
