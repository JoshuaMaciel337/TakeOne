import assert from "node:assert/strict";
import { test } from "node:test";

import { FILTROS, valoresDoFiltro } from "./catalogo.ts";
import type { ContextoDoFiltro, ImagemDoFiltro } from "./comum.ts";
import { aplicarFiltro, aplicarPilha, margemDaPilha, mesclarResultado } from "./pilha.ts";

const ctx: ContextoDoFiltro = { escala: 1, primeiroPlano: [0, 0, 0], fundo: [1, 1, 1], origem: { x: 0, y: 0 }, documento: { largura: 9, altura: 9 } };
/** Uma imagem l × a de uma cor (RGBA de 0 a 255, opaca), com pixels trocados. */
function imagem(l: number, a: number, cor: number[], trocas: [number, number, number[]][] = []): ImagemDoFiltro {
  const dados = new Uint8ClampedArray(l * a * 4);
  for (let p = 0; p < l * a; p++) dados.set(cor, p * 4);
  for (const [x, y, c] of trocas) dados.set(c, (y * l + x) * 4);
  return { largura: l, altura: a, dados };
}
const pixel = (img: ImagemDoFiltro, x: number, y: number) => [...img.dados.slice((y * img.largura + x) * 4, (y * img.largura + x) * 4 + 4)];
const soma = (img: ImagemDoFiltro, k: number) => img.dados.reduce((s, v, i) => (i % 4 === k ? s + v : s), 0);

test("todos os filtros rodam com os padrões e devolvem uma imagem do mesmo tamanho", () => {
  const base = imagem(9, 9, [100, 150, 200, 255], [[4, 4, [255, 0, 0, 255]]]);
  for (const definicao of FILTROS) {
    const saida = aplicarFiltro(base, definicao.id, valoresDoFiltro(definicao), ctx);
    assert.equal(saida.dados.length, base.dados.length, definicao.id);
    assert.ok(saida.dados.every((v) => Number.isFinite(v)), definicao.id);
  }
});

test("o gaussiano espalha um ponto sem perder a soma (longe da borda)", () => {
  const ponto = imagem(31, 31, [0, 0, 0, 0], [[15, 15, [255, 255, 255, 255]]]);
  const saida = aplicarFiltro(ponto, "gaussiano", { raio: 2 }, ctx);
  assert.ok(Math.abs(soma(saida, 3) - 255) <= 25, `alfa somou ${soma(saida, 3)}`);
  assert.ok(pixel(saida, 15, 15)[3] < 255 && pixel(saida, 17, 15)[3] > 0);
});

test("o desfoque de movimento horizontal não espalha na vertical", () => {
  const ponto = imagem(31, 31, [0, 0, 0, 0], [[15, 15, [255, 255, 255, 255]]]);
  const saida = aplicarFiltro(ponto, "movimento", { angulo: 0, distancia: 10 }, ctx);
  assert.ok(pixel(saida, 19, 15)[3] > 0);
  assert.equal(pixel(saida, 15, 18)[3], 0);
});

test("a média pinta a camada com a cor média", () => {
  const img = imagem(2, 1, [0, 0, 0, 255], [[1, 0, [200, 100, 0, 255]]]);
  const saida = aplicarFiltro(img, "media", {}, ctx);
  assert.deepEqual(pixel(saida, 0, 0), [100, 50, 0, 255]);
});

test("a mediana tira o pixel solto", () => {
  const img = imagem(5, 5, [50, 50, 50, 255], [[2, 2, [255, 255, 255, 255]]]);
  assert.deepEqual(pixel(aplicarFiltro(img, "mediana", { raio: 1 }, ctx), 2, 2), [50, 50, 50, 255]);
});

test("o ruído é o mesmo no mesmo ponto do documento, venha de onde vier a imagem", () => {
  const img = imagem(4, 1, [128, 128, 128, 255]);
  const a = aplicarFiltro(img, "adicionar_ruido", { quantidade: 50 }, ctx);
  const b = aplicarFiltro(imagem(2, 1, [128, 128, 128, 255]), "adicionar_ruido", { quantidade: 50 }, { ...ctx, origem: { x: 2, y: 0 } });
  assert.deepEqual(pixel(b, 0, 0), pixel(a, 2, 0));
  assert.notDeepEqual(pixel(a, 0, 0), [128, 128, 128, 255]);
});

test("máximo cresce o claro; deslocamento anda; cor para alfa tira o branco", () => {
  const img = imagem(5, 5, [0, 0, 0, 255], [[2, 2, [255, 255, 255, 255]]]);
  assert.deepEqual(pixel(aplicarFiltro(img, "maximo", { raio: 1 }, ctx), 1, 1), [255, 255, 255, 255]);
  assert.deepEqual(pixel(aplicarFiltro(img, "deslocamento", { horizontal: 1, vertical: 0 }, ctx), 3, 2), [255, 255, 255, 255]);
  const branco = aplicarFiltro(imagem(1, 1, [255, 255, 255, 255]), "cor_para_alfa", { cor: "#ffffff" }, ctx);
  assert.equal(pixel(branco, 0, 0)[3], 0);
});

test("HSB e de volta dá a mesma cor", () => {
  const img = imagem(1, 1, [200, 80, 30, 255]);
  const ida = aplicarFiltro(img, "hsb_hsl", { entrada: "rgb", saida: "hsb" }, ctx);
  const volta = aplicarFiltro(ida, "hsb_hsl", { entrada: "hsb", saida: "rgb" }, ctx);
  pixel(volta, 0, 0).forEach((v, k) => assert.ok(Math.abs(v - [200, 80, 30, 255][k]) <= 2));
});

test("a mesclagem do filtro: opacidade 0 devolve o que chegou; normal a 50% fica no meio", () => {
  const antes = imagem(1, 1, [0, 0, 0, 255]);
  const depois = imagem(1, 1, [200, 200, 200, 255]);
  assert.deepEqual(pixel(mesclarResultado(antes, depois, "normal", 0), 0, 0), [0, 0, 0, 255]);
  assert.deepEqual(pixel(mesclarResultado(antes, depois, "normal", 0.5), 0, 0), [100, 100, 100, 255]);
  const pilha = aplicarPilha(antes, [{ id: "a", tipo: "inexistente", opcoes: {}, ligado: true, modo: "normal", opacidade: 1 }], ctx);
  assert.deepEqual(pixel(pilha, 0, 0), [0, 0, 0, 255]);
  assert.equal(margemDaPilha([{ id: "a", tipo: "gaussiano", opcoes: { raio: 4 }, ligado: true, modo: "normal", opacidade: 1 }]), 12);
});
