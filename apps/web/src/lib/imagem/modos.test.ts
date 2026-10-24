import assert from "node:assert/strict";
import { test } from "node:test";

import { aplicarModo, amostrasDoEspaco, BITMAP_PADRAO, cmykNaTela, CURVA_LINEAR, type FormaDoPonto, rgbParaCmyk, rgbParaLab, tabelaDoDuotone } from "./modos.ts";

const liso = (l: number, a: number, cor: [number, number, number, number]) => {
  const dados = new Uint8ClampedArray(l * a * 4);
  for (let p = 0; p < l * a; p++) dados.set(cor, p * 4);
  return dados;
};
const fracaoPreta = (dados: Uint8ClampedArray) => {
  let pretos = 0;
  for (let i = 0; i < dados.length; i += 4) if (dados[i] === 0) pretos++;
  return pretos / (dados.length / 4);
};

test("escala de cinza pela luz e o alfa fica", () => {
  const dados = Uint8ClampedArray.from([255, 0, 0, 200, 0, 0, 255, 255]);
  aplicarModo(dados, 2, 1, { tipo: "cinza" });
  assert.deepEqual(Array.from(dados), [76, 76, 76, 200, 29, 29, 29, 255]);
});

test("duotone de uma tinta preta linear é o cinza; a curva muda a tinta", () => {
  const tabela = tabelaDoDuotone([{ nome: "Preto", cor: "#000000", curva: CURVA_LINEAR }]);
  for (const g of [0, 64, 128, 200, 255]) assert.deepEqual(Array.from(tabela.subarray(g * 3, g * 3 + 3)), [g, g, g]);
  const sepia = tabelaDoDuotone([{ nome: "Preto", cor: "#000000", curva: CURVA_LINEAR }, { nome: "Marrom", cor: "#a0703c", curva: [0, 50, 80, 95, 100] }]);
  assert.deepEqual(Array.from(sepia.subarray(255 * 3)), [255, 255, 255], "o branco fica branco");
  assert.ok(sepia[128 * 3] > sepia[128 * 3 + 2], "o meio-tom fica quente");
});

test("bitmap: o limiar, e a média do padrão, da difusão e do meio-tom acompanham o cinza", () => {
  const limiar = liso(4, 1, [127, 127, 127, 255]);
  aplicarModo(limiar, 4, 1, { ...BITMAP_PADRAO, metodo: "limiar", limiar: 128 });
  assert.equal(fracaoPreta(limiar), 1);
  for (const metodo of ["padrao", "difusao"] as const) {
    const dados = liso(64, 64, [77, 77, 77, 255]);
    aplicarModo(dados, 64, 64, { ...BITMAP_PADRAO, metodo });
    assert.ok(Math.abs(fracaoPreta(dados) - (1 - 77 / 255)) < 0.03, `${metodo}: ${fracaoPreta(dados)}`);
  }
  for (const forma of ["redondo", "elipse", "linha", "quadrado", "losango", "cruz"] as FormaDoPonto[]) {
    const dados = liso(240, 240, [77, 77, 77, 255]);
    // 300 ppp a 30 linhas: células de 10 pixels
    aplicarModo(dados, 240, 240, { ...BITMAP_PADRAO, metodo: "meio_tom", frequencia: 30, angulo: 45, forma }, 300);
    assert.ok(Math.abs(fracaoPreta(dados) - (1 - 77 / 255)) < 0.06, `${forma}: ${fracaoPreta(dados)}`);
  }
});

test("o transparente vira branco no bitmap", () => {
  const dados = Uint8ClampedArray.from([0, 0, 0, 0]);
  aplicarModo(dados, 1, 1, { ...BITMAP_PADRAO, metodo: "limiar" });
  assert.deepEqual(Array.from(dados), [255, 255, 255, 255]);
});

test("cores indexadas na paleta guardada", () => {
  const dados = Uint8ClampedArray.from([100, 100, 100, 255, 200, 200, 200, 255]);
  aplicarModo(dados, 2, 1, { tipo: "indexadas", paleta: [[0, 0, 0], [255, 255, 255]], pontilhado: "nenhum", quantidade: 1, transparencia: false });
  assert.deepEqual(Array.from(dados), [0, 0, 0, 255, 255, 255, 255, 255]);
});

test("a separação CMYK: branco, preto, vermelho, a geração de preto e o limite de tinta", () => {
  assert.deepEqual(rgbParaCmyk(1, 1, 1, "media", 300), [0, 0, 0, 0]);
  assert.deepEqual(rgbParaCmyk(0, 0, 0, "maxima", 300), [0, 0, 0, 1]);
  assert.deepEqual(rgbParaCmyk(1, 0, 0, "nenhuma", 300), [0, 1, 1, 0]);
  const limitado = rgbParaCmyk(0, 0, 0, "nenhuma", 240);
  assert.ok(Math.abs(limitado[0] - 0.8) < 1e-9 && limitado[3] === 0);
  assert.deepEqual(cmykNaTela(0, 0, 0, 0), [255, 255, 255]);
  // A prova tira a saturação do verde puro da tela (fora do que as tintas imprimem)
  const [c, m, y, k] = rgbParaCmyk(0, 1, 0, "media", 300);
  const prova = cmykNaTela(c, m, y, k);
  assert.ok(prova[1] < 200 && prova[0] < 60, `verde na prova: ${prova}`);
});

test("Lab: o branco, o preto e o cinza neutro; as amostras com sinal", () => {
  const branco = rgbParaLab(1, 1, 1);
  assert.ok(Math.abs(branco[0] - 100) < 0.01 && Math.abs(branco[1]) < 0.01 && Math.abs(branco[2]) < 0.01);
  assert.deepEqual(rgbParaLab(0, 0, 0).map((v) => Math.round(v)), [0, 0, 0]);
  const amostras = amostrasDoEspaco(Uint8ClampedArray.from([255, 0, 0, 255]), 1, "lab");
  assert.equal(amostras[0], Math.round((53.24 * 255) / 100));
  assert.ok(amostras[1] > 0 && amostras[1] < 128, "a* positivo");
  const cmyk = amostrasDoEspaco(Uint8ClampedArray.from([0, 0, 0, 0]), 1, "cmyk");
  assert.deepEqual(Array.from(cmyk), [0, 0, 0, 0], "o transparente é papel");
});
