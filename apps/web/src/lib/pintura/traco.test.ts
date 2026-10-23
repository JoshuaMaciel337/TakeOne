import assert from "node:assert/strict";
import { test } from "node:test";

import { juntarTraco, misturar } from "./mesclar.ts";
import { Corda, Espacador, pontoNaCamada } from "./traco.ts";

const perto = (a: number, b: number, folga = 1e-9) => assert.ok(Math.abs(a - b) <= folga, `${a} ≠ ${b}`);

test("o espaçamento não muda com a velocidade do mouse", () => {
  const passo = () => 10;
  // Um movimento de 0 a 35 em dois pedaços dá as mesmas marcas que num pedaço só
  const juntos = new Espacador();
  juntos.ate({ x: 0, y: 0, pressao: 1 }, passo);
  const deUmaVez = juntos.ate({ x: 35, y: 0, pressao: 1 }, passo).map((p) => p.x);
  const aos = new Espacador();
  aos.ate({ x: 0, y: 0, pressao: 1 }, passo);
  const emDois = [...aos.ate({ x: 13, y: 0, pressao: 1 }, passo), ...aos.ate({ x: 35, y: 0, pressao: 1 }, passo)].map((p) => p.x);
  assert.deepEqual(deUmaVez, [10, 20, 30]);
  assert.deepEqual(emDois, [10, 20, 30]);
  // Parado, nenhuma marca nova
  assert.deepEqual(aos.ate({ x: 35, y: 0, pressao: 1 }, passo), []);
  // A pressão é interpolada no ponto da marca
  const comPressao = new Espacador();
  comPressao.ate({ x: 0, y: 0, pressao: 0 }, passo);
  perto(comPressao.ate({ x: 20, y: 0, pressao: 1 }, passo)[0].pressao, 0.5);
});

test("a corda segura o pincel até esticar e solta no fim", () => {
  const corda = new Corda(10);
  assert.deepEqual(corda.puxar({ x: 0, y: 0, pressao: 1 }), { x: 0, y: 0, pressao: 1 });
  assert.equal(corda.puxar({ x: 6, y: 0, pressao: 1 }), null);
  const puxado = corda.puxar({ x: 25, y: 0, pressao: 1 })!;
  perto(puxado.x, 15);
  assert.deepEqual(corda.soltar({ x: 25, y: 0, pressao: 1 }), { x: 25, y: 0, pressao: 1 });
  // Sem corda, o pincel é o mouse
  assert.deepEqual(new Corda(0).puxar({ x: 3, y: 4, pressao: 0.5 }), { x: 3, y: 4, pressao: 0.5 });
});

test("o ponto da prévia vai para o pixel da camada pela caixa, o recorte e a virada", () => {
  const midia = { largura: 1000, altura: 500 };
  const inteiro = { x: 0, y: 0, largura: 1, altura: 1 };
  // A camada na metade do tamanho, no meio de um quadro de 1000 × 500
  const caixa = { cx: 500, cy: 250, largura: 500, altura: 250, rotacao: 0, opacidade: 1 };
  const p = pontoNaCamada({ x: 250, y: 125 }, caixa, inteiro, null, midia);
  perto(p.x, 0);
  perto(p.y, 0);
  perto(p.escala, 2);
  // Girada 90°: o canto de cima da tela é o da esquerda da camada
  const girada = { ...caixa, rotacao: 90 };
  const q = pontoNaCamada({ x: 500 + 125, y: 250 }, girada, inteiro, null, midia);
  perto(q.x, 500);
  perto(q.y, 0, 1e-6);
  // Virada na horizontal e recortada na metade da direita
  const r = pontoNaCamada({ x: 250, y: 125 }, caixa, { x: 0.5, y: 0, largura: 0.5, altura: 1 }, { horizontal: true, vertical: false }, midia);
  perto(r.x, 500);
});

test("o traço junta à camada pela opacidade, trava a transparência, apaga e mistura", () => {
  const px = (r: number, g: number, b: number, a: number) => new Uint8ClampedArray([r, g, b, a]);
  const saida = new Uint8ClampedArray(4);
  const base = { largura: 1, x0: 0, y0: 0, travarTransparencia: false, apagar: false };
  // Vermelho a 50% sobre transparente: vermelho com alfa 128
  juntarTraco(px(0, 0, 0, 0), px(255, 0, 0, 255), saida, { ...base, modo: "normal", opacidade: 0.5 });
  assert.deepEqual([...saida], [255, 0, 0, 128]);
  // Com a transparência travada, sobre transparente nada aparece; sobre azul opaco, mistura
  juntarTraco(px(0, 0, 0, 0), px(255, 0, 0, 255), saida, { ...base, modo: "normal", opacidade: 1, travarTransparencia: true });
  assert.equal(saida[3], 0);
  juntarTraco(px(0, 0, 255, 255), px(255, 0, 0, 255), saida, { ...base, modo: "normal", opacidade: 0.5, travarTransparencia: true });
  assert.deepEqual([...saida], [128, 0, 128, 255]);
  // Apagar a 50% deixa metade do alfa
  juntarTraco(px(10, 20, 30, 200), px(255, 255, 255, 255), saida, { ...base, modo: "normal", opacidade: 0.5, apagar: true });
  assert.deepEqual([...saida], [10, 20, 30, 100]);
  // Multiplicar cinza sobre branco opaco dá o cinza (a mesma fórmula do compositor)
  juntarTraco(px(255, 255, 255, 255), px(128, 128, 128, 255), saida, { ...base, modo: "multiplicar", opacidade: 1 });
  assert.deepEqual([...saida], [128, 128, 128, 255]);
  // Os não separáveis: a luminosidade do branco sobre vermelho é branca
  assert.deepEqual(misturar("luminosidade", [1, 0, 0], [1, 1, 1]), [1, 1, 1]);
});
