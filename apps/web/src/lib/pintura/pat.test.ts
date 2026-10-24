import assert from "node:assert/strict";
import { test } from "node:test";

import { lerPat } from "./pat.ts";

/** Escreve um .pat como a especificação descreve (os canais crus ou em PackBits de uma linha literal). */
function escreverPat(padroes: { nome: string; modo: number; largura: number; altura: number; canais: number[][]; rle?: boolean; paleta?: number[] }[]): ArrayBuffer {
  const bytes: number[] = [];
  const u8 = (v: number) => bytes.push(v & 255);
  const u16 = (v: number) => bytes.push((v >> 8) & 255, v & 255);
  const u32 = (v: number) => bytes.push((v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255);
  for (const letra of "8BPT") u8(letra.charCodeAt(0));
  u16(1);
  u32(padroes.length);
  for (const p of padroes) {
    u32(1);
    u32(p.modo);
    u16(p.altura);
    u16(p.largura);
    u32(p.nome.length + 1);
    for (const letra of p.nome) u16(letra.charCodeAt(0));
    u16(0);
    const id = "abc";
    u8(id.length);
    for (const letra of id) u8(letra.charCodeAt(0));
    if (p.paleta) for (const v of p.paleta) u8(v);
    // A lista de canais, montada à parte para saber o tamanho
    const lista: number[] = [];
    const l32 = (v: number) => lista.push((v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255);
    const l16 = (v: number) => lista.push((v >> 8) & 255, v & 255);
    [0, 0, p.altura, p.largura].forEach(l32);
    l32(24);
    for (let c = 0; c < 26; c++) {
      const canal = p.canais[c];
      if (!canal) {
        l32(0);
        continue;
      }
      const corpo: number[] = [];
      if (p.rle) {
        // Cada linha numa corrida literal: [n - 1, ...bytes]
        const linhas = Array.from({ length: p.altura }, (_, y) => canal.slice(y * p.largura, (y + 1) * p.largura));
        for (const linha of linhas) corpo.push(((linha.length + 1) >> 8) & 255, (linha.length + 1) & 255);
        for (const linha of linhas) corpo.push(linha.length - 1, ...linha);
      } else corpo.push(...canal);
      l32(1);
      l32(23 + corpo.length);
      l32(8);
      [0, 0, p.altura, p.largura].forEach(l32);
      l16(8);
      lista.push(p.rle ? 1 : 0);
      lista.push(...corpo);
    }
    u32(3);
    u32(lista.length);
    bytes.push(...lista);
  }
  return new Uint8Array(bytes).buffer;
}

test("lê um padrão RGB cru e um cinza em PackBits com transparência", () => {
  const arquivo = escreverPat([
    { nome: "Tijolo", modo: 3, largura: 2, altura: 1, canais: [[255, 10], [0, 20], [0, 30]] },
    { nome: "Névoa", modo: 1, largura: 3, altura: 2, canais: [[0, 128, 255, 1, 2, 3], [255, 255, 0, 0, 255, 128]], rle: true },
  ]);
  const [rgb, cinza] = lerPat(arquivo);
  assert.equal(rgb.nome, "Tijolo");
  assert.deepEqual([...rgb.rgba], [255, 0, 0, 255, 10, 20, 30, 255]);
  assert.equal(cinza.nome, "Névoa");
  assert.equal(cinza.largura, 3);
  assert.deepEqual([...cinza.rgba.slice(0, 12)], [0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 0]);
  assert.equal(cinza.rgba[5 * 4 + 3], 128);
});

test("cores indexadas pela paleta, e um arquivo que não é .pat é recusado", () => {
  const paleta = new Array(768).fill(0);
  paleta.splice(3, 3, 9, 8, 7);
  const [indexado] = lerPat(escreverPat([{ nome: "P", modo: 2, largura: 1, altura: 1, canais: [[1]], paleta }]));
  assert.deepEqual([...indexado.rgba], [9, 8, 7, 255]);
  assert.throws(() => lerPat(new Uint8Array([1, 2, 3, 4, 5, 6]).buffer), /padrões/);
});
