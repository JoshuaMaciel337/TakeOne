import assert from "node:assert/strict";
import { test } from "node:test";

import { segundosParaTicks, TICKS_POR_SEGUNDO } from "../tempo.ts";
import { escreverSrt, escreverVtt, instanteParaDividir, lerLegendas, lerTempo, lerTextoDeLegenda, limitesDaFicha } from "./legendas.ts";

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

test("SRT com linha em branco que tem espaço ou tabulação separa as legendas", () => {
  const srt = "1\n00:00:01,000 --> 00:00:02,000\nUm\n \n2\n00:00:03,000 --> 00:00:04,000\nDois\n\t\n3\n00:00:05,000 --> 00:00:06,000\nTrês\n";
  assert.deepEqual(lerLegendas(srt).map((l) => l.conteudo), ["Um", "Dois", "Três"]);
});

test("o arquivo de legendas é lido na codificação dele", () => {
  const texto = "1\n00:00:01,000 --> 00:00:02,000\nAção é já\n";
  const utf8 = new TextEncoder().encode(texto);
  // Windows-1252: "ç" é 0xE7, "ã" 0xE3, "é" 0xE9
  const cp1252 = Uint8Array.from([...texto].map((letra) => ({ ç: 0xe7, ã: 0xe3, é: 0xe9 })[letra as "ç"] ?? letra.charCodeAt(0)));
  const utf16 = (be: boolean) => {
    const bytes = new Uint8Array(texto.length * 2);
    [...texto].forEach((letra, i) => {
      const codigo = letra.charCodeAt(0);
      bytes[2 * i + (be ? 1 : 0)] = codigo & 0xff;
      bytes[2 * i + (be ? 0 : 1)] = codigo >> 8;
    });
    return bytes;
  };
  const comBom = (bom: number[], bytes: Uint8Array) => Uint8Array.from([...bom, ...bytes]);
  for (const [nome, bytes] of [
    ["UTF-8", utf8],
    ["UTF-8 com BOM", comBom([0xef, 0xbb, 0xbf], utf8)],
    ["Windows-1252", cp1252],
    ["UTF-16 LE com BOM", comBom([0xff, 0xfe], utf16(false))],
    ["UTF-16 BE com BOM", comBom([0xfe, 0xff], utf16(true))],
    ["UTF-16 LE sem BOM", utf16(false)],
  ] as const) {
    assert.deepEqual(lerLegendas(lerTextoDeLegenda(bytes)).map((l) => l.conteudo), ["Ação é já"], nome);
  }
});

test("legendas sem a linha em branco entre elas, e as notas do WebVTT de fora", () => {
  const srt = "1\n00:00:01,000 --> 00:00:02,000\nUm\n2\n00:00:03,000 --> 00:00:04,000\nDois\n";
  assert.deepEqual(lerLegendas(srt).map((l) => l.conteudo), ["Um", "Dois"]);
  const vtt = "WEBVTT\n\n00:01.000 --> 00:02.000\nOi\n\nNOTE isto é uma nota\n\n00:03.000 --> 00:04.000\nTchau\n";
  assert.deepEqual(lerLegendas(vtt).map((l) => l.conteudo), ["Oi", "Tchau"]);
});

test("as fichas das legendas: os limites do tempo e onde dividir", () => {
  const S = TICKS_POR_SEGUNDO;
  const fichas = [
    { id: "a", inicio: 0, duracao: 2 * S },
    { id: "b", inicio: 3 * S, duracao: 2 * S },
    { id: "c", inicio: 5 * S, duracao: S },
  ];
  assert.deepEqual(limitesDaFicha(fichas[1], fichas, 10 * S), {
    inicio: { minimo: 2 * S, maximo: 5 * S - 0.2 * S },
    fim: { minimo: 3 * S + 0.2 * S, maximo: 5 * S },
  });
  // A última vai até o fim do vídeo; a primeira começa no zero
  assert.equal(limitesDaFicha(fichas[2], fichas, 10 * S).fim.maximo, 10 * S);
  assert.equal(limitesDaFicha(fichas[0], fichas, 10 * S).inicio.minimo, 0);

  const texto = (conteudo: string, tempos: number[] | null = null) => ({ conteudo, tempos }) as never;
  const legenda = { inicio: 10 * S, duracao: 2 * S, texto: texto("um dois três quatro", [0, 0.4 * S, 0.9 * S, 1.5 * S]) };
  assert.equal(instanteParaDividir(legenda, 11 * S), 11 * S, "o cursor dentro dela");
  assert.equal(instanteParaDividir(legenda, 20 * S), 10.9 * S, "senão, a palavra do meio");
  assert.equal(instanteParaDividir({ ...legenda, texto: texto("um dois três") }, 0), 11 * S, "sem tempos, o meio");
  assert.equal(instanteParaDividir({ ...legenda, texto: texto("sozinha") }, 11 * S), null);
});
