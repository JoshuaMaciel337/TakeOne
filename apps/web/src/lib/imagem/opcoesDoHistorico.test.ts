import assert from "node:assert/strict";
import { test } from "node:test";

import { lerOpcoesDoHistorico, OPCOES_DO_HISTORICO_PADRAO } from "./opcoesDoHistorico.ts";

test("as opções do histórico guardadas são conferidas", () => {
  assert.deepEqual(lerOpcoesDoHistorico(null), OPCOES_DO_HISTORICO_PADRAO);
  assert.deepEqual(lerOpcoesDoHistorico("lixo"), OPCOES_DO_HISTORICO_PADRAO);
  assert.deepEqual(lerOpcoesDoHistorico(JSON.stringify({ estados: 50, naoLinear: true })), { ...OPCOES_DO_HISTORICO_PADRAO, estados: 50, naoLinear: true });
  assert.equal(lerOpcoesDoHistorico(JSON.stringify({ estados: 5000 })).estados, 200);
  assert.equal(lerOpcoesDoHistorico(JSON.stringify({ estados: 2.5 })).estados, 200);
  assert.equal(lerOpcoesDoHistorico(JSON.stringify({ primeiroInstantaneo: "sim" })).primeiroInstantaneo, true);
});
