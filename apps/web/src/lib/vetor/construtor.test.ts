import assert from "node:assert/strict";
import { test } from "node:test";

import { areaDaRegiao, construirPecas, faceNoPonto, facesDasFormas, facesDoArrasto, origemDaFace } from "./construtor.ts";
import { regiaoDosCaminhos } from "./contorno.ts";
import type { Subcaminho } from "./modelo.ts";

const quadrado = (x: number, y: number, lado: number): Subcaminho[] => [{ nos: [{ x, y }, { x: x + lado, y }, { x: x + lado, y: y + lado }, { x, y: y + lado }], fechado: true, operacao: "somar" }];

test("dois quadrados sobrepostos dão três faces, cada uma com quem a cobre", () => {
  const faces = facesDasFormas([quadrado(0, 0, 100), quadrado(50, 50, 100)]);
  assert.equal(faces.length, 3);
  const areas = faces.map((face) => Math.round(areaDaRegiao(face.regiao))).sort((a, b) => a - b);
  assert.deepEqual(areas, [2500, 7500, 7500]);
  const meio = faces[faceNoPonto(faces, { x: 75, y: 75 })];
  assert.deepEqual(meio.dentro, [0, 1]);
  assert.equal(origemDaFace(meio), 1, "a aparência é a da forma de cima");
  assert.equal(faceNoPonto(faces, { x: 300, y: 300 }), -1);
});

test("o Construtor junta as faces do arrasto e apaga as do Alt", () => {
  const faces = facesDasFormas([quadrado(0, 0, 100), quadrado(50, 50, 100)]);
  const tocadas = facesDoArrasto(faces, [{ x: 25, y: 25 }, { x: 75, y: 75 }]);
  assert.equal(tocadas.length, 2);
  const pecas = construirPecas(faces, tocadas, []);
  assert.equal(pecas.length, 2);
  const juntada = pecas[pecas.length - 1];
  assert.equal(Math.round(areaDaRegiao(regiaoDosCaminhos(juntada.caminhos, 0.1))), 10000);
  assert.equal(juntada.origem, 0, "a aparência da primeira face tocada");
  // Apagar o meio: sobram os dois pedaços de fora
  const semMeio = construirPecas(faces, [], [faceNoPonto(faces, { x: 75, y: 75 })]);
  assert.equal(semMeio.length, 2);
  assert.ok(semMeio.every((peca) => Math.round(areaDaRegiao(regiaoDosCaminhos(peca.caminhos, 0.1))) === 7500));
});

test("um anel cria uma face com buraco; formas separadas ficam como são", () => {
  const anel: Subcaminho[] = [...quadrado(0, 0, 100), { ...quadrado(25, 25, 50)[0], operacao: "subtrair" }];
  const faces = facesDasFormas([anel, quadrado(200, 0, 50)]);
  assert.equal(faces.length, 2);
  assert.equal(Math.round(areaDaRegiao(faces[0].regiao)), 7500);
});
