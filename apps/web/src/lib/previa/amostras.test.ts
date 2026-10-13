import assert from "node:assert/strict";
import { test } from "node:test";

import {
  amostraNoTempo,
  bytesDasAmostras,
  chaveAnterior,
  fimDoGrupo,
  montarAmostras,
  ordemDeExibicao,
  quadroParaMostrar,
} from "./amostras.ts";

// Um vídeo a 30 qps com quadros B, como o proxy que o x264 gera: I P B B P B B | I P B B.
// Na ordem de decodificação o P vem antes dos B que aparecem antes dele. Escala de tempo 15360
// (512 por quadro) e lista de edição começando em 1024, os dois quadros de atraso dos B.
const ESCALA = 15360;
const Q = 512;
// Número do quadro na exibição, na ordem em que é decodificado, e se é quadro-chave
const ORDEM: [number, boolean][] = [
  [0, true], [3, false], [1, false], [2, false], [6, false], [4, false], [5, false],
  [7, true], [10, false], [8, false], [9, false],
];
const ARQUIVO = ORDEM.map(([n, chave], indice) => ({ offset: 1000 + indice * 100, size: 90, cts: (n + 2) * Q, duration: Q, is_sync: chave }));

const amostras = montarAmostras(ARQUIVO, ESCALA, 2 * Q);
const exibicao = ordemDeExibicao(amostras);
const inicioDoQuadro = (n: number) => Math.round((n * Q * 1_000_000) / ESCALA);

test("a lista de edição faz o primeiro quadro aparecer no zero", () => {
  assert.equal(amostras[0].tempo, 0);
  assert.equal(amostras[2].tempo, inicioDoQuadro(1));
  assert.deepEqual(
    exibicao.map((i) => amostras[i].tempo),
    [...exibicao.keys()].map(inicioDoQuadro),
  );
});

test("acha o quadro de cada instante e o quadro-chave de onde decodificar", () => {
  // Quadro 5 da exibição: o B que é a sétima amostra decodificada
  const indice = amostraNoTempo(amostras, exibicao, inicioDoQuadro(5) + 10);
  assert.equal(amostras[indice].tempo, inicioDoQuadro(5));
  assert.equal(indice, 6);
  assert.equal(chaveAnterior(amostras, indice), 0);

  const depois = amostraNoTempo(amostras, exibicao, inicioDoQuadro(9));
  assert.equal(chaveAnterior(amostras, depois), 7);
  assert.equal(amostraNoTempo(amostras, exibicao, -5), exibicao[0], "antes do início, o primeiro quadro");
  assert.equal(amostraNoTempo(amostras, exibicao, 1e9), exibicao.at(-1), "depois do fim, o último");
});

test("grupo de quadros e os bytes que ele ocupa", () => {
  assert.equal(fimDoGrupo(amostras, 0), 7);
  assert.equal(fimDoGrupo(amostras, 7), 11);
  assert.deepEqual(bytesDasAmostras(amostras, 7, 11), [1700, 2090]);
});

test("mostra o último quadro que começou até o instante", () => {
  const inicios = [0, 33_333, 66_667, 100_000];
  assert.equal(quadroParaMostrar(inicios, 50_000), 1);
  assert.equal(quadroParaMostrar(inicios, 66_400), 2, "folga para o arredondamento");
  assert.equal(quadroParaMostrar(inicios, 500_000), 3);
  assert.equal(quadroParaMostrar([10_000], 0), -1);
});
