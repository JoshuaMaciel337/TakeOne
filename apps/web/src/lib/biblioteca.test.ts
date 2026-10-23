import assert from "node:assert/strict";
import { test } from "node:test";

import { alternarSalvo, categoriasDos, filtrarItens, type Filtros, itensDeAnimacao, itensDeProjeto, textoDeUsos } from "./biblioteca.ts";
import { MODELOS_DE_PROJETO } from "./projeto/modelos.ts";

const S = 254016000000;
const DO_ESPACO = [
  { id: "aaa111", nome: "Abertura do canal", descricao: "Nossa abertura", categoria: "Do espaço", proporcao: "16:9", duracao: 6 * S, capa_midia_id: null, vagas: [{ clipe_id: "c1", tipo: "midia" as const, rotulo: "Vídeo" }], criado_por_nome: "Joana", criado_em: "2026-10-22T10:00:00" },
];
const ANIMACOES = [
  { id: "tarja-nome", nome: "Tarja com nome", descricao: "Nome e cargo", duracao: 4, categoria: "tarjas", nome_da_categoria: "Tarjas", temas: [] },
  { id: "natal-contador", nome: "Contador de Natal", descricao: "Conta os dias", duracao: 5, categoria: "numeros", nome_da_categoria: "Números", temas: [{ id: "natal", nome: "Natal e Ano Novo" }] },
];
const BASE: Filtros = { aba: "todos", busca: "", formato: "", categoria: "", ordem: "populares" };

test("os modelos prontos e os do espaço viram itens; os do espaço são os mais novos", () => {
  const itens = itensDeProjeto(MODELOS_DE_PROJETO, DO_ESPACO, { salvos: ["tres-dicas"], usos: { aaa111: 3 } });
  assert.equal(itens.length, MODELOS_DE_PROJETO.length + 1);
  const espaco = itens.find((item) => item.tipo === "espaco")!;
  assert.deepEqual([espaco.duracaoS, espaco.vagas, espaco.usos], [6, 1, 3]);
  assert.ok(itens.find((item) => item.id === "tres-dicas")!.salvo);
  assert.equal(filtrarItens(itens, { ...BASE, ordem: "novos" })[0].id, "aaa111");
  assert.equal(filtrarItens(itens, BASE)[0].id, "aaa111", "o único com uso vem primeiro nos populares");
  assert.deepEqual(filtrarItens(itens, { ...BASE, aba: "espaco" }).map((item) => item.id), ["aaa111"]);
  assert.deepEqual(filtrarItens(itens, { ...BASE, aba: "salvos" }).map((item) => item.id), ["tres-dicas"]);
  assert.ok(filtrarItens(itens, { ...BASE, aba: "destaques" }).every((item) => item.destaque));
  assert.ok(filtrarItens(itens, { ...BASE, formato: "1:1" }).every((item) => item.proporcao === "1:1"));
});

test("a busca não liga para acento nem maiúscula e acha pelo tema e por quem criou", () => {
  const animacoes = itensDeAnimacao(ANIMACOES, { salvos: [], usos: {} });
  assert.deepEqual(filtrarItens(animacoes, { ...BASE, busca: "NATAL" }).map((item) => item.id), ["natal-contador"]);
  assert.deepEqual(filtrarItens(animacoes, { ...BASE, busca: "numeros" }).map((item) => item.id), ["natal-contador"]);
  const projetos = itensDeProjeto([], DO_ESPACO, { salvos: [], usos: {} });
  assert.equal(filtrarItens(projetos, { ...BASE, busca: "joana" }).length, 1);
  assert.equal(animacoes[0].grupo, "texto");
  assert.equal(animacoes[1].grupo, "elementos");
  assert.ok(animacoes[0].destaque && !animacoes[1].destaque, "os desenhos, sem tema, são destaque");
  assert.equal(animacoes[0].chave, "animacao-tarja-nome");
  assert.deepEqual(categoriasDos(animacoes), ["Tarjas", "Números"]);
});

test("salvos e usos", () => {
  assert.deepEqual(alternarSalvo(["a"], "b"), ["b", "a"]);
  assert.deepEqual(alternarSalvo(["b", "a"], "b"), ["a"]);
  assert.deepEqual([textoDeUsos(1), textoDeUsos(12), textoDeUsos(1234)], ["1 uso", "12 usos", "1,2 mil usos"]);
});
