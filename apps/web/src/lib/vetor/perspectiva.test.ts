import assert from "node:assert/strict";
import { test } from "node:test";

import { aplicarH, caminhosDoPlano, gradePadrao, homografiaDoPlano, linhasDaGrade, noPlano, PLANOS, retanguloNoPlano } from "./perspectiva.ts";

const perto = (p: { x: number; y: number }, x: number, y: number) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6;

test("dois pontos: no pé, a altura é em pixels; na distância, tudo fica pela metade a caminho do ponto de fuga", () => {
  const grade = gradePadrao(2, 800, 600);
  const h = homografiaDoPlano(grade, "esquerdo");
  assert.ok(perto(aplicarH(h, 0, 100), grade.origem.x, grade.origem.y - 100));
  const longe = aplicarH(h, grade.distancia, 0);
  assert.ok(perto(longe, (grade.origem.x + grade.fuga[0].x) / 2, (grade.origem.y + grade.horizonte) / 2));
  // A altura de 100 lá fica com 50
  assert.ok(Math.abs(aplicarH(h, grade.distancia, 0).y - aplicarH(h, grade.distancia, 100).y - 50) < 1e-6);
  // O chão: cada direção vai para o seu ponto de fuga
  const chao = homografiaDoPlano(grade, "chao");
  const muitoLonge = aplicarH(chao, 1e9, 0);
  assert.ok(Math.abs(muitoLonge.x - grade.fuga[1].x) < 1e-3 && Math.abs(muitoLonge.y - grade.horizonte) < 1e-3);
});

test("ida e volta pelos planos, nas três grades", () => {
  for (const tipo of [1, 2, 3] as const) {
    const grade = gradePadrao(tipo, 800, 600);
    for (const plano of PLANOS) {
      const p = aplicarH(homografiaDoPlano(grade, plano), 120, 80);
      const volta = noPlano(grade, plano, p);
      assert.ok(Math.abs(volta.a - 120) < 1e-6 && Math.abs(volta.b - 80) < 1e-6, `${tipo} ${plano}`);
      assert.ok(linhasDaGrade(grade, plano).length > 4);
    }
  }
});

test("o retângulo arrastado vira a forma no plano: os cantos voltam aos arrastados", () => {
  const grade = gradePadrao(2, 800, 600);
  const de = aplicarH(homografiaDoPlano(grade, "direito"), 50, 200);
  const ate = aplicarH(homografiaDoPlano(grade, "direito"), 250, 20);
  const { largura, altura, paraPlano } = retanguloNoPlano(grade, "direito", de, ate);
  assert.ok(Math.abs(largura - 200) < 1e-6 && Math.abs(altura - 180) < 1e-6);
  const quadrado = [{ nos: [paraPlano(0, 0), paraPlano(largura, 0), paraPlano(largura, altura), paraPlano(0, altura)], fechado: true, operacao: "somar" as const }];
  const naImagem = caminhosDoPlano(grade, "direito", quadrado)[0].nos;
  // O canto de cima à esquerda da forma é o de cima do plano (b = 200) no começo (a = 50)
  assert.ok(perto(naImagem[0], de.x, de.y));
  assert.ok(perto(naImagem[2], ate.x, ate.y));
});
