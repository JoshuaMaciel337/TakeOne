import assert from "node:assert/strict";
import { test } from "node:test";

import { cubeParaIgualar, estatisticasDaCor, igualarPixel } from "./igualarCor.ts";

/** Uma amostra RGBA com estes pixels. */
function amostra(pixels: [number, number, number][]): Uint8ClampedArray {
  return new Uint8ClampedArray(pixels.flatMap(([r, g, b]) => [r, g, b, 255]));
}

test("o clipe igualado fica com a média e o desvio da referência", () => {
  // Um clipe escuro e azulado; a referência, clara e quente
  const alvo = amostra([
    [20, 30, 70],
    [40, 50, 100],
    [60, 70, 120],
    [30, 40, 90],
  ]);
  const referencia = amostra([
    [200, 150, 110],
    [230, 180, 130],
    [170, 120, 90],
    [210, 160, 120],
  ]);
  const a = estatisticasDaCor(alvo)!;
  const r = estatisticasDaCor(referencia)!;
  const igualado = Array.from({ length: alvo.length / 4 }, (_, i) => igualarPixel([alvo[i * 4] / 255, alvo[i * 4 + 1] / 255, alvo[i * 4 + 2] / 255], a, r));
  const depois = estatisticasDaCor(new Uint8ClampedArray(igualado.flatMap((rgb) => [...rgb.map((v) => v * 255), 255])))!;
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(depois.media[k] - r.media[k]) < 0.01, `média ${k}: ${depois.media[k]} contra ${r.media[k]}`);
  assert.ok(Math.abs(depois.desvio[0] - r.desvio[0]) < 0.01, "o desvio da luz");
});

test("a referência transformada conta com a cor dela, e a imagem lisa não ganha contraste infinito", () => {
  const lisa = amostra([[100, 100, 100]]);
  const a = estatisticasDaCor(lisa)!;
  const escurecida = estatisticasDaCor(lisa, ([r, g, b]) => [r / 2, g / 2, b / 2])!;
  assert.ok(Math.abs(escurecida.media[0] - a.media[0] / 2) < 1e-9);
  assert.deepEqual(igualarPixel([100 / 255, 100 / 255, 100 / 255], a, escurecida).map((v) => Math.round(v * 255)), [50, 50, 50]);
  assert.equal(estatisticasDaCor(new Uint8ClampedArray([1, 2, 3, 0])), null, "só pixels transparentes");
  const cube = cubeParaIgualar(a, escurecida, 'Igualar a "Abertura"', 2).split("\n");
  assert.deepEqual(cube.slice(0, 2), ["TITLE \"Igualar a 'Abertura'\"", "LUT_3D_SIZE 2"]);
  assert.equal(cube.length, 2 + 8 + 1);
});
