import assert from "node:assert/strict";
import { test } from "node:test";

import { retangulo } from "./mascara.ts";
import { descontaminar, filtroGuiado, mediaNaJanela, REFINAMENTO_PADRAO, refinarSelecao } from "./refinar.ts";

test("a média na janela de um degrau", () => {
  const v = Float32Array.from([0, 0, 0, 1, 1, 1]);
  const m = mediaNaJanela(v, 6, 1, 1);
  assert.deepEqual([...m].map((x) => Math.round(x * 3)), [0, 0, 1, 2, 3, 3]);
});

test("o filtro guiado leva a cobertura para a borda da imagem", () => {
  // A imagem tem a borda em x = 12; a seleção tem a borda em x = 9 (errada)
  const largura = 24;
  const luz = new Float32Array(largura).map((_, x) => (x < 12 ? 0.9 : 0.1));
  const cobertura = new Float32Array(largura).map((_, x) => (x < 9 ? 1 : 0));
  const guiada = filtroGuiado(luz, cobertura, largura, 1, 4, 1e-3);
  // Dentro da faixa, a cobertura segue a luz: dos dois lados da borda de verdade os valores se separam
  assert.ok(guiada[10] - guiada[13] > 0.4, `${guiada[10]} ${guiada[13]}`);
});

test("refinar com raio puxa a borda da seleção para a borda da imagem; sem nada, não muda", () => {
  const largura = 60;
  const altura = 20;
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) dados.set(x < 30 ? [230, 230, 230, 255] : [20, 20, 20, 255], (y * largura + x) * 4);
  const imagem = { largura, altura, dados };
  const selecao = retangulo(largura, altura, { x: 0, y: 0, largura: 26, altura }, false);
  assert.deepEqual(refinarSelecao(imagem, selecao, REFINAMENTO_PADRAO).dados, selecao.dados);
  const refinada = refinarSelecao(imagem, selecao, { ...REFINAMENTO_PADRAO, raio: 8 });
  // Entre a borda errada (26) e a de verdade (30), a cobertura subiu; depois da de verdade, continua baixa
  assert.ok(refinada.dados[10 * largura + 28] > 128, String(refinada.dados[10 * largura + 28]));
  assert.ok(refinada.dados[10 * largura + 33] < 64, String(refinada.dados[10 * largura + 33]));
  // Contraste endurece; deslocar para fora sobe a cobertura
  const macia = refinarSelecao(imagem, selecao, { ...REFINAMENTO_PADRAO, difusao: 6 });
  const dura = refinarSelecao(imagem, selecao, { ...REFINAMENTO_PADRAO, difusao: 6, contraste: 60 });
  assert.ok(Math.abs(dura.dados[10 * largura + 24] - 128) > Math.abs(macia.dados[10 * largura + 24] - 128));
  const fora = refinarSelecao(imagem, selecao, { ...REFINAMENTO_PADRAO, difusao: 6, deslocar: 50 });
  assert.ok(fora.dados[10 * largura + 27] > macia.dados[10 * largura + 27]);
});

test("descontaminar puxa a cor da borda para a de dentro", () => {
  const largura = 20;
  const dados = new Uint8ClampedArray(largura * 4);
  for (let x = 0; x < largura; x++) dados.set(x < 10 ? [250, 0, 0, 255] : [0, 0, 250, 255], x * 4);
  const selecao = { largura, altura: 1, dados: Uint8Array.from({ length: largura }, (_, x) => (x < 9 ? 255 : x === 10 ? 128 : 0)) };
  const limpa = descontaminar({ largura, altura: 1, dados }, selecao, 1, 4);
  // O pixel meio coberto (azul) ficou bem mais vermelho
  assert.ok(limpa.dados[10 * 4] > 100 && limpa.dados[10 * 4 + 2] < 150, `${limpa.dados[40]} ${limpa.dados[42]}`);
  // Os de dentro não mudam
  assert.equal(limpa.dados[0], 250);
});
