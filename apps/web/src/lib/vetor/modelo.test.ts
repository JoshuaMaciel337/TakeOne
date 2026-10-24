import assert from "node:assert/strict";
import { test } from "node:test";

import { caixaDosCaminhos, camadaDaForma, KAPPA, margemDoTraco, redimensionar, refazerForma, subcaminhosDaForma, tamanhoDosCaminhos, TRACO_PADRAO } from "./modelo.ts";

const COR = { tipo: "cor" as const, cor: "#ff0000" };

test("o retângulo sem raio tem os quatro cantos; com raios, cada canto vira uma curva com as alças de um quarto de círculo", () => {
  const reto = subcaminhosDaForma({ tipo: "retangulo", largura: 100, altura: 60, raios: [0, 0, 0, 0] })[0];
  assert.deepEqual(
    reto.nos.map((no) => [no.x, no.y]),
    [
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ],
  );
  const redondo = subcaminhosDaForma({ tipo: "retangulo", largura: 100, altura: 60, raios: [10, 0, 10, 50] })[0];
  // Os raios passam do limite (metade do lado menor): 50 vira 30
  assert.equal(redondo.nos.length, 2 + 1 + 2 + 2);
  const primeiro = redondo.nos[0];
  assert.deepEqual([primeiro.x, primeiro.y], [0, 10]);
  assert.ok(Math.abs(primeiro.sy! - (10 - 10 * KAPPA)) < 1e-9);
  const ultimo = redondo.nos[redondo.nos.length - 1];
  assert.deepEqual([ultimo.x, ultimo.y], [0, 60 - 30]);
});

test("a elipse, o polígono, a estrela e a caixa dos caminhos", () => {
  const elipse = subcaminhosDaForma({ tipo: "elipse", largura: 80, altura: 40 })[0];
  assert.equal(elipse.nos.length, 4);
  assert.deepEqual(caixaDosCaminhos([elipse]), { x0: 0, y0: 0, x1: 80, y1: 40 });
  const hexagono = subcaminhosDaForma({ tipo: "poligono", largura: 100, altura: 100, lados: 6, estrela: 0, raio: 0 })[0];
  assert.equal(hexagono.nos.length, 6);
  assert.ok(Math.abs(hexagono.nos[0].x - 50) < 1e-9 && Math.abs(hexagono.nos[0].y) < 1e-9, "a primeira ponta em cima");
  const estrela = subcaminhosDaForma({ tipo: "poligono", largura: 100, altura: 100, lados: 5, estrela: 0.5, raio: 0 })[0];
  assert.equal(estrela.nos.length, 10);
  // A ponta de dentro fica na metade do raio
  assert.ok(Math.abs(Math.hypot(estrela.nos[1].x - 50, estrela.nos[1].y - 50) - 25) < 1e-9);
});

test("a camada da forma tem a margem do traço; refazer muda as medidas e mantém o resto", () => {
  const traco = { ...TRACO_PADRAO, largura: 10, alinhamento: "fora" as const, cantos: "redondo" as const };
  assert.equal(margemDoTraco(traco), 12);
  const camada = camadaDaForma({ tipo: "retangulo", largura: 100, altura: 50, raios: [0, 0, 0, 0] }, COR, traco);
  assert.deepEqual(camada.caixa, { largura: 124, altura: 74 });
  assert.deepEqual([camada.subcaminhos[0].nos[0].x, camada.subcaminhos[0].nos[0].y], [12, 12]);
  const maior = refazerForma(camada, { forma: { tipo: "retangulo", largura: 200, altura: 50, raios: [0, 0, 0, 0] } });
  assert.deepEqual(maior.caixa, { largura: 224, altura: 74 });
  assert.deepEqual(maior.preenchimento, COR);
  // A linha não tem preenchimento e a seta entra na margem
  const linha = camadaDaForma({ tipo: "linha", comprimento: 100, angulo: 0, setaInicio: false, setaFim: true, tamanhoDaSeta: 3 }, COR, { ...TRACO_PADRAO, largura: 4, alinhamento: "centro" });
  assert.equal(linha.preenchimento.tipo, "nenhuma");
  assert.ok(linha.margem! >= 12);
});

test("redimensionar a forma viva muda as medidas; o caminho estica os pontos e deixa de ser vivo", () => {
  const camada = camadaDaForma({ tipo: "elipse", largura: 100, altura: 50 }, COR, null);
  const maior = redimensionar(camada, 200, 50);
  assert.equal(maior.forma?.tipo === "elipse" && maior.forma.largura, 200);
  const caminho = { ...camada, forma: null };
  const esticado = redimensionar(caminho, 300, 25);
  assert.deepEqual(tamanhoDosCaminhos(esticado), { largura: 300, altura: 25 });
  assert.equal(esticado.forma, null);
});
