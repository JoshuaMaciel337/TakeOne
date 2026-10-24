import assert from "node:assert/strict";
import { test } from "node:test";

import { aplicarProva, corDaltonica, foraDaGama } from "./prova.ts";

test("o daltonismo junta o vermelho e o verde e deixa o cinza", () => {
  for (const tipo of ["protanopia", "deuteranopia", "tritanopia"] as const) {
    const cinza = corDaltonica(tipo, 128, 128, 128);
    assert.ok(cinza.every((v) => Math.abs(v - 128) <= 1), `${tipo}: ${cinza}`);
  }
  const vermelho = corDaltonica("protanopia", 255, 0, 0);
  const verde = corDaltonica("protanopia", 0, 160, 0);
  // Na protanopia, o vermelho e o verde ficam os dois amarelados (vermelho e verde parecidos, sem azul)
  assert.ok(Math.abs(vermelho[0] - vermelho[1]) < 40 && vermelho[2] < 30, `vermelho: ${vermelho}`);
  assert.ok(Math.abs(verde[0] - verde[1]) < 40, `verde: ${verde}`);
});

test("o alerta de gama: o cinza e o tom de pele cabem; o verde e o azul puros da tela, não", () => {
  assert.equal(foraDaGama(128, 128, 128), false);
  assert.equal(foraDaGama(224, 172, 140), false);
  assert.equal(foraDaGama(0, 255, 0), true);
  assert.equal(foraDaGama(0, 0, 255), true);
  const dados = Uint8ClampedArray.from([0, 255, 0, 255, 128, 128, 128, 255, 0, 255, 0, 0]);
  aplicarProva(dados, null, true);
  assert.deepEqual(Array.from(dados), [128, 128, 128, 255, 128, 128, 128, 255, 0, 255, 0, 0], "o transparente fica");
});
