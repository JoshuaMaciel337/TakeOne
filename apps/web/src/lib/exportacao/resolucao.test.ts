import assert from "node:assert/strict";
import { test } from "node:test";

import { comResolucao } from "./resolucao.ts";

test("o PNG ganha o pHYs logo depois do IHDR, com o CRC certo", () => {
  // Assinatura + um IHDR qualquer (o conteúdo não importa) + IEND
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, ...new Array(13).fill(0), 1, 2, 3, 4, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  const saida = comResolucao(png, "png", 300);
  assert.equal(saida.length, png.length + 21);
  assert.equal(String.fromCharCode(...saida.subarray(37, 41)), "pHYs");
  const visao = new DataView(saida.buffer);
  assert.equal(visao.getUint32(41), 11811);
  assert.equal(saida[49], 1);
  // O CRC do bloco "pHYs" + dados de 300 ppi (11811 por metro), conferido no zlib
  assert.equal(visao.getUint32(50), 0x78a53f76);
  assert.equal(String.fromCharCode(...saida.subarray(saida.length - 8, saida.length - 4)), "IEND");
});

test("o JPG tem a densidade do JFIF trocada; o WebP volta igual", () => {
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const saida = comResolucao(jpg, "jpeg", 300);
  assert.deepEqual([...saida.subarray(13, 18)], [1, 1, 44, 1, 44]);
  const webp = new Uint8Array([1, 2, 3]);
  assert.equal(comResolucao(webp, "webp", 300), webp);
});
