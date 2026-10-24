import assert from "node:assert/strict";
import { test } from "node:test";

import { alcasDoDegrade, type CamadaDePreenchimento, pontasDoDegrade } from "./camadaDePreenchimento.ts";

const degrade = { nome: "", tipo: "solido" as const, cores: [], opacidades: [], suavidade: 1, aspereza: 0.5, semente: 1 };
// Igual com folga (cos 90° não é zero em ponto flutuante)
const perto = (atual: unknown, esperado: unknown) => assert.equal(JSON.stringify(atual, (_, v) => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v)), JSON.stringify(esperado));
const tinta = (forma: "linear" | "radial", angulo: number, escala = 1): CamadaDePreenchimento["tinta"] => ({ tipo: "degrade", degrade, forma, angulo, escala, inverter: false });

test("sem alças, o degradê linear atravessa o documento no ângulo", () => {
  // 90°: de baixo para cima, na altura toda
  perto(pontasDoDegrade({ tinta: tinta("linear", 90) }, 400, 200), { de: { x: 200, y: 200 }, ate: { x: 200, y: 0 } });
  // 0° com escala 0,5: metade da largura, centrada
  const { de, ate } = pontasDoDegrade({ tinta: tinta("linear", 0, 0.5) }, 400, 200);
  assert.ok(Math.abs(de.x - 100) < 1e-9 && Math.abs(ate.x - 300) < 1e-9);
});

test("o radial começa no meio", () => {
  const { de, ate } = pontasDoDegrade({ tinta: tinta("radial", 0) }, 400, 200);
  assert.deepEqual(de, { x: 200, y: 100 });
  assert.ok(Math.abs(ate.x - 400) < 1e-9);
});

test("as alças valem em frações do documento, em qualquer tamanho", () => {
  const preenchimento = { tinta: tinta("linear", 0), de: { x: 0.1, y: 0.5 }, ate: { x: 0.9, y: 0.25 } };
  assert.deepEqual(pontasDoDegrade(preenchimento, 1000, 400), { de: { x: 100, y: 200 }, ate: { x: 900, y: 100 } });
  assert.deepEqual(alcasDoDegrade(preenchimento, { largura: 50, altura: 50 }), { de: { x: 0.1, y: 0.5 }, ate: { x: 0.9, y: 0.25 } });
  // Sem alças, as frações saem da linha do ângulo
  perto(alcasDoDegrade({ tinta: tinta("linear", 90) }, { largura: 400, altura: 200 }), { de: { x: 0.5, y: 1 }, ate: { x: 0.5, y: 0 } });
});
