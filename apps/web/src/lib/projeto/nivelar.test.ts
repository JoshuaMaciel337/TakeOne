import assert from "node:assert/strict";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { type Keyframe, valorNoTempo } from "./keyframes.ts";
import { GANHO_MAXIMO_DB, mudarForca, nivelamentoDaVoz } from "./nivelar.ts";

const S = TICKS_POR_SEGUNDO;
// 12 s de mídia: fala baixa (-30 dB) de 0 a 4 s, silêncio (-70) de 4 a 6 s, fala alta (-10) de 6 a 12 s
const niveis = Int8Array.from({ length: 1200 }, (_, i) => (i < 400 ? -30 : i < 600 ? -70 : -10));
const clipe = { entrada: 0, duracao: 12 * S, velocidade: 1 };
const db = (pontos: Keyframe[], s: number) => 20 * Math.log10(valorNoTempo(pontos, s * S));

test("nivelar sobe a fala baixa, desce a alta e deixa o silêncio em 0 dB", () => {
  const curva = nivelamentoDaVoz(clipe, niveis, 1)!;
  // O alvo é a mediana da fala: a alta tem mais tempo (6 s contra 4), então o alvo é -10 dB
  assert.ok(Math.abs(db(curva.pontos, 2) - Math.min(20, GANHO_MAXIMO_DB)) < 0.5, "a baixa sobe o máximo");
  assert.ok(Math.abs(db(curva.pontos, 9)) < 0.5, "a alta fica");
  assert.ok(Math.abs(db(curva.pontos, 5)) < 0.5, "o silêncio não sobe");
  assert.ok(curva.pontos.length < 60, "só os pontos que fazem diferença");
});

test("a força escala o ganho em dB, sem ler os níveis de novo", () => {
  const cheia = nivelamentoDaVoz(clipe, niveis, 1)!;
  const metade = mudarForca(cheia, 0.5);
  assert.ok(Math.abs(db(metade.pontos, 2) - GANHO_MAXIMO_DB / 2) < 0.5);
  const direta = nivelamentoDaVoz(clipe, niveis, 0.5)!;
  assert.ok(Math.abs(db(direta.pontos, 2) - db(metade.pontos, 2)) < 0.01);
});

test("o trecho e a velocidade do clipe valem: a 2×, o mesmo som cai na metade do tempo", () => {
  const rapido = nivelamentoDaVoz({ entrada: 0, duracao: 6 * S, velocidade: 2 }, niveis, 1)!;
  assert.ok(Math.abs(db(rapido.pontos, 1) - GANHO_MAXIMO_DB) < 0.5);
  assert.ok(Math.abs(db(rapido.pontos, 4.5)) < 0.5);
  // Só silêncio: nada a nivelar
  assert.equal(nivelamentoDaVoz({ entrada: 4.2 * S, duracao: 1.5 * S, velocidade: 1 }, niveis, 1), null);
});
