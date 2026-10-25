import assert from "node:assert/strict";
import { test } from "node:test";

import { arrastoDaForma } from "./arrasto.ts";
import { caminhoDaEspiral, caminhoDoArco, caminhosDaGrade, caminhosDaGradePolar, caminhosDoGerador, divisoes, GERADORES_PADRAO } from "./geradores.ts";
import type { No } from "./modelo.ts";

/** O ponto da cúbica entre dois nós, em t. */
function naCurva(a: No, b: No, t: number) {
  const p1 = { x: a.sx ?? a.x, y: a.sy ?? a.y };
  const p2 = { x: b.ex ?? b.x, y: b.ey ?? b.y };
  const u = 1 - t;
  return { x: u ** 3 * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * b.x, y: u ** 3 * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * b.y };
}

test("as divisões ficam iguais sem inclinação e se juntam para um lado com ela", () => {
  assert.deepEqual(divisoes(3, 0), [0.25, 0.5, 0.75]);
  const juntas = divisoes(3, 50);
  assert.ok(juntas[0] < 0.25 && juntas[2] < 0.75, "com inclinação positiva, as divisões descem para o começo");
  assert.deepEqual(divisoes(0, 0), []);
});

test("o arco a 50 é um quarto de círculo; a 0, uma reta; fechado, volta pelo centro", () => {
  const [arco] = caminhoDoArco({ x: 0, y: 0 }, { x: 100, y: 100 }, { fechado: false, base: "x", inclinacao: 50 });
  // O quarto de círculo em volta de (0, 100): o meio da curva a 100 do centro
  const meio = naCurva(arco.nos[0], arco.nos[1], 0.5);
  assert.ok(Math.abs(Math.hypot(meio.x - 0, meio.y - 100) - 100) < 0.1);
  assert.ok(meio.x > 50 && meio.y < 50, "convexo: a curva vai para o canto (100, 0)");
  const [concavo] = caminhoDoArco({ x: 0, y: 0 }, { x: 100, y: 100 }, { fechado: false, base: "x", inclinacao: -50 });
  const meioConcavo = naCurva(concavo.nos[0], concavo.nos[1], 0.5);
  assert.ok(meioConcavo.x < 50 && meioConcavo.y > 50);
  const [reto] = caminhoDoArco({ x: 0, y: 0 }, { x: 100, y: 100 }, { fechado: false, base: "x", inclinacao: 0 });
  assert.deepEqual(naCurva(reto.nos[0], reto.nos[1], 0.5), { x: 50, y: 50 });
  const [fechado] = caminhoDoArco({ x: 0, y: 0 }, { x: 100, y: 100 }, { fechado: true, base: "x", inclinacao: 50 });
  assert.equal(fechado.fechado, true);
  assert.deepEqual(fechado.nos[2], { x: 0, y: 100 });
});

test("a espiral com decaimento de 100% é um círculo; com 50%, cada quarto tem metade do raio", () => {
  const [circulo] = caminhoDaEspiral({ x: 0, y: 0 }, { x: 100, y: 0 }, { decaimento: 100, segmentos: 4, sentido: "horario" });
  assert.equal(circulo.nos.length, 5);
  for (let k = 0; k < 4; k++) {
    for (const t of [0.25, 0.5, 0.75]) {
      const p = naCurva(circulo.nos[k], circulo.nos[k + 1], t);
      assert.ok(Math.abs(Math.hypot(p.x, p.y) - 100) < 0.2, `quarto ${k}, t ${t}: ${Math.hypot(p.x, p.y)}`);
    }
  }
  // Horário na tela (o y para baixo): do leste vai para o sul
  assert.ok(Math.abs(circulo.nos[1].x) < 1e-9 && Math.abs(circulo.nos[1].y - 100) < 1e-9);
  const [entrando] = caminhoDaEspiral({ x: 0, y: 0 }, { x: 100, y: 0 }, { decaimento: 50, segmentos: 3, sentido: "antiHorario" });
  assert.deepEqual(entrando.nos.map((no) => Math.round(Math.hypot(no.x, no.y))), [100, 50, 25, 13]);
  assert.ok(entrando.nos[1].y < 0, "anti-horário: do leste vai para o norte");
  // O meio de um quarto que encolhe fica entre os dois raios, perto da média geométrica
  const meio = naCurva(entrando.nos[0], entrando.nos[1], 0.5);
  assert.ok(Math.abs(Math.hypot(meio.x, meio.y) - Math.SQRT1_2 * 100) < 1.5);
});

test("as grades: a moldura, as divisões e os anéis do caminho composto", () => {
  const caixa = { x: 10, y: 20, largura: 100, altura: 50 };
  const grade = caminhosDaGrade(caixa, { horizontais: 1, verticais: 3, inclinacaoH: 0, inclinacaoV: 0, moldura: true }, false);
  assert.equal(grade.length, 5);
  assert.equal(grade[0].fechado, true);
  assert.deepEqual(grade[1].nos, [{ x: 10, y: 45 }, { x: 110, y: 45 }]);
  assert.deepEqual(grade.slice(2).map((sub) => sub.nos[0].x), [35, 60, 85]);
  const solta = caminhosDaGrade(caixa, { horizontais: 0, verticais: 0, inclinacaoH: 0, inclinacaoV: 0, moldura: false }, false);
  assert.equal(solta.length, 4);
  assert.ok(solta.every((sub) => !sub.fechado));
  const polar = caminhosDaGradePolar(caixa, { concentricas: 2, radiais: 4, inclinacaoC: 0, inclinacaoR: 0, composto: true });
  // Três elipses (a de fora e duas) e quatro raios
  assert.equal(polar.length, 7);
  assert.deepEqual(polar.slice(0, 3).map((sub) => sub.operacao), ["somar", "excluir", "excluir"]);
  // A de fora toca a caixa; os raios saem do meio, o primeiro para cima
  assert.deepEqual(polar[0].nos[0], { x: 60, y: 20, ex: 60 - 50 * 0.5522847498, ey: 20, sx: 60 + 50 * 0.5522847498, sy: 20 });
  assert.deepEqual(polar[3].nos.map((no) => [Math.round(no.x), Math.round(no.y)]), [[60, 45], [60, 20]]);
  assert.deepEqual(polar[4].nos[1].x.toFixed(6), (110).toFixed(6));
  // Sem o caminho composto, as de dentro são abertas e voltam ao começo
  const simples = caminhosDaGradePolar(caixa, { concentricas: 1, radiais: 0, inclinacaoC: 0, inclinacaoR: 0, composto: false });
  assert.deepEqual(simples.map((sub) => [sub.fechado, sub.nos.length]), [[true, 4], [false, 5]]);
  assert.deepEqual([simples[1].nos[4].x, simples[1].nos[4].y], [simples[1].nos[0].x, simples[1].nos[0].y]);
});

test("o segmento vai do começo ao fim do arrasto, com o Shift preso a 45°", () => {
  const arrasto = arrastoDaForma({ x: 0, y: 0 }, { x: 100, y: 90 }, { proporcional: true, linha: true });
  const [segmento] = caminhosDoGerador("segmento", arrasto, GERADORES_PADRAO);
  assert.equal(segmento.nos.length, 2);
  assert.ok(Math.abs(segmento.nos[1].x - segmento.nos[1].y) < 1e-9);
});
