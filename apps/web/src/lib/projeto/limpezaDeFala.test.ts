import assert from "node:assert/strict";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import type { Palavra } from "./fala.ts";
import { ehVicio, OPCOES_DE_LIMPEZA, segundosDosTrechos, trechosParaLimpar } from "./limpezaDeFala.ts";
import type { Clipe } from "./modelo.ts";

const S = TICKS_POR_SEGUNDO;

function clipe(id: string, midia: string, inicio: number, duracao: number, entrada = 0): Clipe {
  return { id, midia_id: midia, inicio: inicio * S, duracao: duracao * S, entrada: entrada * S, velocidade: 1 } as Clipe;
}

const p = (texto: string, inicio: number, fim: number): Palavra => ({ texto, inicio, fim });
const emSegundos = (trechos: { tipo: string; inicio: number; fim: number }[]) =>
  trechos.map((t) => [t.tipo, Number((t.inicio / S).toFixed(2)), Number((t.fim / S).toFixed(2))]);

test("vícios de hesitação, sem as palavras normais do português", () => {
  for (const vicio of ["ahn", "Ahnn,", "hã", "hum", "Hmm...", "éééh", "eh", "ãh"]) assert.ok(ehVicio(vicio), vicio);
  for (const normal of ["é", "um", "tipo", "então", "né?", "humano", "aham"]) assert.ok(!ehVicio(normal), normal);
});

test("pausas longas viram trechos, com folga em volta da fala; as curtas ficam", () => {
  const palavras = new Map([["m", [p("Olá", 1.5, 1.8), p("pessoal.", 1.9, 2.4), p("Hoje", 4.0, 4.3), p("vamos", 4.4, 4.7)]]]);
  const trechos = trechosParaLimpar([clipe("c", "m", 0, 6)], palavras);
  assert.deepEqual(emSegundos(trechos), [
    ["pausa", 0, 1.35],      // silêncio do começo do clipe até a primeira palavra
    ["pausa", 2.55, 3.85],   // entre "pessoal." e "Hoje"
    ["pausa", 4.85, 6],      // do fim da fala até o fim do clipe
  ]);
  assert.ok(Math.abs(segundosDosTrechos(trechos) - 3.8) < 1e-9);
});

test("o vício sai e o silêncio em volta dele vira uma pausa só", () => {
  const palavras = new Map([["m", [p("Então", 0, 0.4), p("ahn", 0.8, 1.1), p("vamos", 1.5, 1.8)]]]);
  const trechos = trechosParaLimpar([clipe("c", "m", 0, 1.8)], palavras);
  assert.deepEqual(emSegundos(trechos), [
    ["pausa", 0.55, 1.35],
    ["vicio", 0.8, 1.1],
  ]);
  const soPausas = trechosParaLimpar([clipe("c", "m", 0, 1.8)], palavras, { ...OPCOES_DE_LIMPEZA, vicios: false });
  assert.deepEqual(soPausas, [], "sem tirar o vício, as pausas em volta dele são curtas");
});

test("clipe sem fala e mídia sem transcrição não são tocados; o tempo é o do clipe na linha", () => {
  const palavras = new Map([["m", [p("a", 10, 10.3), p("b", 12, 12.3)]], ["silencio", []]]);
  const trechos = trechosParaLimpar([clipe("x", "silencio", 0, 5), clipe("c", "m", 5, 3, 9.8), clipe("y", "outra", 8, 2)], palavras);
  // O clipe c usa de 9,8 s a 12,8 s da mídia e começa em 5 s na linha do tempo
  assert.deepEqual(emSegundos(trechos), [["pausa", 5.65, 7.05]]);
});

test("retake: a frase começada e abandonada sai, até o começo da versão boa", () => {
  const fala = (texto: string, inicio: number) => texto.split(" ").map((w, i) => p(w, inicio + i * 0.4, inicio + i * 0.4 + 0.3));
  const palavras = new Map([["m", [
    ...fala("Hoje eu vou", 0),                                  // abandonada (pausa de 1 s depois)
    ...fala("Hoje eu vou mostrar como editar.", 2.1),           // a versão boa
    ...fala("Eu quero isso. Eu quero aquilo.", 5),             // repetição de estilo, do mesmo tamanho: fica
  ]]]);
  const opcoes = { ...OPCOES_DE_LIMPEZA, pausas: false, vicios: false };
  const trechos = trechosParaLimpar([clipe("c", "m", 0, 10)], palavras, opcoes);
  assert.deepEqual(trechos.map((t) => [t.tipo, t.inicio / S, t.fim / S, t.texto]), [["retake", 0, 2.1, "Hoje eu vou"]]);
  assert.deepEqual(trechosParaLimpar([clipe("c", "m", 0, 10)], palavras, { ...opcoes, retakes: false }), []);

  const repetida = new Map([["m", [...fala("Olha só isso.", 0), ...fala("Olha só isso.", 1.5), ...fala("Pronto.", 3)]]]);
  assert.deepEqual(trechosParaLimpar([clipe("c", "m", 0, 5)], repetida, opcoes).map((t) => [t.tipo, t.inicio / S, t.fim / S]), [["retake", 0, 1.5]],
    "a mesma frase dita duas vezes: fica a segunda");

  // Sem ponto entre as tentativas: a repetição fica no meio da mesma frase, depois de uma pausa curta (0,4 s, como na transcrição real)
  const noMeio = new Map([["m", [...fala("Essa ferramenta edita", 0), ...fala("Essa ferramenta edita vídeos sozinhos.", 1.5)]]]);
  assert.deepEqual(trechosParaLimpar([clipe("c", "m", 0, 5)], noMeio, opcoes).map((t) => [t.tipo, t.inicio / S, t.fim / S, t.texto]),
    [["retake", 0, 1.5, "Essa ferramenta edita"]]);
  // Uma palavra só repetida ("muito, muito") não é retake
  assert.deepEqual(trechosParaLimpar([clipe("c", "m", 0, 5)], new Map([["m", fala("Ficou muito muito bom.", 0)]]), opcoes), []);
});

test("retake: pares comuns repetidos na fala não contam, só o recomeço depois de uma pausa", () => {
  const fala = (texto: string, inicio: number) => texto.split(" ").map((w, i) => p(w, inicio + i * 0.4, inicio + i * 0.4 + 0.3));
  // "do editor" aparece duas vezes, mas a segunda não é um recomeço: segue a frase sem pausa
  const palavras = new Map([["m", fala("Abra o painel do editor e use as funções do editor com calma.", 0)]]);
  const opcoes = { ...OPCOES_DE_LIMPEZA, pausas: false, vicios: false };
  assert.deepEqual(trechosParaLimpar([clipe("c", "m", 0, 10)], palavras, opcoes), []);
});
