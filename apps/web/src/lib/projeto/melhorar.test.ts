import assert from "node:assert/strict";
import { test } from "node:test";

import { AJUSTES_NEUTROS, aplicarCor } from "./cor.ts";
import { ajustesAutomaticos } from "./melhorar.ts";

/** Uma amostra de n × n pixels com uma rampa de luz e a cor multiplicada por `tinta`. */
function amostra(tinta: [number, number, number], luz: [number, number], n = 32): Uint8ClampedArray {
  const dados = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const v = luz[0] + ((luz[1] - luz[0]) * (i % n)) / (n - 1);
    dados.set([v * tinta[0] * 255, v * tinta[1] * 255, v * tinta[2] * 255, 255], i * 4);
  }
  return dados;
}

function media(dados: Uint8ClampedArray, ajustes = AJUSTES_NEUTROS): [number, number, number] {
  const soma = [0, 0, 0];
  for (let i = 0; i < dados.length; i += 4) {
    const [r, g, b] = aplicarCor([dados[i] / 255, dados[i + 1] / 255, dados[i + 2] / 255], ajustes);
    soma[0] += r;
    soma[1] += g;
    soma[2] += b;
  }
  const n = dados.length / 4;
  return [soma[0] / n, soma[1] / n, soma[2] / n];
}

test("uma foto quente e escura fica mais fria e mais clara", () => {
  const dados = amostra([1, 0.8, 0.55], [0.05, 0.5]);
  const ajustes = ajustesAutomaticos(dados);
  assert.ok(ajustes.temperatura < 0, `temperatura ${ajustes.temperatura}`);
  assert.ok(ajustes.exposicao > 0, `exposição ${ajustes.exposicao}`);
  // Só o balanço de branco: o azul sobre o vermelho chega mais perto de 1
  const [r0, , b0] = media(dados);
  const [r1, , b1] = media(dados, { ...AJUSTES_NEUTROS, temperatura: ajustes.temperatura, tom: ajustes.tom });
  assert.ok(Math.abs(1 - b1 / r1) < Math.abs(1 - b0 / r0), `azul/vermelho de ${(b0 / r0).toFixed(2)} para ${(b1 / r1).toFixed(2)}`);
});

test("uma foto já equilibrada quase não muda", () => {
  const ajustes = ajustesAutomaticos(amostra([1, 1, 1], [0.02, 0.98]));
  assert.ok(Math.abs(ajustes.temperatura) < 0.02 && Math.abs(ajustes.tom) < 0.02);
  assert.ok(Math.abs(ajustes.exposicao) < 0.2);
  assert.equal(ajustes.contraste, 0);
});

test("uma foto lavada ganha contraste; transparente e vazia ficam neutras", () => {
  assert.ok(ajustesAutomaticos(amostra([1, 1, 1], [0.35, 0.65])).contraste > 0);
  assert.deepEqual(ajustesAutomaticos(new Uint8ClampedArray(64 * 4)), { exposicao: 0, contraste: 0, realces: 0, sombras: 0, temperatura: 0, tom: 0, saturacao: 0 });
});

test("um pôr do sol muito colorido não perde a cor, e as luzes da noite não estouram", () => {
  // Céu laranja forte (fora dos neutros) e um pouco de cinza
  const dados = amostra([1, 0.45, 0.15], [0.2, 0.9]);
  assert.equal(ajustesAutomaticos(dados).temperatura, 0);
  // Noite: quase tudo escuro e umas luzes no branco
  const noite = amostra([1, 1, 1], [0.02, 0.2]);
  for (let i = 0; i < 40; i++) noite.set([250, 250, 250, 255], i * 4);
  assert.ok(ajustesAutomaticos(noite).exposicao <= 0.05);
});
