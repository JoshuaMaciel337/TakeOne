import assert from "node:assert/strict";
import { test } from "node:test";

import { MARGEM_DO_CORTE_S, planoDaMusica, type Trecho } from "./ajustarMusica.ts";

// Uma música de 60 s a 120 BPM: um tempo forte a cada 2 s
const FORTES = Array.from({ length: 30 }, (_, i) => i * 2);
const duracao = (trechos: Trecho[]) => trechos.reduce((soma, t) => soma + t.fim - t.inicio, 0);
const cortesNosFortes = (trechos: Trecho[]) => trechos.slice(1).every((t, i) => FORTES.includes(t.inicio) && FORTES.includes(trechos[i].fim));

test("encurtar tira compassos do meio e a música acaba no fim dela", () => {
  const { trechos, sobra } = planoDaMusica(0, 60, FORTES, 40);
  assert.equal(sobra, 0);
  assert.equal(trechos.length, 2);
  assert.equal(duracao(trechos), 40);
  assert.ok(cortesNosFortes(trechos));
  assert.equal(trechos[0].inicio, 0, "começa como começava");
  assert.equal(trechos[1].fim, 60, "acaba no final da música");
  // O corte fica perto do meio do vídeo
  assert.ok(Math.abs(trechos[0].fim - 20) <= 2);
});

test("alongar repete o miolo e acerta a duração", () => {
  const { trechos, sobra } = planoDaMusica(0, 60, FORTES, 150);
  assert.equal(sobra, 0);
  assert.equal(duracao(trechos), 150);
  assert.ok(cortesNosFortes(trechos));
  assert.equal(trechos[trechos.length - 1].fim, 60);
  assert.ok(trechos.every((t) => t.fim - t.inicio >= MARGEM_DO_CORTE_S));
});

test("o que os tempos fortes não acertam sai do fim (para o fade) ou falta no fim", () => {
  // 41 s: um corte de 19 s não existe (os fortes andam de 2 em 2): o mais perto, 18 ou 20
  const { trechos, sobra } = planoDaMusica(0, 60, FORTES, 41);
  assert.ok(Math.abs(duracao(trechos) - 41) < 1e-9 || duracao(trechos) === 40);
  if (sobra) assert.equal(duracao(trechos), 41);
  // Sem tempos fortes, só corta o fim
  const semRitmo = planoDaMusica(5, 60, [], 30);
  assert.deepEqual(semRitmo, { trechos: [{ inicio: 5, fim: 35 }], sobra: 25 });
  // Já na duração: nada muda
  assert.deepEqual(planoDaMusica(0, 60, FORTES, 60), { trechos: [{ inicio: 0, fim: 60 }], sobra: 0 });
});
