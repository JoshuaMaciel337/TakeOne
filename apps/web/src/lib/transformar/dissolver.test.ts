import assert from "node:assert/strict";
import { test } from "node:test";

import { campoEm, campoNovo, deformar, marcarNoCampo, restaurarTudo } from "./dissolver.ts";

/** Uma imagem com um degradê na horizontal (o vermelho é a coluna). */
function degrade(largura: number, altura: number) {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) dados.set([x * 4, y * 4, 0, 255], (y * largura + x) * 4);
  return dados;
}
const PINCEL = { raio: 10, densidade: 1, pressao: 1, taxa: 1 };

test("sem pincelada, a imagem sai igual", () => {
  const dados = degrade(32, 24);
  const saida = deformar({ dados, largura: 32, altura: 24 }, campoNovo(32, 24));
  assert.deepEqual([...saida], [...dados]);
});

test("empurrar leva o conteúdo junto com o pincel; reconstruir traz de volta", () => {
  const dados = degrade(40, 30);
  const campo = campoNovo(40, 30);
  marcarNoCampo(campo, "empurrar", 20, 15, 3, 0, PINCEL);
  const saida = deformar({ dados, largura: 40, altura: 30 }, campo);
  // No centro (força 1), o pixel mostra o que estava 3 px à esquerda
  assert.equal(saida[(15 * 40 + 20) * 4], (20 - 3) * 4);
  // Longe do pincel, nada muda
  assert.equal(saida[(15 * 40 + 35) * 4], 35 * 4);
  for (let i = 0; i < 40; i++) marcarNoCampo(campo, "reconstruir", 20, 15, 0, 0, { ...PINCEL, raio: 14 });
  assert.ok(Math.abs(campo.dx[15 * 40 + 20]) < 0.05, String(campo.dx[15 * 40 + 20]));
});

test("contrair puxa para o centro, inflar empurra para fora; o congelado não muda", () => {
  const campo = campoNovo(40, 30);
  marcarNoCampo(campo, "contrair", 20, 15, 0, 0, PINCEL);
  // À direita do centro, o pixel lê mais longe do centro (o conteúdo veio para dentro)
  assert.ok(campo.dx[15 * 40 + 24] > 0);
  const inflado = campoNovo(40, 30);
  marcarNoCampo(inflado, "inflar", 20, 15, 0, 0, PINCEL);
  assert.ok(inflado.dx[15 * 40 + 24] < 0);
  const congelado = campoNovo(40, 30);
  marcarNoCampo(congelado, "congelar", 20, 15, 0, 0, { ...PINCEL, raio: 15 });
  marcarNoCampo(congelado, "empurrar", 20, 15, 5, 0, PINCEL);
  assert.ok(Math.abs(congelado.dx[15 * 40 + 20]) < 1e-9);
});

test("o campo na resolução cheia leva os deslocamentos junto, e restaurar zera o que não está congelado", () => {
  const campo = campoNovo(20, 10);
  marcarNoCampo(campo, "empurrar", 10, 5, 2, 0, { ...PINCEL, raio: 6 });
  const cheio = campoEm(campo, 40, 20);
  assert.ok(Math.abs(cheio.dx[10 * 40 + 20] - campo.dx[5 * 20 + 10] * 2) < 0.6, `${cheio.dx[10 * 40 + 20]} ${campo.dx[5 * 20 + 10]}`);
  restaurarTudo(campo);
  assert.ok(Math.abs(campo.dx[5 * 20 + 10]) < 1e-9);
});
