import assert from "node:assert/strict";
import { test } from "node:test";

import { corNaGrade, inversaBilinear, malhaNova, pixelsDaMalha, pontoDaMalhaPerto, remalhar } from "./malhaDeDegrade.ts";

test("a inversa bilinear acha o lugar no quadrilátero torto", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 10 };
  const c = { x: 120, y: 90 };
  const d = { x: -10, y: 80 };
  for (const [s, t] of [[0.25, 0.5], [0.9, 0.1], [0, 1]]) {
    const p = { x: a.x + s * (b.x - a.x) + t * (d.x - a.x) + s * t * (a.x - b.x + c.x - d.x), y: a.y + s * (b.y - a.y) + t * (d.y - a.y) + s * t * (a.y - b.y + c.y - d.y) };
    const volta = inversaBilinear(p, a, b, c, d)!;
    assert.ok(Math.abs(volta.s - s) < 1e-6 && Math.abs(volta.t - t) < 1e-6, JSON.stringify(volta));
  }
});

test("as cores andam suaves entre os pontos e batem nos pontos", () => {
  const malha = malhaNova(1, 2, (x) => (x === 0 ? "#ff0000" : x === 1 ? "#0000ff" : "#ff0000"));
  assert.deepEqual(corNaGrade(malha, 0, 0, 0, 0).map(Math.round), [255, 0, 0]);
  assert.deepEqual(corNaGrade(malha, 1, 0, 1, 0).map(Math.round), [0, 0, 255]);
  const dados = pixelsDaMalha(malhaNova(1, 1, (x) => (x === 0 ? "#ff0000" : "#0000ff")), 10, 4, { x: 0, y: 0, largura: 10, altura: 4 });
  // No meio da largura, metade de cada
  const i = (1 * 10 + 5) * 4;
  assert.ok(Math.abs(dados[i] - 102) < 30 && Math.abs(dados[i + 2] - 140) < 30 && dados[i + 3] === 255, `${dados[i]},${dados[i + 2]}`);
  // Fora da caixa, transparente
  assert.equal(pixelsDaMalha(malhaNova(1, 1, () => "#ffffff"), 10, 10, { x: 0, y: 0, largura: 5, altura: 5 })[(8 * 10 + 8) * 4 + 3], 0);
});

test("remalhar guarda as cores; o ponto perto", () => {
  const malha = malhaNova(1, 1, (x) => (x === 0 ? "#000000" : "#ffffff"));
  const mais = remalhar(malha, 2, 2);
  assert.equal(mais.pontos.length, 9);
  assert.equal(mais.pontos[0].cor, "#000000");
  assert.equal(mais.pontos[2].cor, "#ffffff");
  assert.equal(pontoDaMalhaPerto(mais, { x: 0.52, y: 0.49 }, 0.1), 4);
  assert.equal(pontoDaMalhaPerto(mais, { x: 0.3, y: 0.3 }, 0.05), -1);
});
