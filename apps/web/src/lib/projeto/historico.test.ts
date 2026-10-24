import assert from "node:assert/strict";
import { test } from "node:test";

import { desfazer, excluirEstado, type Historico, iniciarHistorico, limitarHistorico, registrar, substituirPresente } from "./comandos.ts";
import type { Projeto } from "./modelo.ts";

// Os estados são projetos diferentes só pelo nome, para comparar
const p = (nome: string) => ({ nome }) as unknown as Projeto;
const nomes = (h: Historico) => ({ estados: [...h.passado.map((passo) => (passo.projeto as unknown as { nome: string }).nome), `[${(h.presente as unknown as { nome: string }).nome}]`, ...h.futuro.map((passo) => (passo.projeto as unknown as { nome: string }).nome)], passos: [...h.passado.map((passo) => passo.nome), "|", ...h.futuro.map((passo) => passo.nome)] });

function tres(): Historico {
  let h = iniciarHistorico(p("s0"));
  h = registrar(h, p("s1"), "um");
  h = registrar(h, p("s2"), "dois");
  return registrar(h, p("s3"), "três");
}

test("linear: o passo novo depois de desfazer apaga os desfeitos", () => {
  const h = registrar(desfazer(desfazer(tres())), p("x"), "novo");
  assert.deepEqual(nomes(h), { estados: ["s0", "s1", "[x]"], passos: ["um", "novo", "|"] });
});

test("não linear: os desfeitos ficam e o passo novo entra no fim, feito do estado escolhido", () => {
  const h = registrar(desfazer(desfazer(tres())), p("x"), "novo", { naoLinear: true });
  assert.deepEqual(nomes(h), { estados: ["s0", "s1", "s2", "s3", "[x]"], passos: ["um", "dois", "três", "novo", "|"] });
  // Desfazer volta pela lista: ao último estado antes do novo
  assert.deepEqual(nomes(desfazer(h)).estados, ["s0", "s1", "s2", "[s3]", "x"]);
});

test("o limite de estados", () => {
  let h = tres();
  h = registrar(h, p("s4"), "quatro", { limite: 2 });
  assert.deepEqual(nomes(h).estados, ["s2", "s3", "[s4]"]);
  assert.deepEqual(nomes(limitarHistorico(tres(), 1)).estados, ["s2", "[s3]"]);
  assert.equal(limitarHistorico(tres(), 10).passado.length, 3);
});

test("excluir o estado e substituir sem passo", () => {
  const voltou = desfazer(tres());
  assert.deepEqual(nomes(excluirEstado(voltou)).estados, ["s0", "[s1]"]);
  assert.deepEqual(nomes(excluirEstado(voltou, true)).estados, ["s0", "[s1]", "s3"]);
  const inicio = iniciarHistorico(p("s0"));
  assert.equal(excluirEstado(inicio), inicio);
  const trocado = substituirPresente(tres(), p("y"));
  assert.deepEqual(nomes(trocado).estados, ["s0", "s1", "s2", "[y]"]);
});
