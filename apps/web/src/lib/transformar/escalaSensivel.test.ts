import assert from "node:assert/strict";
import { test } from "node:test";

import { escalaSensivel } from "./escalaSensivel.ts";

/** Um fundo liso com um quadrado vermelho (o que importa) à esquerda. */
function cena(largura: number, altura: number) {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const dentro = x >= 4 && x < 12 && y >= 4 && y < 12;
      dados.set(dentro ? [220, 20, 20, 255] : [90, 120, 160, 255], (y * largura + x) * 4);
    }
  }
  return dados;
}
const vermelhos = (dados: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 0; i < dados.length; i += 4) if (dados[i] > 200 && dados[i + 1] < 40) n++;
  return n;
};

test("diminuir pelas costuras tira o fundo liso e guarda o quadrado", () => {
  const dados = cena(40, 16);
  const saida = escalaSensivel({ dados, largura: 40, altura: 16 }, 24, 16);
  assert.equal(saida.length, 24 * 16 * 4);
  // O quadrado de 8 × 8 continua inteiro (a escala comum o deixaria com 8 × 0,6 de largura)
  assert.equal(vermelhos(saida), 64);
});

test("a altura também, e aumentar repete o fundo sem esticar o quadrado", () => {
  const dados = cena(30, 30);
  const menor = escalaSensivel({ dados, largura: 30, altura: 30 }, 30, 18);
  assert.equal(vermelhos(menor), 64);
  const maior = escalaSensivel({ dados, largura: 30, altura: 30 }, 45, 30);
  assert.equal(maior.length, 45 * 30 * 4);
  assert.equal(vermelhos(maior), 64);
});

test("a proteção segura o que foi protegido, mesmo liso", () => {
  const largura = 40;
  const altura = 10;
  const dados = new Uint8ClampedArray(largura * altura * 4);
  // Metade da esquerda cinza-claro lisa, metade da direita cinza-escuro lisa
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) dados.set(x < 20 ? [200, 200, 200, 255] : [60, 60, 60, 255], (y * largura + x) * 4);
  const protecao = new Uint8Array(largura * altura);
  for (let y = 0; y < altura; y++) for (let x = 0; x < 20; x++) protecao[y * largura + x] = 255;
  const saida = escalaSensivel({ dados, largura, altura }, 28, altura, { protecao });
  let claros = 0;
  for (let x = 0; x < 28; x++) if (saida[x * 4] > 150) claros++;
  assert.equal(claros, 20, "o lado protegido fica com as 20 colunas");
});
