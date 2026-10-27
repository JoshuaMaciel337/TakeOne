import assert from "node:assert/strict";
import { test } from "node:test";

import { type Corte, legendasDoArquivo, ordenarCortes, pedacosDoTitulo, picosDaOnda, tempoEstimado, tempoLegivel } from "./clipagens.ts";

test("o tempo estimado soma a transcrição, o modelo subindo e as janelas", () => {
  // 10 min sem transcrição: 45 + 50 s de fala, 15 s, 130 s do modelo, 3 janelas de 30 s e 30 s da ênfase
  assert.equal(tempoEstimado(600, false), 360);
  assert.equal(tempoEstimado(600, true), 265);
  assert.equal(tempoEstimado(60, true), 205);
  assert.equal(tempoLegivel(45), "menos de 1 min");
  assert.equal(tempoLegivel(265), "uns 4 min");
});

test("as palavras de foco do título viram pedaços marcados, sem caixa", () => {
  assert.deepEqual(pedacosDoTitulo("Guarde R$ 10 por dia: o poder dos mini-hábitos", ["mini-hábitos", "R$ 10"]), [
    { texto: "Guarde ", foco: false },
    { texto: "R$ 10", foco: true },
    { texto: " por dia: o poder dos ", foco: false },
    { texto: "mini-hábitos", foco: true },
  ]);
  assert.deepEqual(pedacosDoTitulo("Sem foco", []), [{ texto: "Sem foco", foco: false }]);
  assert.deepEqual(pedacosDoTitulo("O PODER", ["poder"]), [{ texto: "O ", foco: false }, { texto: "PODER", foco: true }]);
});

test("a lista ordena pela nota, pelo vídeo e pela duração", () => {
  const corte = (id: string, inicio: number, duracao: number, nota: number) => ({ id, trechos: [{ inicio, fim: inicio + duracao }], duracao, nota }) as Corte;
  const cortes = [corte("a", 100, 30, 70), corte("b", 10, 60, 90), corte("c", 50, 45, 80)];
  assert.deepEqual(ordenarCortes(cortes, "nota").map((c) => c.id), ["b", "c", "a"]);
  assert.deepEqual(ordenarCortes(cortes, "video").map((c) => c.id), ["b", "c", "a"]);
  assert.deepEqual(ordenarCortes(cortes, "longos").map((c) => c.id), ["b", "c", "a"]);
  assert.deepEqual(ordenarCortes(cortes, "curtos").map((c) => c.id), ["a", "c", "b"]);
  assert.deepEqual(cortes.map((c) => c.id), ["a", "b", "c"]);
});

test("o .srt vira legendas em segundos, numa linha só", () => {
  const srt = "1\n00:00:01,000 --> 00:00:03,500\n<i>Olá,</i>\nmundo\n\n2\n00:01:02,250 --> 00:01:04,000\nSegunda\n";
  assert.deepEqual(legendasDoArquivo(new TextEncoder().encode(srt)), [
    { inicio: 1, fim: 3.5, texto: "Olá, mundo" },
    { inicio: 62.25, fim: 64, texto: "Segunda" },
  ]);
});

test("a forma de onda leva o pico de cada coluna de -60 dB a 0 dB", () => {
  const niveis = new Int8Array([-80, -60, -30, -30, 0, -10, -127, -127]);
  assert.deepEqual(picosDaOnda(niveis, 4), [0, 0.5, 1, 0]);
  assert.deepEqual(picosDaOnda(new Int8Array([-30]), 3), [0.5, 0.5, 0.5]);
});
