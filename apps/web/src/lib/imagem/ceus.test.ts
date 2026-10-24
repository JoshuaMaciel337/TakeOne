import assert from "node:assert/strict";
import { test } from "node:test";

import { ajustarCeu, baseDoCeu, CEUS_PRONTOS, corMediaDoCeu, pintarCeu } from "./ceus.ts";

test("os céus prontos: opacos, mais escuros no alto (menos o nublado), e o pôr do sol quente no horizonte", () => {
  for (const { id } of CEUS_PRONTOS) {
    const dados = pintarCeu(id, 40, 30);
    assert.equal(dados.length, 40 * 30 * 4, id);
    for (let i = 3; i < dados.length; i += 4) assert.equal(dados[i], 255, id);
  }
  const sol = pintarCeu("por_do_sol", 40, 30);
  const embaixo = (29 * 40 + 5) * 4;
  assert.ok(sol[embaixo] > sol[embaixo + 2], "o horizonte do pôr do sol é mais vermelho que azul");
  const azul = pintarCeu("azul", 40, 30);
  assert.ok(azul[2] > azul[0], "o alto do céu azul é azul");
});

test("brilho, temperatura, cor média e a base do céu", () => {
  const dados = new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 255]);
  ajustarCeu(dados, 100, 0);
  assert.equal(dados[0], 200);
  ajustarCeu(dados, 0, 100);
  assert.ok(dados[0] > dados[2]);
  const cor = corMediaDoCeu(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]), new Uint8Array([255, 0]));
  assert.deepEqual(cor, [1, 0, 0]);
  assert.equal(baseDoCeu({ largura: 2, altura: 3, dados: new Uint8Array([255, 255, 255, 0, 0, 0]) }), 1);
  assert.equal(baseDoCeu({ largura: 1, altura: 1, dados: new Uint8Array([0]) }), -1);
});
