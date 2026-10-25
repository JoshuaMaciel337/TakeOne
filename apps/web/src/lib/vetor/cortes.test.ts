import assert from "node:assert/strict";
import { test } from "node:test";

import { achatar, areaDoPoligono } from "./contorno.ts";
import { apagarArea, cortarComFaca, cortarComTesoura, regiaoDoCorte, regiaoDoRetangulo } from "./cortes.ts";
import type { Subcaminho } from "./modelo.ts";
import { regiaoDaBolha } from "./pincelVetorial.ts";

const quadrado = (x: number, y: number, lado: number): Subcaminho => ({ nos: [{ x, y }, { x: x + lado, y }, { x: x + lado, y: y + lado }, { x, y: y + lado }], fechado: true, operacao: "somar" });
const area = (subs: Subcaminho[]) => subs.filter((sub) => sub.fechado).reduce((soma, sub) => soma + areaDoPoligono(achatar(sub, 0.05)), 0);

test("a Tesoura abre o caminho fechado no ponto e divide o aberto em dois", () => {
  const [aberto] = cortarComTesoura([quadrado(0, 0, 100)], { x: 50, y: 1 }, 5)!;
  assert.equal(aberto.fechado, false);
  // Começa e acaba no ponto cortado, e passa pelos quatro cantos
  const perto = (no: { x: number; y: number }, x: number, y: number) => Math.abs(no.x - x) < 1e-3 && Math.abs(no.y - y) < 1e-3;
  assert.ok(perto(aberto.nos[0], 50, 0) && perto(aberto.nos[aberto.nos.length - 1], 50, 0));
  assert.equal(aberto.nos.length, 6);
  const linha: Subcaminho = { nos: [{ x: 0, y: 0 }, { x: 100, y: 0 }], fechado: false, operacao: "somar" };
  const dois = cortarComTesoura([linha], { x: 30, y: 2 }, 5)!;
  assert.deepEqual(dois.map((sub) => sub.nos.map((no) => Math.round(no.x * 1000) / 1000)), [[0, 30], [30, 100]]);
  // Perto de um nó, corta nele; na ponta de um aberto, nada; longe, nada
  assert.deepEqual(cortarComTesoura([quadrado(0, 0, 100)], { x: 100, y: 0.2 }, 5)![0].nos.length, 5);
  assert.equal(cortarComTesoura([linha], { x: 0.1, y: 0 }, 5), null);
  assert.equal(cortarComTesoura([linha], { x: 50, y: 50 }, 5), null);
  // Numa curva, o corte não muda o desenho
  const curva: Subcaminho = { nos: [{ x: 0, y: 0, sx: 50, sy: -50 }, { x: 100, y: 0, ex: 50, ey: -50 }], fechado: false, operacao: "somar" };
  const partes = cortarComTesoura([curva], { x: 50, y: -37.5 }, 2)!;
  assert.equal(partes.length, 2);
  assert.ok(Math.abs(partes[0].nos[1].x - 50) < 0.5 && Math.abs(partes[0].nos[1].y + 37.5) < 0.5);
});

test("a Faca corta a forma em pedaços sem perder área", () => {
  const corte = regiaoDoCorte([{ x: 50, y: -20 }, { x: 50, y: 120 }]);
  const pedacos = cortarComFaca([quadrado(0, 0, 100)], corte)!;
  assert.equal(pedacos.length, 2);
  const areas = pedacos.map((pedaco) => area(pedaco)).sort((a, b) => a - b);
  assert.ok(Math.abs(areas[0] - 5000) < 10 && Math.abs(areas[1] - 5000) < 10, JSON.stringify(areas));
  // Um traço que não atravessa não divide; um que não toca, também não
  assert.equal(cortarComFaca([quadrado(0, 0, 100)], regiaoDoCorte([{ x: 50, y: -20 }, { x: 50, y: 40 }])), null);
  assert.equal(cortarComFaca([quadrado(0, 0, 100)], regiaoDoCorte([{ x: 200, y: 0 }, { x: 300, y: 0 }])), null);
});

test("a Borracha vetorial tira a área das formas e corta os caminhos abertos", () => {
  // Um retângulo de 20 de largura no meio do quadrado: sobram dois pedaços de 40 × 100
  const sobra = apagarArea([quadrado(0, 0, 100)], regiaoDoRetangulo({ x: 40, y: -10 }, { x: 60, y: 110 }))!;
  assert.equal(sobra.length, 2);
  assert.ok(Math.abs(area(sobra) - 8000) < 10, `${area(sobra)}`);
  // O traço grosso tira um buraco redondo
  const comBuraco = apagarArea([quadrado(0, 0, 100)], regiaoDaBolha([{ x: 50, y: 50 }], 10))!;
  assert.ok(Math.abs(area(comBuraco) - (10000 - Math.PI * 100)) < 30, `${area(comBuraco)}`);
  const linha: Subcaminho = { nos: [{ x: 0, y: 200 }, { x: 100, y: 200 }], fechado: false, operacao: "somar" };
  const cortada = apagarArea([linha], regiaoDoRetangulo({ x: 40, y: 190 }, { x: 60, y: 210 }))!;
  assert.equal(cortada.length, 2);
  // Tudo apagado: a lista vazia; nada tocado: null
  assert.deepEqual(apagarArea([quadrado(0, 0, 10)], regiaoDoRetangulo({ x: -5, y: -5 }, { x: 20, y: 20 })), []);
  assert.equal(apagarArea([quadrado(0, 0, 10)], regiaoDoRetangulo({ x: 50, y: 50 }, { x: 60, y: 60 })), null);
});
