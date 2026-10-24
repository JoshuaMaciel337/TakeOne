import assert from "node:assert/strict";
import { test } from "node:test";

import { codificarGifAnimado } from "../exportacao/formatos/gif.ts";
import { duracaoDaAnimacao, interpolar, type QuadroDaAnimacao } from "./animacao.ts";

const t = (x: number, opacidade = 1) => ({ x, y: 0, escala: 1, rotacao: 0, opacidade });

test("interpolar anda em linha reta e faz a camada aparecer pela opacidade", () => {
  const a: QuadroDaAnimacao = { id: "a", atraso: 0.2, camadas: { f1: { oculta: false, transformacao: t(0) }, f2: { oculta: true, transformacao: t(0) } } };
  const b: QuadroDaAnimacao = { id: "b", atraso: 1, camadas: { f1: { oculta: false, transformacao: t(0.4, 0.5) }, f2: { oculta: false, transformacao: t(0) } } };
  let n = 0;
  const meio = interpolar(a, b, 3, () => `m${++n}`);
  assert.deepEqual(meio.map((q) => q.id), ["m1", "m2", "m3"]);
  assert.deepEqual(meio.map((q) => +q.camadas.f1.transformacao!.x.toFixed(3)), [0.1, 0.2, 0.3]);
  assert.deepEqual(meio.map((q) => +q.camadas.f1.transformacao!.opacidade.toFixed(3)), [0.875, 0.75, 0.625]);
  // A f2 aparece aos poucos: visível, com a opacidade subindo de 0
  assert.deepEqual(meio.map((q) => [q.camadas.f2.oculta, +q.camadas.f2.transformacao!.opacidade.toFixed(2)]), [[false, 0.25], [false, 0.5], [false, 0.75]]);
  assert.equal(meio[0].atraso, 0.2);
  assert.equal(duracaoDaAnimacao({ quadros: [a, ...meio, b], repetir: 0 }), 0.2 * 4 + 1);
});

test("o GIF animado: a repetição, um controle e uma imagem por quadro", () => {
  const imagem = (cor: number) => ({ largura: 2, altura: 2, indices: new Uint8Array([0, 0, 0, 0]), paleta: [[cor, 0, 0] as [number, number, number], [0, 0, 0] as [number, number, number]], transparente: null });
  const gif = codificarGifAnimado([{ imagem: imagem(255), atraso: 0.5 }, { imagem: imagem(10), atraso: 1.25 }], 0);
  const texto = String.fromCharCode(...gif);
  assert.equal(texto.slice(0, 6), "GIF89a");
  assert.ok(texto.includes("NETSCAPE2.0"));
  // Dois controles gráficos com os tempos em centésimos (50 e 125)
  const controles = [...texto.matchAll(/\x21\xf9\x04/g)].map((m) => gif[m.index! + 4] | (gif[m.index! + 5] << 8));
  assert.deepEqual(controles, [50, 125]);
  assert.equal(gif[gif.length - 1], 0x3b);
  // Uma vez: sem a extensão de repetição
  assert.ok(!String.fromCharCode(...codificarGifAnimado([{ imagem: imagem(1), atraso: 0.1 }], 1)).includes("NETSCAPE"));
});
