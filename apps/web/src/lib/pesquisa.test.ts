import assert from "node:assert/strict";
import { test } from "node:test";

import { achatarMenus, procurar } from "./pesquisa.ts";

const nada = () => undefined;
const menus = [
  { nome: "Imagem", itens: [{ nome: "Ajustes", itens: [{ nome: "Níveis…", atalho: "Ctrl+L", aoEscolher: nada }, { nome: "Curvas…", aoEscolher: nada }] }, "-" as const, { nome: "Tamanho da imagem…", aoEscolher: nada }] },
  { nome: "Camada", itens: [{ nome: "Novo", desativado: true, itens: [{ nome: "Camada de ajuste", aoEscolher: nada }] }, { nome: "Rasterizar", aoEscolher: nada, desativado: true }] },
];

test("os menus viram uma lista com o caminho", () => {
  const itens = achatarMenus(menus);
  assert.deepEqual(itens.map((i) => `${i.caminho} › ${i.nome}${i.desativado ? " (off)" : ""}`), ["Imagem › Ajustes › Níveis…", "Imagem › Ajustes › Curvas…", "Imagem › Tamanho da imagem…", "Camada › Novo › Camada de ajuste (off)", "Camada › Rasterizar (off)"]);
  assert.equal(itens[0].atalho, "Ctrl+L");
});

test("procurar sem acento, pelo nome e pelo caminho", () => {
  const itens = achatarMenus(menus);
  assert.deepEqual(procurar(itens, "niveis").map((i) => i.nome), ["Níveis…"]);
  // "ajuste" está no caminho de Níveis e Curvas e no nome da Camada de ajuste (desligada, no fim)
  assert.deepEqual(procurar(itens, "AJUSTE").map((i) => i.nome), ["Níveis…", "Curvas…", "Camada de ajuste"]);
  assert.deepEqual(procurar(itens, "imagem tam").map((i) => i.nome), ["Tamanho da imagem…"]);
  assert.equal(procurar(itens, "xyz").length, 0);
  // Pelo começo das palavras: "vas" não acha "Curvas"
  assert.equal(procurar(itens, "vas").length, 0);
  assert.equal(procurar(itens, "").length, 5);
});
