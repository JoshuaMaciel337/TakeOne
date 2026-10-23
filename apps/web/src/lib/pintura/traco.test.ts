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

test("as marcas de um ponto: dispersão, tremor, controles e o desvanecer", async () => {
  const { marcasDoPonto, PINCEL_PADRAO, PASSOS_DO_DESVANECER } = await import("./traco.ts");
  let n = 0;
  const fixo = (valor: number) => () => valor;
  const sequencia = () => [0.9, 0.1, 0.5, 0.3, 0.7][n++ % 5];
  // Sem seções: uma marca, no ponto, com a pressão no tamanho
  const simples = marcasDoPonto(PINCEL_PADRAO, { x: 10, y: 20, pressao: 0.5 }, 40, 0, fixo(0.5));
  assert.equal(simples.length, 1);
  assert.deepEqual([simples[0].x, simples[0].y, simples[0].diametro, simples[0].alfa], [10, 20, 20, 1]);
  // Dispersão de 1 diâmetro na perpendicular de um traço para a direita: a marca anda só no y
  const disperso = { ...PINCEL_PADRAO, dispersao: { ligado: true, quanto: 1, ambosEixos: false, contagem: 3, tremorDaContagem: 0 } };
  const marcas = marcasDoPonto(disperso, { x: 0, y: 0, pressao: 1, direcao: 0 }, 10, 0, sequencia);
  assert.equal(marcas.length, 3);
  for (const marca of marcas) {
    perto(marca.x, 0, 1e-9);
    assert.ok(Math.abs(marca.y) <= 10);
  }
  // Tremor do tamanho de 100% com sorteio 0,5 dá metade; o desvanecer leva o fluxo ao mínimo
  const forma = { ...PINCEL_PADRAO, dinamicaDeForma: { ...PINCEL_PADRAO.dinamicaDeForma, ligado: true, tamanho: { tremor: 1, controle: "nenhum" as const, minimo: 0 } } };
  perto(marcasDoPonto(forma, { x: 0, y: 0, pressao: 1 }, 40, 0, fixo(0.5))[0].diametro, 20);
  const desvanece = { ...PINCEL_PADRAO, transferencia: { ligado: true, opacidade: { tremor: 0, controle: "nenhum" as const, minimo: 0 }, fluxo: { tremor: 0, controle: "desvanecer" as const, minimo: 0.2 } } };
  perto(marcasDoPonto(desvanece, { x: 0, y: 0, pressao: 1 }, 10, 0, fixo(0))[0].alfa, 1);
  perto(marcasDoPonto(desvanece, { x: 0, y: 0, pressao: 1 }, 10, PASSOS_DO_DESVANECER, fixo(0))[0].alfa, 0.2);
  // O ângulo pela direção do traço
  const direcao = { ...PINCEL_PADRAO, dinamicaDeForma: { ...PINCEL_PADRAO.dinamicaDeForma, ligado: true, angulo: { tremor: 0, controle: "direcao" as const, minimo: 0 } } };
  perto(marcasDoPonto(direcao, { x: 0, y: 0, pressao: 1, direcao: Math.PI / 2 }, 10, 0, fixo(0.5))[0].angulo, Math.PI / 2);
});

test("as cópias da simetria em volta do meio", async () => {
  const { copiasDaSimetria } = await import("./traco.ts");
  const centro = { x: 100, y: 50 };
  const ponto = { x: 120, y: 40, pressao: 1 };
  const xy = (lista: { x: number; y: number }[]) => lista.map((p) => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000]);
  assert.deepEqual(xy(copiasDaSimetria(ponto, null, centro)), [[120, 40]]);
  assert.deepEqual(xy(copiasDaSimetria(ponto, { tipo: "vertical", segmentos: 2 }, centro)), [[120, 40], [80, 40]]);
  assert.deepEqual(xy(copiasDaSimetria(ponto, { tipo: "doisEixos", segmentos: 2 }, centro)), [[120, 40], [80, 40], [120, 60], [80, 60]]);
  assert.deepEqual(xy(copiasDaSimetria(ponto, { tipo: "diagonal", segmentos: 2 }, centro)), [[120, 40], [90, 70]]);
  assert.deepEqual(xy(copiasDaSimetria(ponto, { tipo: "radial", segmentos: 4 }, centro)), [[120, 40], [110, 70], [80, 60], [90, 30]]);
  assert.equal(copiasDaSimetria(ponto, { tipo: "mandala", segmentos: 6 }, centro).length, 12);
});

test("a predefinição troca o pincel, menos as seções travadas e a textura protegida", async () => {
  const { comPredefinicao, PREDEFINICOES } = await import("./predefinicoes.ts");
  const { PINCEL_PADRAO } = await import("./traco.ts");
  const giz = PREDEFINICOES.find((p) => p.id === "giz")!;
  const atual = { ...PINCEL_PADRAO, opacidade: 0.4, modo: "multiplicar" as const, dispersao: { ...PINCEL_PADRAO.dispersao, ligado: true, quanto: 2 } };
  const novo = comPredefinicao(atual, giz);
  assert.equal(novo.ponta, "giz");
  assert.equal(novo.textura.ligado, true);
  assert.deepEqual([novo.opacidade, novo.modo], [0.4, "multiplicar"]);
  assert.equal(novo.dispersao.ligado, false);
  const travado = comPredefinicao(atual, giz, new Set(["dispersao"]));
  assert.equal(travado.dispersao.quanto, 2);
  const protegido = comPredefinicao({ ...atual, protegerTextura: true, textura: { ...PINCEL_PADRAO.textura, ligado: true, id: "linhas" } }, giz);
  assert.equal(protegido.textura.id, "linhas");
  // Toda predefinição tem nome e pasta, e os ids não se repetem
  assert.equal(new Set(PREDEFINICOES.map((p) => p.id)).size, PREDEFINICOES.length);
});

test("pincel do histórico: vai em direção à fonte (até a transparência); o artístico espalha traços na área", async () => {
  const { tracosArtisticos } = await import("./traco.ts");
  const saida = new Uint8ClampedArray(4);
  const base = { largura: 1, x0: 0, y0: 0, travarTransparencia: false, apagar: false, modo: "normal" as const };
  // A camada é azul opaca; a fonte é vermelha opaca: com força 1, vira vermelha; com 0,5, meio a meio
  juntarTraco(new Uint8ClampedArray([0, 0, 255, 255]), new Uint8ClampedArray([255, 255, 255, 255]), saida, { ...base, opacidade: 1, substituirPor: new Uint8ClampedArray([255, 0, 0, 255]) });
  assert.deepEqual([...saida], [255, 0, 0, 255]);
  juntarTraco(new Uint8ClampedArray([0, 0, 255, 255]), new Uint8ClampedArray([255, 255, 255, 255]), saida, { ...base, opacidade: 0.5, substituirPor: new Uint8ClampedArray([255, 0, 0, 255]) });
  assert.deepEqual([...saida], [128, 0, 128, 255]);
  // A fonte transparente devolve a transparência (o que foi pintado depois some)
  juntarTraco(new Uint8ClampedArray([0, 0, 255, 255]), new Uint8ClampedArray([255, 255, 255, 255]), saida, { ...base, opacidade: 1, substituirPor: new Uint8ClampedArray([0, 0, 0, 0]) });
  assert.equal(saida[3], 0);
  let n = 0;
  const sorteio = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
  const tracos = tracosArtisticos({ x: 100, y: 100 }, 40, 10, "tensoLongo", 5, sorteio);
  assert.equal(tracos.length, 5);
  for (const traco of tracos) {
    assert.ok(Math.hypot(traco[0].x - 100, traco[0].y - 100) <= 20 + 1e-9);
    assert.ok(traco.length >= 2);
  }
  assert.equal(tracosArtisticos({ x: 0, y: 0 }, 10, 10, "pontilhado", 3, sorteio).every((traco) => traco.length === 1), true);
});
