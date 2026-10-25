import assert from "node:assert/strict";
import { test } from "node:test";

import { espacoDoBorrifo, type InstanciaNoPincel, lugarDoBorrifo, passoDoPincelDeSimbolo, SIMBOLOS_PADRAO, tingirTinta, vetorDaInstancia } from "./simbolos.ts";

const inst = (clipeId: string, x: number, y: number): InstanciaNoPincel => ({ clipeId, x, y, escala: 1, rotacao: 0, opacidade: 1, tinta: null, estilo: null });
const opcoes = { ...SIMBOLOS_PADRAO, raio: 50, intensidade: 100 };

test("a tinta da instância mistura as cores do símbolo", () => {
  assert.deepEqual(tingirTinta({ tipo: "cor", cor: "#000000" }, "#ffffff", 0.5), { tipo: "cor", cor: "#808080" });
  const vetor = { caixa: { largura: 10, altura: 10 }, subcaminhos: [], preenchimento: { tipo: "cor" as const, cor: "#ff0000" }, traco: null };
  assert.equal(vetorDaInstancia({ id: "s", nome: "S", vetor }, null), vetor);
  assert.deepEqual(vetorDaInstancia({ id: "s", nome: "S", vetor }, { cor: "#0000ff", quantidade: 1 }).preenchimento, { tipo: "cor", cor: "#0000ff" });
});

test("os pincéis mexem só debaixo deles, mais no meio", () => {
  const lista = [inst("perto", 100, 100), inst("longe", 300, 100)];
  const movidas = passoDoPincelDeSimbolo("mover", lista, { x: 110, y: 100 }, { x: 100, y: 100 }, opcoes, false, "#000000");
  assert.ok(movidas[0].x > 105 && movidas[1].x === 300);
  const juntas = passoDoPincelDeSimbolo("juntar", [inst("a", 130, 100)], { x: 100, y: 100 }, { x: 100, y: 100 }, opcoes, false, "#000000");
  assert.ok(juntas[0].x < 130);
  assert.ok(passoDoPincelDeSimbolo("juntar", [inst("a", 130, 100)], { x: 100, y: 100 }, { x: 100, y: 100 }, opcoes, true, "#000000")[0].x > 130, "Alt afasta");
  assert.ok(passoDoPincelDeSimbolo("redimensionar", lista, { x: 100, y: 100 }, { x: 100, y: 100 }, opcoes, false, "#000000")[0].escala > 1);
  const giradas = passoDoPincelDeSimbolo("girar", lista, { x: 100, y: 110 }, { x: 100, y: 100 }, opcoes, false, "#000000");
  assert.ok(giradas[0].rotacao > 0 && giradas[0].rotacao <= 90);
  const tingida = passoDoPincelDeSimbolo("tingir", lista, { x: 100, y: 100 }, { x: 100, y: 100 }, opcoes, false, "#ff0000")[0];
  assert.equal(tingida.tinta?.cor, "#ff0000");
  assert.ok(passoDoPincelDeSimbolo("transparencia", lista, { x: 100, y: 100 }, { x: 100, y: 100 }, opcoes, false, "#000000")[0].opacidade < 1);
  assert.equal(passoDoPincelDeSimbolo("estilo", lista, { x: 100, y: 100 }, { x: 100, y: 100 }, opcoes, false, "#000000")[0].estilo, opcoes.estilo);
});

test("o borrifo cai dentro do raio, sempre igual pelo número", () => {
  for (let n = 0; n < 50; n++) {
    const lugar = lugarDoBorrifo({ x: 0, y: 0 }, opcoes, n);
    assert.ok(Math.hypot(lugar.x, lugar.y) <= 50 + 1e-9 && lugar.escala >= 0.8 && lugar.escala <= 1.2);
  }
  assert.deepEqual(lugarDoBorrifo({ x: 0, y: 0 }, opcoes, 7), lugarDoBorrifo({ x: 0, y: 0 }, opcoes, 7));
  assert.ok(espacoDoBorrifo({ ...opcoes, densidade: 100 }) < espacoDoBorrifo({ ...opcoes, densidade: 10 }));
});
