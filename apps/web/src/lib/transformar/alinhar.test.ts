import assert from "node:assert/strict";
import { test } from "node:test";

import { alinhar, aplicar, modeloPeloRansac } from "./alinhar.ts";

/** Uma textura com manchas e riscos (cantos de sobra para achar), com semente. */
function textura(largura: number, altura: number) {
  let s = 42;
  const aleatorio = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const manchas = Array.from({ length: 120 }, () => ({ x: aleatorio() * largura, y: aleatorio() * altura, r: 4 + aleatorio() * 18, v: aleatorio() * 255 }));
  const valor = (x: number, y: number) => {
    let v = 60;
    for (const m of manchas) if ((x - m.x) ** 2 + (y - m.y) ** 2 < m.r * m.r) v = m.v;
    return v;
  };
  return valor;
}

/** A imagem da textura vista por uma transformação (o ponto da imagem nova vem do ponto `deOnde` da textura). */
function imagem(largura: number, altura: number, valor: (x: number, y: number) => number, deOnde: (x: number, y: number) => { x: number; y: number }) {
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const p = deOnde(x, y);
      const v = valor(p.x, p.y);
      dados.set([v, v * 0.8, 255 - v, 255], (y * largura + x) * 4);
    }
  }
  return dados;
}

test("o RANSAC acha o deslocamento no meio de pares errados", () => {
  const certos = Array.from({ length: 30 }, (_, i) => [{ x: i * 7, y: i * 3 }, { x: i * 7 + 10, y: i * 3 - 4 }] as [{ x: number; y: number }, { x: number; y: number }]);
  const errados = Array.from({ length: 15 }, (_, i) => [{ x: i, y: i * 2 }, { x: 300 - i * 9, y: i * 11 }] as [{ x: number; y: number }, { x: number; y: number }]);
  const achado = modeloPeloRansac([...certos, ...errados], "reposicionar")!;
  assert.equal(achado.concordam, 30);
  const p = aplicar(achado.modelo, { x: 0, y: 0 });
  assert.ok(Math.abs(p.x - 10) < 1e-9 && Math.abs(p.y + 4) < 1e-9);
});

test("alinhar acha o giro, a escala e o deslocamento de uma foto em relação à outra", () => {
  const largura = 320;
  const altura = 240;
  const valor = textura(largura * 1.3, altura * 1.3);
  const referencia = imagem(largura, altura, valor, (x, y) => ({ x, y }));
  // A outra: girada 4°, 3% maior e deslocada (o ponto (x, y) dela é o ponto T(x, y) da referência)
  const a = (4 * Math.PI) / 180;
  const k = 1.03;
  const T = (x: number, y: number) => ({ x: k * (x * Math.cos(a) - y * Math.sin(a)) + 12, y: k * (x * Math.sin(a) + y * Math.cos(a)) - 7 });
  const outra = imagem(largura, altura, valor, (x, y) => T(x, y));
  const achado = alinhar({ dados: outra, largura, altura }, { dados: referencia, largura, altura }, "colagem");
  assert.ok(achado, "achou");
  for (const p of [
    { x: 50, y: 40 },
    { x: 260, y: 200 },
    { x: 160, y: 120 },
  ]) {
    const esperado = T(p.x, p.y);
    const r = aplicar(achado!.modelo, p);
    assert.ok(Math.hypot(r.x - esperado.x, r.y - esperado.y) < 1.5, `${JSON.stringify(r)} ${JSON.stringify(esperado)}`);
  }
});
