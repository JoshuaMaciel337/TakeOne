import assert from "node:assert/strict";
import { test } from "node:test";

import { candidatasAVaga, vagasQueRestam } from "./vagas.ts";
import type { Clipe, Faixa, Projeto } from "./modelo.ts";

const clipe = (id: string, inicio: number, extra: Partial<Clipe> = {}) =>
  ({ id, midia_id: "m-video", inicio, duracao: 10, entrada: 0, velocidade: 1, volume: 1, fade_entrada: 0, fade_saida: 0, transformacao: { x: 0, y: 0, escala: 1, rotacao: 0, opacidade: 1 }, recorte: { x: 0, y: 0, largura: 1, altura: 1 }, ...extra }) as Clipe;
const faixa = (tipo: Faixa["tipo"], clipes: Clipe[]): Faixa => ({ id: `f-${tipo}`, tipo, oculta: false, muda: false, travada: false, clipes });

const PROJETO: Projeto = {
  id: "p",
  nome: "Teste",
  proporcao: "9:16",
  taxa: { num: 30, den: 1 },
  fundo: { cor: "#000000" },
  versao: 1,
  duracao: 30,
  criado_em: "",
  atualizado_em: "",
  faixas: [
    faixa("legenda", [clipe("leg", 0, { midia_id: null, texto: { conteudo: "fala" } as Clipe["texto"] })]),
    faixa("texto", [clipe("titulo", 5, { midia_id: null, texto: { conteudo: "Um título bem comprido que passa do limite de quarenta letras" } as Clipe["texto"] })]),
    faixa("video", [clipe("forma", 0, { midia_id: "m-forma" }), clipe("logo", 2, { midia_id: "m-logo" })]),
    faixa("principal", [clipe("c2", 10), clipe("c1", 0)]),
    faixa("audio", [clipe("musica", 0, { midia_id: "m-musica" })]),
  ],
};
const MIDIAS: Record<string, { elemento?: unknown }> = { "m-forma": { elemento: { tipo: "estrela" } } };

test("as candidatas: cenas e textos marcados, sobreposições e áudio não; formas e legendas ficam de fora", () => {
  const candidatas = candidatasAVaga(PROJETO, (id) => MIDIAS[id] ?? {});
  assert.deepEqual(
    candidatas.map((c) => [c.clipe_id, c.tipo, c.rotulo, c.marcada]),
    [
      ["c1", "midia", "Cena 1", true],
      ["c2", "midia", "Cena 2", true],
      ["logo", "midia", "Sobreposição 1", false],
      ["musica", "midia", "Áudio 1", false],
      ["titulo", "texto", "Um título bem comprido que passa do lim…", true],
    ],
  );
});

test("as vagas que restam no projeto criado do modelo, sem as que o clipe saiu", () => {
  const vagas = [
    { clipe_id: "c1", tipo: "midia" as const, rotulo: "Seu vídeo" },
    { clipe_id: "sumiu", tipo: "texto" as const, rotulo: "Título" },
  ];
  const restam = vagasQueRestam({ ...PROJETO, modelo_origem: { id: "m", nome: "Modelo", vagas } });
  assert.deepEqual(restam.map((v) => [v.rotulo, v.faixa.tipo]), [["Seu vídeo", "principal"]]);
  assert.deepEqual(vagasQueRestam(PROJETO), []);
});
