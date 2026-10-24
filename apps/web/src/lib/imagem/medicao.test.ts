import assert from "node:assert/strict";
import { test } from "node:test";

import {
  csvDoRegistro,
  medicaoDaContagem,
  medicaoDaRegua,
  medicaoDaSelecao,
  medirSelecao,
  moverPonto,
  naEscala,
  novoGrupo,
  perimetroDaMascara,
  pontoPerto,
  regioesDaMascara,
  somarPonto,
  textoDaEscala,
  tirarGrupo,
  tirarPonto,
  totalDaContagem,
} from "./medicao.ts";

function mascara(largura: number, altura: number, dentro: (x: number, y: number) => boolean) {
  const dados = new Uint8Array(largura * altura);
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) dados[y * largura + x] = dentro(x, y) ? 255 : 0;
  return { largura, altura, dados };
}

test("a contagem: grupos, pontos, o mais perto, tirar e mover", () => {
  let c = somarPonto(null, { x: 10, y: 10 }, "g1");
  assert.equal(c.grupos[0].nome, "Grupo de contagem 1");
  c = somarPonto(c, { x: 50, y: 50 }, "x");
  c = novoGrupo(c, "g2");
  assert.equal(c.ativo, "g2");
  assert.notEqual(c.grupos[1].cor, c.grupos[0].cor);
  c = somarPonto(c, { x: 52, y: 51 }, "x");
  assert.equal(totalDaContagem(c), 3);
  // O mais perto entre os visíveis: o do grupo 2
  assert.deepEqual(pontoPerto(c, { x: 52, y: 52 }, 5), { grupo: "g2", indice: 0 });
  assert.equal(pontoPerto(c, { x: 200, y: 200 }, 5), null);
  c = tirarPonto(c, "g1", 0);
  assert.deepEqual(c.grupos[0].pontos, [{ x: 50, y: 50 }]);
  c = moverPonto(c, "g1", 0, { x: 1, y: 2 });
  assert.deepEqual(c.grupos[0].pontos, [{ x: 1, y: 2 }]);
  const sem = tirarGrupo(c, "g2")!;
  assert.equal(sem.ativo, "g1");
  assert.equal(tirarGrupo(sem, "g1"), null);
});

test("a escala de medida", () => {
  const escala = { pixels: 100, comprimento: 2.5, unidade: "cm" };
  assert.equal(naEscala(200, escala), 5);
  assert.equal(naEscala(10000, escala, 2), 6.25);
  assert.equal(naEscala(7, null), 7);
  assert.equal(textoDaEscala(escala), "100 pixels = 2,5 cm");
  assert.equal(textoDaEscala(null), "1 pixel = 1 pixels");
});

test("o perímetro e a circularidade de um quadrado e de um círculo", () => {
  const quadrado = mascara(40, 40, (x, y) => x >= 10 && x < 30 && y >= 10 && y < 30);
  // As bordas retas na divisa dos pixels (20 de lado); só os cantos ficam um pouco arredondados (uns 3,4 px ao todo)
  const p = perimetroDaMascara(quadrado);
  assert.ok(p > 76 && p <= 80, String(p));
  const grande = perimetroDaMascara(mascara(120, 120, (x, y) => x >= 10 && x < 110 && y >= 10 && y < 110));
  assert.ok(Math.abs(grande - 400) / 400 < 0.01, String(grande));
  // Um quadrado de 80 girado 30°: os degraus não contam
  const [c, s] = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
  const girado = perimetroDaMascara(mascara(140, 140, (x, y) => Math.abs((x + 0.5 - 70) * c + (y + 0.5 - 70) * s) <= 40 && Math.abs(-(x + 0.5 - 70) * s + (y + 0.5 - 70) * c) <= 40));
  assert.ok(Math.abs(girado - 320) / 320 < 0.01, String(girado));
  const r = 60;
  const circulo = mascara(140, 140, (x, y) => Math.hypot(x + 0.5 - 70, y + 0.5 - 70) <= r);
  const medidas = medirSelecao(circulo, null)!;
  assert.ok(Math.abs(medidas.perimetro - 2 * Math.PI * r) / (2 * Math.PI * r) < 0.01, String(medidas.perimetro));
  assert.ok(medidas.circularidade > 0.95, String(medidas.circularidade));
  assert.equal(medidas.largura, 120);
  assert.equal(medidas.regioes, 1);
  // O de um quadrado é π/4 (0,785); o pequeno sai um pouco acima pelos cantos
  const doQuadrado = medirSelecao(quadrado, null)!.circularidade;
  assert.ok(doQuadrado > 0.75 && doQuadrado < 0.9, String(doQuadrado));
});

test("as regiões e o cinza da seleção", () => {
  const duas = mascara(10, 4, (x) => x < 3 || x > 6);
  assert.equal(regioesDaMascara(duas), 2);
  // Em diagonal, conta como uma (8 vizinhos)
  assert.equal(regioesDaMascara(mascara(3, 3, (x, y) => x === y)), 1);
  const imagem = { largura: 10, altura: 4, dados: new Uint8Array(10 * 4 * 4) };
  for (let i = 0; i < 40; i++) imagem.dados.set(i % 10 < 3 ? [100, 100, 100, 255] : [200, 200, 200, 255], i * 4);
  const medidas = medirSelecao(duas, imagem)!;
  assert.equal(medidas.area, 24);
  assert.deepEqual(medidas.cinza, { media: 150, minimo: 100, maximo: 200, mediana: 100 });
  assert.equal(medirSelecao(mascara(4, 4, () => false), imagem), null);
});

test("o registro: as linhas e o CSV", () => {
  const base = { id: "1", rotulo: "Medição 1", data: "24/10/2026 10:00", documento: "Foto; nova", escala: { pixels: 10, comprimento: 1, unidade: "mm" } };
  const quadrado = mascara(40, 40, (x, y) => x >= 10 && x < 30 && y >= 10 && y < 30);
  const sel = medicaoDaSelecao(base, medirSelecao(quadrado, null)!);
  assert.equal(sel.area, 4);
  assert.equal(sel.largura, 2);
  assert.equal(sel.fator, 0.1);
  const regua = medicaoDaRegua(base, { x: 0, y: 0 }, { x: 30, y: -40 });
  assert.equal(regua.comprimento, 5);
  assert.ok(Math.abs(regua.angulo! - 53.1301) < 1e-3);
  assert.equal(medicaoDaContagem(base, somarPonto(null, { x: 1, y: 1 }, "g")).contagem, 1);
  const csv = csvDoRegistro([regua], [
    { id: "rotulo", nome: "Rótulo" },
    { id: "documento", nome: "Documento" },
    { id: "comprimento", nome: "Comprimento" },
    { id: "area", nome: "Área" },
  ]);
  assert.equal(csv, 'Rótulo;Documento;Comprimento;Área\r\nMedição 1;"Foto; nova";5;\r\n');
});
