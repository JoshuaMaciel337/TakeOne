import assert from "node:assert/strict";
import { test } from "node:test";

import { destinoSeguro } from "./api.ts";

test("destino seguro: só caminhos deste site", () => {
  assert.equal(destinoSeguro("/app/editor/abc?aba=cor#x"), "/app/editor/abc?aba=cor#x");
  assert.equal(destinoSeguro(null), "/app");
  // O navegador lê a barra invertida como barra e ignora tab e quebra de linha: todos levam para outro site
  for (const fora of ["https://fora.com", "//fora.com", "/\\fora.com", "/\t/fora.com", "/\n/fora.com", "app"]) {
    assert.equal(destinoSeguro(fora), "/app", JSON.stringify(fora));
  }
});
