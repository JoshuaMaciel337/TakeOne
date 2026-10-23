import assert from "node:assert/strict";
import { test } from "node:test";

import { aplicar, compor, IDENTIDADE, inverter, matrizDaCaixa, matrizParaOutraCaixa, pontoNaMascara } from "./mascaraDePixels.ts";

const perto = (a: number, b: number, folga = 1e-9) => assert.ok(Math.abs(a - b) <= folga, `${a} ≠ ${b}`);
const quadro = { largura: 800, altura: 400 };
const documento = { largura: 1600, altura: 800 };

test("a matriz da caixa leva os cantos da caixa aos pontos do quadro, com o giro", () => {
  const caixa = { cx: 400, cy: 200, largura: 200, altura: 100, rotacao: 0, opacidade: 1 };
  const m = matrizDaCaixa(caixa, quadro);
  assert.deepEqual(aplicar(m, 0, 0).map((v) => Math.round(v * 1e6) / 1e6), [0.375, 0.375]);
  assert.deepEqual(aplicar(m, 1, 1).map((v) => Math.round(v * 1e6) / 1e6), [0.625, 0.625]);
  // Girada 90°: o canto de cima à esquerda da caixa vai para cima à direita
  const g = matrizDaCaixa({ ...caixa, rotacao: 90 }, quadro);
  const [x, y] = aplicar(g, 0, 0);
  perto(x * quadro.largura, 450);
  perto(y * quadro.altura, 100);
  // Inverter e compor
  const volta = compor(inverter(g), g);
  for (let i = 0; i < 6; i++) perto(volta[i], IDENTIDADE[i]);
});

test("o ponto na máscara: vinculada segue a caixa de quando foi feita; desvinculada fica no documento", () => {
  const feita = { cx: 400, cy: 200, largura: 200, altura: 100, rotacao: 0, opacidade: 1 };
  const matriz = matrizDaCaixa(feita, quadro);
  // A camada andou 100 px para a direita
  const agora = { ...feita, cx: 500 };
  const vinculada = pontoNaMascara({ x: 500, y: 200 }, { vinculada: true, matriz }, agora, quadro, documento);
  // O meio da camada é o meio da máscara feita (800, 400 no documento de 1600 × 800)
  perto(vinculada.x, 800);
  perto(vinculada.y, 400);
  const solta = pontoNaMascara({ x: 500, y: 200 }, { vinculada: false, matriz }, agora, quadro, documento);
  perto(solta.x, 1000);
  perto(solta.y, 400);
});

test("passar para outra caixa deixa a máscara no mesmo lugar do documento", () => {
  const feita = { cx: 300, cy: 150, largura: 200, altura: 100, rotacao: 30, opacidade: 1 };
  const mascara = { vinculada: true, matriz: matrizDaCaixa(feita, quadro) };
  const agora = { ...feita, cx: 360 };
  const inteira = { cx: 400, cy: 200, largura: 800, altura: 400, rotacao: 0, opacidade: 1 };
  const nova = matrizParaOutraCaixa(mascara, agora, inteira, quadro);
  // Um ponto do quadro dentro da camada: o valor da máscara tem de ser o mesmo pelas duas caixas
  const ponto = { x: 380, y: 160 };
  const antes = pontoNaMascara(ponto, mascara, agora, quadro, documento);
  const depois = pontoNaMascara(ponto, { vinculada: true, matriz: nova }, inteira, quadro, documento);
  perto(antes.x, depois.x, 1e-6);
  perto(antes.y, depois.y, 1e-6);
});
