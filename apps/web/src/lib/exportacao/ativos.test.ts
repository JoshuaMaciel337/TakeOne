import assert from "node:assert/strict";
import { test } from "node:test";

import { pedidosDoNome, tamanhoDoAtivo } from "./ativos.ts";

test("o nome que termina numa extensão vira um ativo", () => {
  assert.deepEqual(pedidosDoNome("logo.png"), [{ arquivo: "logo.png", formato: "png", qualidade: null, tamanho: null }]);
  assert.deepEqual(pedidosDoNome("Camada 1"), []);
  assert.deepEqual(pedidosDoNome("versão 2.0"), []);
  assert.deepEqual(pedidosDoNome("notas.txt"), []);
});

test("vários pedidos, tamanho, qualidade e pastas", () => {
  const pedidos = pedidosDoNome("logo.png, 200% logo@2x.png, foto.jpg80, foto-baixa.jpg5, 300x? icones/menu.gif, 64x64 fav.png8, ../fora.webp60");
  assert.deepEqual(
    pedidos.map((p) => [p.arquivo, p.formato, p.qualidade, p.tamanho]),
    [
      ["logo.png", "png", null, null],
      ["logo@2x.png", "png", null, { escala: 2 }],
      ["foto.jpg", "jpeg", 0.8, null],
      ["foto-baixa.jpg", "jpeg", 0.5, null],
      ["icones/menu.gif", "gif", null, { largura: 300, altura: null }],
      ["fav.png", "png8", null, { largura: 64, altura: 64 }],
      ["fora.webp", "webp", 0.6, null],
    ],
  );
});

test("o tamanho do arquivo pela escala ou pelas medidas, na proporção quando falta uma", () => {
  const [metade, largo, fixo] = pedidosDoNome("50% a.png, 300x? b.png, 100x40 c.png");
  assert.deepEqual(tamanhoDoAtivo(metade, 401, 200), { escala: 0.5, largura: 201, altura: 100 });
  assert.deepEqual(tamanhoDoAtivo(largo, 600, 200), { escala: 0.5, largura: 300, altura: 100 });
  assert.deepEqual(tamanhoDoAtivo(fixo, 200, 200), { escala: 0.5, largura: 100, altura: 40 });
});
