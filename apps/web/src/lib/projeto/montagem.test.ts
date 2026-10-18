import assert from "node:assert/strict";
import { test } from "node:test";

import { type ClipeParaMontar, duracoesDosTrechos, melhorTrecho, montar, NOTA_MINIMA, type Qualidade, TAMANHO_SEM_MUSICA_S } from "./montagem.ts";

/** Nota de um vídeo de `duracao` s, 4 amostras por segundo, com a nota dada por instante. */
function qualidade(duracao: number, nota: (t: number) => number, cortes: number[] = []): Qualidade {
  const t = Array.from({ length: duracao * 4 }, (_, i) => i / 4);
  return { t, nota: t.map(nota), corte: t.map((v) => cortes.some((c) => Math.abs(c - v) < 1e-9)) };
}

const video = (midiaId: string, duracaoS: number, nota: (t: number) => number = () => 0.9, cortes: number[] = []): ClipeParaMontar => ({
  midiaId,
  duracaoS,
  qualidade: qualidade(duracaoS, nota, cortes),
});

test("o melhor trecho fica longe do borrado e não atravessa corte de cena", () => {
  // Bom de 4 a 8 s, ruim no resto, com um corte aos 6 s
  const clipe = video("a", 12, (t) => (t >= 4 && t < 8 ? 0.95 : 0.1), [6]);
  const trecho = melhorTrecho(clipe, 2, [])!;
  assert.ok(trecho.entradaS >= 4 && trecho.entradaS + 2 <= 8.0001, String(trecho.entradaS));
  assert.ok(trecho.entradaS + 2 <= 6 || trecho.entradaS >= 6, "não atravessa o corte");
  // Usado o melhor, o segundo é o outro lado do corte
  const segundo = melhorTrecho(clipe, 2, [{ de: trecho.entradaS, ate: trecho.entradaS + 2 }]);
  assert.ok(segundo === null || segundo.nota >= NOTA_MINIMA);
  // Vídeo todo ruim: nada
  assert.equal(melhorTrecho(video("b", 10, () => 0.2), 2, []), null);
  assert.equal(melhorTrecho(video("c", 1, () => 0.9), 2, []), null, "curto demais");
});

test("com batidas, os trechos duram batidas inteiras perto de 2,4 s e começam na primeira", () => {
  // 120 BPM a partir de 0,3 s
  const batidas = Array.from({ length: 40 }, (_, i) => 0.3 + i * 0.5);
  const { duracoes, inicio } = duracoesDosTrechos(batidas, 10, 100);
  assert.equal(inicio, 0.3);
  assert.ok(duracoes.every((d) => Math.abs(d - 2.5) < 1e-9), "5 batidas de 0,5 s");
  assert.equal(duracoes.length, 4, "10 s de alvo");
  // Sem alvo, até as batidas acabarem
  assert.equal(duracoesDosTrechos(batidas, null, 100).duracoes.length, 7);
  // Sem música, tamanho fixo
  const semMusica = duracoesDosTrechos(null, 10, 100);
  assert.deepEqual(semMusica.duracoes, [TAMANHO_SEM_MUSICA_S, TAMANHO_SEM_MUSICA_S, TAMANHO_SEM_MUSICA_S, TAMANHO_SEM_MUSICA_S]);
});

test("os clipes se revezam na ordem escolhida e cada trecho é usado uma vez", () => {
  const clipes = [video("a", 20), video("b", 20), { midiaId: "foto", duracaoS: Number.POSITIVE_INFINITY, imagem: true }];
  const { trechos } = montar(clipes, null, 15);
  assert.deepEqual(trechos.map((t) => t.midiaId), ["a", "b", "foto", "a", "b", "a"]);
  for (const id of ["a", "b"]) {
    const doClipe = trechos.filter((t) => t.midiaId === id).sort((x, y) => x.entradaS - y.entradaS);
    for (let i = 1; i < doClipe.length; i++) assert.ok(doClipe[i].entradaS >= doClipe[i - 1].entradaS + doClipe[i - 1].duracaoS, "sem sobrepor");
  }
});

test("quando um clipe acaba, os outros continuam; quando todos acabam, a montagem para", () => {
  const curto = video("curto", 3);
  const longo = video("longo", 30);
  const { trechos } = montar([curto, longo], null, 20);
  assert.equal(trechos.filter((t) => t.midiaId === "curto").length, 1);
  assert.equal(trechos.length, 8);
  // Só ruim: nada
  assert.equal(montar([video("ruim", 30, () => 0.1)], null, 20).trechos.length, 0);
});
