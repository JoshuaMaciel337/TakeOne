import assert from "node:assert/strict";
import { test } from "node:test";

import { arquivoDaFoto, comCor, edicaoParaEnviar, editandoAgora, mudaOEnquadramento, semNada, tamanhoExibido } from "./edicao.ts";

const foto = (edicao?: Parameters<typeof arquivoDaFoto>[0]["edicao"]) => ({ midia_id: "m", largura: 4000, altura: 3000, edicao });

test("a edição de uma foto do álbum: o arquivo, o tamanho e o lote", () => {
  assert.equal(arquivoDaFoto(foto(), "a1", "capa"), "capa.jpg");
  assert.equal(arquivoDaFoto(foto({ versao: 3, gerada: 2 }), "a1", "proxy"), "album_a1_2_proxy.webp");
  assert.equal(editandoAgora(foto({ versao: 3, gerada: 2 })), true);
  assert.equal(editandoAgora(foto({ versao: 2, gerada: 2 })), false);
  // A cópia leve editada (1920 de lado, recortada em 1080 × 1080) volta à resolução da original
  assert.deepEqual(tamanhoExibido(foto({ versao: 1, gerada: 1, largura: 1080, altura: 1080, recorte: { x: 0, y: 0, largura: 0.75, altura: 1 } })), [2250, 2250]);
  assert.deepEqual(tamanhoExibido(foto()), [4000, 3000]);
  assert.equal(mudaOEnquadramento(foto({ versao: 1, gerada: 1, giro: 2 })), true);
  assert.equal(mudaOEnquadramento(foto({ versao: 1, gerada: 1, cor: { exposicao: 1 } })), false);

  const guardada = { versao: 4, gerada: 4, largura: 10, altura: 10, cor: { exposicao: 0.5, filtro: "quente" }, giro: 3 };
  assert.deepEqual(edicaoParaEnviar(guardada), { cor: { exposicao: 0.5, filtro: "quente" }, giro: 3 });
  assert.deepEqual(comCor(guardada, { filtro: "frio", intensidade: 0.5 }), { cor: { exposicao: 0.5, filtro: "frio", intensidade: 0.5 }, giro: 3 });
  assert.equal(semNada({ cor: { exposicao: 0, filtro: null, intensidade: 1 } }), true);
  assert.equal(semNada({ cor: { exposicao: 0.1 } }), false);
  assert.equal(semNada({ auto: { endireitar: true } }), false);
});
