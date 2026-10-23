import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ajustesDoEfeito, borraoDoEfeito, celulasDoPixelizar, colunasDoGrao, deslocamentoDoGrao, desvioDeCor, type Efeito, hash32, linhasDoEfeito, posicaoDaLuz, valoresDoGrao } from "./efeitos.ts";

// Os mesmos casos que tests/test_efeitos.py confere no render
const casos = JSON.parse(readFileSync(new URL("../../../../../tests/casos/efeitos.json", import.meta.url), "utf-8")) as {
  hash: [number, number][];
  glitch: { efeito: Efeito; quadros: number[]; desvios: number[] };
  vhs: { efeito: Efeito; desvio: number; linhas: number; ajustes: Record<string, number> };
  pixelizar: { intensidade: number; largura: number; altura: number; celulas: [number, number] }[];
};

test("hash de inteiros igual ao do render", () => {
  assert.deepEqual(
    casos.hash.map(([n]) => hash32(n)),
    casos.hash.map(([, h]) => h),
  );
});

test("glitch salta nos mesmos quadros que o render", () => {
  casos.glitch.quadros.forEach((q, i) => assert.ok(Math.abs(desvioDeCor(casos.glitch.efeito, q) - casos.glitch.desvios[i]) < 1e-12, `quadro ${q}`));
});

test("VHS: desvio fixo, linhas e cor iguais aos do render", () => {
  assert.equal(desvioDeCor(casos.vhs.efeito, 10), casos.vhs.desvio);
  assert.equal(linhasDoEfeito(casos.vhs.efeito), casos.vhs.linhas);
  assert.deepEqual(ajustesDoEfeito(casos.vhs.efeito), casos.vhs.ajustes);
});

test("grão e luz iguais aos do render", () => {
  const { grao, luz } = casos as unknown as {
    grao: { colunas: number; quadros: number[]; deslocamentos: [number, number][]; celulas: [number, number][] };
    luz: { segundos: number[]; posicoes: number[] };
  };
  assert.equal(colunasDoGrao(1080, 1920), grao.colunas);
  assert.deepEqual(
    grao.quadros.map((q) => deslocamentoDoGrao(q, grao.colunas)),
    grao.deslocamentos,
  );
  const valores = valoresDoGrao();
  assert.deepEqual(
    grao.celulas.map(([i]) => valores[i]),
    grao.celulas.map(([, v]) => v),
  );
  luz.segundos.forEach((s, i) => assert.ok(Math.abs(posicaoDaLuz(s) - luz.posicoes[i]) < 1e-12));
});

test("pixelizar: as mesmas células do render (tests/casos/efeitos.json)", () => {
  for (const caso of casos.pixelizar) {
    assert.deepEqual(celulasDoPixelizar({ tipo: "pixelizar", intensidade: caso.intensidade }, caso.largura, caso.altura), caso.celulas);
  }
});

test("zoom e giro: a força cresce com a intensidade, e os outros efeitos não borram", () => {
  assert.deepEqual(borraoDoEfeito({ tipo: "zoom", intensidade: 0.5 }), { tipo: "zoom", forca: 0.15 });
  assert.equal(borraoDoEfeito({ tipo: "giro", intensidade: 1 })?.forca, 0.35);
  assert.equal(borraoDoEfeito({ tipo: "desfoque", intensidade: 1 }), null);
});
