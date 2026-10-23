import assert from "node:assert/strict";
import { test } from "node:test";

import { caixaDaCamadaNaFoto, pontoDaCamadaNaFoto } from "./objeto.ts";

const INTEIRO = { x: 0, y: 0, largura: 1, altura: 1 };

test("o clique na camada vai para o ponto certo da foto, com recorte e virada", () => {
  assert.deepEqual(pontoDaCamadaNaFoto(0.25, 0.5, INTEIRO, null), { x: 0.25, y: 0.5 });
  // Recortada na metade da direita: o meio da camada é 3/4 da foto
  assert.deepEqual(pontoDaCamadaNaFoto(0.5, 0.5, { x: 0.5, y: 0, largura: 0.5, altura: 1 }, null), { x: 0.75, y: 0.5 });
  // Virada na horizontal: o canto da esquerda na tela é o da direita na foto
  assert.deepEqual(pontoDaCamadaNaFoto(0, 0.5, INTEIRO, { horizontal: true, vertical: false }), { x: 1, y: 0.5 });
});

test("a caixa da camada na foto, em pixels, para o pincel", () => {
  const caixa = caixaDaCamadaNaFoto({ x: 0.5, y: 0, largura: 0.5, altura: 1 }, { horizontal: true, vertical: false }, 800, 600);
  // O que aparece (a metade da direita da foto virada) é a metade da esquerda da foto
  assert.deepEqual(caixa, { x: 0, y: 0, largura: 400, altura: 600, espelharX: true, espelharY: false });
});
