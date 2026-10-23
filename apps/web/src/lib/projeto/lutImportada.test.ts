import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { aplicarLutImportada, lerLutImportada, type LutImportada, lutsDoProjeto } from "./lutImportada.ts";

// Os casos saem de tests/test_lut.py (core/utils/lut.py): uma LUT torta de 5 pontos e oito cores
const casos = JSON.parse(readFileSync(new URL("../../../../../tests/casos/lut.json", import.meta.url), "utf8")) as {
  tamanho: number;
  dados: number[];
  pontos: { entrada: [number, number, number]; saida: number[]; metade: number[] }[];
};

test("a leitura tetraédrica e a mistura batem com o render", () => {
  const lut: LutImportada = { tamanho: casos.tamanho, dados: new Float32Array(casos.dados), minimo: [0, 0, 0], maximo: [1, 1, 1] };
  for (const caso of casos.pontos) {
    const saida = lerLutImportada(lut, caso.entrada);
    const metade = aplicarLutImportada(caso.entrada, lut, 0.5);
    for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs(saida[k] - caso.saida[k]) < 1e-6, `${caso.entrada}: ${saida} contra ${caso.saida}`);
      assert.ok(Math.abs(metade[k] - caso.metade[k]) < 1e-6, `${caso.entrada}: ${metade} contra ${caso.metade}`);
    }
  }
});

test("o domínio maior lê a entrada na escala dele", () => {
  const lut: LutImportada = { tamanho: 2, dados: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1]), minimo: [0, 0, 0], maximo: [2, 2, 2] };
  assert.deepEqual(lerLutImportada(lut, [1, 0.5, 0]), [0.5, 0.25, 0]);
  assert.deepEqual(lutsDoProjeto({ faixas: [{ clipes: [{ cor: { lut: { id: "a", intensidade: 1 } } }, { cor: null }, { cor: { lut: { id: "a", intensidade: 0.3 } } }] }] }), ["a"]);
});
