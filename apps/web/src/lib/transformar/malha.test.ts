import assert from "node:assert/strict";
import { test } from "node:test";

import { afimDoTriangulo, bezier, homografia, malhaDoQuadrilatero, type Quadrilatero, quadDoRetangulo } from "./malha.ts";

const perto = (a: number, b: number, folga = 1e-6) => assert.ok(Math.abs(a - b) <= folga, `${a} ≠ ${b}`);

test("a homografia leva os cantos do quadrado aos do quadrilátero", () => {
  const q: Quadrilatero = [{ x: 10, y: 20 }, { x: 110, y: 5 }, { x: 130, y: 140 }, { x: 0, y: 100 }];
  const h = homografia(q);
  for (const [[u, v], p] of [[[0, 0], q[0]], [[1, 0], q[1]], [[1, 1], q[2]], [[0, 1], q[3]]] as const) {
    const r = h(u, v);
    perto(r.x, p.x);
    perto(r.y, p.y);
  }
  // A perspectiva: o meio do quadrado vai para o cruzamento das diagonais (não para a média dos cantos)
  const meio = h(0.5, 0.5);
  const cruz = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) => {
    const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / ((b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x));
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  };
  const diagonais = cruz(q[0], q[2], q[1], q[3]);
  perto(meio.x, diagonais.x, 1e-6);
  perto(meio.y, diagonais.y, 1e-6);
});

test("num retângulo girado a homografia é a afim", () => {
  const q = quadDoRetangulo(50, 40, 100, 60, 30);
  const h = homografia(q);
  const meio = h(0.5, 0.5);
  perto(meio.x, 50);
  perto(meio.y, 40);
});

test("a malha sem deformar reproduz a homografia; puxar um ponto do meio entorta só por perto", () => {
  const q: Quadrilatero = [{ x: 0, y: 0 }, { x: 90, y: 0 }, { x: 90, y: 90 }, { x: 0, y: 90 }];
  const malha = malhaDoQuadrilatero(q);
  const b = bezier(malha);
  perto(b(0.3, 0.7).x, 27);
  perto(b(0.3, 0.7).y, 63);
  malha[5] = { x: malha[5].x + 30, y: malha[5].y };
  const torto = bezier(malha);
  assert.ok(torto(1 / 3, 1 / 3).x > 30 + 5);
  perto(torto(1, 1).x, 90);
});

test("a afim do triângulo leva os três pontos", () => {
  const s = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }] as const;
  const t = [{ x: 5, y: 5 }, { x: 25, y: 10 }, { x: 0, y: 30 }] as const;
  const [a, b, c, d, e, f] = afimDoTriangulo([...s], [...t])!;
  for (let k = 0; k < 3; k++) {
    perto(a * s[k].x + c * s[k].y + e, t[k].x);
    perto(b * s[k].x + d * s[k].y + f, t[k].y);
  }
  assert.equal(afimDoTriangulo([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], [...t]), null);
});
