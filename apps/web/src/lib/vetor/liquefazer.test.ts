import assert from "node:assert/strict";
import { test } from "node:test";

import { achatar, areaDoPoligono } from "./contorno.ts";
import { caminhosDoLiquefazer, comecarLiquefazer, type FerramentaDeLiquefazer, LIQUEFAZER_PADRAO, passoDoLiquefazer, terminarLiquefazer } from "./liquefazer.ts";
import type { Subcaminho } from "./modelo.ts";

const quadrado: Subcaminho = { nos: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], fechado: true, operacao: "somar" };
const area = (sub: Subcaminho) => Math.abs(areaDoPoligono(achatar(sub, 0.1)));
const meio = { x: 50, y: 50 };

function aplicar(ferramenta: FerramentaDeLiquefazer, vezes: number, centro = meio, opcoes = { ...LIQUEFAZER_PADRAO, raio: 80 }) {
  let estado = comecarLiquefazer([quadrado], opcoes.raio);
  for (let i = 0; i < vezes; i++) estado = passoDoLiquefazer(estado, ferramenta, centro, centro, opcoes);
  return estado;
}

test("franzir encolhe e inflar estica o que fica debaixo do pincel; longe, nada muda", () => {
  assert.ok(area(terminarLiquefazer(aplicar("franzir", 10))[0]) < 10000 * 0.8);
  assert.ok(area(terminarLiquefazer(aplicar("inflar", 10))[0]) > 10000 * 1.1);
  const longe = aplicar("franzir", 10, { x: 500, y: 500 });
  assert.equal(longe.pontos[0], null, "o caminho que o pincel não alcança fica como era");
  assert.equal(terminarLiquefazer(longe)[0], quadrado);
});

test("deformar leva os pontos com o pincel; torcer gira em volta do meio sem mudar a área", () => {
  let estado = comecarLiquefazer([quadrado], 30);
  // O pincel anda 20 px para cima até o meio do lado de cima: o ponto debaixo dele vai junto
  estado = passoDoLiquefazer(estado, "deformar", { x: 50, y: 0 }, { x: 50, y: 20 }, { ...LIQUEFAZER_PADRAO, raio: 30 });
  const [puxado] = caminhosDoLiquefazer(estado);
  const doMeio = puxado.nos.find((no) => Math.abs(no.x - 50) < 1e-6)!;
  assert.ok(Math.abs(doMeio.y + 20) < 1e-9, `o ponto do meio subiu 20 (${doMeio.y})`);
  assert.ok(puxado.nos.every((no) => no.y >= -20 - 1e-9), "nada passa do arrasto");
  const girado = terminarLiquefazer(aplicar("torcer", 5))[0];
  assert.ok(Math.abs(area(girado) - 10000) < 300, `${area(girado)}`);
});

test("recortar, cristalizar e enrugar mexem no contorno, e enrugar é sempre o mesmo", () => {
  for (const ferramenta of ["recortar", "cristalizar", "enrugar"] as const) {
    const [antes] = caminhosDoLiquefazer(comecarLiquefazer([quadrado], 80));
    const depois = caminhosDoLiquefazer(aplicar(ferramenta, 8))[0];
    assert.notDeepEqual(depois, antes, ferramenta);
  }
  assert.deepEqual(aplicar("enrugar", 5).pontos, aplicar("enrugar", 5).pontos);
});
