import assert from "node:assert/strict";
import { test } from "node:test";

import { achatar, areaDoPoligono } from "./contorno.ts";
import { FORMAS_PRONTAS } from "./formasProntas.ts";
import { caixaDosCaminhos } from "./modelo.ts";
import { caminhosDoSvg } from "./svg.ts";

const perto = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

test("linhas absolutas e relativas, H e V, e o Z fecha", () => {
  const [sub] = caminhosDoSvg("M10 10 L50 10 h20 v30 l-60 0 Z");
  assert.equal(sub.fechado, true);
  assert.deepEqual(
    sub.nos.map((no) => [no.x, no.y]),
    [
      [10, 10],
      [50, 10],
      [70, 10],
      [70, 40],
      [10, 40],
    ],
  );
  // Dois M são dois caminhos; os números colados ("-5-5") também
  const dois = caminhosDoSvg("M0 0L10 0L10 10ZM20 20l10-5-5-5z");
  assert.equal(dois.length, 2);
  assert.deepEqual([dois[1].nos[1].x, dois[1].nos[1].y, dois[1].nos[2].x, dois[1].nos[2].y], [30, 15, 25, 10]);
});

test("cúbicas, a curva espelhada (S), a quadrática e o arco", () => {
  const [c] = caminhosDoSvg("M0 0 C10 20 30 20 40 0 S70 -20 80 0");
  assert.deepEqual([c.nos[1].ex, c.nos[1].ey, c.nos[1].sx, c.nos[1].sy], [30, 20, 50, -20]);
  const [q] = caminhosDoSvg("M0 0 Q30 30 60 0");
  assert.ok(perto(q.nos[0].sx!, 20) && perto(q.nos[0].sy!, 20) && perto(q.nos[1].ex!, 40) && perto(q.nos[1].ey!, 20));
  // Um círculo de raio 40 por dois arcos: a área fica perto de π r²
  const [circulo] = caminhosDoSvg("M10 50 A40 40 0 1 1 90 50 A40 40 0 1 1 10 50 Z");
  assert.ok(circulo.fechado);
  const area = Math.abs(areaDoPoligono(achatar(circulo, 0.05)));
  assert.ok(Math.abs(area - Math.PI * 1600) / (Math.PI * 1600) < 2e-3, `${area}`);
});

test("a biblioteca: ids sem repetir, cada forma com área e dentro da caixa de 100 × 100", () => {
  assert.ok(FORMAS_PRONTAS.length >= 150, `${FORMAS_PRONTAS.length} formas`);
  assert.equal(new Set(FORMAS_PRONTAS.map((forma) => forma.id)).size, FORMAS_PRONTAS.length);
  for (const forma of FORMAS_PRONTAS) {
    const caminhos = forma.caminhos();
    assert.ok(caminhos.length, forma.id);
    const caixa = caixaDosCaminhos(caminhos)!;
    assert.ok(caixa.x0 >= -15 && caixa.y0 >= -15 && caixa.x1 <= 115 && caixa.y1 <= 115, `${forma.id}: ${JSON.stringify(caixa)}`);
    const area = caminhos.filter((sub) => sub.operacao === "somar").reduce((soma, sub) => soma + Math.abs(areaDoPoligono(achatar(sub, 0.5))), 0);
    assert.ok(area > 30, `${forma.id} sem área`);
  }
});
