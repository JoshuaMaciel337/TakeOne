import assert from "node:assert/strict";
import { test } from "node:test";

import { ALVOS_DO_VETORSCOPIO, brilhoDaContagem, formaDeOnda, histogramas, lumaDe, posicaoNoVetorscopio, vetorscopio } from "./escopos.ts";

/** Uma imagem de `largura` × `altura` com a cor de cada coluna dada pela função. */
function imagem(largura: number, altura: number, cor: (x: number) => [number, number, number]) {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++)
    for (let x = 0; x < largura; x++) {
      const [r, g, b] = cor(x);
      dados.set([r, g, b, 255], (y * largura + x) * 4);
    }
  return { largura, altura, dados };
}

test("o branco tem luz 255 e o cinza fica no meio do vetorscópio", () => {
  assert.equal(Math.round(lumaDe(255, 255, 255)), 255);
  const [cb, cr] = posicaoNoVetorscopio(128, 128, 128);
  assert.ok(Math.abs(cb) < 1e-9 && Math.abs(cr) < 1e-9);
});

test("as cores puras caem no círculo do vetorscópio, nos ângulos de sempre", () => {
  const angulo = (cor: [number, number, number]) => {
    const [cb, cr] = posicaoNoVetorscopio(...cor);
    return ((Math.atan2(cr, cb) * 180) / Math.PI + 360) % 360;
  };
  // No BT.709, o vermelho fica a 103° e o azul a 355° (o Cb máximo, um pouco abaixo do eixo)
  assert.ok(Math.abs(angulo([255, 0, 0]) - 102.9) < 0.1);
  assert.ok(Math.abs(angulo([0, 0, 255]) - 354.8) < 0.1);
  // Cores complementares ficam em lados opostos
  for (const [a, b] of [
    [0, 3],
    [1, 4],
    [2, 5],
  ]) {
    const diferenca = Math.abs(angulo(ALVOS_DO_VETORSCOPIO[a].cor) - angulo(ALVOS_DO_VETORSCOPIO[b].cor));
    assert.ok(Math.abs(diferenca - 180) < 1e-6, `${ALVOS_DO_VETORSCOPIO[a].nome} e ${ALVOS_DO_VETORSCOPIO[b].nome}`);
  }
  // A cor mais saturada (o azul no Cb, o vermelho no Cr) chega à borda do círculo
  assert.ok(Math.abs(posicaoNoVetorscopio(0, 0, 255)[0] - 0.5) < 1e-3);
  assert.ok(Math.abs(posicaoNoVetorscopio(255, 0, 0)[1] - 0.5) < 1e-3);
});

test("a forma de onda de um degradê sobe da esquerda para a direita", () => {
  const degrade = imagem(256, 4, (x) => [x, x, x]);
  const onda = formaDeOnda(degrade, "luma", 8);
  for (let coluna = 0; coluna < 8; coluna++) {
    let soma = 0;
    let pesos = 0;
    for (let nivel = 0; nivel < 256; nivel++) {
      soma += nivel * onda[coluna * 256 + nivel];
      pesos += onda[coluna * 256 + nivel];
    }
    assert.equal(pesos, 32 * 4);
    assert.ok(Math.abs(soma / pesos - (coluna * 32 + 15.5)) < 0.01);
  }
});

test("o desfile separa os canais: um quadro vermelho tem o R no topo e o G e o B no zero", () => {
  const vermelho = imagem(10, 10, () => [255, 0, 0]);
  assert.equal(formaDeOnda(vermelho, "r", 1)[255], 100);
  assert.equal(formaDeOnda(vermelho, "g", 1)[0], 100);
  assert.equal(formaDeOnda(vermelho, "b", 1)[0], 100);
});

test("o vetorscópio de um quadro cinza tem tudo na casa do meio, e o histograma conta cada canal", () => {
  const cinza = imagem(6, 5, () => [100, 100, 100]);
  const casas = vetorscopio(cinza, 101);
  assert.equal(casas[50 * 101 + 50], 30);
  const h = histogramas(imagem(4, 1, (x) => [x * 10, 200, 0]));
  assert.deepEqual([h.r[0], h.r[10], h.r[20], h.r[30], h.g[200], h.b[0]], [1, 1, 1, 1, 4, 4]);
});

test("o brilho cresce pela escala logarítmica até a referência", () => {
  assert.equal(brilhoDaContagem(0, 100), 0);
  assert.equal(brilhoDaContagem(100, 100), 1);
  assert.equal(brilhoDaContagem(1000, 100), 1);
  assert.ok(brilhoDaContagem(10, 100) > 0.4 && brilhoDaContagem(10, 100) < 0.6);
});
