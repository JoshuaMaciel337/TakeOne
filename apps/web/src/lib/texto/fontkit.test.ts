import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { create } from "fontkit";

import { adaptarFonte } from "./fontkit.ts";
import { disporTexto } from "./layout.ts";
import { textoNovo } from "./modelo.ts";

const INTER = new URL("../../../../../core/fontes/Inter[opsz,wght].ttf", import.meta.url);

test("as letras de cada glifo não dependem do que já foi desenhado (o fontkit guarda os glifos por id)", () => {
  const fonte = create(readFileSync(INTER)).getVariation({ wght: 400 });
  const adaptada = adaptarFonte(fonte, "inter");
  // Desenhar o "á" (composto: "a" + acento) guardava o "a" sem código de caractere
  fonte.glyphForCodePoint(0xe1).path.toSVG();
  const glifos = adaptada.formatar("parágrafo", { liga: true, kern: true });
  assert.equal(glifos.reduce((soma, g) => soma + g.letras, 0), 9);
  assert.ok(glifos.every((g) => g.letras === 1));
  // E a quebra fica nos espaços
  const corrido = "Um texto de parágrafo comprido que precisa quebrar em várias linhas dentro da caixa desenhada.";
  const texto = { ...textoNovo(corrido, { tamanho: 20 }, "paragrafo"), caixa: { largura: 280, altura: 200 } };
  const d = disporTexto(texto, () => adaptada);
  assert.deepEqual(d.linhas.map((l) => corrido.slice(l.inicio, l.fim)), ["Um texto de parágrafo ", "comprido que precisa ", "quebrar em várias linhas ", "dentro da caixa desenhada."]);
});

test("ligadura e caractere fora do plano básico contam as unidades de UTF-16", () => {
  const adaptada = adaptarFonte(create(readFileSync(INTER)), "inter");
  const fi = adaptada.formatar("fi", { liga: true });
  assert.equal(fi.reduce((soma, g) => soma + g.letras, 0), 2);
  const fora = adaptada.formatar("a😀b", {});
  assert.equal(fora.reduce((soma, g) => soma + g.letras, 0), 4);
});
