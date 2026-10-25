import assert from "node:assert/strict";
import { test } from "node:test";

import { CORES_DO_GRAFICO, dadosDoTexto, elementosDoGrafico, escalaBonita, type Grafico, TIPOS_DE_GRAFICO } from "./graficos.ts";

const base: Grafico = { tipo: "colunas", rotulos: ["Jan", "Fev", "Mar"], series: [{ nome: "A", valores: [10, 20, 30] }, { nome: "B", valores: [5, 15, 25] }], caixa: { x: 0, y: 0, largura: 400, altura: 300 }, legenda: true, cores: CORES_DO_GRAFICO };
const formas = (g: Grafico) => elementosDoGrafico(g).filter((e) => e.tipo === "forma");
const caixaDe = (sub: { nos: { x: number; y: number }[] }) => {
  const xs = sub.nos.map((n) => n.x);
  const ys = sub.nos.map((n) => n.y);
  return { largura: Math.max(...xs) - Math.min(...xs), altura: Math.max(...ys) - Math.min(...ys), y1: Math.max(...ys) };
};

test("a escala redonda e a tabela colada", () => {
  assert.deepEqual(escalaBonita(0, 87), { min: 0, max: 100, passo: 20 });
  assert.deepEqual(escalaBonita(-3, 7), { min: -4, max: 8, passo: 2 });
  assert.deepEqual(dadosDoTexto("\tVendas;Custos\nJan;1.200,5;800\nFev;900;700"), { rotulos: ["Jan", "Fev"], series: [{ nome: "Vendas", valores: [1200.5, 900] }, { nome: "Custos", valores: [800, 700] }] });
});

test("colunas: uma forma por série, a altura proporcional ao valor e todas no mesmo chão", () => {
  const serieA = formas(base).find((e) => e.tipo === "forma" && e.nome === "A");
  assert.ok(serieA && serieA.tipo === "forma");
  const [jan, fev, mar] = serieA.caminhos.map(caixaDe);
  assert.ok(Math.abs(fev.altura / jan.altura - 2) < 1e-6 && Math.abs(mar.altura / jan.altura - 3) < 1e-6);
  assert.ok(Math.abs(jan.y1 - mar.y1) < 1e-6);
  // Empilhadas: a de cima começa onde a de baixo acaba
  const empilhadas = formas({ ...base, tipo: "colunasEmpilhadas" });
  const a = empilhadas.find((e) => e.tipo === "forma" && e.nome === "A")!;
  const b = empilhadas.find((e) => e.tipo === "forma" && e.nome === "B")!;
  if (a.tipo === "forma" && b.tipo === "forma") assert.ok(Math.abs(caixaDe(b.caminhos[0]).y1 - Math.min(...a.caminhos[0].nos.map((n) => n.y))) < 1e-6);
});

test("todos os tipos desenham, sem passar do retângulo", () => {
  for (const { id } of TIPOS_DE_GRAFICO) {
    const elementos = elementosDoGrafico({ ...base, tipo: id });
    assert.ok(elementos.some((e) => e.tipo === "forma"), id);
    const nos = elementos.flatMap((e) => (e.tipo === "forma" ? e.caminhos.flatMap((s) => s.nos) : []));
    assert.ok(nos.every((n) => n.x >= -1 && n.x <= 401 && n.y >= -1 && n.y <= 301), id);
  }
  // A linha: o traço sem preenchimento e as marcas à parte
  const linha = formas({ ...base, tipo: "linha" }).find((e) => e.nome === "A");
  assert.ok(linha && linha.tipo === "forma" && linha.cor === null && linha.traco);
  // A pizza: uma forma por categoria, e o nome de cada série embaixo da pizza dela
  assert.deepEqual(formas({ ...base, tipo: "pizza", legenda: false }).map((e) => e.nome), ["Jan", "Fev", "Mar"]);
  assert.deepEqual(elementosDoGrafico({ ...base, tipo: "pizza", legenda: false }).filter((e) => e.tipo === "texto").map((e) => e.tipo === "texto" && e.texto), ["A", "B"]);
  // O radar: os nomes das categorias em volta
  assert.equal(elementosDoGrafico({ ...base, tipo: "radar", legenda: false }).filter((e) => e.tipo === "texto").length, 3);
});
