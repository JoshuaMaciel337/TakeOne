import assert from "node:assert/strict";
import { test } from "node:test";

import { corrigirGrandeAngular, corrigirLente, focalPelasRestricoes, LENTE_PADRAO, pontoNoResultado } from "./lente.ts";

function xadrez(largura: number, altura: number) {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) dados.set([(x * 7) % 256, (y * 9) % 256, 100, 255], (y * largura + x) * 4);
  return dados;
}

test("sem ajuste, a correção de lente devolve a foto", () => {
  const dados = xadrez(40, 30);
  const saida = corrigirLente({ dados, largura: 40, altura: 30 }, LENTE_PADRAO, "vizinho");
  assert.deepEqual([...saida], [...dados]);
});

test("barril: o canto do resultado lê mais longe do meio; a vinheta escurece a borda", () => {
  const largura = 60;
  const altura = 40;
  const dados = new Uint8ClampedArray(largura * altura * 4);
  // A coluna x vale x (para saber de onde cada pixel veio)
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) dados.set([x * 4, 0, 0, 255], (y * largura + x) * 4);
  const barril = corrigirLente({ dados, largura, altura }, { ...LENTE_PADRAO, distorcao: 60 }, "vizinho");
  // Num ponto perto da borda direita, no meio da altura: veio de mais à direita (ou ficou fora)
  const k = (20 * largura + 50) * 4;
  assert.ok(barril[k + 3] === 0 || barril[k] > 50 * 4, String(barril[k]));
  const branca = new Uint8ClampedArray(largura * altura * 4).fill(200);
  const comVinheta = corrigirLente({ dados: branca, largura, altura }, { ...LENTE_PADRAO, vinheta: -80 }, "vizinho");
  assert.ok(comVinheta[0] < comVinheta[(20 * largura + 30) * 4], "o canto mais escuro que o meio");
});

test("olho de peixe: o resultado é retilíneo, e as restrições acham a focal da lente", () => {
  const largura = 400;
  const altura = 300;
  const focalDaLente = 0.8;
  // Uma reta do mundo (retilínea) vista pela lente: os pontos dela levados à foto pelo contrário do resultado
  const naLente = (x: number, y: number) => {
    // Procura o ponto da foto que vai para (x, y): a projeção é radial, então basta o raio
    const cx = largura / 2;
    const cy = altura / 2;
    const d = Math.hypot(cx, cy);
    const nx = (x - cx) / d;
    const ny = (y - cy) / d;
    const r = Math.hypot(nx, ny);
    const theta = Math.atan(r / focalDaLente);
    const k = (focalDaLente * theta) / r;
    return { x: cx + nx * k * d, y: cy + ny * k * d };
  };
  const reta = [0, 0.25, 0.5, 0.75, 1].map((t) => naLente(30 + t * 340, 40));
  const reta2 = [0, 0.25, 0.5, 0.75, 1].map((t) => naLente(60, 30 + t * 240));
  const focal = focalPelasRestricoes([reta, reta2], largura, altura, "olhoDePeixe")!;
  assert.ok(Math.abs(focal - focalDaLente) < 0.02, String(focal));
  // A reta medida volta reta pelo resultado
  const volta = reta.map((p) => pontoNoResultado("olhoDePeixe", p, largura, altura, focal));
  for (const p of volta) assert.ok(Math.abs(p.y - 40) < 1, String(p.y));
  // A imagem corrigida tem o mesmo tamanho e o meio no lugar
  const dados = xadrez(40, 30);
  const saida = corrigirGrandeAngular({ dados, largura: 40, altura: 30 }, { tipo: "olhoDePeixe", focal: 1, escala: 100 }, "vizinho");
  assert.deepEqual([...saida.slice((15 * 40 + 20) * 4, (15 * 40 + 20) * 4 + 4)], [...dados.slice((15 * 40 + 20) * 4, (15 * 40 + 20) * 4 + 4)]);
});
