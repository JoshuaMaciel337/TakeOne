import assert from "node:assert/strict";
import { test } from "node:test";

import { achatar, areaDoPoligono } from "./contorno.ts";
import { misturarCores, passosDaMescla, pontosIguais } from "./mesclar.ts";
import type { Subcaminho } from "./modelo.ts";
import { subcaminhosDaForma } from "./modelo.ts";

const quadrado = (x: number, y: number, lado: number): Subcaminho => ({ nos: [{ x, y }, { x: x + lado, y }, { x: x + lado, y: y + lado }, { x, y: y + lado }], fechado: true, operacao: "somar" });

test("os pontos iguais pelo comprimento, no sentido horário", () => {
  const pontos = pontosIguais(quadrado(0, 0, 100), 8);
  assert.equal(pontos.length, 8);
  assert.deepEqual(pontos.map((p) => [Math.round(p.x), Math.round(p.y)]), [[0, 0], [50, 0], [100, 0], [100, 50], [100, 100], [50, 100], [0, 100], [0, 50]]);
  // Dado no sentido contrário, vira
  const contrario: Subcaminho = { ...quadrado(0, 0, 100), nos: [...quadrado(0, 0, 100).nos].reverse() };
  assert.ok(areaDoPoligono(pontosIguais(contrario, 40)) > 0);
});

test("a mescla de um quadrado pequeno a um grande: os passos crescem e andam, com a cor no meio", () => {
  const a = { caminhos: [quadrado(0, 0, 100)], preenchimento: { tipo: "cor" as const, cor: "#ff0000" }, traco: null, opacidade: 1 };
  const b = { caminhos: [quadrado(300, 0, 200)], preenchimento: { tipo: "cor" as const, cor: "#0000ff" }, traco: null, opacidade: 0.5 };
  const passos = passosDaMescla(a, b, 3);
  assert.equal(passos.length, 3);
  const areas = passos.map((p) => Math.round(Math.abs(areaDoPoligono(achatar(p.caminhos[0], 0.1)))));
  // Os lados 125, 150 e 175
  assert.ok(Math.abs(areas[0] - 15625) < 200 && Math.abs(areas[1] - 22500) < 250 && Math.abs(areas[2] - 30625) < 300, JSON.stringify(areas));
  assert.equal(passos[1].preenchimento.tipo === "cor" ? passos[1].preenchimento.cor : "", "#800080");
  assert.equal(passos[1].opacidade, 0.75);
  // De um círculo a um quadrado também dá (o contorno se ajeita)
  const circulo = subcaminhosDaForma({ tipo: "elipse", largura: 100, altura: 100 });
  assert.equal(passosDaMescla({ ...a, caminhos: circulo }, b, 2).length, 2);
  assert.equal(misturarCores("#000000", "#ffffff", 0.5), "#808080");
});
