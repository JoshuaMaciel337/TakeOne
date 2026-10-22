import assert from "node:assert/strict";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { abaixamentoNaFala, fatorDoAbaixamento, mudarProfundidade, PONTOS_MAXIMOS } from "./abaixar.ts";

const S = TICKS_POR_SEGUNDO;
const g = 10 ** (-12 / 20);
const perto = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("abaixa durante a fala, desce antes e volta depois, juntando pausas curtas", () => {
  // Música de 0 a 10 s; fala de 2 a 4 s e de 4,5 a 5 s (pausa curta: uma fala só) e de 8 a 12 s
  const clipe = { inicio: 0, duracao: 10 * S };
  const r = abaixamentoNaFala(clipe, [{ inicio: 2 * S, fim: 4 * S }, { inicio: 4.5 * S, fim: 5 * S }, { inicio: 8 * S, fim: 12 * S }])!;
  const pontos = r.pontos.map((p) => [+(p.t / S).toFixed(2), +p.valor.toFixed(4)]);
  assert.deepEqual(pontos, [[0, 1], [1.7, 1], [2, +g.toFixed(4)], [5, +g.toFixed(4)], [5.5, 1], [7.7, 1], [8, +g.toFixed(4)], [10, +g.toFixed(4)]]);
  const comCurva = { inicio: 0, abaixamento: r };
  assert.ok(perto(fatorDoAbaixamento(comCurva, 3 * S), g));
  assert.ok(perto(fatorDoAbaixamento(comCurva, 6 * S), 1));
  assert.ok(perto(fatorDoAbaixamento(comCurva, 5.25 * S), (1 + g) / 2), "no meio da volta");
});

test("clipe que começa no meio de uma fala já começa abaixado", () => {
  const r = abaixamentoNaFala({ inicio: 3 * S, duracao: 4 * S }, [{ inicio: 2 * S, fim: 4 * S }])!;
  assert.ok(perto(r.pontos[0].valor, g) && r.pontos[0].t === 0);
  assert.ok(perto(fatorDoAbaixamento({ inicio: 3 * S, abaixamento: r }, 5 * S), 1));
});

test("sem fala no trecho do clipe, nada muda", () => {
  assert.equal(abaixamentoNaFala({ inicio: 0, duracao: 2 * S }, [{ inicio: 5 * S, fim: 6 * S }]), null);
  assert.equal(fatorDoAbaixamento({ inicio: 0 }, S), 1);
});

test("mudar a profundidade mantém a forma da curva", () => {
  const r = abaixamentoNaFala({ inicio: 0, duracao: 10 * S }, [{ inicio: 2 * S, fim: 4 * S }])!;
  const mais = mudarProfundidade(r, -24);
  assert.ok(perto(fatorDoAbaixamento({ inicio: 0, abaixamento: mais }, 3 * S), 10 ** (-24 / 20)));
  assert.ok(perto(fatorDoAbaixamento({ inicio: 0, abaixamento: mais }, 9 * S), 1));
});

test("fala demais: a curva junta as falas até caber no limite da API", () => {
  const S = TICKS_POR_SEGUNDO;
  // 1500 falas de 0,5 s separadas por 1 s: 4 pontos cada passaria de 4000
  const falas = Array.from({ length: 1500 }, (_, i) => ({ inicio: i * 1.5 * S, fim: (i * 1.5 + 0.5) * S }));
  const curva = abaixamentoNaFala({ inicio: 0, duracao: 2300 * S }, falas)!;
  assert.ok(curva.pontos.length <= PONTOS_MAXIMOS, `${curva.pontos.length} pontos`);
  assert.ok(curva.pontos.every((p, i) => i === 0 || p.t >= curva.pontos[i - 1].t));
  // Uma fala curta ainda abaixa onde ela está
  assert.ok(fatorDoAbaixamento({ inicio: 0, abaixamento: curva }, 0.25 * S) < 0.5);
});
