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

test("mosaico: cada quadrado do documento com a média dele", () => {
  const img = imagem(4, 2, [0, 0, 0, 255], [[1, 0, [200, 0, 0, 255]]]);
  const saida = aplicarFiltro(img, "mosaico", { tamanho: 2 }, ctx);
  assert.deepEqual(pixel(saida, 0, 1), [50, 0, 0, 255]);
  assert.deepEqual(pixel(saida, 3, 1), [0, 0, 0, 255]);
});

test("solarizar inverte só o que passa do meio", () => {
  const img = imagem(2, 1, [60, 60, 60, 255], [[1, 0, [200, 200, 200, 255]]]);
  const saida = aplicarFiltro(img, "solarizar", {}, ctx);
  assert.deepEqual(pixel(saida, 0, 0), [60, 60, 60, 255]);
  assert.deepEqual(pixel(saida, 1, 0), [55, 55, 55, 255]);
});

test("o redemoinho e a esfera não mexem fora da elipse, e o desentrelaçar copia a linha vizinha", () => {
  const img = imagem(9, 9, [10, 20, 30, 255], [[0, 0, [250, 0, 0, 255]]]);
  assert.deepEqual(pixel(aplicarFiltro(img, "redemoinho", { angulo: 300 }, ctx), 0, 0), [250, 0, 0, 255]);
  assert.deepEqual(pixel(aplicarFiltro(img, "esfera", { quantidade: 100 }, ctx), 0, 0), [250, 0, 0, 255]);
  const linhas = imagem(1, 3, [0, 0, 0, 255], [[0, 0, [90, 90, 90, 255]], [0, 2, [30, 30, 30, 255]]]);
  assert.deepEqual(pixel(aplicarFiltro(linhas, "desentrelacar", { eliminar: "impares", criar: "interpolacao" }, ctx), 0, 1), [60, 60, 60, 255]);
});

test("encontrar bordas deixa o liso branco", () => {
  const img = imagem(5, 5, [80, 120, 40, 255]);
  assert.deepEqual(pixel(aplicarFiltro(img, "encontrar_bordas", {}, ctx), 2, 2), [255, 255, 255, 255]);
});

test("desfoque de lente: a íris vale 1 nos cantos e no meio dos lados, e a curvatura 100 é o círculo", async () => {
  const { normaDaIris } = await import("./lente.ts");
  const hexagono = normaDaIris(6, 0, 0);
  // Os cantos ficam no círculo de raio 1; o meio dos lados, no apótema
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 - Math.PI / 2;
    assert.ok(Math.abs(hexagono(Math.cos(a), Math.sin(a)) - 1) < 1e-9);
  }
  assert.ok(Math.abs(hexagono(Math.cos(Math.PI / 6 - Math.PI / 2) * Math.cos(Math.PI / 6), Math.sin(Math.PI / 6 - Math.PI / 2) * Math.cos(Math.PI / 6)) - 1) < 1e-9);
  assert.ok(Math.abs(normaDaIris(5, 100, 30)(0.3, 0.4) - 0.5) < 1e-9);
});

test("desfoque de lente sem mapa espalha o ponto num disco, sem perder a soma", () => {
  const ponto = imagem(41, 41, [0, 0, 0, 0], [[20, 20, [255, 255, 255, 255]]]);
  const saida = aplicarFiltro(ponto, "lente", { fonte: "nenhuma", raio: 6, iris: "circulo" }, ctx);
  assert.ok(Math.abs(soma(saida, 3) - 255) <= 40, `alfa somou ${soma(saida, 3)}`);
  assert.ok(pixel(saida, 24, 20)[3] > 0 && pixel(saida, 30, 20)[3] === 0);
});

test("desfoque de lente com mapa: o nítido fica, e não vaza para o fundo borrado", () => {
  // Fundo preto; à esquerda (profundidade 0, no foco) um ponto branco; à direita (profundidade 1) borrado
  const img = imagem(30, 21, [0, 0, 0, 255], [[13, 10, [255, 255, 255, 255]], [24, 10, [255, 255, 255, 255]]]);
  const mapa = new Float32Array(30 * 21).map((_, p) => (p % 30 >= 15 ? 1 : 0));
  const saida = aplicarFiltro(img, "lente", { fonte: "mascara", raio: 6, focal: 0, iris: "circulo" }, { ...ctx, mapa: () => mapa });
  assert.deepEqual(pixel(saida, 13, 10), [255, 255, 255, 255]);
  // Logo depois da divisa, no borrado, o ponto nítido não chega
  assert.deepEqual(pixel(saida, 16, 10), [0, 0, 0, 255]);
  // O ponto do borrado se espalha e perde força
  assert.ok(pixel(saida, 24, 10)[0] < 128 && pixel(saida, 27, 10)[0] > 0);
});

test("galeria de desfoque: os alfinetes vão e voltam pelo texto", async () => {
  const { pinosDoTexto, textoDosPinos } = await import("./galeria.ts");
  const iris = [{ x: 50, y: 40.5, rx: 120, ry: 80, giro: 15, arredondado: 60, nitida: 50, desfoque: 12 }];
  assert.deepEqual(pinosDoTexto("iris", textoDosPinos("iris", iris)), iris);
  const caminho = [{ pontos: [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 20 }], velocidade: 40, afunilar: 25 }];
  assert.deepEqual(pinosDoTexto("caminho", textoDosPinos("caminho", caminho)), caminho);
  // Texto estragado vira nada, sem lançar erro
  assert.deepEqual(pinosDoTexto("campo", "1,2;abc;;3"), []);
});

test("galeria de desfoque: a íris e a inclinação deixam o meio nítido e borram longe", async () => {
  const { desfoqueNoPonto } = await import("./galeria.ts");
  const documento = { largura: 200, altura: 100 };
  const vazia = { campo: [], iris: [], inclinacao: [], caminho: [], giro: [] };
  const iris = desfoqueNoPonto({ ...vazia, iris: [{ x: 50, y: 50, rx: 40, ry: 20, giro: 0, arredondado: 100, nitida: 50, desfoque: 10 }] }, documento)!;
  assert.equal(iris(100, 50), 0);
  assert.equal(iris(0, 0), 10);
  assert.ok(iris(135, 50) > 0 && iris(135, 50) < 10);
  const inclinacao = desfoqueNoPonto({ ...vazia, inclinacao: [{ x: 50, y: 50, angulo: 0, nitida: 10, transicao: 20, desfoque: 8 }] }, documento)!;
  assert.equal(inclinacao(10, 55), 0);
  assert.equal(inclinacao(10, 95), 8);
  // Um alfinete de campo só: o mesmo desfoque em tudo; o campo e a íris juntos ficam no maior
  assert.equal(desfoqueNoPonto({ ...vazia, campo: [{ x: 0, y: 0, desfoque: 3 }] }, documento)!(150, 80), 3);
  assert.equal(desfoqueNoPonto({ ...vazia, campo: [{ x: 0, y: 0, desfoque: 3 }], iris: [{ x: 50, y: 50, rx: 40, ry: 20, giro: 0, arredondado: 100, nitida: 50, desfoque: 10 }] }, documento)!(100, 50), 3);
});

test("galeria de desfoque: o giro não mexe fora da elipse, e o caminho borra só na direção dele", () => {
  const doc = { ...ctx, documento: { largura: 31, altura: 31 } };
  const ponto = imagem(31, 31, [0, 0, 0, 0], [[15, 15, [255, 255, 255, 255]], [2, 2, [255, 255, 255, 255]]]);
  const giro = aplicarFiltro(ponto, "galeria", { giro: "50,50,10,10,0,90,0" }, doc);
  assert.deepEqual(pixel(giro, 2, 2), [255, 255, 255, 255]);
  const anel = imagem(31, 31, [0, 0, 0, 0], [[20, 15, [255, 255, 255, 255]]]);
  const girado = aplicarFiltro(anel, "galeria", { giro: "50,50,10,10,0,90,0" }, doc);
  assert.ok(pixel(girado, 20, 15)[3] < 255 && pixel(girado, 19, 18)[3] > 0);
  const caminho = aplicarFiltro(ponto, "galeria", { caminho: "0 50 100 50|10|0" }, doc);
  assert.ok(pixel(caminho, 19, 15)[3] > 0);
  assert.equal(pixel(caminho, 15, 18)[3], 0);
});
