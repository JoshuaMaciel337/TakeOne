// O "Melhorar" daqui é o do worker (core/utils/melhorar.py): os casos saem do Python (tests/test_melhorar.py)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ajustesAutomaticos } from "./melhorar.ts";

type Caso = { nome: string; rgba: number[]; esperado: Record<string, number> };
const casos = JSON.parse(readFileSync(new URL("../../../../../tests/casos/melhorar.json", import.meta.url), "utf-8")) as Caso[];

test("o Melhorar do editor e o do worker dão os mesmos ajustes", () => {
  for (const caso of casos) {
    const obtido = ajustesAutomaticos(caso.rgba) as Record<string, number>;
    for (const [chave, valor] of Object.entries(caso.esperado)) assert.ok(Math.abs(obtido[chave] - valor) < 1e-9, `${caso.nome}.${chave}: ${obtido[chave]} contra ${valor}`);
  }
});
