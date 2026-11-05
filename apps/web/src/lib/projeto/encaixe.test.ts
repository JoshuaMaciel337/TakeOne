import assert from "node:assert/strict";
import { test } from "node:test";

import { escalaParaCobrir, posicaoAlinhada } from "./encaixe.ts";
import { caixaDoClipe } from "./geometria.ts";
import { RECORTE_PADRAO, TRANSFORMACAO_PADRAO } from "./modelo.ts";

const QUADRO = { largura: 1080, altura: 1920 };
const DEITADO = { largura: 1920, altura: 1080 };

test("cobrir: o vídeo deitado num quadro em pé cobre a altura e passa da largura", () => {
  const escala = escalaParaCobrir(DEITADO, RECORTE_PADRAO, QUADRO);
  const caixa = caixaDoClipe({ ...TRANSFORMACAO_PADRAO, escala }, RECORTE_PADRAO, DEITADO, QUADRO);
  assert.ok(Math.abs(caixa.altura - 1920) < 1e-6);
  assert.ok(caixa.largura > 1080);
  // Um vídeo em pé no quadro em pé já cobre
  assert.ok(Math.abs(escalaParaCobrir(QUADRO, RECORTE_PADRAO, QUADRO) - 1) < 1e-9);
});

test("alinhar: a borda da caixa encosta na borda do quadro", () => {
  const transformacao = { ...TRANSFORMACAO_PADRAO, escala: 0.5 };
  const caixa = (mudanca: object) => caixaDoClipe({ ...transformacao, ...mudanca }, RECORTE_PADRAO, DEITADO, QUADRO);
  const esquerda = caixa(posicaoAlinhada("esquerda", transformacao, DEITADO, RECORTE_PADRAO, QUADRO));
  assert.ok(Math.abs(esquerda.cx - esquerda.largura / 2) < 1e-6);
  const base = caixa(posicaoAlinhada("base", transformacao, DEITADO, RECORTE_PADRAO, QUADRO));
  assert.ok(Math.abs(base.cy + base.altura / 2 - 1920) < 1e-6);
  assert.deepEqual(posicaoAlinhada("centro", transformacao, DEITADO, RECORTE_PADRAO, QUADRO), { x: 0 });
});
