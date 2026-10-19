import assert from "node:assert/strict";
import { test } from "node:test";

import { acabarSom, ganhoParaOAlvo, loudnessIntegrado } from "./somFinal.ts";

const TAXA = 48000;

function seno(segundos: number, amplitude: number, frequencia = 997): Float32Array {
  return Float32Array.from({ length: Math.round(segundos * TAXA) }, (_, i) => amplitude * Math.sin((2 * Math.PI * frequencia * i) / TAXA));
}

test("um seno de 997 Hz em -20 dBFS nos dois canais mede -20 LUFS (a referência da norma)", () => {
  const amplitude = 10 ** (-20 / 20);
  const lufs = loudnessIntegrado([seno(5, amplitude), seno(5, amplitude)], TAXA)!;
  assert.ok(Math.abs(lufs - -20) < 0.1, String(lufs));
  // Um canal só: 3 dB abaixo
  const mono = loudnessIntegrado([seno(5, amplitude), new Float32Array(5 * TAXA)], TAXA)!;
  assert.ok(Math.abs(mono - -23.01) < 0.1, String(mono));
});

test("o portão relativo ignora o silêncio e os trechos muito baixos", () => {
  const alto = seno(4, 0.1);
  const comPausa = Float32Array.from([...alto, ...new Float32Array(6 * TAXA), ...seno(1, 0.001)]);
  const lufs = loudnessIntegrado([comPausa, comPausa], TAXA)!;
  assert.ok(Math.abs(lufs - -20) < 0.2, String(lufs));
  assert.equal(loudnessIntegrado([new Float32Array(TAXA), new Float32Array(TAXA)], TAXA), null);
});

test("ganho até -14 LUFS, com teto e nada no silêncio", () => {
  assert.equal(ganhoParaOAlvo(-20), 6);
  assert.equal(ganhoParaOAlvo(-60), 30);
  assert.equal(ganhoParaOAlvo(null), 0);
  assert.equal(ganhoParaOAlvo(-80), 0);
});

test("o acabamento segura os picos em -1,5 dBFS sem mexer no que está abaixo, e abre e fecha nas pontas", () => {
  const baixo = seno(1, 0.2);
  const pico = seno(0.2, 1.5);
  const canal = Float32Array.from([...baixo, ...pico, ...baixo]);
  const copia = Float32Array.from(canal);
  acabarSom([canal, copia], TAXA, 0);
  const teto = 10 ** (-1.5 / 20);
  assert.ok(Math.max(...canal.map(Math.abs)) <= teto + 1e-4, "nenhum pico acima do teto");
  // Longe do pico (mais que a soltura), o som baixo fica como estava
  const meio = Math.round(0.5 * TAXA);
  assert.ok(Math.abs(canal[meio] - baixo[meio]) < 1e-6);
  assert.equal(Math.abs(canal[0]), 0, "abre do zero");
  assert.equal(Math.abs(canal[canal.length - 1]), 0, "fecha no zero");
  // O ganho leva junto: +6 dB dobra a amplitude (num som que não passa do teto)
  const leve = seno(1, 0.1);
  acabarSom([leve], TAXA, 6.0206);
  assert.ok(Math.abs(leve[Math.round(0.5 * TAXA)] - 2 * seno(1, 0.1)[Math.round(0.5 * TAXA)]) < 1e-4);
});
