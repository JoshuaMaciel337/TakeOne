import assert from "node:assert/strict";
import { test } from "node:test";

import { empilharFoco, mesclarPanorama } from "./mesclarCamadas.ts";

const largura = 60;
const altura = 20;

test("panorama: cada lado vem da camada dele, a emenda fica na parte em comum; tons e cores igualam a luz", () => {
  // A da esquerda cobre x < 40 (cinza 100), a da direita x >= 20 (cinza 160)
  const esquerda = new Uint8ClampedArray(largura * altura * 4);
  const direita = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (x < 40) esquerda.set([100, 100, 100, 255], (y * largura + x) * 4);
      if (x >= 20) direita.set([160, 160, 160, 255], (y * largura + x) * 4);
    }
  }
  const saida = mesclarPanorama([
    { dados: esquerda, largura, altura },
    { dados: direita, largura, altura },
  ]);
  const em = (x: number) => saida[(10 * largura + x) * 4];
  assert.equal(em(5), 100);
  assert.equal(em(55), 160);
  assert.ok(em(30) > 100 && em(30) < 160, String(em(30)));
  // Com tons e cores: a da direita é levada à luz da esquerda
  const igual = mesclarPanorama(
    [
      { dados: esquerda, largura, altura },
      { dados: direita, largura, altura },
    ],
    { tonsECores: true },
  );
  assert.ok(Math.abs(igual[(10 * largura + 55) * 4] - 100) <= 1, String(igual[(10 * largura + 55) * 4]));
});

test("empilhar imagens: de cada lado vem a camada nítida", () => {
  // A primeira tem xadrez fino à esquerda e liso à direita; a segunda, o contrário
  const a = new Uint8ClampedArray(largura * altura * 4);
  const b = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const xadrez = (x + y) % 2 ? 220 : 30;
      a.set(x < 30 ? [xadrez, xadrez, xadrez, 255] : [125, 125, 125, 255], (y * largura + x) * 4);
      b.set(x >= 30 ? [xadrez, xadrez, xadrez, 255] : [125, 125, 125, 255], (y * largura + x) * 4);
    }
  }
  const saida = empilharFoco([
    { dados: a, largura, altura },
    { dados: b, largura, altura },
  ]);
  const contraste = (x0: number) => Math.abs(saida[(10 * largura + x0) * 4] - saida[(10 * largura + x0 + 1) * 4]);
  assert.ok(contraste(10) > 150, String(contraste(10)));
  assert.ok(contraste(50) > 150, String(contraste(50)));
});
