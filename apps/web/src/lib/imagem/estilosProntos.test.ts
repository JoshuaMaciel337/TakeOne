import assert from "node:assert/strict";
import { test } from "node:test";

import { type Campo, campoDoEfeito, contextoDoAlfa } from "./efeitos.ts";
import { LUZ_GLOBAL_PADRAO } from "./estiloDeCamada.ts";
import { ESTILOS_PRONTOS } from "./estilosProntos.ts";

test("os estilos prontos: ids sem repetir, dentro dos limites da API e com as contas de cada efeito rodando", () => {
  assert.equal(new Set(ESTILOS_PRONTOS.map((e) => e.id)).size, ESTILOS_PRONTOS.length);
  const n = 48;
  const alfa: Campo = { largura: n, altura: n, dados: new Float32Array(n * n) };
  for (let y = 12; y < 36; y++) for (let x = 12; x < 36; x++) alfa.dados[y * n + x] = 1;
  const ctx = contextoDoAlfa(alfa, 1, 0, LUZ_GLOBAL_PADRAO);
  for (const pronto of ESTILOS_PRONTOS) {
    assert.ok(pronto.preenchimento >= 0 && pronto.preenchimento <= 1, pronto.id);
    assert.ok(pronto.estilo.efeitos.length > 0 && pronto.estilo.efeitos.length <= 40, pronto.id);
    for (const efeito of pronto.estilo.efeitos) {
      assert.ok(efeito.opacidade >= 0 && efeito.opacidade <= 1, `${pronto.id}: opacidade`);
      assert.ok((efeito.tamanho ?? 0) <= 2500 && (efeito.distancia ?? 0) <= 30000, `${pronto.id}: medidas`);
      if (efeito.profundidade !== undefined) assert.ok(efeito.profundidade >= 0.01 && efeito.profundidade <= 10, `${pronto.id}: profundidade`);
      const campo = campoDoEfeito(efeito, ctx);
      assert.ok(campo.cobertura.dados.every((v) => Number.isFinite(v) && v >= 0 && v <= 1.0001), `${pronto.id}: ${efeito.tipo}`);
    }
  }
});
