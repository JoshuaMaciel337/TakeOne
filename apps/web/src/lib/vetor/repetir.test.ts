import assert from "node:assert/strict";
import { test } from "node:test";

import type { Subcaminho } from "./modelo.ts";
import { lugaresNoCaminho } from "./repetir.ts";

test("as cópias da ponta à ponta no aberto e dando a volta no fechado, com a direção do caminho", () => {
  const reta: Subcaminho = { nos: [{ x: 0, y: 0 }, { x: 100, y: 0 }], fechado: false, operacao: "somar" };
  assert.deepEqual(lugaresNoCaminho(reta, 3).map((p) => [p.x, p.y, p.angulo]), [[0, 0, 0], [50, 0, 0], [100, 0, 0]]);
  assert.deepEqual(lugaresNoCaminho(reta, 1).map((p) => p.x), [50]);
  const quadrado: Subcaminho = { nos: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], fechado: true, operacao: "somar" };
  const volta = lugaresNoCaminho(quadrado, 4);
  assert.deepEqual(volta.map((p) => [Math.round(p.x), Math.round(p.y)]), [[0, 0], [100, 0], [100, 100], [0, 100]]);
  assert.deepEqual(volta.map((p) => Math.round(p.angulo)), [0, 90, 180, -90]);
});
