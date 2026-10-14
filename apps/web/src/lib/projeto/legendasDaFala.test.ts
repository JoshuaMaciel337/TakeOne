import assert from "node:assert/strict";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { legendasDaFala, opcoesParaOQuadro, type Palavra, quebrarEmLinhas } from "./legendasDaFala.ts";
import type { Clipe } from "./modelo.ts";

const S = TICKS_POR_SEGUNDO;

function clipe(id: string, midia: string, inicio: number, duracao: number, entrada = 0, velocidade = 1): Clipe {
  return { id, midia_id: midia, inicio: inicio * S, duracao: duracao * S, entrada: entrada * S, velocidade } as Clipe;
}

/** Palavras de 0,3 s, uma a cada 0,4 s, a partir de `inicio`. */
function fala(texto: string, inicio = 0): Palavra[] {
  return texto.split(" ").map((p, i) => ({ texto: p, inicio: inicio + i * 0.4, fim: inicio + i * 0.4 + 0.3 }));
}

const emSegundos = (legendas: { inicio: number; fim: number; conteudo: string }[]) =>
  legendas.map((l) => [Number((l.inicio / S).toFixed(3)), Number((l.fim / S).toFixed(3)), l.conteudo]);

test("frases curtas viram uma linha cada, no tempo da fala", () => {
  const palavras = new Map([["m", fala("Olá a todos. Bem-vindos ao canal!")]]);
  assert.deepEqual(emSegundos(legendasDaFala([clipe("c", "m", 0, 10)], palavras)), [
    [0, 1.1, "Olá a todos."],
    [1.2, 2.3, "Bem-vindos ao canal!"],
  ]);
});

test("pausa longa e linha comprida quebram a legenda", () => {
  const palavras = new Map([["m", [...fala("primeira parte"), ...fala("depois da pausa", 2)]]]);
  assert.deepEqual(emSegundos(legendasDaFala([clipe("c", "m", 0, 10)], palavras)), [
    [0, 0.7, "primeira parte"],
    [2, 3.1, "depois da pausa"],
  ]);
  const longa = new Map([["m", fala("uma frase bem comprida que não cabe numa linha só de legenda no celular")]]);
  const linhas = legendasDaFala([clipe("c", "m", 0, 30)], longa);
  assert.ok(linhas.length >= 2 && linhas.every((l) => l.conteudo.length <= 42));
});

test("cada clipe mostra só a fala do trecho que usa, na posição e na velocidade dele", () => {
  const palavras = new Map([["m", fala("um dois três quatro cinco seis sete oito")]]);
  // O clipe usa de 1,2 s a 2,4 s da mídia ("quatro cinco seis"), na linha do tempo a partir de 10 s, em dobro
  const [legenda] = legendasDaFala([clipe("c", "m", 10, 0.6, 1.2, 2)], palavras);
  assert.equal(legenda.conteudo, "quatro cinco seis");
  assert.deepEqual([legenda.inicio / S, legenda.fim / S], [10, 10.55]);
});

test("a linha não passa do fim do clipe nem junta dois clipes", () => {
  const palavras = new Map([["m", fala("a b c d e f")]]);
  const legendas = legendasDaFala([clipe("x", "m", 5, 0.5, 0.8), clipe("w", "m", 0, 1)], palavras);
  assert.deepEqual(emSegundos(legendas), [
    [0, 1, "a b c"],       // usa de 0 a 1 s da mídia; "c" acaba depois do fim do clipe e é cortada
    [5, 5.5, "c d"],       // o outro começa em 0,8 s da mídia; "d" também é cortada no fim dele
  ]);
  assert.deepEqual(legendasDaFala([clipe("c", "outra", 0, 5)], palavras), [], "mídia sem transcrição fica de fora");
});

test("no quadro em pé a legenda usa duas linhas equilibradas e cabe na largura", () => {
  const emPe = opcoesParaOQuadro("9:16", 0.07);
  const deitado = opcoesParaOQuadro("16:9", 0.07);
  assert.equal(emPe.maxCaracteres, 21);
  assert.equal(deitado.maxCaracteres, 38);
  assert.deepEqual(quebrarEmLinhas("Esse modo é a união de todas as funções".split(" "), 21, 2), ["Esse modo é a união", "de todas as funções"]);
  assert.equal(quebrarEmLinhas("uma frase que passa de duas linhas de vinte e uma letras".split(" "), 21, 2), null);

  const palavras = new Map([["m", fala("Esse modo é a união de todas as funções do editor com apenas um clipe.")]]);
  const legendas = legendasDaFala([clipe("c", "m", 0, 30)], palavras, emPe);
  for (const legenda of legendas) {
    const linhas = legenda.conteudo.split("\n");
    assert.ok(linhas.length <= 2 && linhas.every((linha) => linha.length <= 21), JSON.stringify(legenda.conteudo));
  }
  assert.equal(legendas.map((l) => l.conteudo.replace("\n", " ")).join(" "), "Esse modo é a união de todas as funções do editor com apenas um clipe.");
});
