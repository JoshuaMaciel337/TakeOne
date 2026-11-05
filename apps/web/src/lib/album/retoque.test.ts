import assert from "node:assert/strict";
import { test } from "node:test";

import { edicaoParaEnviar, semNada } from "./edicao.ts";
import { comPredefinicao, comValores, predefinicaoDe, retoqueVazio } from "./retoque.ts";

test("o retoque: predefinições, valores e a edição vazia", () => {
  const natural = comPredefinicao({ pessoas: [3], pincel: [] }, "natural");
  assert.equal(natural.pele, 40);
  assert.equal(natural.contornar, 0);
  assert.deepEqual(natural.pessoas, [3]);
  assert.equal(predefinicaoDe(natural), "natural");
  assert.equal(predefinicaoDe(comValores(natural, { pele: 41 })), "");
  assert.equal(retoqueVazio({ pele: 0 }), true);
  assert.equal(retoqueVazio({ pincel: [{ modo: "excluir", raio: 0.02, pontos: [[0.1, 0.1]] }] }), true);
  assert.equal(retoqueVazio({ pincel: [{ modo: "incluir", raio: 0.02, pontos: [[0.1, 0.1]] }] }), false);
  assert.equal(semNada({ retoque: { manchas: 50 } }), false);
  assert.deepEqual(edicaoParaEnviar({ versao: 1, gerada: 1, retoque: { pele: 0 } }), {});
  assert.deepEqual(edicaoParaEnviar({ versao: 1, gerada: 1, retoque: { pele: 30 } }), { retoque: { pele: 30 } });
});
