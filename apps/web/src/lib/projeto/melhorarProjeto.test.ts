import assert from "node:assert/strict";
import { test } from "node:test";

import { analisarProjeto, type MidiaParaAnalise } from "./melhorarProjeto.ts";
import { type Clipe, type Projeto, RECORTE_PADRAO, TRANSFORMACAO_PADRAO } from "./modelo.ts";

const S = 254_016_000_000;
const clipe = (id: string, midia: string, duracao: number, extra: Partial<Clipe> = {}): Clipe => ({
  id,
  midia_id: midia,
  inicio: 0,
  duracao: duracao * S,
  entrada: 0,
  velocidade: 1,
  volume: 1,
  fade_entrada: 0,
  fade_saida: 0,
  transformacao: TRANSFORMACAO_PADRAO,
  recorte: RECORTE_PADRAO,
  ...extra,
});

const projeto = (faixas: Projeto["faixas"]): Projeto => ({ id: "p", nome: "P", proporcao: "9:16", taxa: { num: 30, den: 1 }, fundo: { cor: "#000" }, faixas, versao: 1, duracao: 0 }) as Projeto;
const faixa = (tipo: "principal" | "audio" | "legenda", clipes: Clipe[]) => ({ id: tipo, tipo, oculta: false, muda: false, travada: false, clipes });

const MIDIAS = new Map<string, MidiaParaAnalise>([
  ["baixo", { video: {}, audio: { lufs: -26 } }],
  ["certo", { video: {}, audio: { lufs: -14.5 } }],
  ["foto", { imagem: true, video: {}, audio: null }],
  ["musica", { video: null, audio: { lufs: -9 } }],
]);

test("as sugestões saem do que está medido e só nos clipes que precisam", () => {
  const sugestoes = analisarProjeto(
    projeto([
      faixa("principal", [clipe("a", "baixo", 30), clipe("b", "certo", 5, { cor: { filtro: "frio" } as Clipe["cor"], voz_limpa: true }), clipe("c", "foto", 5)]),
      faixa("audio", [clipe("m", "musica", 30)]),
    ]),
    MIDIAS,
  );
  const por = Object.fromEntries(sugestoes.map((s) => [s.tipo, s.clipeIds]));
  assert.deepEqual(por.volume, ["a", "m"], "o som longe de -14 LUFS, na principal e na música");
  assert.deepEqual(por.cor, ["a", "c"], "o clipe com filtro fica de fora");
  assert.deepEqual(por.voz, ["a"]);
  assert.deepEqual(por.cenas, ["a"], "só o vídeo longo");
  assert.ok(por.legendas, "fala sem legendas");
  // Com legendas e tudo igualado, sobra a cor
  const pronto = analisarProjeto(
    projeto([faixa("principal", [clipe("b", "certo", 5, { voz_limpa: true, cor: { filtro: "frio" } as Clipe["cor"] })]), faixa("legenda", [clipe("l", "certo", 2, { midia_id: null })])]),
    MIDIAS,
  );
  assert.deepEqual(pronto, []);
});
