import assert from "node:assert/strict";
import { test } from "node:test";

import { segundosParaTicks } from "../tempo.ts";
import { escreverSrt, escreverVtt, lerLegendas, lerTempo } from "./legendas.ts";

const S = segundosParaTicks(1);

test("tempos de SRT e de WebVTT", () => {
  assert.equal(lerTempo("00:01:02,500"), 62.5);
  assert.equal(lerTempo("01:02:03.250"), 3723.25);
  assert.equal(lerTempo("01:02.250"), 62.25);
  assert.equal(lerTempo("abc"), null);
  assert.equal(lerTempo("1:2:3:4"), null);
});

test("lê SRT com BOM, CRLF, marcações e blocos quebrados", () => {
  const srt = "﻿1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>Olá,</i> mundo\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n{\\an8}Segunda\r\nlinha\r\n\r\n3\r\nsem tempo\r\n\r\n4\r\n00:00:05,000 --> 00:00:04,000\r\nfim antes do começo\r\n";
  assert.deepEqual(lerLegendas(srt), [
    { inicio: 1 * S, fim: 2.5 * S, conteudo: "Olá, mundo" },
    { inicio: 3 * S, fim: 4 * S, conteudo: "Segunda\nlinha" },
  ]);
});

test("lê WebVTT com cabeçalho, notas, ids e ajustes de posição", () => {
  const vtt = "WEBVTT - legendas\n\nNOTE isto é um comentário\n\nabertura\n00:01.000 --> 00:02.000 line:90% align:center\n<c.amarelo>Oi</c>\n\n00:00:02.500 --> 00:00:03.000\nTchau\n";
  assert.deepEqual(lerLegendas(vtt), [
    { inicio: 1 * S, fim: 2 * S, conteudo: "Oi" },
    { inicio: 2.5 * S, fim: 3 * S, conteudo: "Tchau" },
  ]);
});

test("legendas fora de ordem ou uma por cima da outra são arrumadas", () => {
  const srt = "2\n00:00:03,000 --> 00:00:05,000\nB\n\n1\n00:00:01,000 --> 00:00:04,000\nA\n";
  assert.deepEqual(lerLegendas(srt), [
    { inicio: 1 * S, fim: 3 * S, conteudo: "A" },
    { inicio: 3 * S, fim: 5 * S, conteudo: "B" },
  ]);
});

test("escrever e ler de novo dá as mesmas legendas", () => {
  const legendas = [
    { inicio: 0, fim: 1.5 * S, conteudo: "Primeira" },
    { inicio: 3725.25 * S, fim: 3727 * S, conteudo: "Duas\nlinhas" },
  ];
  const srt = escreverSrt(legendas);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:01,500\nPrimeira\n\n2\n01:02:05,250 --> 01:02:07,000\nDuas\nlinhas\n$/);
  assert.deepEqual(lerLegendas(srt), legendas);
  const vtt = escreverVtt(legendas);
  assert.ok(vtt.startsWith("WEBVTT\n\n00:00:00.000 --> 00:00:01.500\n"));
  assert.deepEqual(lerLegendas(vtt), legendas);
});
