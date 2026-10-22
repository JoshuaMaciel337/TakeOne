import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ajustarAsGuias, type Caixa, caixaDoClipe, caixaDoTexto, contemPonto, deslocamentoDoCentro, limitesDaCaixa, recorteNaFonte } from "./geometria.ts";
import type { Recorte, Transformacao, Virar } from "./modelo.ts";

type Caso = {
  nome: string;
  midia: { largura: number; altura: number };
  quadro: { largura: number; altura: number };
  transformacao: Transformacao;
  recorte: Recorte;
  caixa: Caixa;
};

// Os mesmos casos que tests/test_geometria.py confere no render
type CasoTexto = Omit<Caso, "midia" | "recorte"> & { imagem: { largura: number; altura: number } };
const { casos, casos_texto: casosTexto, casos_virar: casosVirar } = JSON.parse(readFileSync(new URL("../../../../../tests/casos/geometria.json", import.meta.url), "utf-8")) as {
  casos: Caso[];
  casos_texto: CasoTexto[];
  casos_virar: { nome: string; recorte: Recorte; virar: Virar | null; fonte: Recorte }[];
};

for (const caso of casosVirar) {
  test(`recorte do clipe virado: ${caso.nome}`, () => {
    const fonte = recorteNaFonte(caso.recorte, caso.virar);
    for (const chave of Object.keys(caso.fonte) as (keyof Recorte)[]) assert.ok(Math.abs(fonte[chave] - caso.fonte[chave]) < 1e-12, chave);
  });
}

for (const caso of casosTexto) {
  test(`caixa do texto: ${caso.nome}`, () => {
    const caixa = caixaDoTexto(caso.transformacao, caso.imagem, caso.quadro);
    for (const chave of Object.keys(caso.caixa) as (keyof Caixa)[]) {
      assert.ok(Math.abs(caixa[chave] - caso.caixa[chave]) < 1e-9, `${chave}: ${caixa[chave]} ≠ ${caso.caixa[chave]}`);
    }
  });
}

for (const caso of casos) {
  test(`caixa do clipe: ${caso.nome}`, () => {
    const caixa = caixaDoClipe(caso.transformacao, caso.recorte, caso.midia, caso.quadro);
    for (const chave of Object.keys(caso.caixa) as (keyof Caixa)[]) {
      assert.ok(Math.abs(caixa[chave] - caso.caixa[chave]) < 1e-9, `${chave}: ${caixa[chave]} ≠ ${caso.caixa[chave]}`);
    }
  });
}

const QUADRO = { largura: 1080, altura: 1920 };

test("o deslocamento do centro desfaz a conta da caixa", () => {
  const t = { x: 0.13, y: -0.4, escala: 0.7, rotacao: 12, opacidade: 1 };
  const caixa = caixaDoClipe(t, { x: 0, y: 0, largura: 1, altura: 1 }, { largura: 1280, altura: 720 }, QUADRO);
  const volta = deslocamentoDoCentro({ x: caixa.cx, y: caixa.cy }, QUADRO);
  assert.ok(Math.abs(volta.x - t.x) < 1e-12 && Math.abs(volta.y - t.y) < 1e-12);
});

test("a caixa girada contém o centro e não contém o canto do retângulo sem giro", () => {
  const caixa: Caixa = { cx: 500, cy: 500, largura: 400, altura: 100, rotacao: 90, opacidade: 1 };
  assert.ok(contemPonto(caixa, { x: 500, y: 500 }));
  assert.ok(contemPonto(caixa, { x: 500, y: 690 }), "girada 90°, ela fica em pé");
  assert.ok(!contemPonto(caixa, { x: 690, y: 500 }));
  const limites = limitesDaCaixa(caixa);
  assert.ok(Math.abs(limites.esquerda - 450) < 1e-9 && Math.abs(limites.base - 700) < 1e-9);
});

test("ímã da prévia encosta no centro e nas bordas do quadro", () => {
  const perto: Caixa = { cx: 545, cy: 300, largura: 200, altura: 200, rotacao: 0, opacidade: 1 };
  assert.deepEqual(ajustarAsGuias(perto, QUADRO, 8), { dx: -5, dy: 0, guias: { verticais: [540], horizontais: [] } });

  const naBorda: Caixa = { cx: 103, cy: 1815, largura: 200, altura: 200, rotacao: 0, opacidade: 1 };
  assert.deepEqual(ajustarAsGuias(naBorda, QUADRO, 8), { dx: -3, dy: 5, guias: { verticais: [0], horizontais: [1920] } });

  const longe: Caixa = { cx: 300, cy: 300, largura: 200, altura: 200, rotacao: 0, opacidade: 1 };
  assert.deepEqual(ajustarAsGuias(longe, QUADRO, 8).guias, { verticais: [], horizontais: [] });
});
