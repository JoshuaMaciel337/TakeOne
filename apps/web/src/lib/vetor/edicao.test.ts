import assert from "node:assert/strict";
import { test } from "node:test";

import { achatar, areaDoPoligono, pontoNaCubica } from "./contorno.ts";
import { acharPonto, acharTrecho, ajustarCurvas, caminhoDeCurvatura, caminhosDaMascara, contornosDaMascara, converterNo, dividirTrecho, excluirNo, mesclarComponentes, moverAlca, noLiso } from "./edicao.ts";
import { subcaminhosDaForma, type Subcaminho } from "./modelo.ts";

const perto = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

test("achar o nó, a alça e o trecho perto do ponto", () => {
  const circulo = subcaminhosDaForma({ tipo: "elipse", largura: 100, altura: 100 });
  assert.deepEqual(acharPonto(circulo, { x: 51, y: 1 }, 5), { sub: 0, no: 0, parte: "ancora" });
  const alca = acharPonto(circulo, { x: 50 + 27.6, y: 0 }, 5, () => true);
  assert.equal(alca?.parte, "s");
  const trecho = acharTrecho(circulo, { x: 50 + 35.36, y: 50 - 35.36 }, 3);
  assert.ok(trecho && trecho.trecho === 0 && perto(trecho.t, 0.5, 0.02), JSON.stringify(trecho));
  assert.equal(acharTrecho(circulo, { x: 50, y: 50 }, 3), null);
});

test("pôr um nó no meio do trecho não muda a curva; tirar e converter", () => {
  const circulo = subcaminhosDaForma({ tipo: "elipse", largura: 100, altura: 100 })[0];
  const dividido = dividirTrecho(circulo, 0, 0.3);
  assert.equal(dividido.nos.length, 5);
  const antes = achatar(circulo, 0.01);
  const depois = achatar(dividido, 0.01);
  assert.ok(perto(Math.abs(areaDoPoligono(antes)), Math.abs(areaDoPoligono(depois)), 1), "a mesma área");
  // O nó novo fica na curva
  const [a, b] = [circulo.nos[0], circulo.nos[1]];
  const esperado = pontoNaCubica(a, { x: a.sx!, y: a.sy! }, { x: b.ex!, y: b.ey! }, b, 0.3);
  assert.ok(perto(dividido.nos[1].x, esperado.x) && perto(dividido.nos[1].y, esperado.y));
  assert.equal(excluirNo(dividido, 1)?.nos.length, 4);
  const canto = converterNo(circulo, 0);
  assert.equal(canto.nos[0].sx, undefined);
  assert.ok(noLiso(converterNo(canto, 0).nos[0]), "o canto convertido ganha alças lisas");
});

test("mover a alça de um nó liso leva a outra junto, com o comprimento dela; com quebrar, não", () => {
  const no = { x: 0, y: 0, ex: -10, ey: 0, sx: 20, sy: 0 };
  const movido = moverAlca(no, "s", { x: 0, y: 30 });
  assert.ok(perto(movido.ex!, 0) && perto(movido.ey!, -10), JSON.stringify(movido));
  const quebrado = moverAlca(no, "s", { x: 0, y: 30 }, true);
  assert.deepEqual([quebrado.ex, quebrado.ey], [-10, 0]);
});

test("a caneta de curvatura passa pelos pontos, e o canto fica sem alças", () => {
  const caminho = caminhoDeCurvatura([{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 0, canto: true }, { x: 150, y: 40 }], false);
  assert.deepEqual(caminho.nos.map((no) => [no.x, no.y]), [[0, 0], [50, 40], [100, 0], [150, 40]]);
  assert.ok(noLiso(caminho.nos[1]));
  assert.equal(caminho.nos[2].sx, undefined);
});

test("o ajuste de curva fica a menos da tolerância dos pontos, com poucos nós", () => {
  // Uma senoide amostrada a cada pixel
  const pontos = Array.from({ length: 301 }, (_, i) => ({ x: i, y: 50 + 40 * Math.sin(i / 30) }));
  const nos = ajustarCurvas(pontos, 1);
  assert.ok(nos.length < 12, `${nos.length} nós`);
  const caminho: Subcaminho = { nos, fechado: false, operacao: "somar" };
  const achatado = achatar(caminho, 0.05);
  // A distância de cada ponto ao segmento mais perto da curva achatada
  const aoSegmento = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1)));
    return Math.hypot(p.x - a.x - vx * t, p.y - a.y - vy * t);
  };
  const maior = Math.max(...pontos.map((p) => Math.min(...achatado.slice(1).map((q, i) => aoSegmento(p, achatado[i], q)))));
  assert.ok(maior < 1.5, `o ponto mais longe a ${maior.toFixed(2)} px`);
});

test("o contorno da seleção: o anel de fora no sentido horário e o buraco no contrário; o caminho segue o círculo", () => {
  // Um quadrado de 10 × 10 com um furo de 4 × 4 no meio
  const largura = 14;
  const dados = new Uint8Array(largura * largura);
  for (let y = 2; y < 12; y++) for (let x = 2; x < 12; x++) dados[y * largura + x] = x >= 5 && x < 9 && y >= 5 && y < 9 ? 0 : 255;
  const aneis = contornosDaMascara({ largura, altura: largura, dados });
  const areas = aneis.map(areaDoPoligono).sort((a, b) => a - b);
  assert.deepEqual(areas, [-16, 100]);
  // Um círculo de raio 40: o caminho fica perto do círculo e com poucos nós
  const lado = 100;
  const disco = new Uint8Array(lado * lado);
  for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) disco[y * lado + x] = Math.hypot(x + 0.5 - 50, y + 0.5 - 50) <= 40 ? 255 : 0;
  const [caminho] = caminhosDaMascara({ largura: lado, altura: lado, dados: disco }, 2);
  assert.ok(caminho.nos.length <= 12, `${caminho.nos.length} nós`);
  const pontos = achatar(caminho, 0.1);
  const erro = Math.max(...pontos.map((p) => Math.abs(Math.hypot(p.x - 50, p.y - 50) - 40)));
  assert.ok(erro < 2, `o caminho a ${erro.toFixed(2)} px do círculo`);
});

test("o anel ajustado tem ao menos quatro nós e fica perto da elipse", () => {
  const pontos = Array.from({ length: 400 }, (_, i) => ({ x: 300 + 100 * Math.cos((i / 400) * 2 * Math.PI), y: 200 + 110 * Math.sin((i / 400) * 2 * Math.PI) }));
  const nos = ajustarCurvas(pontos, 2, true);
  assert.ok(nos.length >= 4, `${nos.length} nós`);
  const achatado = achatar({ nos, fechado: true, operacao: "somar" }, 0.05);
  const erro = Math.max(...achatado.map((p) => Math.abs(Math.hypot((p.x - 300) / 100, (p.y - 200) / 110) - 1) * 100));
  assert.ok(erro < 2.5, `${erro.toFixed(2)} px fora da elipse`);
});

test("mesclar componentes: a união de um quadrado com um círculo guarda os cantos do quadrado e a área", () => {
  const quadrado: Subcaminho = { nos: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 0, y: 60 }], fechado: true, operacao: "somar" };
  const circulo = subcaminhosDaForma({ tipo: "elipse", largura: 60, altura: 60 }).map((sub) => ({ ...sub, nos: sub.nos.map((no) => ({ x: no.x + 30, y: no.y + 30, ex: no.ex! + 30, ey: no.ey! + 30, sx: no.sx! + 30, sy: no.sy! + 30 })) }));
  const furo: Subcaminho = { nos: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }], fechado: true, operacao: "subtrair" };
  const mesclado = mesclarComponentes([quadrado, ...circulo, furo]);
  assert.equal(mesclado.length, 2, "o contorno de fora e o furo");
  assert.ok(mesclado.every((sub) => sub.operacao === "somar"));
  // Área: 3600 + 3/4 do círculo (π 30²) − 100
  const esperado = 3600 + 0.75 * Math.PI * 900 - 100;
  const area = mesclado.reduce((soma, sub) => soma + areaDoPoligono(achatar(sub, 0.05)), 0);
  assert.ok(Math.abs(Math.abs(area) - esperado) / esperado < 0.01, `${area} contra ${esperado}`);
  // O canto de cima à esquerda continua um canto (sem alças)
  const canto = mesclado[0].nos.find((no) => Math.hypot(no.x, no.y) < 0.5);
  assert.ok(canto, "o canto (0, 0) ficou");
  assert.ok(mesclado[0].nos.length < 20, `${mesclado[0].nos.length} nós`);
});
