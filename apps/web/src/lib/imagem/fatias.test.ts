import assert from "node:assert/strict";
import { test } from "node:test";

import { dividirFatia, fatiaNoPonto, fatiasAutomaticas, fatiasDasGuias, nomeDaFatia, retanguloDosCantos } from "./fatias.ts";

const doc = { largura: 300, altura: 200 };
let n = 0;
const novoId = () => `f${++n}`;

test("o retângulo dos cantos fica dentro do documento", () => {
  assert.deepEqual(retanguloDosCantos({ x: 250.4, y: -10 }, { x: 10, y: 90.6 }, doc), { x: 10, y: 0, largura: 240, altura: 91 });
  assert.equal(retanguloDosCantos({ x: 400, y: 10 }, { x: 500, y: 20 }, doc), null);
});

test("fatias a partir das guias e dividir", () => {
  const fatias = fatiasDasGuias({ verticais: [100, 100, 400], horizontais: [50] }, doc, novoId);
  assert.deepEqual(fatias.map((f) => [f.x, f.y, f.largura, f.altura]), [[0, 0, 100, 50], [100, 0, 200, 50], [0, 50, 100, 150], [100, 50, 200, 150]]);
  const partes = dividirFatia({ id: "a", nome: "topo", x: 0, y: 0, largura: 100, altura: 50 }, 3, 1, novoId);
  assert.deepEqual(partes.map((f) => [f.id, f.nome, f.x, f.largura]), [["a", "topo", 0, 33], [partes[1].id, "", 33, 34], [partes[2].id, "", 67, 33]]);
});

test("as automáticas cobrem o resto, juntadas", () => {
  // Uma fatia no meio: sobram quatro faixas em volta (em cima, à esquerda, à direita, embaixo)
  const meio = [{ id: "m", nome: "", x: 100, y: 50, largura: 100, altura: 100 }];
  const auto = fatiasAutomaticas(meio, doc);
  assert.deepEqual(auto.map((r) => [r.x, r.y, r.largura, r.altura]), [[0, 0, 300, 50], [0, 50, 100, 100], [200, 50, 100, 100], [0, 150, 300, 50]]);
  // A área total fecha com a fatia
  assert.equal(auto.reduce((s, r) => s + r.largura * r.altura, 0) + 100 * 100, 300 * 200);
  assert.deepEqual(fatiasAutomaticas([], doc), [{ x: 0, y: 0, largura: 300, altura: 200 }]);
  assert.equal(fatiaNoPonto(meio, 150, 100)?.id, "m");
  assert.equal(fatiaNoPonto(meio, 10, 10), null);
});

test("o nome da fatia", () => {
  assert.equal(nomeDaFatia({ nome: "" }, "foto", 3, 12), "foto_03");
  assert.equal(nomeDaFatia({ nome: "botao" }, "foto", 3, 12), "botao");
});
