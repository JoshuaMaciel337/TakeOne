import assert from "node:assert/strict";
import { test } from "node:test";

import { areaDoPoligono } from "./contorno.ts";
import { comPontoDeLargura, contornoDaLargura, larguraEm, maiorDoPerfil, PERFIS_DE_LARGURA, tNoCaminho } from "./largura.ts";
import { margemDoTraco, TRACO_PADRAO, type Subcaminho } from "./modelo.ts";

const reta: Subcaminho = { nos: [{ x: 0, y: 0 }, { x: 100, y: 0 }], fechado: false, operacao: "somar" };

test("a largura entre os pontos do perfil é a reta; sem pontos, a de sempre", () => {
  const pontas = PERFIS_DE_LARGURA.find((p) => p.id === "pontas")!.pontos;
  assert.deepEqual(larguraEm(pontas, 0.25), { esquerda: 0.5, direita: 0.5 });
  assert.deepEqual(larguraEm([], 0.3), { esquerda: 1, direita: 1 });
  assert.equal(maiorDoPerfil([{ t: 0.5, esquerda: 3, direita: 1 }]), 3);
});

test("o contorno do traço afinado nas pontas é um losango com a área da conta", () => {
  const pontas = PERFIS_DE_LARGURA.find((p) => p.id === "pontas")!.pontos;
  const [anel] = contornoDaLargura(reta, 20, pontas);
  // Do zero nas pontas a 10 de cada lado no meio: dois triângulos de 100 × 10
  assert.ok(Math.abs(Math.abs(areaDoPoligono(anel)) - 1000) < 1e-6, `${areaDoPoligono(anel)}`);
  // A esquerda de quem anda para a direita fica em cima (o y para baixo)
  assert.ok(anel.some((p) => Math.abs(p.x - 50) < 1e-6 && Math.abs(p.y + 10) < 1e-6));
  // Fechado: as duas bordas, para encher pela regra par-ímpar
  const quadrado: Subcaminho = { nos: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], fechado: true, operacao: "somar" };
  assert.equal(contornoDaLargura(quadrado, 10, [{ t: 0, esquerda: 1, direita: 1 }]).length, 2);
});

test("pôr um ponto perto de outro o muda; o t do clique sai do caminho; a margem cresce com o perfil", () => {
  const perfil = comPontoDeLargura([{ t: 0.5, esquerda: 1, direita: 1 }], 0.51, 2, 3);
  assert.deepEqual(perfil, [{ t: 0.5, esquerda: 2, direita: 3 }]);
  assert.equal(comPontoDeLargura(perfil, 0.1, 25, 1).length, 2);
  assert.equal(comPontoDeLargura(perfil, 0.1, 25, 1)[0].esquerda, 20, "no máximo 20");
  const perto = tNoCaminho([reta], { x: 30, y: 4 })!;
  assert.ok(Math.abs(perto.t - 0.3) < 1e-9 && Math.abs(perto.distancia - 4) < 1e-9);
  const traco = { ...TRACO_PADRAO, largura: 10, alinhamento: "dentro" as const, cantos: "redondo" as const };
  assert.equal(margemDoTraco(traco), 2);
  assert.equal(margemDoTraco({ ...traco, perfil: [{ t: 0.5, esquerda: 3, direita: 1 }] }), 17);
});
