import assert from "node:assert/strict";
import { test } from "node:test";

import { alvoDoRetoque, apagarFundoNaMarca, borrarMarca, estadoNovo, type Marca, MISTURADOR_PADRAO, misturarMarca, RETOQUE_PADRAO, SUBSTITUICAO_PADRAO, substituirCorNaMarca } from "./retoque.ts";

/** Um xadrez de casas de `casa` pixels entre dois cinzas. */
function xadrez(lado: number, a = 60, b = 200, casa = 1) {
  const dados = new Uint8ClampedArray(lado * lado * 4);
  for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) dados.set((Math.floor(x / casa) + Math.floor(y / casa)) % 2 ? [b, b, b, 255] : [a, a, a, 255], (y * lado + x) * 4);
  return dados;
}

const variacao = (dados: Uint8ClampedArray, lado: number) => {
  let soma = 0;
  for (let x = 1; x < lado; x++) soma += Math.abs(dados[(8 * lado + x) * 4] - dados[(8 * lado + x - 1) * 4]);
  return soma / (lado - 1);
};

test("desfoque: o xadrez some, mais com mais força, e o alfa não muda", () => {
  const dados = xadrez(32, 60, 200, 4);
  const fraco = alvoDoRetoque("desfoque", dados, 32, 32, { ...RETOQUE_PADRAO, forca: 0.1 });
  const forte = alvoDoRetoque("desfoque", dados, 32, 32, { ...RETOQUE_PADRAO, forca: 1 });
  // Antes: 140 a cada 4 pixels (35 em média)
  assert.ok(variacao(fraco, 32) < 35 && variacao(forte, 32) < variacao(fraco, 32) / 3, `${variacao(fraco, 32)} ${variacao(forte, 32)}`);
  assert.equal(forte[3], 255);
});

test("desfoque no modo escurecer só escurece", () => {
  const dados = xadrez(16);
  const saida = alvoDoRetoque("desfoque", dados, 16, 16, { ...RETOQUE_PADRAO, forca: 1, modo: "escurecer" });
  for (let i = 0; i < saida.length; i += 4) assert.ok(saida[i] <= dados[i]);
  // O claro desce até a média, o escuro fica
  assert.equal(saida[0], 60);
});

test("nitidez: a borda fica mais marcada; protegendo os detalhes, não passa dos vizinhos", () => {
  const lado = 16;
  const dados = new Uint8ClampedArray(lado * lado * 4);
  for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) dados.set(x < 8 ? [80, 80, 80, 255] : [x === 8 ? 120 : 160, x === 8 ? 120 : 160, x === 8 ? 120 : 160, 255], (y * lado + x) * 4);
  const livre = alvoDoRetoque("nitidez", dados, lado, lado, { ...RETOQUE_PADRAO, forca: 1, protegerDetalhes: false });
  const protegida = alvoDoRetoque("nitidez", dados, lado, lado, { ...RETOQUE_PADRAO, forca: 1, protegerDetalhes: true });
  const em = (d: Uint8ClampedArray, x: number) => d[(8 * lado + x) * 4];
  // Sem proteção: halo (o escuro passa de 80 para baixo na borda)
  assert.ok(em(livre, 7) < 80, String(em(livre, 7)));
  // Com proteção: nada abaixo de 80 nem acima de 160, e a borda do meio ainda mais marcada que antes
  for (let x = 0; x < lado; x++) assert.ok(em(protegida, x) >= 80 && em(protegida, x) <= 160);
  assert.ok(Math.abs(em(protegida, 9) - em(protegida, 7)) >= 80);
});

test("subexposição clareia os meios-tons e, protegendo os tons, guarda a cor", () => {
  const dados = new Uint8ClampedArray([120, 60, 30, 255, 128, 128, 128, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
  const saida = alvoDoRetoque("subexposicao", dados, 2, 2, { ...RETOQUE_PADRAO, forca: 0.5 });
  assert.ok(saida[4] > 150, String(saida[4]));
  // A proporção entre os canais fica (o matiz)
  assert.ok(Math.abs(saida[0] / saida[1] - 2) < 0.1, `${saida[0]} ${saida[1]}`);
  // O preto e o branco não mudam
  assert.deepEqual([...saida.slice(8, 16)], [0, 0, 0, 255, 255, 255, 255, 255]);
  const escura = alvoDoRetoque("superexposicao", dados, 2, 2, { ...RETOQUE_PADRAO, forca: 0.5, intervalo: "realces" });
  assert.ok(escura[4] < 128);
});

test("esponja: saturar afasta do cinza, dessaturar aproxima", () => {
  const dados = new Uint8ClampedArray([180, 120, 100, 255]);
  const mais = alvoDoRetoque("esponja", dados, 1, 1, { ...RETOQUE_PADRAO, forca: 1, esponja: "saturar", vibracao: false });
  const menos = alvoDoRetoque("esponja", dados, 1, 1, { ...RETOQUE_PADRAO, forca: 1, esponja: "dessaturar", vibracao: false });
  assert.ok(mais[0] - mais[2] > 80, `${mais[0]} ${mais[2]}`);
  assert.ok(Math.abs(menos[0] - menos[2]) <= 1);
});

/** Uma marca de `lado` com a metade esquerda numa cor e a direita noutra, peso 1 em tudo. */
function marca(lado: number, esquerda: number[], direita: number[]): Marca {
  const pixels = new Uint8ClampedArray(lado * lado * 4);
  for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) pixels.set(x < lado / 2 ? esquerda : direita, (y * lado + x) * 4);
  return { lado, pixels, peso: new Float32Array(lado * lado).fill(1), dentro: new Uint8Array(lado * lado).fill(1) };
}

test("borrar: a tinta da marca anterior vem junto", () => {
  const estado = estadoNovo();
  const vermelha = marca(8, [255, 0, 0, 255], [255, 0, 0, 255]);
  borrarMarca(vermelha, estado, 0.8, [0, 0, 0], false);
  const azul = marca(8, [0, 0, 255, 255], [0, 0, 255, 255]);
  borrarMarca(azul, estado, 0.8, [0, 0, 0], false);
  assert.ok(azul.pixels[0] > 180, String(azul.pixels[0]));
  // Com a pintura com o dedo, a primeira marca já leva o primeiro plano
  const dedo = marca(8, [0, 0, 255, 255], [0, 0, 255, 255]);
  borrarMarca(dedo, estadoNovo(), 1, [0, 1, 0], true);
  assert.equal(dedo.pixels[1], 255);
});

test("misturador: o reservatório pinta, a tinta acaba sem carga e a tela suja o pincel", () => {
  const estado = estadoNovo();
  const opcoes = { ...MISTURADOR_PADRAO, umido: 0, mistura: 0, carga: 0 };
  const branca = marca(4, [255, 255, 255, 255], [255, 255, 255, 255]);
  misturarMarca(branca, estado, opcoes, [1, 0, 0]);
  assert.deepEqual([...branca.pixels.slice(0, 4)], [255, 0, 0, 255]);
  for (let i = 0; i < 12; i++) misturarMarca(marca(4, [255, 255, 255, 255], [255, 255, 255, 255]), estado, opcoes, [1, 0, 0]);
  assert.equal(estado.tinta, 0);
  // Úmido e meio a meio: o pincel pega metade da tela e solta metade disso e metade do reservatório (seco, a mistura
  // não muda nada: não há tinta da tela no pincel)
  const meio = marca(4, [0, 255, 0, 255], [0, 255, 0, 255]);
  misturarMarca(meio, estadoNovo(), { ...MISTURADOR_PADRAO, umido: 1, mistura: 0.5 }, [1, 0, 0]);
  assert.deepEqual([...meio.pixels.slice(0, 3)].map((v) => Math.round(v / 8)), [24, 8, 0]);
  // Molhado e só mistura: o pincel pega a cor da tela e não solta a do reservatório
  const molhado = estadoNovo();
  const verde = marca(4, [0, 255, 0, 255], [0, 255, 0, 255]);
  misturarMarca(verde, molhado, { ...MISTURADOR_PADRAO, umido: 1, mistura: 1 }, [1, 0, 0]);
  assert.ok(molhado.carregado![1] > 0.4 && molhado.carregado![0] < 0.6, String([...molhado.carregado!.slice(0, 4)]));
});

test("substituição de cor: só a cor parecida ligada ao meio muda, com a luz de cada pixel", () => {
  // Faixas verticais: azul, cinza e azul; o meio da marca cai no azul da direita
  const lado = 9;
  const pixels = new Uint8ClampedArray(lado * lado * 4);
  for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) pixels.set(x < 3 ? [0, 0, 200, 255] : x < 4 ? [128, 128, 128, 255] : [0, 0, 200, 255], (y * lado + x) * 4);
  const m: Marca = { lado, pixels, peso: new Float32Array(lado * lado).fill(1), dentro: new Uint8Array(lado * lado).fill(1) };
  substituirCorNaMarca(m, estadoNovo(), { ...SUBSTITUICAO_PADRAO, suavizar: false }, [1, 0, 0], [1, 1, 1], 1);
  const em = (x: number) => [...pixels.slice((4 * lado + x) * 4, (4 * lado + x) * 4 + 3)];
  assert.ok(em(6)[0] > em(6)[2], String(em(6)));
  // O azul da esquerda não encosta no meio (o cinza separa) e fica
  assert.deepEqual(em(1), [0, 0, 200]);
  assert.deepEqual(em(3), [128, 128, 128]);
  // Não contíguo: o da esquerda também
  const todo = marca(9, [0, 0, 200, 255], [0, 0, 200, 255]);
  todo.pixels.set([128, 128, 128, 255], (4 * 9 + 3) * 4);
  substituirCorNaMarca(todo, estadoNovo(), { ...SUBSTITUICAO_PADRAO, limites: "naoContiguo" }, [1, 0, 0], [1, 1, 1], 1);
  assert.ok(todo.pixels[0] > todo.pixels[2]);
});

test("borracha de fundo: apaga a cor do meio e guarda a outra (e a do primeiro plano, protegida)", () => {
  const m = marca(8, [250, 250, 250, 255], [30, 120, 40, 255]);
  // O meio (4, 4) cai na direita: verde
  apagarFundoNaMarca(m, estadoNovo(), { ...SUBSTITUICAO_PADRAO, limites: "naoContiguo", tolerancia: 40 }, [0, 0, 0], [1, 1, 1], 1);
  assert.equal(m.pixels[(4 * 8 + 6) * 4 + 3], 0);
  assert.equal(m.pixels[(4 * 8 + 1) * 4 + 3], 255);
  const protegida = marca(8, [250, 250, 250, 255], [30, 120, 40, 255]);
  apagarFundoNaMarca(protegida, estadoNovo(), { ...SUBSTITUICAO_PADRAO, limites: "naoContiguo", tolerancia: 40, protegerPrimeiroPlano: true }, [30 / 255, 120 / 255, 40 / 255], [1, 1, 1], 1);
  assert.equal(protegida.pixels[(4 * 8 + 6) * 4 + 3], 255);
});
