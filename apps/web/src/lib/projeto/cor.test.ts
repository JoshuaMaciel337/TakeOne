import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  AJUSTES_NEUTROS,
  type AjustesCor,
  ajustesEfetivos,
  aplicarCor,
  aplicarCurvas,
  type Cor,
  type Curvas,
  curvasNeutras,
  escurecimentoDaVinheta,
  type PontoDaCurva,
  tabelaDasCurvas,
  valorDaCurva,
} from "./cor.ts";

type Dados = {
  casos: { nome: string; ajustes: Partial<AjustesCor>; entrada: [number, number, number]; saida: [number, number, number] }[];
  vinhetas: { u: number; v: number; vinheta: number; escurecimento: number }[];
  filtros: { cor: Cor; ajustes: AjustesCor }[];
};

// Calculados pelo core/utils/cor.py, que gera a LUT do render
const dados = JSON.parse(readFileSync(new URL("../../../../../tests/casos/cor.json", import.meta.url), "utf-8")) as Dados;

test("a conta da cor é a mesma do render, em todos os casos", () => {
  for (const caso of dados.casos) {
    const saida = aplicarCor(caso.entrada, { ...AJUSTES_NEUTROS, ...caso.ajustes });
    saida.forEach((valor, i) => assert.ok(Math.abs(valor - caso.saida[i]) < 1e-6, `${caso.nome}: ${saida} ≠ ${caso.saida}`));
  }
});

test("vinheta e filtros iguais aos do render", () => {
  for (const caso of dados.vinhetas) {
    assert.ok(Math.abs(escurecimentoDaVinheta(caso.u, caso.v, caso.vinheta) - caso.escurecimento) < 1e-9, JSON.stringify(caso));
  }
  for (const caso of dados.filtros) {
    const efetivos = ajustesEfetivos(caso.cor);
    for (const chave of Object.keys(caso.ajustes) as (keyof AjustesCor)[]) {
      assert.ok(Math.abs(efetivos[chave] - caso.ajustes[chave]) < 1e-9, `${chave}: ${efetivos[chave]} ≠ ${caso.ajustes[chave]}`);
    }
  }
});

test("conferido à mão: neutro não muda, preto e branco vira a luminância, contraste afasta do cinza médio", () => {
  assert.deepEqual(aplicarCor([0.2, 0.4, 0.6], AJUSTES_NEUTROS).map((v) => Number(v.toFixed(12))), [0.2, 0.4, 0.6]);
  const cinza = 0.2126 * 0.2 + 0.7152 * 0.4 + 0.0722 * 0.6;
  aplicarCor([0.2, 0.4, 0.6], { ...AJUSTES_NEUTROS, saturacao: -1 }).forEach((v) => assert.ok(Math.abs(v - cinza) < 1e-9));
  const contraste = aplicarCor([0.2, 0.4, 0.6], { ...AJUSTES_NEUTROS, contraste: 0.5 });
  [0.05, 0.35, 0.65].forEach((esperado, i) => assert.ok(Math.abs(contraste[i] - esperado) < 1e-9));
  assert.equal(escurecimentoDaVinheta(0.5, 0.5, 1), 0);
  assert.equal(escurecimentoDaVinheta(0, 0, 0.7), 0.7);
});

// Os mesmos casos de curvas que tests/test_cor.py confere no render
const curvas = JSON.parse(readFileSync(new URL("../../../../../tests/casos/curvas.json", import.meta.url), "utf-8")) as {
  casos: { nome: string; pontos: PontoDaCurva[]; x: number[]; y: number[] }[];
  composta: { curvas: Curvas; rgb: [number, number, number]; esperado: number[] };
};

for (const caso of curvas.casos) {
  test(`curva: ${caso.nome}`, () => {
    caso.x.forEach((x, i) => assert.ok(Math.abs(valorDaCurva(caso.pontos, x) - caso.y[i]) < 1e-12, `${x}`));
  });
}

test("curvas: a geral nos três canais, depois a de cada um; a tabela do shader segue a conta", () => {
  const { composta } = curvas;
  aplicarCurvas(composta.rgb, composta.curvas).forEach((v, i) => assert.ok(Math.abs(v - composta.esperado[i]) < 1e-12));
  const tabela = tabelaDasCurvas(composta.curvas);
  const [r, g, b] = aplicarCurvas([128 / 255, 128 / 255, 128 / 255], composta.curvas);
  assert.deepEqual([...tabela.slice(128 * 4, 128 * 4 + 4)], [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255]);
  assert.ok(curvasNeutras({ rgb: [[0, 0], [1, 1]] }) && curvasNeutras(null));
});
