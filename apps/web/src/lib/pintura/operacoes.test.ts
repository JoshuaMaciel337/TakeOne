import assert from "node:assert/strict";
import { test } from "node:test";

import { retangulo } from "../selecao/mascara.ts";
import { caixaParaAparar, faixaDoTracado, limparPixels, preencherPixels, rgbDaCor } from "./operacoes.ts";

const pixels = (n: number, cor: number[]) => {
  const dados = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) dados.set(cor, i * 4);
  return dados;
};

test("preencher pela cobertura, com a opacidade, o modo e o preservar transparência", () => {
  const dados = pixels(4, [100, 100, 100, 255]);
  preencherPixels(dados, 4, Uint8Array.from([255, 128, 0, 255]), rgbDaCor("#ff0000"));
  assert.deepEqual([...dados.slice(0, 4)], [255, 0, 0, 255]);
  assert.ok(dados[4] > 150 && dados[4] < 200);
  assert.deepEqual([...dados.slice(8, 12)], [100, 100, 100, 255]);
  // Multiplicar pelo vermelho: o cinza fica escuro no verde
  const multiplicado = pixels(1, [200, 200, 200, 255]);
  preencherPixels(multiplicado, 1, null, [255, 0, 0], { modo: "multiplicar" });
  assert.deepEqual([...multiplicado], [200, 0, 0, 255]);
  // Preservar transparência: o transparente continua transparente
  const metade = pixels(2, [0, 0, 0, 0]);
  metade.set([10, 10, 10, 255], 4);
  preencherPixels(metade, 2, null, [0, 0, 255], { preservar: true });
  assert.equal(metade[3], 0);
  assert.deepEqual([...metade.slice(4)], [0, 0, 255, 255]);
});

test("limpar deixa transparente, ou pinta o fundo", () => {
  const dados = pixels(2, [50, 60, 70, 255]);
  limparPixels(dados, Uint8Array.from([255, 0]), null);
  assert.equal(dados[3], 0);
  assert.equal(dados[7], 255);
  const fundo = pixels(1, [50, 60, 70, 255]);
  limparPixels(fundo, null, [255, 255, 255]);
  assert.deepEqual([...fundo], [255, 255, 255, 255]);
});

test("a faixa do traçado por dentro, no centro e por fora", () => {
  const quadrado = retangulo(40, 40, { x: 10, y: 10, largura: 20, altura: 20 }, false);
  const dentro = faixaDoTracado(quadrado, 3, "dentro");
  const fora = faixaDoTracado(quadrado, 3, "fora");
  const centro = faixaDoTracado(quadrado, 4, "centro");
  const v = (s: { dados: Uint8Array }, x: number) => s.dados[20 * 40 + x];
  assert.ok(v(dentro, 11) > 128 && v(dentro, 8) < 128 && v(dentro, 20) < 128);
  assert.ok(v(fora, 8) > 128 && v(fora, 11) < 128);
  assert.ok(v(centro, 9) > 128 && v(centro, 11) > 128 && v(centro, 20) < 128);
});

test("aparar pela transparência e pela cor do canto", () => {
  const dados = pixels(25, [255, 255, 255, 255]);
  dados.set([0, 0, 0, 255], (2 * 5 + 3) * 4);
  assert.deepEqual(caixaParaAparar(dados, 5, 5, "cantoDeCima"), { x0: 3, y0: 2, x1: 4, y1: 3 });
  const transparente = pixels(25, [0, 0, 0, 0]);
  transparente.set([9, 9, 9, 255], (4 * 5 + 1) * 4);
  assert.deepEqual(caixaParaAparar(transparente, 5, 5, "transparencia"), { x0: 1, y0: 4, x1: 2, y1: 5 });
  assert.equal(caixaParaAparar(pixels(4, [0, 0, 0, 0]), 2, 2, "transparencia"), null);
});
