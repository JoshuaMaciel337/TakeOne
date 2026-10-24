import assert from "node:assert/strict";
import { test } from "node:test";

import { aplicarEstilo, aplicarParagrafo, estiloComum, paragrafoDoIndice, substituir, textoCorrido, textoNovo } from "./modelo.ts";

test("digitar, apagar e quebrar o parágrafo guardam os índices de um campo de texto", () => {
  let texto = textoNovo("Olá mundo");
  texto = substituir(texto, 3, 3, ",");
  assert.equal(textoCorrido(texto), "Olá, mundo");
  texto = substituir(texto, 4, 5, "\n");
  assert.equal(textoCorrido(texto), "Olá,\nmundo");
  assert.equal(texto.paragrafos.length, 2);
  // Apagar a quebra junta os parágrafos
  texto = substituir(texto, 4, 5, " ");
  assert.equal(texto.paragrafos.length, 1);
  // Um emoji são duas unidades, como no campo
  texto = substituir(texto, 0, 0, "😀");
  assert.equal(textoCorrido(texto).length, 12);
  assert.equal(textoCorrido(substituir(texto, 0, 2, "")), "Olá, mundo");
});

test("o estilo vale no trecho escolhido, o digitado herda o de antes, e o comum é o que não muda", () => {
  let texto = textoNovo("abc def");
  texto = aplicarEstilo(texto, 4, 7, { cor: "#ff0000", peso: 700 });
  assert.equal(texto.paragrafos[0].trechos.length, 2);
  assert.deepEqual(texto.paragrafos[0].trechos[1], { texto: "def", estilo: { cor: "#ff0000", peso: 700 } });
  texto = substituir(texto, 7, 7, "g");
  assert.equal(texto.paragrafos[0].trechos[1].texto, "defg");
  assert.deepEqual(estiloComum(texto, 4, 8).cor, "#ff0000");
  assert.equal(estiloComum(texto, 0, 8).cor, undefined, "duas cores: em branco no painel");
  // Voltar ao estilo de base tira a diferença e junta os trechos
  texto = aplicarEstilo(texto, 4, 8, { cor: "#000000", peso: 400 });
  assert.equal(texto.paragrafos[0].trechos.length, 1);
});

test("o estilo do parágrafo vale nos parágrafos tocados", () => {
  let texto = textoNovo("um\ndois\ntrês");
  assert.equal(paragrafoDoIndice(texto, 5), 1);
  texto = aplicarParagrafo(texto, 4, 9, { alinhamento: "centro" });
  assert.deepEqual(texto.paragrafos.map((p) => p.estilo.alinhamento ?? "esquerda"), ["esquerda", "centro", "centro"]);
});
