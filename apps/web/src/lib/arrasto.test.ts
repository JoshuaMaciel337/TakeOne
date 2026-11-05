import assert from "node:assert/strict";
import { test } from "node:test";

import { materialNoArrasto, tipoDoMaterial } from "./arrasto.ts";

test("o material arrastado volta com o id, mesmo com o tipo em minúsculas", () => {
  const tipo = tipoDoMaterial("transicao", "cortinaEsquerda").toLowerCase();
  const dados = { types: ["text/plain", tipo] } as unknown as DataTransfer;
  assert.deepEqual(materialNoArrasto(dados), { tipo: "transicao", id: "cortinaEsquerda" });
  assert.equal(materialNoArrasto({ types: ["text/plain"] } as unknown as DataTransfer), null);
});
