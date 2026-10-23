import assert from "node:assert/strict";
import { test } from "node:test";

import { bordaPerto, caminhoMagnetico, mapaDeBordas } from "./magnetico.ts";
import { retangulo } from "./mascara.ts";
import { aumentar, corDaAmostra, varinha } from "./varinha.ts";

/** Uma imagem com um quadrado vermelho (20 a 40) sobre azul, e um vermelho solto em (5, 5). */
function imagem() {
  const largura = 60;
  const altura = 60;
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 4;
      const vermelho = (x >= 20 && x < 40 && y >= 20 && y < 40) || (x === 5 && y === 5);
      dados.set(vermelho ? [220, 20, 20, 255] : [20, 40, 200, 255], i);
    }
  }
  return { largura, altura, dados };
}
const valor = (s: { largura: number; dados: Uint8Array }, x: number, y: number) => s.dados[y * s.largura + x];

test("a varinha contígua pega o quadrado; sem contígua, também o pixel solto", () => {
  const img = imagem();
  const contigua = varinha(img, 30, 30, { tolerancia: 32, contigua: true, suavizar: false, amostra: 1 });
  assert.equal(valor(contigua, 25, 25), 255);
  assert.equal(valor(contigua, 45, 30), 0);
  assert.equal(valor(contigua, 5, 5), 0);
  assert.equal([...contigua.dados].filter((v) => v).length, 400);
  const toda = varinha(img, 30, 30, { tolerancia: 32, contigua: false, suavizar: false, amostra: 1 });
  assert.equal(valor(toda, 5, 5), 255);
  // A tolerância 255 pega tudo
  assert.equal([...varinha(img, 30, 30, { tolerancia: 255, contigua: true, suavizar: false, amostra: 1 }).dados].every((v) => v === 255), true);
  // Suavizada: a borda tem meio-tom de cada lado, o miolo continua cheio
  const suave = varinha(img, 30, 30, { tolerancia: 32, contigua: true, suavizar: true, amostra: 1 });
  assert.equal(valor(suave, 30, 30), 255);
  assert.ok(valor(suave, 19, 30) > 0 && valor(suave, 19, 30) < 128);
  assert.ok(valor(suave, 20, 30) >= 128);
});

test("a amostra média e o transparente valem como uma cor só", () => {
  const img = imagem();
  // No canto do quadrado, a média 3 × 3 mistura vermelho e azul
  const media = corDaAmostra(img, 20, 20, 3);
  assert.ok(media[0] > 20 && media[0] < 220);
  const transparente = { largura: 2, altura: 1, dados: new Uint8ClampedArray([255, 0, 0, 0, 0, 255, 0, 0]) };
  const s = varinha(transparente, 0, 0, { tolerancia: 0, contigua: true, suavizar: false, amostra: 1 });
  assert.deepEqual([...s.dados], [255, 255]);
});

test("aumentar cresce pelas cores da seleção; semelhante pega as soltas", () => {
  const img = imagem();
  const pedaco = retangulo(60, 60, { x: 28, y: 28, largura: 4, altura: 4 }, false);
  const maior = aumentar(img, pedaco, 32, true);
  assert.equal(valor(maior, 21, 21), 255);
  assert.equal(valor(maior, 5, 5), 0);
  assert.ok(valor(maior, 45, 45) === 0);
  const semelhante = aumentar(img, pedaco, 32, false);
  // O pixel solto entra com a borda suave (meio coberto)
  assert.ok(valor(semelhante, 5, 5) >= 128);
});

test("o laço magnético segue a borda do quadrado e acha a borda perto do ponteiro", () => {
  const mapa = mapaDeBordas(imagem());
  // A borda de cima do quadrado (y 19 e 20) é forte; o meio dele, liso
  assert.ok(mapa.forca[20 * 60 + 30] > 0.9);
  assert.ok(mapa.forca[30 * 60 + 30] < 0.05);
  const perto = bordaPerto(mapa, { x: 30, y: 25 }, 6, 0.1);
  assert.ok(perto.y === 20 || perto.y === 19, JSON.stringify(perto));
  // De um canto ao outro do quadrado, com margem para cortar pelo meio: o caminho fica na borda
  const caminho = caminhoMagnetico(mapa, { x: 20, y: 20 }, { x: 39, y: 39 }, 10, 0.1);
  assert.deepEqual(caminho[0], { x: 20, y: 20 });
  assert.deepEqual(caminho.at(-1), { x: 39, y: 39 });
  const naBorda = caminho.filter((p) => mapa.forca[p.y * 60 + p.x] > 0.5).length;
  assert.ok(naBorda / caminho.length > 0.9, `${naBorda}/${caminho.length}`);
});

test("a seleção rápida cresce no liso e para na borda", async () => {
  const { marcaRapida } = await import("./rapida.ts");
  const img = imagem();
  // Um gradiente suave dentro do quadrado vermelho (o crescimento não pode parar nele)
  for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) img.dados[(y * 60 + x) * 4 + 1] = 20 + (x - 20) * 2;
  const marcado = new Uint8Array(60 * 60);
  const mudou = marcaRapida(img, marcado, 30, 30, 4);
  assert.ok(mudou);
  // O quadrado inteiro (três raios = 12 alcançam as bordas a 10) e nada do azul
  let dentro = 0;
  let fora = 0;
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < 60; x++) {
      if (!marcado[y * 60 + x]) continue;
      if (x >= 20 && x < 40 && y >= 20 && y < 40) dentro++;
      else fora++;
    }
  }
  assert.equal(fora, 0);
  assert.ok(dentro >= 380, String(dentro));
  // De novo no mesmo lugar: nada muda
  assert.equal(marcaRapida(img, marcado, 30, 30, 4), null);
});
