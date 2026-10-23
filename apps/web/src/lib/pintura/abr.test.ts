import assert from "node:assert/strict";
import { test } from "node:test";

import { ErroAbr, lerAbr } from "./abr.ts";

/** Monta um arquivo em big endian a partir de pedaços (números com o tamanho em bytes, ou bytes). */
function arquivo(pedacos: ([number, 1 | 2 | 4] | number[] | string)[]): ArrayBuffer {
  const bytes: number[] = [];
  for (const pedaco of pedacos) {
    if (typeof pedaco === "string") bytes.push(...[...pedaco].map((letra) => letra.charCodeAt(0)));
    else if (pedaco.length === 2 && (pedaco[1] === 1 || pedaco[1] === 2 || pedaco[1] === 4) && !Array.isArray(pedaco[0])) {
      const [valor, tamanho] = pedaco as [number, 1 | 2 | 4];
      for (let i = tamanho - 1; i >= 0; i--) bytes.push((valor >>> (8 * i)) & 255);
    } else bytes.push(...(pedaco as number[]));
  }
  return new Uint8Array(bytes).buffer;
}

/** Uma amostra da versão 6 (subversão 2): 301 bytes antes dos limites, então topo, esquerda, base, direita. */
function amostraV6(largura: number, altura: number, comprimido: boolean, dados: number[]) {
  const corpo: ([number, 1 | 2 | 4] | number[])[] = [new Array(301).fill(0), [0, 4], [0, 4], [altura, 4], [largura, 4], [8, 2], [comprimido ? 1 : 0, 1], dados];
  const tamanho = corpo.reduce((soma, pedaco) => soma + (Array.isArray(pedaco[0]) || pedaco.length !== 2 ? (pedaco as number[]).length : (pedaco as [number, number])[1]), 0);
  const preenchido = Math.ceil(tamanho / 4) * 4;
  return [[tamanho, 4] as [number, 4], ...corpo, new Array(preenchido - tamanho).fill(0)];
}

test("versão 6: pula as outras seções e lê as amostras cruas e em PackBits", () => {
  const crua = amostraV6(3, 2, false, [0, 128, 255, 10, 20, 30]);
  // PackBits: linha 1 = "repete 200 quatro vezes" (-3, 200); linha 2 = "copia 4" (3, 1, 2, 3, 4); contagens 2 e 5
  const rle = amostraV6(4, 2, true, [0, 2, 0, 5, 253, 200, 3, 1, 2, 3, 4]);
  const samp = [...crua, ...rle];
  const tamanhoDaSecao = samp.reduce((soma: number, pedaco) => soma + (Array.isArray(pedaco[0]) || (pedaco as unknown[]).length !== 2 ? (pedaco as number[]).length : (pedaco as [number, number])[1]), 0);
  const buffer = arquivo([[6, 2], [2, 2], "8BIM", "desc", [3, 4], [1, 2, 3], "8BIM", "samp", [tamanhoDaSecao, 4], ...samp]);
  const pontas = lerAbr(buffer);
  assert.equal(pontas.length, 2);
  assert.deepEqual([pontas[0].largura, pontas[0].altura, [...pontas[0].dados]], [3, 2, [0, 128, 255, 10, 20, 30]]);
  assert.deepEqual([pontas[1].largura, pontas[1].altura, [...pontas[1].dados]], [4, 2, [200, 200, 200, 200, 1, 2, 3, 4]]);
});

test("versão 2: o pincel de amostra com o nome; o calculado é pulado", () => {
  const nome = "Ab";
  const amostra: ([number, 1 | 2 | 4] | number[] | string)[] = [[0, 4], [25, 2], [nome.length + 1, 4], [65, 2], [98, 2], [0, 2], [1, 1], [0, 2], [0, 2], [0, 2], [0, 2], [0, 4], [0, 4], [1, 4], [2, 4], [8, 2], [0, 1], [7, 9]];
  const tamanho = 4 + 2 + 4 + 6 + 1 + 8 + 16 + 2 + 1 + 2;
  const buffer = arquivo([[2, 2], [2, 2], [1, 2], [3, 4], [0, 0, 0], [2, 2], [tamanho, 4], ...amostra]);
  const pontas = lerAbr(buffer);
  assert.deepEqual(pontas.map((p) => [p.nome, p.largura, p.altura, [...p.dados]]), [["Ab", 2, 1, [7, 9]]]);
});

test("arquivos que não servem dão a mensagem", () => {
  assert.throws(() => lerAbr(arquivo([[3, 2]])), ErroAbr);
  assert.throws(() => lerAbr(arquivo([[6, 2], [2, 2], "8BIM", "desc", [0, 4]])), /só pincéis calculados/);
  assert.throws(() => lerAbr(arquivo([[6, 2], [2, 2], "8BIM", "samp", [100, 4], [1, 2]])), /cortado/);
});
