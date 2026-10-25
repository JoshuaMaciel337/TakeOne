import assert from "node:assert/strict";
import { test } from "node:test";

import type { Subcaminho } from "../vetor/modelo.ts";
import { afimDoGesto, aplicarAfim, giroEmVolta, inclinacaoEmVolta, posicaoPelaAfim, reflexoEmVolta, remodelarCaminhos } from "./ferramentas.ts";

const perto = (p: { x: number; y: number }, x: number, y: number) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9;
const o = { x: 100, y: 100 };

test("girar, refletir, escalar e inclinar pelo arrasto, em volta da origem", () => {
  // Do leste ao sul da origem: 90° no sentido horário da tela
  const giro = afimDoGesto("girar", o, { x: 200, y: 100 }, { x: 100, y: 180 });
  assert.ok(perto(aplicarAfim(giro, { x: 150, y: 100 }), 100, 150));
  assert.ok(perto(aplicarAfim(giro, o), 100, 100), "a origem fica");
  // Shift prende a 45°: 50° vira 45°
  const preso = afimDoGesto("girar", o, { x: 200, y: 100 }, { x: 100 + Math.cos((50 * Math.PI) / 180) * 50, y: 100 + Math.sin((50 * Math.PI) / 180) * 50 }, true);
  assert.ok(perto(aplicarAfim(preso, { x: 200, y: 100 }), 100 + 100 * Math.SQRT1_2, 100 + 100 * Math.SQRT1_2));
  // O eixo deitado: vira de cima para baixo
  const reflexo = afimDoGesto("refletir", o, o, { x: 300, y: 100 });
  assert.ok(perto(aplicarAfim(reflexo, { x: 150, y: 80 }), 150, 120));
  assert.ok(perto(aplicarAfim(reflexoEmVolta(o, 90), { x: 150, y: 80 }), 50, 80));
  const escala = afimDoGesto("escalar", o, { x: 200, y: 150 }, { x: 300, y: 150 });
  assert.ok(perto(aplicarAfim(escala, { x: 200, y: 150 }), 300, 150), "x dobra, y fica");
  const igual = afimDoGesto("escalar", o, { x: 200, y: 100 }, { x: 100, y: 250 }, true);
  assert.ok(perto(aplicarAfim(igual, { x: 120, y: 120 }), 130, 130));
  // Inclinar para o lado: o ponto do começo anda o arrasto, a altura da origem não anda
  const inclinacao = afimDoGesto("inclinar", o, { x: 100, y: 200 }, { x: 150, y: 200 });
  assert.ok(perto(aplicarAfim(inclinacao, { x: 100, y: 200 }), 150, 200));
  assert.ok(perto(aplicarAfim(inclinacao, { x: 300, y: 100 }), 300, 100));
  const empe = afimDoGesto("inclinar", o, { x: 200, y: 100 }, { x: 200, y: 140 });
  assert.ok(perto(aplicarAfim(empe, { x: 200, y: 100 }), 200, 140));
  assert.ok(perto(aplicarAfim(inclinacaoEmVolta(o, 45, 0), { x: 0, y: 200 }), 100, 200));
});

test("girar e refletir mudam só a posição da camada; inclinar não dá", () => {
  const girada = posicaoPelaAfim(giroEmVolta(o, 30), { x: 200, y: 100 }, 1, 10)!;
  assert.ok(Math.abs(girada.rotacao - 40) < 1e-6 && Math.abs(girada.escala - 1) < 1e-9 && !girada.espelhado);
  assert.ok(Math.abs(girada.centro.x - (100 + 100 * Math.cos(Math.PI / 6))) < 1e-9);
  const espelhada = posicaoPelaAfim(reflexoEmVolta(o, 90), { x: 150, y: 100 }, 2, 10)!;
  assert.equal(espelhada.espelhado, true);
  assert.ok(perto(espelhada.centro, 50, 100));
  assert.equal(posicaoPelaAfim(inclinacaoEmVolta(o, 20), o, 1, 0), null);
});

test("o Remodelar leva o ponto agarrado inteiro e os vizinhos cada vez menos", () => {
  const linha: Subcaminho = { nos: [0, 25, 50, 75, 100].map((x) => ({ x, y: 0 })), fechado: false, operacao: "somar" };
  const [puxada] = remodelarCaminhos([linha], { x: 50, y: 0 }, { x: 0, y: 20 }, 50);
  assert.deepEqual(puxada.nos.map((no) => Math.round(no.y * 100) / 100), [0, 10, 20, 10, 0]);
});
