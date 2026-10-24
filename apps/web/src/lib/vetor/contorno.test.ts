import assert from "node:assert/strict";
import { test } from "node:test";

import { achatar, areaDoPoligono, caminhosDaRegiao, regiaoDosCaminhos } from "./contorno.ts";
import { subcaminhosDaForma, type Subcaminho } from "./modelo.ts";

const quadrado = (x: number, y: number, lado: number, operacao: Subcaminho["operacao"] = "somar"): Subcaminho => ({
  nos: [
    { x, y },
    { x: x + lado, y },
    { x: x + lado, y: y + lado },
    { x, y: y + lado },
  ],
  fechado: true,
  operacao,
});
const areaTotal = (subs: Subcaminho[]) => subs.reduce((soma, sub) => soma + areaDoPoligono(sub.nos), 0);

test("a elipse achatada fica perto da área do círculo", () => {
  const circulo = subcaminhosDaForma({ tipo: "elipse", largura: 200, altura: 200 })[0];
  const pontos = achatar(circulo, 0.05);
  // A Bézier de quatro quartos passa 0,027% do raio: a área fica a menos de 0,1% da do círculo
  assert.ok(Math.abs(Math.abs(areaDoPoligono(pontos)) - Math.PI * 100 * 100) / (Math.PI * 1e4) < 1e-3);
});

test("somar, subtrair, intersectar e excluir dão as áreas certas; o buraco vai no sentido contrário", () => {
  const a = quadrado(0, 0, 10);
  const b = (op: Subcaminho["operacao"]) => quadrado(5, 5, 10, op);
  assert.equal(areaTotal(caminhosDaRegiao(regiaoDosCaminhos([a, b("somar")]))), 175);
  assert.equal(areaTotal(caminhosDaRegiao(regiaoDosCaminhos([a, b("subtrair")]))), 75);
  assert.equal(areaTotal(caminhosDaRegiao(regiaoDosCaminhos([a, b("intersectar")]))), 25);
  assert.equal(areaTotal(caminhosDaRegiao(regiaoDosCaminhos([a, b("excluir")]))), 150);
  // Um furo no meio: o anel de fora e o buraco, que soma área negativa
  const furado = caminhosDaRegiao(regiaoDosCaminhos([quadrado(0, 0, 10), quadrado(3, 3, 4, "subtrair")]));
  assert.equal(furado.length, 2);
  assert.equal(areaTotal(furado), 84);
});
