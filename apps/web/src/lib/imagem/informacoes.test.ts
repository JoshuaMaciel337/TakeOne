import assert from "node:assert/strict";
import { test } from "node:test";

import { corNoPonto, leiturasDaCor, naUnidade } from "./informacoes.ts";

function imagem(largura: number, altura: number, pixel: (x: number, y: number) => [number, number, number, number]) {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) dados.set(pixel(x, y), (y * largura + x) * 4);
  return { largura, altura, dados };
}

test("o ponto lê o pixel debaixo dele; fora da imagem, nada", () => {
  const img = imagem(4, 4, (x, y) => [x * 60, y * 60, 7, 255]);
  assert.deepEqual(corNoPonto(img, 2.9, 1.2), { r: 120, g: 60, b: 7, a: 255 });
  assert.equal(corNoPonto(img, -0.1, 1), null);
  assert.equal(corNoPonto(img, 4, 1), null);
});

test("a média 3 × 3 é a do quadrado, cortada na borda, e o transparente não escurece a cor", () => {
  const img = imagem(5, 5, (x) => (x < 2 ? [0, 0, 0, 255] : [200, 100, 50, 255]));
  // No meio (x = 2): três colunas, uma preta e duas coloridas
  assert.deepEqual(corNoPonto(img, 2, 2, 3), { r: 133, g: 67, b: 33, a: 255 });
  // No canto, só os 4 pixels de dentro
  assert.deepEqual(corNoPonto(img, 0, 0, 3), { r: 0, g: 0, b: 0, a: 255 });
  const meio = imagem(3, 1, (x) => (x === 1 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
  assert.deepEqual(corNoPonto(meio, 1, 0, 3), { r: 255, g: 0, b: 0, a: 85 });
  assert.deepEqual(corNoPonto(meio, 0, 0, 1), { r: 0, g: 0, b: 0, a: 0 });
});

test("as leituras de uma cor", () => {
  const vermelho = leiturasDaCor({ r: 255, g: 0, b: 0, a: 255 });
  assert.equal(vermelho.hex, "#ff0000");
  assert.deepEqual(vermelho.hsb, [0, 100, 100]);
  assert.deepEqual(vermelho.lab, [53, 80, 67]);
  assert.equal(vermelho.cmyk[3], 0);
  assert.ok(vermelho.cmyk[1] > 90 && vermelho.cmyk[2] > 90 && vermelho.cmyk[0] === 0);
  const cinza = leiturasDaCor({ r: 128, g: 128, b: 128, a: 255 });
  assert.equal(cinza.hsb[1], 0);
  assert.equal(cinza.cinza, 50);
  assert.deepEqual(cinza.lab.slice(1), [0, 0]);
  // Com a separação sem preto, o cinza sai só nas três cores
  assert.equal(leiturasDaCor({ r: 128, g: 128, b: 128, a: 255 }, { tipo: "cmyk", preto: "nenhuma", limite: 300 }).cmyk[3], 0);
  assert.deepEqual(leiturasDaCor({ r: 0, g: 128, b: 255, a: 255 }).hsb, [210, 100, 100]);
});

test("as medidas na unidade das réguas", () => {
  assert.equal(naUnidade(150, "px", 72, 900), "150 px");
  assert.equal(naUnidade(300, "pol", 300, 900), "1,000 pol");
  assert.equal(naUnidade(118.11, "cm", 300, 900), "1,00 cm");
  assert.equal(naUnidade(450, "pct", 72, 900), "50,0 %");
  assert.equal(naUnidade(72, "pt", 72, 900), "72,00 pt");
});
