import assert from "node:assert/strict";
import { test } from "node:test";

import { abrirDocumento, documentoVizinho, fecharDocumento, lerDocumentos, MAXIMO_DE_DOCUMENTOS } from "./documentos.ts";

const id = (n: number) => n.toString(16).padStart(24, "0");
const doc = (n: number, nome = `Imagem ${n}`) => ({ id: id(n), nome });

test("abrir põe a aba no fim, atualiza o nome e guarda no máximo 20", () => {
  let lista = abrirDocumento([], doc(1));
  lista = abrirDocumento(lista, doc(2));
  assert.deepEqual(lista.map((d) => d.nome), ["Imagem 1", "Imagem 2"]);
  const mesma = abrirDocumento(lista, doc(1));
  assert.equal(mesma, lista);
  assert.equal(abrirDocumento(lista, doc(1, "Capa"))[0].nome, "Capa");
  for (let n = 3; n <= 25; n++) lista = abrirDocumento(lista, doc(n));
  assert.equal(lista.length, MAXIMO_DE_DOCUMENTOS);
  assert.equal(lista[0].id, id(6));
  assert.equal(lista.at(-1)!.id, id(25));
});

test("fechar escolhe a vizinha e o Ctrl+F6 dá a volta", () => {
  const lista = [doc(1), doc(2), doc(3)];
  assert.deepEqual(fecharDocumento(lista, id(2)), { lista: [doc(1), doc(3)], proximo: id(3) });
  assert.equal(fecharDocumento(lista, id(3)).proximo, id(2));
  assert.equal(fecharDocumento([doc(1)], id(1)).proximo, null);
  assert.equal(documentoVizinho(lista, id(3), 1), id(1));
  assert.equal(documentoVizinho(lista, id(1), -1), id(3));
  assert.equal(documentoVizinho([doc(1)], id(1), 1), null);
});

test("a lista guardada é conferida", () => {
  assert.deepEqual(lerDocumentos(null), []);
  assert.deepEqual(lerDocumentos("{}"), []);
  assert.deepEqual(lerDocumentos("não é json"), []);
  const texto = JSON.stringify([doc(1), { id: "../../x", nome: "mau" }, doc(1, "repetida"), { id: id(2) }, doc(3, "x".repeat(300))]);
  const lida = lerDocumentos(texto);
  assert.deepEqual(lida.map((d) => d.id), [id(1), id(3)]);
  assert.equal(lida[1].nome.length, 120);
});
