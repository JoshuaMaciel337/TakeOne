import assert from "node:assert/strict";
import { test } from "node:test";

import { type Deformacao, deformarCaminhos, deformarPonto, ESTILOS_DA_DEFORMACAO, limitesDosPoligonos } from "./deformar.ts";

const r = { x0: 0, y0: 0, x1: 200, y1: 50 };
const com = (estilo: Deformacao["estilo"], curvatura: number, extra: Partial<Deformacao> = {}): Deformacao => ({ estilo, curvatura, vertical: false, distorcaoH: 0, distorcaoV: 0, ...extra });
const perto = (a: { x: number; y: number }, b: { x: number; y: number }, erro = 1e-6) => Math.hypot(a.x - b.x, a.y - b.y) < erro;

test("sem curvatura nem distorção, todo estilo deixa os pontos no lugar", () => {
  for (const { id } of ESTILOS_DA_DEFORMACAO) {
    for (const p of [{ x: 0, y: 0 }, { x: 37, y: 12 }, { x: 200, y: 50 }]) assert.ok(perto(deformarPonto(p, r, com(id, 0)), p), id);
  }
});

test("o arco: o meio fica, as pontas descem (∩) e o comprimento da linha do meio continua", () => {
  const d = com("arco", 50);
  assert.ok(perto(deformarPonto({ x: 100, y: 25 }, r, d), { x: 100, y: 25 }));
  const ponta = deformarPonto({ x: 200, y: 25 }, r, d);
  assert.ok(ponta.y > 25 && ponta.x < 200);
  // Um quarto de volta (curvatura 50 = 45° para cada lado): o arco da linha do meio mede 200
  let comprimento = 0;
  let anterior = deformarPonto({ x: 0, y: 25 }, r, d);
  for (let i = 1; i <= 200; i++) {
    const p = deformarPonto({ x: i, y: 25 }, r, d);
    comprimento += Math.hypot(p.x - anterior.x, p.y - anterior.y);
    anterior = p;
  }
  assert.ok(Math.abs(comprimento - 200) < 0.01, `comprimento ${comprimento}`);
  // Negativa curva para baixo (∪)
  assert.ok(deformarPonto({ x: 200, y: 25 }, r, com("arco", -50)).y < 25);
});

test("vertical troca os eixos; a torção deixa o meio no lugar; os polígonos cobrem o deformado", () => {
  const vertical = deformarPonto({ x: 25, y: 200 }, { x0: 0, y0: 0, x1: 50, y1: 200 }, com("arcada", 60, { vertical: true }));
  assert.ok(Math.abs(vertical.y - 200) < 1e-6 && Math.abs(vertical.x - 25) < 1e-6, "a ponta da coluna não anda na arcada");
  const meio = deformarPonto({ x: 25, y: 100 }, { x0: 0, y0: 0, x1: 50, y1: 200 }, com("arcada", 60, { vertical: true }));
  assert.ok(Math.abs(meio.x - 25) > 1, "o meio da coluna sai do lugar");
  assert.ok(perto(deformarPonto({ x: 100, y: 25 }, r, com("torcao", 80)), { x: 100, y: 25 }));
  const quadrado = { nos: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 50 }, { x: 0, y: 50 }], fechado: true, operacao: "somar" as const };
  const [poligono] = deformarCaminhos([quadrado], r, com("bandeira", 100), 0.25);
  assert.ok(poligono.length > 40, "os lados retos foram divididos");
  const limites = limitesDosPoligonos([poligono])!;
  assert.ok(limites.y0 < 0 && limites.y1 > 50, "a bandeira passa do retângulo em cima e embaixo");
});
