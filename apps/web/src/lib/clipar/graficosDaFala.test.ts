import assert from "node:assert/strict";
import { test } from "node:test";

import type { PalavraNoTempo } from "../projeto/fala.ts";
import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { graficoDaPalavra, graficosDaFala } from "./graficosDaFala.ts";

const S = TICKS_POR_SEGUNDO;

function fala(texto: string, passo = 0.4): PalavraNoTempo[] {
  return texto.split(" ").map((p, i) => ({ texto: p, inicio: i * passo * S, fim: (i * passo + 0.3) * S }));
}

test("as palavras chamam o gráfico certo, sem acento e com as formas da palavra", () => {
  assert.equal(graficoDaPalavra("Coração,"), "pregacao_coracao");
  assert.equal(graficoDaPalavra("pecados"), "pregacao_coracao");
  assert.equal(graficoDaPalavra("MENTE"), "pregacao_mente");
  assert.equal(graficoDaPalavra("mentira"), null);
  assert.equal(graficoDaPalavra("libertação"), "pregacao_corrente");
  assert.equal(graficoDaPalavra("céus"), "pregacao_ceu");
  assert.equal(graficoDaPalavra("palavras"), null);
  assert.equal(graficoDaPalavra("a"), null);
});

test("os gráficos ficam longe um do outro, não se repetem e levam a palavra dita", () => {
  // "mente" em 0,4 s, "mente" de novo (repetido), "fogo" a 4 s (perto demais) e "liberdade" depois de 8 s
  const palavras = fala("a mente é tudo e a mente cansa fogo x x x x x x x x x x x x x a liberdade vem do Espírito Santo");
  const graficos = graficosDaFala(palavras);
  assert.deepEqual(
    graficos.map((g) => [g.modelo, g.campos.texto]),
    [
      ["pregacao_mente", "MENTE"],
      ["pregacao_corrente", "LIBERDADE"],
    ],
  );
  assert.equal(graficos[0].inicio, Math.round(0.4 * S - 0.2 * S));
  assert.equal(graficos[0].duracao, 3.5 * S);
  // Com menos distância, o espírito entra também, com o "Santo" junto
  const perto = graficosDaFala(palavras, { distancia: 1 });
  assert.deepEqual(perto.at(-1)!.campos, { texto: "ESPÍRITO SANTO" });
  assert.equal(graficosDaFala(palavras, { maximo: 1 }).length, 1);
});

test("o coração recebe as dores ditas perto dele", () => {
  const [coracao] = graficosDaFala(fala("tira do coração a inveja a ira e o orgulho e a inveja"));
  assert.equal(coracao.modelo, "pregacao_coracao");
  assert.equal(coracao.campos.palavras, "INVEJA\nIRA\nORGULHO");
  // Sem dores por perto, fica o padrão do modelo
  assert.deepEqual(graficosDaFala(fala("o coração bate"))[0].campos, {});
});
