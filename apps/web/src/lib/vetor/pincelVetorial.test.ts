import assert from "node:assert/strict";
import { test } from "node:test";

import { achatar, areaDoPoligono, regiaoDosCaminhos } from "./contorno.ts";
import type { Subcaminho } from "./modelo.ts";
import { apagarDoCaminho, caminhoLivre, caminhosDaRegiaoEmCurvas, continuarCaminho, juntarBolha, pontoNaRegiao, reconhecerForma, regiaoDaBolha, suavizarCaminhos, unirCaminhos } from "./pincelVetorial.ts";

type Ponto = { x: number; y: number };
const linha = (de: Ponto, ate: Ponto, n = 40): Ponto[] => Array.from({ length: n + 1 }, (_, i) => ({ x: de.x + ((ate.x - de.x) * i) / n, y: de.y + ((ate.y - de.y) * i) / n }));
const circulo = (c: Ponto, r: number, n = 64, voltas = 1): Ponto[] => Array.from({ length: n * voltas + 1 }, (_, i) => ({ x: c.x + Math.cos((i / n) * 2 * Math.PI) * r, y: c.y + Math.sin((i / n) * 2 * Math.PI) * r }));
const aberto = (pontos: Ponto[]): Subcaminho => ({ nos: pontos.map(({ x, y }) => ({ x, y })), fechado: false, operacao: "somar" });

test("o traço livre vira poucas curvas; acabando perto do começo, fecha", () => {
  const reta = caminhoLivre(linha({ x: 0, y: 0 }, { x: 100, y: 0 }), 1)!;
  assert.equal(reta.fechado, false);
  assert.equal(reta.nos.length, 2);
  const roda = caminhoLivre(circulo({ x: 50, y: 50 }, 40), 1, 10)!;
  assert.equal(roda.fechado, true);
  assert.ok(roda.nos.length <= 8, `${roda.nos.length} nós`);
  // Sem fechar, o mesmo círculo fica aberto
  assert.equal(caminhoLivre(circulo({ x: 50, y: 50 }, 40), 1, 0)!.fechado, false);
});

test("o traço que começa na ponta de um caminho aberto o continua, e fecha na outra ponta", () => {
  const base = aberto([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  const novo = caminhoLivre(linha({ x: 103, y: 2 }, { x: 100, y: 100 }), 0.5)!;
  const [junto] = continuarCaminho([base], novo, 10)!;
  assert.equal(junto.nos.length, 3);
  assert.deepEqual([junto.nos[1].x, junto.nos[1].y], [100, 0], "o começo do traço cai na ponta");
  // Pela outra ponta (o começo do caminho), o caminho é invertido antes
  const [doComeco] = continuarCaminho([base], caminhoLivre(linha({ x: -2, y: 1 }, { x: -50, y: 40 }), 0.5)!, 10)!;
  assert.deepEqual([doComeco.nos[0].x, doComeco.nos[0].y, doComeco.nos[1].x], [100, 0, 0]);
  // Voltando ao começo, fecha
  const volta = caminhoLivre([...linha({ x: 100, y: 0 }, { x: 50, y: 80 }), ...linha({ x: 50, y: 80 }, { x: 2, y: 1 }).slice(1)], 0.5)!;
  const [fechado] = continuarCaminho([base], volta, 10)!;
  assert.equal(fechado.fechado, true);
  assert.equal(continuarCaminho([base], caminhoLivre(linha({ x: 50, y: 50 }, { x: 80, y: 80 }), 0.5)!, 10), null);
});

test("a bolha cobre o traço com o raio, em curvas, e se junta à forma que toca", () => {
  const bolha = regiaoDaBolha(linha({ x: 0, y: 0 }, { x: 100, y: 0 }), 10);
  const caminhos = caminhosDaRegiaoEmCurvas(bolha, 0.5);
  assert.equal(caminhos.length, 1);
  // A área: o retângulo de 100 × 20 mais um círculo de raio 10 (a 1% do polígono de dentro)
  const area = Math.abs(areaDoPoligono(achatar(caminhos[0], 0.1)));
  const esperada = 100 * 20 + Math.PI * 100;
  assert.ok(Math.abs(area - esperada) / esperada < 0.02, `${area} contra ${esperada}`);
  assert.ok(pontoNaRegiao(bolha, { x: 50, y: 9 }) && !pontoNaRegiao(bolha, { x: 50, y: 11 }));
  const quadrado: Subcaminho = { nos: [{ x: 90, y: -30 }, { x: 150, y: -30 }, { x: 150, y: 30 }, { x: 90, y: 30 }], fechado: true, operacao: "somar" };
  const juntos = juntarBolha([quadrado], bolha, 0.5)!;
  assert.equal(juntos.length, 1, "a bolha e o quadrado viram uma forma só");
  const longe: Subcaminho = { nos: [{ x: 300, y: 300 }, { x: 310, y: 300 }, { x: 310, y: 310 }], fechado: true, operacao: "somar" };
  assert.equal(juntarBolha([longe], bolha, 0.5), null);
});

test("o Suavizar só mexe onde o traço passa", () => {
  // Um zigue-zague: suavizado no meio, as pontas ficam
  const zigue = aberto(Array.from({ length: 21 }, (_, i) => ({ x: i * 10, y: i % 2 ? 10 : 0 })));
  const [liso] = suavizarCaminhos([zigue], linha({ x: 80, y: 5 }, { x: 120, y: 5 }), 25, 100);
  const pontos = achatar(liso, 0.2);
  const noMeio = pontos.filter((p) => p.x > 95 && p.x < 105);
  assert.ok(noMeio.every((p) => p.y > 2 && p.y < 8), "no meio, o zigue-zague vira quase reta");
  assert.ok(pontos.some((p) => Math.abs(p.x) < 0.5 && Math.abs(p.y) < 0.5) && pontos.some((p) => Math.abs(p.x - 10) < 0.6 && Math.abs(p.y - 10) < 0.6), "longe do traço, os cantos ficam");
  const intocado = aberto([{ x: 0, y: 100 }, { x: 50, y: 100 }]);
  assert.equal(suavizarCaminhos([intocado], linha({ x: 0, y: 0 }, { x: 10, y: 0 }), 5, 50)[0], intocado);
});

test("a Borracha de caminho corta o caminho onde passa", () => {
  const reta = aberto([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  const pedacos = apagarDoCaminho([reta], linha({ x: 50, y: -20 }, { x: 50, y: 20 }), 5);
  assert.equal(pedacos.length, 2);
  assert.ok(Math.abs(pedacos[0].nos[pedacos[0].nos.length - 1].x - 45) <= 1 && Math.abs(pedacos[1].nos[0].x - 55) <= 1);
  // Um quadrado fechado cortado num lado vira um caminho aberto só (o pedaço passa pelo começo)
  const quadrado: Subcaminho = { nos: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], fechado: true, operacao: "somar" };
  const aberta = apagarDoCaminho([quadrado], linha({ x: 50, y: 80 }, { x: 50, y: 120 }), 5);
  assert.equal(aberta.length, 1);
  assert.equal(aberta[0].fechado, false);
  assert.ok(aberta[0].nos.length >= 5 && aberta[0].nos.length <= 7, `${aberta[0].nos.length} nós (os cantos ficam)`);
  assert.equal(apagarDoCaminho([reta], linha({ x: 0, y: 0 }, { x: 100, y: 0 }), 5).length, 0);
});

test("o Unir junta as pontas perto do traço; do mesmo caminho, fecha", () => {
  const a = aberto([{ x: 0, y: 0 }, { x: 50, y: 0 }]);
  const b = aberto([{ x: 100, y: 0 }, { x: 60, y: 0 }]);
  const juntos = unirCaminhos([a, b], linha({ x: 55, y: -10 }, { x: 55, y: 10 }), 8)!;
  assert.equal(juntos.length, 1);
  assert.deepEqual(juntos[0].nos.map((no) => no.x), [0, 50, 60, 100]);
  const u = aberto([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 3 }]);
  const [fechado] = unirCaminhos([u], linha({ x: 50, y: 0 }, { x: 50, y: 0 }).concat(linha({ x: 0, y: 2 }, { x: 100, y: 2 })), 6)!;
  assert.equal(fechado.fechado, true);
  assert.equal(unirCaminhos([a], linha({ x: 300, y: 0 }, { x: 310, y: 0 }), 8), null);
});

test("o Modelador reconhece a linha, a elipse, o retângulo, o triângulo e o rabisco", () => {
  assert.equal(reconhecerForma(linha({ x: 0, y: 0 }, { x: 100, y: 30 }))?.tipo, "linha");
  const elipse = reconhecerForma(circulo({ x: 100, y: 100 }, 50).map((p, i) => ({ x: p.x + Math.sin(i) * 1.5, y: p.y })));
  assert.equal(elipse?.tipo, "elipse");
  const tremido = (pontos: Ponto[]) => pontos.map((p, i) => ({ x: p.x + Math.sin(i * 1.7) * 1.5, y: p.y + Math.cos(i * 2.3) * 1.5 }));
  const retangulo = tremido([...linha({ x: 0, y: 0 }, { x: 200, y: 0 }), ...linha({ x: 200, y: 0 }, { x: 200, y: 100 }), ...linha({ x: 200, y: 100 }, { x: 0, y: 100 }), ...linha({ x: 0, y: 100 }, { x: 0, y: 3 })]);
  const r = reconhecerForma(retangulo);
  assert.equal(r?.tipo, "retangulo");
  const triangulo = tremido([...linha({ x: 100, y: 0 }, { x: 200, y: 170 }), ...linha({ x: 200, y: 170 }, { x: 0, y: 170 }), ...linha({ x: 0, y: 170 }, { x: 98, y: 4 })]);
  const t = reconhecerForma(triangulo);
  assert.equal(t?.tipo, "poligono");
  assert.equal(t?.tipo === "poligono" ? t.pontos.length : 0, 3);
  const rabisco = Array.from({ length: 9 }, (_, i) => linha({ x: i % 2 ? 100 : 0, y: i * 6 }, { x: i % 2 ? 0 : 100, y: i * 6 + 6 }, 10)).flat();
  assert.equal(reconhecerForma(rabisco)?.tipo, "rabisco");
  // Um rabisco de uma volta e meia não é uma forma conhecida aberta
  assert.equal(reconhecerForma(circulo({ x: 0, y: 0 }, 50, 64).slice(0, 40)), null);
  // A região pelos caminhos fechados (usada para achar as formas debaixo do rabisco)
  assert.ok(pontoNaRegiao(regiaoDosCaminhos([{ nos: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], fechado: true, operacao: "somar" }]), { x: 8, y: 2 }));
});
