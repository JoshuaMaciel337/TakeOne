import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CORRESPONDER_PADRAO,
  corresponderCor,
  dessaturar,
  equalizar,
  estatisticasDaCor,
  HDR_PADRAO,
  misturarComCobertura,
  pesoDaCor,
  SOMBRAS_REALCES_PADRAO,
  sombrasRealces,
  substituirCor,
  tabelaDaEqualizacao,
  tonalizacaoHdr,
} from "./ajustesNosPixels.ts";

/** Uma imagem de largura × 1 com os tons pedidos (cinza). */
const cinzas = (tons: number[]) => new Uint8ClampedArray(tons.flatMap((t) => [t, t, t, 255]));

test("sombras/realces clareia o escuro e não mexe no claro (com os realces em 0)", () => {
  const dados = cinzas([20, 20, 20, 230, 230, 230]);
  sombrasRealces(dados, 6, 1, { ...SOMBRAS_REALCES_PADRAO, sombras: { quantidade: 80, tom: 60, raio: 1 }, cor: 0 });
  assert.ok(dados[0] > 40, `escuro ficou ${dados[0]}`);
  assert.ok(Math.abs(dados[16] - 230) <= 2, `claro ficou ${dados[16]}`);
  // Os realces escurecem o claro
  const outra = cinzas([20, 20, 20, 230, 230, 230]);
  sombrasRealces(outra, 6, 1, { ...SOMBRAS_REALCES_PADRAO, sombras: { quantidade: 0, tom: 50, raio: 1 }, realces: { quantidade: 80, tom: 60, raio: 1 }, cor: 0 });
  assert.ok(outra[16] < 210, `claro ficou ${outra[16]}`);
  assert.ok(Math.abs(outra[0] - 20) <= 2);
});

test("dessaturar usa a luminosidade (a média do maior e do menor)", () => {
  const dados = new Uint8ClampedArray([255, 0, 0, 255, 10, 200, 100, 128]);
  dessaturar(dados);
  assert.deepEqual([...dados], [128, 128, 128, 255, 105, 105, 105, 128]);
});

test("equalizar espalha os tons e a tabela é crescente", () => {
  const luma = new Float32Array([0.4, 0.4, 0.5, 0.5, 0.6, 0.6]);
  const tabela = tabelaDaEqualizacao(luma);
  assert.equal(tabela[102], 0);
  assert.equal(tabela[153], 1);
  for (let i = 1; i < 256; i++) assert.ok(tabela[i] >= tabela[i - 1]);
  const dados = cinzas([102, 128, 153]);
  equalizar(dados, 3, 1);
  assert.deepEqual([dados[0], dados[8]], [0, 255]);
});

test("corresponder cor leva a média à da origem; atenuar 100 não muda nada", () => {
  const alvo = cinzas([60, 80, 100, 120]);
  const origem = new Uint8ClampedArray([200, 120, 40, 255, 220, 140, 60, 255]);
  const a = estatisticasDaCor(alvo)!;
  const o = estatisticasDaCor(origem)!;
  const copia = alvo.slice();
  corresponderCor(copia, a, o, CORRESPONDER_PADRAO);
  const depois = estatisticasDaCor(copia)!;
  assert.ok(Math.abs(depois.media[0] - o.media[0]) < 0.02);
  assert.ok(depois.media[2] > 0.05, "ficou alaranjada");
  const atenuada = alvo.slice();
  corresponderCor(atenuada, a, o, { ...CORRESPONDER_PADRAO, atenuar: 100 });
  assert.deepEqual([...atenuada], [...alvo]);
});

test("substituir cor só muda o que está perto da cor escolhida", () => {
  assert.equal(pesoDaCor(255, 0, 0, [255, 0, 0], 40), 1);
  assert.equal(pesoDaCor(0, 0, 255, [255, 0, 0], 40), 0);
  const dados = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
  substituirCor(dados, { cor: "#ff0000", imprecisao: 40, matiz: 120, saturacao: 0, luminosidade: 0 });
  assert.deepEqual([...dados], [0, 255, 0, 255, 0, 0, 255, 255]);
});

test("a tonalização HDR por exposição e gama", () => {
  const dados = cinzas([64]);
  tonalizacaoHdr(dados, 1, 1, { ...HDR_PADRAO, metodo: "exposicao_gama", exposicao: 1, gama: 1, saturacao: 0 });
  assert.ok(Math.abs(dados[0] - 128) <= 1);
});

test("a seleção mistura o resultado com o original", () => {
  const original = cinzas([0, 0]);
  const resultado = cinzas([200, 200]);
  misturarComCobertura(original, resultado, new Uint8Array([255, 64]));
  assert.deepEqual([resultado[0], resultado[4]], [200, 50]);
});
