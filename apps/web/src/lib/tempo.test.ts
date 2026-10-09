// Testes portados de crates/time/src/lib.rs do FilmCraft (MIT OR Apache-2.0, ver licencas/filmcraft).
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ajustarAoQuadro,
  duracaoDoQuadro,
  formatarTimecode,
  quadroEm,
  quadroMaisProximo,
  segundosParaTicks,
  TAXA_PADRAO,
  taxaDeFps,
  TAXAS_COMUNS,
  tickDoQuadro,
  TICK_MAXIMO,
  TICKS_POR_SEGUNDO,
} from "./tempo.ts";

test("toda taxa comum tem quadro de duração exata", () => {
  for (const taxa of TAXAS_COMUNS) {
    assert.equal(BigInt(duracaoDoQuadro(taxa)) * BigInt(taxa.num), BigInt(TICKS_POR_SEGUNDO) * BigInt(taxa.den));
  }
  for (const amostras of [8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 176400, 192000]) {
    assert.equal(TICKS_POR_SEGUNDO % amostras, 0, `${amostras} Hz`);
  }
});

test("quadro e tick vão e voltam sem erro, até o fim da linha do tempo", () => {
  for (const taxa of TAXAS_COMUNS) {
    const ultimo = quadroEm(taxa, TICK_MAXIMO);
    for (const quadro of [-1000, -1, 0, 1, 2, 29, 30, 1799, 1800, 107892, 500_003, ultimo - 1, ultimo]) {
      assert.equal(quadroEm(taxa, tickDoQuadro(taxa, quadro)), quadro);
      assert.equal(quadroEm(taxa, tickDoQuadro(taxa, quadro) + duracaoDoQuadro(taxa) - 1), quadro);
    }
    assert.ok(Number.isSafeInteger(tickDoQuadro(taxa, ultimo)));
  }
});

test("taxa danificada vira a padrão em vez de dividir por zero", () => {
  for (const taxa of [{ num: 0, den: 0 }, { num: 0, den: 1 }, { num: 25, den: 0 }, { num: -30, den: 1 }, taxaDeFps(0), taxaDeFps(Number.NaN)]) {
    assert.equal(tickDoQuadro(taxa, 10), tickDoQuadro(TAXA_PADRAO, 10));
    assert.ok(duracaoDoQuadro(taxa) > 0);
  }
});

test("ajustar ao quadro", () => {
  const taxa = { num: 30, den: 1 };
  const quadro = duracaoDoQuadro(taxa);
  assert.equal(ajustarAoQuadro(taxa, quadro * 3 + 5), quadro * 3);
  assert.equal(quadroMaisProximo(taxa, quadro * 3 + 5), quadro * 3);
  assert.equal(quadroMaisProximo(taxa, quadro * 4 - 5), quadro * 4);
  assert.equal(ajustarAoQuadro(taxa, -5), -quadro);
});

test("fps decimal vira a taxa exata", () => {
  assert.deepEqual(taxaDeFps(29.97), { num: 30000, den: 1001 });
  assert.deepEqual(taxaDeFps(23.976), { num: 24000, den: 1001 });
  assert.deepEqual(taxaDeFps(15), { num: 15, den: 1 });
  assert.deepEqual(taxaDeFps(12.5), { num: 25, den: 2 });
});

test("timecode", () => {
  const taxa = { num: 30, den: 1 };
  assert.equal(formatarTimecode(0, taxa), "00:00:00");
  assert.equal(formatarTimecode(tickDoQuadro(taxa, 1799), taxa), "00:59:29");
  assert.equal(formatarTimecode(tickDoQuadro(taxa, 30 * 3600 + 31), taxa), "1:00:01:01");
  assert.equal(formatarTimecode(segundosParaTicks(1.5), { num: 30000, den: 1001 }), "00:01:14");
});
