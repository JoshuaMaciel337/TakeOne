import assert from "node:assert/strict";
import { test } from "node:test";

import { cantosDaMalha, dividirMalha, inversaDoMapa, malhaDoEstilo, malhaDoQuad, mapaDaMalha, moverPontoDaMalha } from "./deformar.ts";
import { homografia, quadDoRetangulo } from "./malha.ts";

const quad = quadDoRetangulo(200, 100, 300, 120, 10);
const perto = (a: number, b: number, tolerancia = 1e-6) => assert.ok(Math.abs(a - b) < tolerancia, `${a} != ${b}`);

test("um retalho só repete o quadrilátero", () => {
  const mapa = mapaDaMalha(malhaDoQuad(quad));
  const reto = homografia(quad);
  for (const [u, v] of [[0, 0], [0.3, 0.7], [1, 1], [0.5, 0.5]]) {
    perto(mapa(u, v).x, reto(u, v).x);
    perto(mapa(u, v).y, reto(u, v).y);
  }
});

test("dividir não muda a forma, e os cantos continuam nos cantos", () => {
  // Uma malha já deformada: um ponto do meio puxado
  const deformada = moverPontoDaMalha(malhaDoQuad(quad), 5, { x: 40, y: -30 });
  const antes = mapaDaMalha(deformada);
  const dividida = dividirMalha(dividirMalha(deformada, 0.3, null), null, 0.6);
  assert.deepEqual(dividida.cortesU, [0, 0.3, 1]);
  assert.deepEqual(dividida.cortesV, [0, 0.6, 1]);
  assert.equal(dividida.pontos.length, 7 * 7);
  const depois = mapaDaMalha(dividida);
  for (const [u, v] of [[0.1, 0.2], [0.3, 0.6], [0.55, 0.9], [0.95, 0.05]]) {
    perto(depois(u, v).x, antes(u, v).x, 1e-9);
    perto(depois(u, v).y, antes(u, v).y, 1e-9);
  }
  const cantos = cantosDaMalha(dividida).map((i) => dividida.pontos[i]);
  perto(cantos[2].x, quad[2].x);
  // Em cruz, de novo no mesmo lugar, não duplica
  assert.equal(dividirMalha(dividida, 0.3, 0.6).pontos.length, 49);
});

test("arrastar um ponto de ancoragem leva as alças em volta; uma alça anda sozinha", () => {
  const dividida = dividirMalha(malhaDoQuad(quad), 0.5, null);
  // Na linha de cima, o ponto 3 é o canto do meio (ancoragem)
  const movida = moverPontoDaMalha(dividida, 3, { x: 0, y: 10 });
  perto(movida.pontos[2].y, dividida.pontos[2].y + 10);
  perto(movida.pontos[4].y, dividida.pontos[4].y + 10);
  const alca = moverPontoDaMalha(dividida, 1, { x: 5, y: 0 });
  perto(alca.pontos[0].x, dividida.pontos[0].x);
});

test("os estilos: sem dobra é o quadrilátero; o arco levanta o meio e não os cantos", () => {
  const reto = homografia(quadDoRetangulo(0, 0, 200, 100, 0));
  const plano = mapaDaMalha(malhaDoEstilo(quadDoRetangulo(0, 0, 200, 100, 0), { estilo: "arco", vertical: false, dobra: 0, distorcaoH: 0, distorcaoV: 0 }));
  perto(plano(0.4, 0.3).x, reto(0.4, 0.3).x, 1e-6);
  perto(plano(0.4, 0.3).y, reto(0.4, 0.3).y, 1e-6);
  const arco = mapaDaMalha(malhaDoEstilo(quadDoRetangulo(0, 0, 200, 100, 0), { estilo: "arco", vertical: false, dobra: 0.5, distorcaoH: 0, distorcaoV: 0 }));
  // O meio de cima sobe um quarto da altura (dobra 0,5 × 0,5 do meio-quadrado, que tem meia altura de 50)
  perto(arco(0.5, 0).y, -50 - 12.5, 1e-6);
  perto(arco(0, 0).y, -50, 1e-6);
  // Na vertical, o arco anda para o lado
  const deitado = mapaDaMalha(malhaDoEstilo(quadDoRetangulo(0, 0, 200, 100, 0), { estilo: "arco", vertical: true, dobra: 0.5, distorcaoH: 0, distorcaoV: 0 }));
  assert.ok(deitado(0, 0.5).x < -100);
});

test("a inversa do mapa acha o ponto da imagem", () => {
  const malha = moverPontoDaMalha(malhaDoQuad(quad), 6, { x: 20, y: 15 });
  const mapa = mapaDaMalha(malha);
  const alvo = mapa(0.37, 0.81);
  const achado = inversaDoMapa(mapa, alvo);
  perto(achado.u, 0.37, 1e-5);
  perto(achado.v, 0.81, 1e-5);
});
