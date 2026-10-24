import assert from "node:assert/strict";
import { test } from "node:test";

import { acharFotos, cantosNaFoto, retanguloMinimo } from "./endireitar.ts";
import { celulasDaFolha, encaixar, OPCOES_PADRAO_DA_FOLHA, paginasDaFolha } from "./folha.ts";
import { mesclarExposicoes } from "./hdr.ts";
import { empilhar, estatistica } from "./pilha.ts";

const lisa = (l: number, a: number, cor: (x: number, y: number) => [number, number, number, number]) => {
  const dados = new Uint8ClampedArray(l * a * 4);
  for (let y = 0; y < a; y++) for (let x = 0; x < l; x++) dados.set(cor(x, y), (y * l + x) * 4);
  return { dados, largura: l, altura: a };
};

test("as estatísticas da pilha", () => {
  assert.equal(estatistica([10, 200, 30], "mediana"), 30);
  assert.equal(estatistica([10, 20, 30], "media"), 20);
  assert.equal(estatistica([10, 200, 30], "faixa"), 190);
  assert.equal(estatistica([200, 200], "soma"), 255);
  assert.equal(estatistica([50, 50, 50], "desvio"), 0);
  assert.equal(estatistica([7, 7, 7, 7], "entropia"), 0);
  assert.equal(Math.round(estatistica([0, 1, 2, 3], "entropia")), 255);
  assert.equal(estatistica([5, 5], "assimetria"), 128);
});

test("a mediana tira o que passa e o transparente não conta", () => {
  const fundo = lisa(4, 1, () => [100, 100, 100, 255]);
  const comCarro = lisa(4, 1, (x) => (x === 1 ? [255, 0, 0, 255] : [100, 100, 100, 255]));
  const vazia = lisa(4, 1, () => [0, 0, 0, 0]);
  const saida = empilhar([fundo, comCarro, fundo, vazia], "mediana");
  assert.deepEqual(Array.from(saida.subarray(4, 8)), [100, 100, 100, 255]);
});

test("a fusão das exposições: uma cena escura e uma clara dão o meio, sem estourar nem entupir", () => {
  const cena = (x: number) => x / 63;
  const escura = lisa(64, 32, (x) => Array(3).fill(Math.round(255 * cena(x) * 0.35)).concat(255) as [number, number, number, number]);
  const clara = lisa(64, 32, (x) => Array(3).fill(Math.min(255, Math.round(255 * (0.4 + cena(x) * 0.9)))).concat(255) as [number, number, number, number]);
  const saida = mesclarExposicoes([escura, clara]);
  const linha = Array.from({ length: 64 }, (_, x) => saida[(16 * 64 + x) * 4]);
  // Cresce da esquerda para a direita e fica longe das pontas no meio
  for (let x = 4; x < 60; x += 8) assert.ok(linha[x + 4] >= linha[x] - 2, `não monótono em ${x}: ${linha}`);
  assert.ok(linha[32] > 60 && linha[32] < 220, `meio: ${linha[32]}`);
});

test("o retângulo mínimo acha o giro de um retângulo girado", () => {
  const pontos = [];
  const t = (12 * Math.PI) / 180;
  for (const [u, v] of [[-50, -20], [50, -20], [50, 20], [-50, 20]]) pontos.push({ x: 200 + u * Math.cos(t) - v * Math.sin(t), y: 100 + u * Math.sin(t) + v * Math.cos(t) });
  const r = retanguloMinimo(pontos);
  assert.ok(Math.abs(r.angulo - 12) < 0.01, `ângulo ${r.angulo}`);
  assert.ok(Math.abs(r.largura - 100) < 0.01 && Math.abs(r.altura - 40) < 0.01);
  assert.ok(Math.abs(r.cx - 200) < 0.01 && Math.abs(r.cy - 100) < 0.01);
});

test("acha duas fotos escaneadas, uma girada, e o canto vai para o lugar", () => {
  const l = 400;
  const a = 300;
  const t = (-8 * Math.PI) / 180;
  const imagem = lisa(l, a, (x, y) => {
    if (x >= 30 && x < 150 && y >= 40 && y < 120) return [200, 40, 40, 255];
    const u = (x - 280) * Math.cos(t) + (y - 180) * Math.sin(t);
    const v = -(x - 280) * Math.sin(t) + (y - 180) * Math.cos(t);
    if (Math.abs(u) < 70 && Math.abs(v) < 45) return [40, 60, 200, 255];
    return [245, 245, 245, 255];
  });
  const fotos = acharFotos(imagem);
  assert.equal(fotos.length, 2);
  assert.ok(Math.abs(fotos[0].largura - 120) < 4 && Math.abs(fotos[0].altura - 80) < 4 && Math.abs(fotos[0].angulo) < 1, JSON.stringify(fotos[0]));
  assert.ok(Math.abs(fotos[1].angulo + 8) < 1.5 && Math.abs(fotos[1].largura - 140) < 6, JSON.stringify(fotos[1]));
  const cantos = cantosNaFoto({ cx: 100, cy: 50, largura: 40, altura: 20, angulo: 0 }, { largura: 200, altura: 100 });
  assert.deepEqual(cantos[0], { x: -80, y: -40 });
});

test("a grade da folha de contato e o encaixe", () => {
  const celulas = celulasDaFolha({ ...OPCOES_PADRAO_DA_FOLHA, largura: 1000, altura: 800, colunas: 2, linhas: 2, margem: 50, espaco: 20, legenda: 30 });
  assert.equal(celulas.length, 4);
  assert.deepEqual(celulas[3].imagem, { x: 510, y: 410, largura: 440, altura: 310 });
  assert.deepEqual(celulas[0].legenda, { x: 50, y: 360, largura: 440, altura: 30 });
  const deitada = encaixar({ largura: 400, altura: 200 }, { x: 0, y: 0, largura: 100, altura: 300 }, true);
  assert.equal(deitada.girada, true);
  assert.equal(encaixar({ largura: 400, altura: 200 }, { x: 0, y: 0, largura: 100, altura: 300 }, false).largura, 100);
  assert.equal(paginasDaFolha(21, { ...OPCOES_PADRAO_DA_FOLHA, colunas: 4, linhas: 5 }), 2);
});
