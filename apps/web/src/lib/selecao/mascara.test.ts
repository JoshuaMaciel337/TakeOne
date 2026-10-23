import assert from "node:assert/strict";
import { test } from "node:test";

import { borda, bordaNaTela, combinar, contrair, difusao, elipse, expandir, inverter, limites, poligono, retangulo, suavizar, temAlgo, vazia } from "./mascara.ts";

const valor = (s: { largura: number; dados: Uint8Array }, x: number, y: number) => s.dados[y * s.largura + x];

test("retângulo, elipse e polígono com a borda suave", () => {
  const r = retangulo(20, 10, { x: 2.5, y: 1, largura: 5, altura: 4 });
  assert.equal(valor(r, 4, 2), 255);
  assert.equal(valor(r, 2, 2), 128);
  assert.equal(valor(r, 9, 2), 0);
  assert.deepEqual(limites(r), { x0: 2, y0: 1, x1: 8, y1: 5 });
  const e = elipse(20, 20, { x: 0, y: 0, largura: 20, altura: 20 });
  assert.equal(valor(e, 10, 10), 255);
  assert.equal(valor(e, 0, 0), 0);
  const t = poligono(20, 20, [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 20 }]);
  assert.equal(valor(t, 2, 2), 255);
  assert.equal(valor(t, 18, 18), 0);
  // Sem suavizar, só 0 e 255
  const duro = elipse(10, 10, { x: 0.3, y: 0.3, largura: 9, altura: 9 }, false);
  assert.ok([...duro.dados].every((v) => v === 0 || v === 255));
});

test("somar, subtrair, intersectar e inverter", () => {
  const a = retangulo(10, 1, { x: 0, y: 0, largura: 6, altura: 1 });
  const b = retangulo(10, 1, { x: 4, y: 0, largura: 6, altura: 1 });
  assert.deepEqual([...combinar(a, b, "somar")!.dados], [255, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  assert.deepEqual([...combinar(a, b, "subtrair")!.dados], [255, 255, 255, 255, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...combinar(a, b, "intersectar")!.dados], [0, 0, 0, 0, 255, 255, 0, 0, 0, 0]);
  assert.equal(combinar(null, b, "subtrair"), null);
  assert.equal(temAlgo(combinar(null, b, "intersectar")), false);
  assert.deepEqual([...inverter(a).dados].slice(0, 7), [0, 0, 0, 0, 0, 0, 255]);
});

test("expandir, contrair, borda, suavizar e difusão", () => {
  const ponto = vazia(21, 21);
  ponto.dados[10 * 21 + 10] = 255;
  const grande = expandir(ponto, 5);
  assert.equal(valor(grande, 15, 10), 255);
  assert.equal(valor(grande, 17, 10), 0);
  // Um pixel expandido em 5: um disco de raio 5,5 (o pixel já tem meio de cada lado)
  const cheios = [...grande.dados].filter((v) => v >= 128).length;
  assert.ok(Math.abs(cheios - Math.PI * 5.5 ** 2) < 12, String(cheios));
  const quadrado = retangulo(30, 30, { x: 5, y: 5, largura: 20, altura: 20 });
  const menor = contrair(quadrado, 3);
  assert.equal(valor(menor, 7, 15), 0);
  assert.equal(valor(menor, 9, 15), 255);
  const anel = borda(quadrado, 6);
  assert.ok(valor(anel, 5, 15) > 128 && valor(anel, 15, 15) < 10);
  // Suavizar arredonda o canto (o pixel do canto sai) e mantém o meio
  const liso = suavizar(quadrado, 6);
  assert.equal(valor(liso, 15, 15), 255);
  assert.ok(valor(liso, 5, 5) < 128);
  const suave = difusao(quadrado, 2);
  assert.ok(valor(suave, 5, 15) > 60 && valor(suave, 5, 15) < 200);
});

test("as bordas na tela marcam só o contorno", () => {
  const r = retangulo(40, 40, { x: 10, y: 10, largura: 20, altura: 20 });
  const b = bordaNaTela(r, 20, 20);
  assert.equal(b[5 * 20 + 5], 1);
  assert.equal(b[10 * 20 + 10], 0);
  assert.equal(b[0], 0);
});

test("a difusão grande (três médias) fica perto da gaussiana exata", () => {
  const quadrado = retangulo(200, 1, { x: 100, y: 0, largura: 100, altura: 1 });
  const sigma = 12;
  const aproximada = difusao(quadrado, sigma);
  // A gaussiana exata de um degrau: 255·Φ((x + 0,5 − 100)/σ)
  const fi = (z: number) => 0.5 * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (z + 0.044715 * z ** 3)));
  let maior = 0;
  for (let x = 60; x < 140; x++) maior = Math.max(maior, Math.abs(aproximada.dados[x] - 255 * fi((x + 0.5 - 100) / sigma)));
  assert.ok(maior <= 4, String(maior));
  // Rápida numa imagem de 12 megapixels
  const grande = retangulo(4000, 3000, { x: 500, y: 500, largura: 3000, altura: 2000 });
  const inicio = performance.now();
  difusao(grande, 50);
  assert.ok(performance.now() - inicio < 4000, `${Math.round(performance.now() - inicio)} ms`);
});
