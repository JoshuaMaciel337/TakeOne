import assert from "node:assert/strict";
import { test } from "node:test";

import { colarSemEmenda, corrigirTom, melhorDeslocamento, preencherBuraco, preencherBuracos } from "./recuperar.ts";

/** Um degradê horizontal (de 40 a 200 de cinza) com um grão fino de xadrez (±10). */
function imagem(largura: number, altura: number, grao = 10) {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const v = 40 + (160 * x) / (largura - 1) + ((x + y) % 2 ? grao : -grao);
      dados.set([v, v, v, 255], (y * largura + x) * 4);
    }
  }
  return dados;
}

test("o buraco é preenchido pelo que está em volta, no degradê", () => {
  const largura = 60;
  const altura = 40;
  const dados = imagem(largura, altura, 0);
  const original = Uint8ClampedArray.from(dados);
  const buraco = new Uint8Array(largura * altura);
  // Um borrão vermelho de 10 × 10 no meio, que vira buraco
  for (let y = 15; y < 25; y++) {
    for (let x = 25; x < 35; x++) {
      buraco[y * largura + x] = 1;
      dados.set([255, 0, 0, 255], (y * largura + x) * 4);
    }
  }
  preencherBuraco(dados, largura, altura, buraco, { jeito: "liso" });
  let maior = 0;
  for (let y = 15; y < 25; y++) for (let x = 25; x < 35; x++) maior = Math.max(maior, Math.abs(dados[(y * largura + x) * 4] - original[(y * largura + x) * 4]), dados[(y * largura + x) * 4 + 1] === 0 ? 255 : 0);
  // A membrana de um degradê linear é o próprio degradê
  assert.ok(maior <= 3, String(maior));
  // Fora do buraco nada muda
  assert.equal(dados[0], original[0]);
});

test("com textura, o grão do lugar parecido volta dentro do buraco", () => {
  const largura = 60;
  const altura = 40;
  const dados = imagem(largura, altura, 12);
  const buraco = new Uint8Array(largura * altura);
  for (let y = 15; y < 25; y++) for (let x = 25; x < 35; x++) buraco[y * largura + x] = 1;
  preencherBuraco(dados, largura, altura, buraco, { jeito: "textura" });
  // A variação entre vizinhos dentro do buraco não é lisa
  let variacao = 0;
  for (let x = 26; x < 34; x++) variacao += Math.abs(dados[(20 * largura + x) * 4] - dados[(20 * largura + x - 1) * 4]);
  assert.ok(variacao / 8 > 4, String(variacao / 8));
});

test("corrigir o tom: a textura da fonte com a luz do destino", () => {
  const largura = 40;
  const altura = 20;
  // Destino liso e claro; fonte escura com grão
  const destino = new Uint8ClampedArray(largura * altura * 4);
  for (let i = 0; i < largura * altura; i++) destino.set([200, 200, 200, 255], i * 4);
  const fonte = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) fonte.set([(x + y) % 2 ? 70 : 50, 60, 60, 255], (y * largura + x) * 4);
  const saida = corrigirTom(destino, fonte, largura, altura, 6);
  // A média fica perto do destino e o grão da fonte (±10) continua
  let soma = 0;
  for (let i = 0; i < largura * altura; i++) soma += saida[i * 4];
  assert.ok(Math.abs(soma / (largura * altura) - 200) < 5, String(soma / (largura * altura)));
  assert.ok(Math.abs(saida[(10 * largura + 20) * 4] - saida[(10 * largura + 21) * 4]) > 12);
});

/** Listras verticais de período 6 (a "água" com reflexos) sobre um degradê vertical. */
function listras(largura: number, altura: number) {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const v = 60 + y * 2 + (x % 6 < 2 ? 80 : 0);
      dados.set([v, v / 2, 255 - v, 255], (y * largura + x) * 4);
    }
  }
  return dados;
}

test("remendo: o lugar parecido vem inteiro, no tom de volta, sem chuvisco", () => {
  const largura = 90;
  const altura = 60;
  const dados = listras(largura, altura);
  const original = Uint8ClampedArray.from(dados);
  const buraco = new Uint8Array(largura * altura);
  for (let y = 22; y < 36; y++) {
    for (let x = 38; x < 52; x++) {
      buraco[y * largura + x] = 1;
      dados.set([255, 255, 255, 255], (y * largura + x) * 4);
    }
  }
  const lugar = melhorDeslocamento(dados, largura, altura, buraco, 3);
  assert.ok(lugar);
  // As listras têm período 6: o lugar escolhido mantém a fase delas
  assert.equal(((lugar.dx % 6) + 6) % 6, 0);
  preencherBuraco(dados, largura, altura, buraco, { jeito: "remendo", alcance: 3 });
  let soma = 0;
  for (let y = 22; y < 36; y++) for (let x = 38; x < 52; x++) for (let c = 0; c < 3; c++) soma += Math.abs(dados[(y * largura + x) * 4 + c] - original[(y * largura + x) * 4 + c]);
  // O degradê vertical some na emenda (o lugar pode estar acima ou abaixo) e as listras voltam no lugar
  assert.ok(soma / (14 * 14 * 3) < 3, String(soma / (14 * 14 * 3)));
});

test("colar sem emenda: a textura da fonte com a luz em volta, e nada muda fora da região", () => {
  const largura = 40;
  const altura = 40;
  const destino = new Uint8ClampedArray(largura * altura * 4);
  for (let i = 0; i < largura * altura; i++) destino.set([200, 200, 200, 255], i * 4);
  const fonte = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) fonte.set([(x + y) % 2 ? 70 : 50, 60, 60, 255], (y * largura + x) * 4);
  const regiao = new Uint8Array(largura * altura);
  for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) regiao[y * largura + x] = 255;
  const saida = colarSemEmenda(destino, fonte, largura, altura, regiao);
  assert.equal(saida[(5 * largura + 5) * 4], 200);
  // Dentro: perto de 200 (na borda e no meio) e com o xadrez de ±10
  const v = (x: number, y: number) => saida[(y * largura + x) * 4];
  assert.ok(Math.abs((v(20, 20) + v(21, 20)) / 2 - 200) < 3, `${v(20, 20)} ${v(21, 20)}`);
  assert.ok(Math.abs((v(10, 20) + v(11, 20)) / 2 - 200) < 3, `${v(10, 20)} ${v(11, 20)}`);
  assert.ok(Math.abs(v(20, 20) - v(21, 20)) > 15);
});

test("vários buracos separados: cada um é preenchido pelo que está em volta dele", () => {
  const largura = 90;
  const altura = 60;
  const dados = listras(largura, altura);
  const original = Uint8ClampedArray.from(dados);
  const buraco = new Uint8Array(largura * altura);
  // Duas cunhas nos cantos de cima (como as de um corte girado)
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10 - y; x++) {
      buraco[y * largura + x] = 1;
      buraco[y * largura + largura - 1 - x] = 1;
      dados.set([0, 0, 0, 0], (y * largura + x) * 4);
      dados.set([0, 0, 0, 0], (y * largura + largura - 1 - x) * 4);
    }
  }
  assert.equal(preencherBuracos(dados, largura, altura, buraco, { jeito: "remendo", alcance: 4 }), 2);
  let soma = 0;
  let quantos = 0;
  for (let i = 0; i < largura * altura; i++) {
    if (!buraco[i]) continue;
    assert.equal(dados[i * 4 + 3], 255);
    soma += Math.abs(dados[i * 4] - original[i * 4]);
    quantos++;
  }
  assert.ok(soma / quantos < 12, String(soma / quantos));
});
