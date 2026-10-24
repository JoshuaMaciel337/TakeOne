import assert from "node:assert/strict";
import { test } from "node:test";

import { DEGRADES_PRONTOS, type Degrade, pixelsDoDegrade, tabelaDoDegrade, tDoPonto } from "./degrade.ts";

const pretoBranco = DEGRADES_PRONTOS[0].degrades[2];

test("a tabela vai das cores das pontas e respeita o ponto médio", () => {
  const tabela = tabelaDoDegrade({ ...pretoBranco, suavidade: 0 }, "#000000", "#ffffff");
  assert.deepEqual([...tabela.slice(0, 4)], [0, 0, 0, 255]);
  assert.deepEqual([...tabela.slice(255 * 4)], [255, 255, 255, 255]);
  assert.ok(Math.abs(tabela[128 * 4] - 128) <= 1);
  // O ponto médio em 0,25: no meio do caminho (t = 0,25) a cor já é o meio-termo
  const puxado: Degrade = { ...pretoBranco, suavidade: 0, cores: [{ posicao: 0, cor: "#000000", meio: 0.25 }, { posicao: 1, cor: "#ffffff", meio: 0.5 }] };
  assert.ok(Math.abs(tabelaDoDegrade(puxado, "#000000", "#ffffff")[64 * 4] - 128) <= 2);
  // Primeiro plano para transparente: a opacidade cai
  const transparente = tabelaDoDegrade(DEGRADES_PRONTOS[0].degrades[1], "#ff0000", "#ffffff");
  assert.deepEqual([...transparente.slice(0, 4)], [255, 0, 0, 255]);
  assert.equal(transparente[255 * 4 + 3], 0);
});

test("o t de cada forma", () => {
  const de = { x: 0, y: 0 };
  const ate = { x: 10, y: 0 };
  assert.equal(tDoPonto("linear", 5, 3, de, ate), 0.5);
  assert.equal(tDoPonto("linear", -5, 0, de, ate), 0);
  assert.equal(tDoPonto("refletido", -5, 0, de, ate), 0.5);
  assert.ok(Math.abs(tDoPonto("radial", 0, 5, de, ate) - 0.5) < 1e-9);
  assert.ok(Math.abs(tDoPonto("losango", 3, 2, de, ate) - 0.5) < 1e-9);
  assert.ok(Math.abs(tDoPonto("angulo", 0, -5, de, ate) - 0.25) < 1e-9);
});

test("os pixels de um degradê linear, invertido e o ruído sorteado igual", () => {
  const tabela = tabelaDoDegrade({ ...pretoBranco, suavidade: 0 }, "#000000", "#ffffff");
  const p = pixelsDoDegrade(11, 1, { x: 0, y: 0.5 }, { x: 11, y: 0.5 }, "linear", tabela, { pontilhar: false });
  assert.ok(p[0] < 20 && p[10 * 4] > 235);
  const invertido = pixelsDoDegrade(11, 1, { x: 0, y: 0.5 }, { x: 11, y: 0.5 }, "linear", tabela, { inverter: true, pontilhar: false });
  assert.ok(invertido[0] > 235);
  const ruido = DEGRADES_PRONTOS[2].degrades[0];
  assert.deepEqual(tabelaDoDegrade(ruido, "#000", "#fff"), tabelaDoDegrade(ruido, "#000", "#fff"));
});
