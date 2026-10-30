import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { expandirParaDesenhar } from "./fundoDesfocado.ts";
import { caixaDoClipe } from "./geometria.ts";
import { comOsLayouts, copiasDoLayout, quadroDaProporcao, SUFIXO_DO_LAYOUT } from "./layoutDaCena.ts";
import type { Clipe, Projeto } from "./modelo.ts";

// Os mesmos casos que tests/test_layout_da_cena.py confere no render
type Caso = { nome: string; clipe: Clipe; midia: { largura: number; altura: number }; proporcao: string; embaixo: Partial<Clipe>; acima: Partial<Clipe> };
const { casos } = JSON.parse(readFileSync(new URL("../../../../../tests/casos/layout.json", import.meta.url), "utf-8")) as { casos: Caso[] };

function perto(atual: unknown, esperado: unknown, onde: string) {
  if (esperado !== null && typeof esperado === "object") {
    for (const [chave, valor] of Object.entries(esperado)) perto((atual as Record<string, unknown>)?.[chave], valor, `${onde}.${chave}`);
  } else if (typeof esperado === "number") {
    assert.ok(typeof atual === "number" && Math.abs(atual - esperado) < 1e-9, `${onde}: ${atual} ≠ ${esperado}`);
  } else assert.equal(atual ?? null, esperado, onde);
}

test("as cópias de cada layout são as do render", () => {
  for (const caso of casos) {
    const copias = copiasDoLayout(caso.clipe, caso.midia, quadroDaProporcao(caso.proporcao));
    assert.ok(copias, caso.nome);
    perto(copias.embaixo, caso.embaixo, `${caso.nome} embaixo`);
    perto(copias.acima, caso.acima, `${caso.nome} acima`);
  }
});

test("no dividido, as duas partes cobrem o quadro e se encostam", () => {
  for (const caso of casos.filter((c) => c.clipe.layout?.tipo !== "caber")) {
    const quadro = quadroDaProporcao(caso.proporcao);
    const { embaixo, acima } = copiasDoLayout(caso.clipe, caso.midia, quadro)!;
    const [a, b] = [embaixo, acima].map((copia) => caixaDoClipe(copia.transformacao, copia.recorte, caso.midia, quadro));
    for (const caixa of [a, b]) assert.ok(Math.abs(caixa.largura - quadro.largura) < 1e-9, caso.nome);
    assert.ok(Math.abs(a.cy - a.altura / 2) < 1e-9, `${caso.nome}: a de cima encosta no topo`);
    assert.ok(Math.abs(a.cy + a.altura / 2 - (b.cy - b.altura / 2)) < 1e-9, `${caso.nome}: as duas se encostam`);
    assert.ok(Math.abs(b.cy + b.altura / 2 - quadro.altura) < 1e-9, `${caso.nome}: a de baixo encosta na base`);
  }
});

const clipe = (id: string, extra: Partial<Clipe> = {}): Clipe =>
  ({
    id,
    midia_id: "m",
    inicio: 0,
    duracao: 10,
    entrada: 0,
    velocidade: 1,
    volume: 1,
    transformacao: { x: 0.2, y: 0, escala: 1.7, rotacao: 0, opacidade: 1 },
    recorte: { x: 0, y: 0, largura: 1, altura: 1 },
    ...extra,
  }) as Clipe;

test("a faixa de cima recebe as cópias sem som; sem o tamanho da mídia, nada muda", () => {
  const projeto = {
    proporcao: "9:16",
    faixas: [
      { id: "t", tipo: "texto", oculta: false, muda: false, travada: false, clipes: [] },
      { id: "p", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [clipe("a", { layout: { tipo: "caber", desfoque: 0.5 } }), clipe("b")] },
    ],
  } as unknown as Projeto;
  const desenhado = comOsLayouts(projeto, () => ({ largura: 1920, altura: 1080 }));
  assert.deepEqual(
    desenhado.faixas.map((faixa) => [faixa.id, faixa.tipo]),
    [
      ["t", "texto"],
      [`p${SUFIXO_DO_LAYOUT}`, "video"],
      ["p", "principal"],
    ],
  );
  assert.equal(desenhado.faixas[1].clipes[0].som_separado, true);
  assert.equal(desenhado.faixas[2].clipes[0].efeito?.tipo, "desfoque");
  assert.equal(desenhado.faixas[2].clipes[1], projeto.faixas[1].clipes[1]);
  assert.deepEqual(comOsLayouts(projeto, () => null).faixas, projeto.faixas);
  // A prévia e a exportação passam pela expansão de sempre, com o tamanho das mídias
  assert.equal(expandirParaDesenhar(projeto, () => ({ largura: 1920, altura: 1080 })).faixas.length, 3);
  assert.equal(expandirParaDesenhar(projeto).faixas.length, 2);
});
