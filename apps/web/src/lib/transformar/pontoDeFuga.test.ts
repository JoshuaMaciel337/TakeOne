import assert from "node:assert/strict";
import { test } from "node:test";

import type { Quadrilatero } from "./malha.ts";
import { proporcaoDoPlano, quadDoColado } from "./pontoDeFuga.ts";

const perto = (a: number, b: number, tolerancia = 1e-6) => assert.ok(Math.abs(a - b) < tolerancia, `${a} != ${b}`);

test("num plano de frente, o colado é o retângulo na proporção da imagem", () => {
  const plano: Quadrilatero = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 100 },
    { x: 0, y: 100 },
  ];
  perto(proporcaoDoPlano(plano), 2);
  // Uma imagem quadrada com metade da largura do plano, no meio: 100 × 100
  const q = quadDoColado(plano, { u: 0.5, v: 0.5, largura: 0.5 }, 64, 64);
  perto(q[0].x, 50);
  perto(q[0].y, 0);
  perto(q[2].x, 150);
  perto(q[2].y, 100);
});

test("num plano em perspectiva, o colado fica no plano (os cantos na mesma reta de fuga)", () => {
  const plano: Quadrilatero = [
    { x: 100, y: 0 },
    { x: 300, y: 50 },
    { x: 300, y: 250 },
    { x: 100, y: 300 },
  ];
  const q = quadDoColado(plano, { u: 0.5, v: 0.5, largura: 0.4 }, 100, 50);
  // O lado de cima do colado aponta para o mesmo ponto de fuga do lado de cima do plano: as duas retas se cruzam
  // no mesmo ponto que o de baixo cruza o de baixo do plano
  const cruzamento = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) => {
    const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
    const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den;
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  };
  const fuga = cruzamento(plano[0], plano[1], plano[3], plano[2]);
  const fugaDoColado = cruzamento(q[0], q[1], q[3], q[2]);
  perto(fuga.x, fugaDoColado.x, 1e-3);
  perto(fuga.y, fugaDoColado.y, 1e-3);
});
