import assert from "node:assert/strict";
import { test } from "node:test";

import { caixaDoConteudo, gradeDaMarionete, levarPelosAlfinetes, mapaDaGrade } from "./marionete.ts";

const perto = (a: number, b: number, tolerancia = 1e-6) => assert.ok(Math.abs(a - b) < tolerancia, `${a} != ${b}`);

test("os alfinetes vão para onde foram postos; parados, nada muda", () => {
  const alfinetes = [
    { origem: { x: 0, y: 0 }, destino: { x: 0, y: 0 } },
    { origem: { x: 100, y: 0 }, destino: { x: 100, y: 0 } },
    { origem: { x: 50, y: 80 }, destino: { x: 50, y: 80 } },
  ];
  for (const modo of ["rigido", "normal", "distorcer"] as const) {
    const v = levarPelosAlfinetes({ x: 37, y: 21 }, alfinetes, modo);
    perto(v.x, 37);
    perto(v.y, 21);
  }
  const puxado = [...alfinetes.slice(0, 2), { origem: { x: 50, y: 80 }, destino: { x: 70, y: 90 } }];
  const alfinete = levarPelosAlfinetes({ x: 50, y: 80 }, puxado, "rigido");
  assert.deepEqual(alfinete, { x: 70, y: 90 });
});

test("girar todos os alfinetes juntos gira o resto, sem esticar no rígido", () => {
  const giro = (p: { x: number; y: number }) => ({ x: -p.y, y: p.x });
  const origens = [
    { x: 10, y: 0 },
    { x: -10, y: 5 },
    { x: 0, y: -12 },
  ];
  const alfinetes = origens.map((origem) => ({ origem, destino: giro(origem) }));
  for (const modo of ["rigido", "normal", "distorcer"] as const) {
    const v = levarPelosAlfinetes({ x: 4, y: 3 }, alfinetes, modo);
    perto(v.x, -3, 1e-6);
    perto(v.y, 4, 1e-6);
  }
  // Afastar dois alfinetes: o normal escala, o rígido mantém o tamanho
  const longe = [
    { origem: { x: -10, y: 0 }, destino: { x: -20, y: 0 } },
    { origem: { x: 10, y: 0 }, destino: { x: 20, y: 0 } },
  ];
  perto(levarPelosAlfinetes({ x: 0, y: 5 }, longe, "normal").y, 10, 1e-6);
  perto(levarPelosAlfinetes({ x: 0, y: 5 }, longe, "rigido").y, 5, 1e-6);
});

test("a grade e o mapa: sem alfinetes, o mapa é a própria caixa; a caixa do conteúdo com a expansão", () => {
  const caixa = { x0: 10, y0: 20, x1: 110, y1: 70 };
  const grade = gradeDaMarionete(caixa, 8, [], "rigido");
  const mapa = mapaDaGrade(grade, 8);
  const p = mapa(0.25, 0.5);
  perto(p.x, 35);
  perto(p.y, 45);
  const dados = new Uint8ClampedArray(20 * 10 * 4);
  dados[(4 * 20 + 6) * 4 + 3] = 255;
  dados[(6 * 20 + 9) * 4 + 3] = 255;
  assert.deepEqual(caixaDoConteudo(dados, 20, 10, 2), { x0: 4, y0: 2, x1: 12, y1: 9 });
  assert.equal(caixaDoConteudo(new Uint8ClampedArray(16), 2, 2, 0), null);
});
