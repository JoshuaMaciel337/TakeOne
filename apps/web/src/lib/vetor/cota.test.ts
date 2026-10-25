import assert from "node:assert/strict";
import { test } from "node:test";

import { COTA_PADRAO, geometriaDaCota, textoDaCota } from "./cota.ts";

test("o número sai na escala de medida, com as casas pedidas", () => {
  assert.equal(textoDaCota(200, null, 1), "200 px");
  assert.equal(textoDaCota(150, { pixels: 100, comprimento: 2.5, unidade: "cm" }, 2), "3,75 cm");
});

test("a cota deitada: a linha acima dos pontos, as setas nas pontas, o número em cima e de pé", () => {
  const { caminhos, meioDoTexto, giro } = geometriaDaCota({ x: 100, y: 200 }, { x: 300, y: 200 }, COTA_PADRAO);
  assert.deepEqual(caminhos[0].nos, [{ x: 100, y: 180 }, { x: 300, y: 180 }]);
  assert.equal(caminhos.length, 5, "a linha, as duas setas e as duas chamadas");
  assert.ok(caminhos[1].fechado && caminhos[1].nos[1].x > 100, "a seta do começo aponta para fora (o corpo para dentro)");
  assert.ok(meioDoTexto.y < 180 && Math.abs(meioDoTexto.x - 200) < 1e-9);
  assert.equal(giro, 0);
  // Da direita para a esquerda, o número continua de pé
  assert.equal(geometriaDaCota({ x: 300, y: 200 }, { x: 100, y: 200 }, COTA_PADRAO).giro, 0);
  // Na vertical, o número lê de baixo para cima
  assert.equal(geometriaDaCota({ x: 0, y: 0 }, { x: 0, y: 100 }, COTA_PADRAO).giro, -90);
  assert.equal(geometriaDaCota({ x: 0, y: 100 }, { x: 0, y: 0 }, COTA_PADRAO).giro, -90);
  // Sem afastamento, sem as chamadas
  assert.equal(geometriaDaCota({ x: 0, y: 0 }, { x: 0, y: 100 }, { ...COTA_PADRAO, afastamento: 0 }).caminhos.length, 3);
});
