import assert from "node:assert/strict";
import { test } from "node:test";

import { areaDoPoligono, cercaUmObjeto } from "./cercado.ts";

const circulo = (raio: number, voltas = 1, passos = 40) => Array.from({ length: passos + 1 }, (_, i) => ({ x: 100 + raio * Math.cos((i / passos) * Math.PI * 2 * voltas), y: 100 + raio * Math.sin((i / passos) * Math.PI * 2 * voltas) }));

test("a área do quadrado", () => {
  assert.equal(
    areaDoPoligono([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]),
    100,
  );
});

test("um círculo fechado cerca; meio círculo, uma linha e um ida e volta não", () => {
  assert.ok(cercaUmObjeto(circulo(50), 10));
  assert.ok(!cercaUmObjeto(circulo(50, 0.5), 10));
  assert.ok(!cercaUmObjeto([0, 1, 2, 3, 4].map((i) => ({ x: i * 20, y: 0 })), 10));
  const idaEVolta = [0, 1, 2, 3, 2, 1, 0].map((i) => ({ x: i * 30, y: (i % 2) * 2 }));
  assert.ok(!cercaUmObjeto(idaEVolta, 10));
  // Quase fechado (a ponta a 12 px do começo, num traço de 10 px): ainda cerca
  const quase = circulo(50, 0.96);
  assert.ok(cercaUmObjeto(quase, 10));
  // Um círculo pequeno demais para o traço é só uma mancha
  assert.ok(!cercaUmObjeto(circulo(8), 10));
});
