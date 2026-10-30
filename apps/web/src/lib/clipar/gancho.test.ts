import assert from "node:assert/strict";
import { test } from "node:test";

import { executarComando } from "../projeto/comandos.ts";
import type { Contexto } from "../projeto/edicao.ts";
import type { Projeto } from "../projeto/modelo.ts";
import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { comGancho, ganchoDoProjeto, semGancho } from "./gancho.ts";

const S = TICKS_POR_SEGUNDO;
let ultimo = 0;
function contexto(): Contexto {
  return {
    novoId: () => `g${++ultimo}`,
    midia: (id) =>
      id === "palestra" ? { duracao: 600 * S, video: true, audio: true } : id.startsWith("fala") ? { duracao: 3 * S, video: false, audio: true } : null,
  };
}

function corte(): Projeto {
  const vazio: Projeto = {
    id: "p",
    nome: "Corte",
    proporcao: "9:16",
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#000000" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
  let projeto = executarComando(vazio, { comando: "clipe.inserirTrecho", parametros: { midiaId: "palestra", de: 100 * S, ate: 102 * S, tempo: 0, modo: "inserir" } }, contexto()).projeto;
  projeto = executarComando(projeto, { comando: "clipe.inserirTrecho", parametros: { midiaId: "palestra", de: 110 * S, ate: 120 * S, tempo: 2 * S, modo: "inserir" } }, contexto()).projeto;
  return projeto;
}

const ehGancho = (id: string) => id.startsWith("fala");
const principal = (projeto: Projeto) => projeto.faixas.find((faixa) => faixa.tipo === "principal")!.clipes;

test("o gancho entra no começo e o som da principal abaixa por baixo dele", () => {
  const projeto = comGancho(corte(), contexto(), "fala-1", ehGancho);
  assert.deepEqual(ganchoDoProjeto(projeto, ehGancho), { inicio: 0, duracao: 3 * S });
  const fala = projeto.faixas.find((faixa) => faixa.tipo === "audio")!.clipes[0];
  assert.equal(fala.midia_id, "fala-1");
  assert.equal(fala.igualar_volume, true);
  // Os dois clipes que tocam durante a fala abaixam (o segundo começa em 2 s, e a fala vai até 3 s)
  const [a, b] = principal(projeto);
  assert.ok(a.abaixamento && b.abaixamento);
  assert.ok(a.abaixamento.pontos.some((ponto) => ponto.valor < 0.2));
  // No fim do segundo clipe o som já voltou
  assert.equal(b.abaixamento.pontos.at(-1)!.valor, 1);
  // Pôr de novo troca o gancho; tirar volta o som da principal
  const trocado = comGancho(projeto, contexto(), "fala-2", ehGancho);
  assert.equal(trocado.faixas.flatMap((faixa) => faixa.clipes).filter((clipe) => ehGancho(clipe.midia_id ?? "")).length, 1);
  const sem = semGancho(trocado, contexto(), ehGancho);
  assert.equal(ganchoDoProjeto(sem, ehGancho), null);
  assert.ok(principal(sem).every((clipe) => !clipe.abaixamento));
});
