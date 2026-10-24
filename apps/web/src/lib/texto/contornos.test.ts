import assert from "node:assert/strict";
import { test } from "node:test";

import { caminhosDoTexto } from "./contornos.ts";
import type { FonteCarregada } from "./layout.ts";
import { textoNovo } from "./modelo.ts";

/** Um "o" de mentira: um quadrado com um furo quadrado (o furo gira ao contrário, como nas fontes). */
const fonte: FonteCarregada = {
  chave: "teste",
  unidades: 1000,
  ascendente: 800,
  descendente: -200,
  sublinhado: { posicao: -100, espessura: 50 },
  tachado: { posicao: 300, espessura: 50 },
  temRecurso: () => false,
  formatar: (texto) =>
    [...texto].map((c) => ({
      id: c.charCodeAt(0),
      avanco: 600,
      dx: 0,
      dy: 0,
      letras: 1,
      caminho: () => (c === " " ? "" : "M0 0L0 500L500 500L500 0Z M100 100L400 100L400 400L100 400Z"),
      caixa: c === " " ? { x0: 0, y0: 0, x1: 0, y1: 0 } : { x0: 0, y0: 0, x1: 500, y1: 500 },
    })),
};

test("os contornos: o de fora soma e o furo subtrai, no lugar do desenho", () => {
  const texto = { ...textoNovo("o o", { tamanho: 10 }), origem: { x: 2, y: 9 } };
  const caminhos = caminhosDoTexto(texto, () => fonte);
  assert.equal(caminhos.length, 4);
  assert.deepEqual(caminhos.map((c) => c.operacao), ["somar", "subtrair", "somar", "subtrair"]);
  // O quadrado de fora da primeira letra: x de 2 a 7, y de 9 (a linha de base) a 4 (500 unidades acima)
  const xs = caminhos[0].nos.map((n) => n.x);
  const ys = caminhos[0].nos.map((n) => n.y);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [2, 7, 4, 9]);
  // A segunda letra começa 600 + 600 unidades depois (o espaço também tem 600)
  assert.equal(Math.min(...caminhos[2].nos.map((n) => n.x)), 2 + 12);
});

test("o sublinhado vira um retângulo", () => {
  const caminhos = caminhosDoTexto({ ...textoNovo("o", { tamanho: 10, sublinhado: true }), origem: { x: 0, y: 0 } }, () => fonte);
  assert.equal(caminhos.length, 3);
  assert.equal(caminhos[2].nos.length, 4);
});

test("texto num caminho: cada letra vai para o ponto do caminho, girada pela tangente; o que passa do fim some", async () => {
  const { gruposDeformados } = await import("./contornos.ts");
  const { disporTexto } = await import("./layout.ts");
  // Um caminho que desce (de 0,0 a 0,100): as letras ficam de lado, com a base à esquerda
  const caminho = { tipo: "linha" as const, nos: [{ x: 0, y: 0 }, { x: 0, y: 100 }], fechado: false, inicio: 0, inverter: false };
  const texto = { ...textoNovo("o o o o o o o o o o o o o o o o o o", { tamanho: 10 }), caminho };
  const grupos = gruposDeformados(texto, disporTexto(texto, () => fonte), 0.1)!;
  const primeiro = grupos[0].poligonos[0];
  const xs = primeiro.map((p) => p.x);
  const ys = primeiro.map((p) => p.y);
  // A letra (5 × 5) a partir do começo do caminho, para a direita da tela fica o "alto" da letra virado para x positivo
  assert.ok(Math.abs(Math.min(...ys) - 0) < 1e-6 && Math.abs(Math.max(...ys) - 5) < 1e-6, `y ${Math.min(...ys)}..${Math.max(...ys)}`);
  assert.ok(Math.abs(Math.min(...xs) - 0) < 1e-6 && Math.abs(Math.max(...xs) - 5) < 1e-6, `x ${Math.min(...xs)}..${Math.max(...xs)}`);
  // 18 letras de 12 de passo não cabem em 100: as do fim não aparecem
  assert.ok(grupos.some((g) => g.poligonos.length === 0));
});
