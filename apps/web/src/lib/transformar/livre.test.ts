import assert from "node:assert/strict";
import { test } from "node:test";

import { afimEntre, doReferencial, noReferencial, numerosDoQuad, quadDosNumeros, reamostrar, reamostrarPeloMapa, retificar, semelhanca } from "./livre.ts";
import { quadDoRetangulo, type Quadrilatero } from "./malha.ts";

const perto = (a: number, b: number, tolerancia = 1e-6) => assert.ok(Math.abs(a - b) < tolerancia, `${a} != ${b}`);
const CENTRO = { u: 0.5, v: 0.5 };

test("no começo, os números são 100%, 0° e o centro", () => {
  const inicial = quadDoRetangulo(50, 40, 80, 60, 0);
  const n = numerosDoQuad(inicial, inicial, CENTRO)!;
  perto(n.x, 50);
  perto(n.y, 40);
  perto(n.largura, 100);
  perto(n.altura, 100);
  perto(n.giro, 0);
  perto(n.inclinacaoH, 0);
  // A referência no canto de cima à esquerda
  perto(numerosDoQuad(inicial, inicial, { u: 0, v: 0 })!.x, 10);
});

test("números e quadrilátero vão e voltam, também numa caixa que começou girada", () => {
  for (const angulo of [0, 25]) {
    const inicial = quadDoRetangulo(100, 80, 60, 40, angulo);
    const numeros = { x: 120, y: 70, largura: 150, altura: 80, giro: 30, inclinacaoH: 12, inclinacaoV: 0 };
    const quad = quadDosNumeros(inicial, numeros, CENTRO);
    const volta = numerosDoQuad(inicial, quad, CENTRO)!;
    for (const chave of ["x", "y", "largura", "altura", "giro", "inclinacaoH"] as const) perto(volta[chave], numeros[chave], 1e-6);
  }
});

test("semelhança: girar e escalar por igual cabem na posição; esticar não; espelhar é reconhecido", () => {
  const inicial = quadDoRetangulo(0, 0, 10, 6, 0);
  const girado = quadDosNumeros(inicial, { x: 5, y: 5, largura: 200, altura: 200, giro: 30, inclinacaoH: 0, inclinacaoV: 0 }, CENTRO);
  const s = semelhanca(inicial, girado)!;
  perto(s.escala, 2);
  perto(s.giro, 30);
  assert.equal(s.espelhado, false);
  assert.equal(semelhanca(inicial, quadDosNumeros(inicial, { x: 0, y: 0, largura: 200, altura: 100, giro: 0, inclinacaoH: 0, inclinacaoV: 0 }, CENTRO)), null);
  const espelhado = quadDosNumeros(inicial, { x: 0, y: 0, largura: -100, altura: 100, giro: 0, inclinacaoH: 0, inclinacaoV: 0 }, CENTRO);
  const e = semelhanca(inicial, espelhado)!;
  assert.equal(e.espelhado, true);
  perto(e.escala, 1);
  // O centro vai para onde a transformação manda
  const levar = afimEntre(inicial, girado);
  const centro = levar({ x: 0, y: 0 });
  perto(centro.x, 5);
  perto(centro.y, 5);
});

test("o referencial da caixa repete a transformação noutra caixa", () => {
  const inicial = quadDoRetangulo(0, 0, 10, 10, 0);
  const final: Quadrilatero = [
    { x: -5, y: -5 },
    { x: 8, y: -4 },
    { x: 6, y: 7 },
    { x: -5, y: 5 },
  ];
  const normalizados = noReferencial(inicial, final);
  assert.deepEqual(normalizados[0], { x: 0, y: 0 });
  const outra = quadDoRetangulo(100, 100, 20, 20, 0);
  const repetida = doReferencial(outra, normalizados);
  perto(repetida[1].x, 90 + 13 * 2);
  perto(repetida[2].y, 90 + 12 * 2);
});

test("reamostrar: no mesmo lugar sai igual; um pixel para o lado anda junto", () => {
  const largura = 4;
  const altura = 3;
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let i = 0; i < largura * altura; i++) dados.set([i * 20, 255 - i * 20, 7, 255], i * 4);
  const mesmo: Quadrilatero = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ];
  for (const interpolacao of ["vizinho", "bilinear", "bicubica"] as const) {
    const saida = reamostrar({ dados, largura, altura }, mesmo, { largura, altura }, interpolacao);
    for (let i = 0; i < dados.length; i++) perto(saida[i], dados[i], 1.01);
  }
  const andado = reamostrar({ dados, largura, altura }, mesmo.map((p) => ({ x: p.x + 1, y: p.y })) as Quadrilatero, { largura: 5, altura }, "vizinho");
  assert.equal(andado[3], 0);
  assert.deepEqual([...andado.slice(4, 8)], [...dados.slice(0, 4)]);
});

test("reamostrar pelo mapa: um mapa que estica não deixa emenda (nenhum pixel meio transparente por dentro)", () => {
  const largura = 20;
  const altura = 10;
  const dados = new Uint8ClampedArray(largura * altura * 4).fill(255);
  // Uma onda: as divisões viram triângulos tortos
  const mapa = (u: number, v: number) => ({ x: 5 + u * 60 + Math.sin(v * 3) * 4, y: 3 + v * 30 + Math.sin(u * 5) * 3 });
  const saida = reamostrarPeloMapa({ dados, largura, altura }, mapa, { largura: 80, altura: 50 }, "vizinho", 16);
  // Por dentro (longe da borda), todo pixel está cheio
  let buracos = 0;
  for (let y = 10; y < 28; y++) for (let x = 15; x < 55; x++) if (saida[(y * 80 + x) * 4 + 3] !== 255) buracos++;
  assert.equal(buracos, 0);
});

test("retificar: o quadrilátero levado ao retângulo, e o retângulo inteiro é a própria imagem", () => {
  const largura = 8;
  const altura = 6;
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let i = 0; i < largura * altura; i++) dados.set([(i * 37) % 256, (i * 11) % 256, 9, 255], i * 4);
  const inteiro: Quadrilatero = [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 6 },
    { x: 0, y: 6 },
  ];
  const igual = retificar({ dados, largura, altura }, inteiro, largura, altura, "vizinho");
  assert.deepEqual([...igual], [...dados]);
  // A metade de baixo à direita, no dobro: cada pixel da fonte vira quatro
  const quarto: Quadrilatero = [
    { x: 4, y: 3 },
    { x: 8, y: 3 },
    { x: 8, y: 6 },
    { x: 4, y: 6 },
  ];
  const ampliado = retificar({ dados, largura, altura }, quarto, 8, 6, "vizinho");
  const fonte = (x: number, y: number) => [...dados.slice((y * largura + x) * 4, (y * largura + x) * 4 + 4)];
  assert.deepEqual([...ampliado.slice(0, 4)], fonte(4, 3));
  assert.deepEqual([...ampliado.slice((5 * 8 + 7) * 4, (5 * 8 + 7) * 4 + 4)], fonte(7, 5));
});
