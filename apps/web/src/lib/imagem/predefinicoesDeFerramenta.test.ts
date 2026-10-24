import assert from "node:assert/strict";
import { test } from "node:test";

import { opcoesParaGuardar, partesDaFerramenta } from "./predefinicoesDeFerramenta.ts";

test("as partes das opções de cada ferramenta", () => {
  assert.deepEqual(partesDaFerramenta("pincel"), ["pincel"]);
  assert.deepEqual(partesDaFerramenta("desfoque"), ["pincel", "retoque"]);
  assert.deepEqual(partesDaFerramenta("carimbo"), ["pincel", "carimbo"]);
  assert.deepEqual(partesDaFerramenta("varinha"), ["selecao"]);
  assert.deepEqual(partesDaFerramenta("caneta"), ["caneta", "forma"]);
  assert.deepEqual(partesDaFerramenta("mao"), []);
});

test("a predefinição guarda uma cópia só das partes da ferramenta", () => {
  const pincel = { tamanho: 80 };
  const guardada = opcoesParaGuardar("pincel", { pincel, selecao: { tolerancia: 10 } });
  assert.deepEqual(guardada, { pincel: { tamanho: 80 } });
  pincel.tamanho = 5;
  assert.deepEqual(guardada, { pincel: { tamanho: 80 } });
});
