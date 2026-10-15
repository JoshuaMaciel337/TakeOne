import assert from "node:assert/strict";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { falaDosClipes, type Palavra, palavrasDaLinha, trechoDasPalavras } from "./fala.ts";
import type { Clipe } from "./modelo.ts";

const S = TICKS_POR_SEGUNDO;

function clipe(id: string, midia: string, inicio: number, duracao: number, entrada = 0): Clipe {
  return { id, midia_id: midia, inicio: inicio * S, duracao: duracao * S, entrada: entrada * S, velocidade: 1 } as Clipe;
}

test("apagar palavras corta até o começo da seguinte, sem passar do clipe", () => {
  const palavras: Palavra[] = [
    { texto: "um", inicio: 0, fim: 0.3 },
    { texto: "dois", inicio: 0.5, fim: 0.8 },
    { texto: "três", inicio: 1.4, fim: 1.7 },
  ];
  // O mesmo trecho da mídia em dois clipes: de 0 a 2 s e, depois, de 0 a 1 s
  const lista = palavrasDaLinha(falaDosClipes([clipe("a", "m", 0, 2), clipe("b", "m", 2, 1)], new Map([["m", palavras]])));
  assert.deepEqual(lista.map((p) => `${p.clipeId}:${p.texto}`), ["a:um", "a:dois", "a:três", "b:um", "b:dois"]);

  const emSegundos = (t: { inicio: number; fim: number }) => [t.inicio / S, t.fim / S];
  assert.deepEqual(emSegundos(trechoDasPalavras(lista, 1, 1)), [0.5, 1.4], "leva a pausa depois de \"dois\"");
  assert.deepEqual(emSegundos(trechoDasPalavras(lista, 2, 0)), [0, 1.7], "a seleção pode vir de trás para a frente; \"três\" é a última do clipe");
  assert.deepEqual(emSegundos(trechoDasPalavras(lista, 2, 3)), [1.4, 2.5], "atravessa os clipes e vai até a palavra seguinte do clipe b");
  assert.deepEqual(emSegundos(trechoDasPalavras(lista, 4, 4)), [2.5, 2.8], "a última palavra da linha corta só ela");
});
