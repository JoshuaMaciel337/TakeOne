import assert from "node:assert/strict";
import { test } from "node:test";

import { areaDeFoco, INTERVALO_PADRAO, intervaloDeCores, lab } from "./cores.ts";

/** Faixas verticais: vermelho, verde, azul, cinza claro, cinza escuro e um tom de pele. */
function faixas() {
  const cores = [
    [220, 30, 30],
    [30, 200, 40],
    [30, 50, 220],
    [235, 235, 235],
    [25, 25, 25],
    [224, 172, 140],
  ];
  const largura = cores.length * 10;
  const altura = 4;
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) dados.set([...cores[Math.floor(x / 10)], 255], (y * largura + x) * 4);
  return { largura, altura, dados };
}
const coluna = (s: { dados: Uint8Array }, faixa: number) => s.dados[faixa * 10 + 5];

test("o Lab do branco e do preto", () => {
  const branco = lab([255, 255, 255]);
  assert.ok(Math.abs(branco[0] - 100) < 0.1 && Math.abs(branco[1]) < 0.5 && Math.abs(branco[2]) < 0.5);
  assert.ok(Math.abs(lab([0, 0, 0])[0]) < 0.01);
});

test("cores amostradas, com a imprecisão e a amostra tirada", () => {
  const img = faixas();
  const verde = intervaloDeCores(img, { ...INTERVALO_PADRAO, amostras: [[30, 200, 40]] });
  assert.equal(coluna(verde, 1), 255);
  assert.equal(coluna(verde, 0), 0);
  assert.equal(coluna(verde, 2), 0);
  // Com o vermelho também, e tirando o vermelho de novo
  const dois = intervaloDeCores(img, { ...INTERVALO_PADRAO, amostras: [[30, 200, 40], [220, 30, 30]] });
  assert.equal(coluna(dois, 0), 255);
  const tirado = intervaloDeCores(img, { ...INTERVALO_PADRAO, amostras: [[30, 200, 40], [220, 30, 30]], tiradas: [[220, 30, 30]] });
  assert.equal(coluna(tirado, 0), 0);
  // Invertida
  assert.equal(coluna(intervaloDeCores(img, { ...INTERVALO_PADRAO, amostras: [[30, 200, 40]], inverter: true }), 1), 0);
});

test("faixas de cor, de luz e a pele", () => {
  const img = faixas();
  const azuis = intervaloDeCores(img, { ...INTERVALO_PADRAO, faixa: "azuis" });
  assert.equal(coluna(azuis, 2), 255);
  assert.equal(coluna(azuis, 1), 0);
  assert.equal(coluna(azuis, 3), 0);
  const realces = intervaloDeCores(img, { ...INTERVALO_PADRAO, faixa: "realces" });
  assert.equal(coluna(realces, 3), 255);
  assert.equal(coluna(realces, 4), 0);
  const sombras = intervaloDeCores(img, { ...INTERVALO_PADRAO, faixa: "sombras" });
  assert.equal(coluna(sombras, 4), 255);
  assert.equal(coluna(sombras, 3), 0);
  const pele = intervaloDeCores(img, { ...INTERVALO_PADRAO, faixa: "pele" });
  assert.equal(coluna(pele, 5), 255);
  assert.equal(coluna(pele, 2), 0);
});

test("a área de foco pega a metade nítida e deixa a lisa", () => {
  const largura = 120;
  const altura = 60;
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      // À esquerda um xadrez fino (nítido); à direita um degradê suave (fora de foco)
      const v = x < 60 ? ((x >> 1) + (y >> 1)) % 2 ? 230 : 30 : 100 + (x - 60);
      dados.set([v, v, v, 255], (y * largura + x) * 4);
    }
  }
  const foco = areaDeFoco({ largura, altura, dados }, { intervalo: null, ruido: 0.3 });
  assert.equal(foco.dados[30 * largura + 20], 255);
  assert.equal(foco.dados[30 * largura + 100], 0);
});

test("o céu desce do alto pelo degradê e para no contorno dos prédios", async () => {
  const { ceu } = await import("./cores.ts");
  const largura = 160;
  const altura = 100;
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      // Os prédios: blocos escuros que sobem até alturas diferentes; o céu, um degradê de azul a laranja
      const topoDoPredio = 50 + ((Math.floor(x / 20) * 37) % 30);
      const predio = y >= topoDoPredio;
      const t = y / altura;
      const cor = predio ? [40, 40, 50] : [Math.round(60 + 190 * t), Math.round(90 + 60 * t), Math.round(220 - 160 * t)];
      dados.set([...cor, 255], (y * largura + x) * 4);
    }
  }
  const s = ceu({ largura, altura, dados });
  assert.equal(s.dados[5 * largura + 80], 255);
  assert.equal(s.dados[45 * largura + 10], 255);
  assert.equal(s.dados[95 * largura + 10], 0);
  assert.equal(s.dados[90 * largura + 150], 0);
});
