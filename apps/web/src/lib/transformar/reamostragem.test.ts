import assert from "node:assert/strict";
import { test } from "node:test";

import { redimensionar } from "./reamostragem.ts";

/** Um xadrez de 1 pixel entre preto e branco, opaco. */
function xadrez(lado: number) {
  const dados = new Uint8ClampedArray(lado * lado * 4);
  for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) dados.set((x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255], (y * lado + x) * 4);
  return dados;
}

test("no mesmo tamanho, todos os métodos devolvem a imagem", () => {
  const dados = xadrez(6);
  for (const metodo of ["automatica", "bicubica", "bilinear", "vizinho", "lanczos"] as const) {
    const saida = redimensionar({ dados, largura: 6, altura: 6 }, 6, 6, metodo);
    for (let i = 0; i < dados.length; i++) assert.ok(Math.abs(saida[i] - dados[i]) <= 1, `${metodo} ${i}`);
  }
});

test("vizinho mais próximo dobra os pixels sem misturar; reduzir faz a média", () => {
  const dados = xadrez(4);
  const dobro = redimensionar({ dados, largura: 4, altura: 4 }, 8, 8, "vizinho");
  assert.deepEqual([...dobro.slice(0, 8)], [0, 0, 0, 255, 0, 0, 0, 255]);
  assert.deepEqual([...dobro.slice(8, 12)], [255, 255, 255, 255]);
  // O xadrez de 1 pixel reduzido à metade vira o cinza do meio (e não preto ou branco)
  for (const metodo of ["bilinear", "bicubica", "lanczos", "automatica"] as const) {
    const metade = redimensionar({ dados: xadrez(16), largura: 16, altura: 16 }, 8, 8, metodo);
    const meio = metade[(4 * 8 + 4) * 4];
    assert.ok(Math.abs(meio - 128) < 20, `${metodo}: ${meio}`);
  }
});

test("a cor dos pixels transparentes não vaza para a borda", () => {
  // Um pixel vermelho opaco ao lado de pixels transparentes pretos
  const dados = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < 16; i++) dados.set(i === 5 ? [255, 0, 0, 255] : [0, 0, 0, 0], i * 4);
  const saida = redimensionar({ dados, largura: 4, altura: 4 }, 8, 8, "bilinear");
  for (let i = 0; i < 64; i++) if (saida[i * 4 + 3] > 0) assert.ok(saida[i * 4] > 240 && saida[i * 4 + 1] < 15, String([...saida.slice(i * 4, i * 4 + 4)]));
});
