import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import type { Animacoes } from "./animacao.ts";
import { cortesDoTrecho, type LayoutDoTexto, trechoVisivel } from "./letras.ts";
import type { Texto } from "./texto.ts";

type Caso = {
  nome: string;
  clipe: { inicio: number; duracao: number; animacao?: Animacoes; texto?: Partial<Texto> };
  t: number;
  destaque: boolean;
  trecho: [number, number] | null;
  cortes: { de: number[]; ate: number[] } | null;
};

// Os mesmos casos que tests/test_letras.py confere no render
const { layout, casos } = JSON.parse(readFileSync(new URL("../../../../../tests/casos/letras.json", import.meta.url), "utf-8")) as {
  layout: LayoutDoTexto;
  casos: Caso[];
};
const S = TICKS_POR_SEGUNDO;

for (const caso of casos) {
  test(`letras: ${caso.nome}`, () => {
    const { clipe } = caso;
    const emTicks = (a: { tipo: string; duracao: number }) => ({ ...a, duracao: a.duracao * S });
    const animacao = clipe.animacao ? ({ entrada: emTicks(clipe.animacao.entrada), saida: emTicks(clipe.animacao.saida) } as Animacoes) : null;
    const texto = clipe.texto ? ({ ...clipe.texto, tempos: clipe.texto.tempos?.map((t) => t * S) ?? null } as Texto) : null;
    const trecho = trechoVisivel({ inicio: clipe.inicio * S, duracao: clipe.duracao * S, animacao, texto }, layout, caso.t * S, caso.destaque);
    assert.deepEqual(trecho, caso.trecho);
    if (trecho) assert.deepEqual(cortesDoTrecho(layout, trecho), caso.cortes);
  });
}
