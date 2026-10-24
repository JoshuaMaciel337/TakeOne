import assert from "node:assert/strict";
import { test } from "node:test";

import { deformarPelaPerspectiva, endireitar } from "./perspectiva.ts";

function imagem(largura: number, altura: number) {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) dados.set([x * 3, y * 3, 50, 255], (y * largura + x) * 4);
  return dados;
}

test("com os planos no lugar do layout, a foto sai igual; movidos, o plano leva o pedaço dele", () => {
  const largura = 60;
  const altura = 40;
  const dados = imagem(largura, altura);
  const origem = [
    { x: 10, y: 5 },
    { x: 50, y: 5 },
    { x: 50, y: 35 },
    { x: 10, y: 35 },
  ];
  const igual = deformarPelaPerspectiva({ dados, largura, altura }, { origem, destino: origem, planos: [[0, 1, 2, 3]] }, "vizinho");
  assert.deepEqual([...igual], [...dados]);
  // O plano todo 5 px para a direita: o pixel (35, 20) mostra o que estava em (30, 20)
  const destino = origem.map((p) => ({ x: p.x + 5, y: p.y }));
  const movido = deformarPelaPerspectiva({ dados, largura, altura }, { origem, destino, planos: [[0, 1, 2, 3]] }, "vizinho");
  assert.equal(movido[(20 * largura + 35) * 4], 30 * 3);
});

test("endireitar põe em pé as arestas quase verticais e nivela as quase horizontais, com os vértices compartilhados", () => {
  const origem = [
    { x: 0, y: 0 },
    { x: 100, y: 4 },
    { x: 104, y: 100 },
    { x: 2, y: 96 },
    { x: 200, y: 8 },
    { x: 198, y: 104 },
  ];
  const deformacao = {
    origem,
    destino: origem,
    planos: [
      [0, 1, 2, 3],
      [1, 4, 5, 2],
    ] as [number, number, number, number][],
  };
  const emPe = endireitar(deformacao, "verticais");
  assert.equal(emPe[0].x, emPe[3].x);
  assert.equal(emPe[1].x, emPe[2].x);
  assert.equal(emPe[0].y, 0, "as horizontais ficam");
  const nivelado = endireitar(deformacao, "ambos");
  assert.equal(nivelado[0].y, nivelado[1].y);
  // A linha de cima dos dois planos é uma corrente: os três vértices na média deles
  assert.ok(Math.abs(nivelado[4].y - nivelado[0].y) < 1e-9 && Math.abs(nivelado[0].y - 4) < 1e-9, String(nivelado[0].y));
  assert.ok(Math.abs(emPe[4].x - 199) < 1e-9);
});
