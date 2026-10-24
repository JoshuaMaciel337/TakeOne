import assert from "node:assert/strict";
import { test } from "node:test";

import { estatisticas, histogramas, niveisAutomaticos, percentil } from "./histograma.ts";

/** Pixels RGBA a partir de cores. */
const pixels = (cores: [number, number, number, number?][]) => new Uint8ClampedArray(cores.flatMap(([r, g, b, a = 255]) => [r, g, b, a]));

test("conta cada canal e a luminância, sem os transparentes", () => {
  const h = histogramas(pixels([[255, 0, 0], [0, 255, 0], [10, 10, 10, 0], [128, 128, 128]]));
  assert.equal(h.pixels, 3);
  assert.equal(h.r[255], 1);
  assert.equal(h.r[0], 1);
  assert.equal(h.luma[76], 1);
  assert.equal(h.luma[150], 1);
  assert.equal(h.luma[128], 1);
});

test("média, desvio e mediana", () => {
  const contagem = new Uint32Array(256);
  contagem[10] = 1;
  contagem[20] = 1;
  contagem[30] = 2;
  const e = estatisticas(contagem);
  assert.equal(e.pixels, 4);
  assert.equal(e.media, 22.5);
  assert.equal(e.mediana, 20);
  assert.ok(Math.abs(e.desvio - Math.sqrt(68.75)) < 1e-9);
  assert.equal(estatisticas(contagem, 25, 255).media, 30);
});

test("percentis das pontas", () => {
  const contagem = new Uint32Array(256);
  for (let i = 40; i <= 200; i++) contagem[i] = 10;
  assert.equal(percentil(contagem, 0.001), 40);
  assert.equal(percentil(contagem, 0.001, true), 200);
});

test("o tom automático estica cada canal; o contraste, os três juntos", () => {
  const cores: [number, number, number][] = [];
  for (let i = 0; i <= 100; i++) cores.push([50 + i, 20 + i, 100 + i]);
  const h = histogramas(pixels(cores));
  const tom = niveisAutomaticos(h, "tom");
  assert.deepEqual([tom.r!.preto, tom.r!.branco, tom.g!.preto, tom.b!.branco], [50, 150, 20, 200]);
  const contraste = niveisAutomaticos(h, "contraste");
  assert.deepEqual([contraste.rgb!.preto, contraste.rgb!.branco], [20, 200]);
  // A cor ainda acerta a gama de cada canal
  const cor = niveisAutomaticos(h, "cor");
  for (const canal of ["r", "g", "b"] as const) assert.ok(cor[canal]!.gama > 0.1 && cor[canal]!.gama < 9.99);
});
