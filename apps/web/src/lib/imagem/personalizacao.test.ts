import assert from "node:assert/strict";
import { test } from "node:test";

import { atalhosRepetidos, lerPersonalizacao, PERSONALIZACAO_PADRAO, personalizarMenus, teclaDaFerramenta } from "./personalizacao.ts";

const nada = () => undefined;
const menus = [
  { nome: "Editar", itens: [{ nome: "Desfazer Pincel", chave: "desfazer", atalho: "Ctrl+Z", aoEscolher: nada }, "-" as const, { nome: "Copiar", atalho: "Ctrl+C", aoEscolher: nada }, "-" as const, { nome: "Colar", atalho: "Ctrl+V", aoEscolher: nada }] },
  { nome: "Imagem", itens: [{ nome: "Ajustes", itens: [{ nome: "Níveis…", atalho: "Ctrl+L", aoEscolher: nada }] }] },
];

test("atalhos trocados, itens escondidos e coloridos", () => {
  const p = { ...PERSONALIZACAO_PADRAO, atalhos: { desfazer: "Ctrl+Alt+Z", "Imagem › Ajustes › Níveis…": "" }, ocultos: ["Editar › Copiar"], cores: { "Editar › Colar": "azul" as const } };
  const [editar, imagem] = personalizarMenus(menus, p);
  // O Copiar sai e os dois separadores viram um
  assert.deepEqual(editar.itens.map((i) => (i === "-" ? "-" : i.nome)), ["Desfazer Pincel", "-", "Colar"]);
  const desfazer = editar.itens[0] as { atalho?: string };
  assert.equal(desfazer.atalho, "Ctrl+Alt+Z");
  const colar = editar.itens[2] as { cor?: string };
  assert.match(colar.cor ?? "", /rgba\(10, 132, 255/);
  const niveis = (imagem.itens[0] as { itens: { atalho?: string }[] }).itens[0];
  assert.equal(niveis.atalho, undefined);
  // Mostrar tudo: os escondidos voltam
  assert.equal(personalizarMenus(menus, p, true)[0].itens.length, 5);
  // Um submenu todo escondido some
  const semNiveis = personalizarMenus(menus, { ...PERSONALIZACAO_PADRAO, ocultos: ["Imagem › Ajustes › Níveis…"] });
  assert.equal(semNiveis[1].itens.length, 0);
});

test("teclas, repetidos e a leitura", () => {
  assert.equal(teclaDaFerramenta({ id: "pincel", tecla: "B" }, { ...PERSONALIZACAO_PADRAO, teclas: { pincel: "K" } }), "K");
  assert.equal(teclaDaFerramenta({ id: "lapis", tecla: "B" }, PERSONALIZACAO_PADRAO), "B");
  assert.deepEqual([...atalhosRepetidos([{ chave: "a", atalho: "Ctrl+K" }, { chave: "b", atalho: "Ctrl+K ou Ctrl+B" }, { chave: "c", atalho: "Ctrl+J" }])], [["Ctrl+K", ["a", "b"]]]);
  assert.deepEqual(lerPersonalizacao("lixo"), PERSONALIZACAO_PADRAO);
  const lida = lerPersonalizacao(JSON.stringify({ atalhos: { a: "Ctrl+1", b: 3 }, cores: { x: "azul", y: "rosa" }, colunas: 2, ocultos: ["k", 1] }));
  assert.deepEqual(lida, { atalhos: { a: "Ctrl+1" }, teclas: {}, ocultos: ["k"], cores: { x: "azul" }, ferramentasOcultas: [], colunas: 2 });
});
