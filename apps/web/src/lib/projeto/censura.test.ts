import assert from "node:assert/strict";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { comCensura, palavraCensurada, textoCensurado, trechosCensurados, volumeSemOsTrechos } from "./censura.ts";
import { executarComando } from "./comandos.ts";
import type { Contexto } from "./edicao.ts";
import type { PalavraDaLinha } from "./fala.ts";
import { valorNoTempo } from "./keyframes.ts";
import { ESTILOS_DE_LEGENDA } from "./legendas.ts";
import type { Projeto } from "./modelo.ts";

const S = TICKS_POR_SEGUNDO;
const LISTA = ["porra", "caral*", "Merda"];

test("a lista pega a palavra sem acento nem pontuação, e o * pega as variações", () => {
  assert.ok(palavraCensurada("Porra!", LISTA));
  assert.ok(palavraCensurada("caralho,", LISTA));
  assert.ok(palavraCensurada("MERDA", LISTA));
  assert.ok(!palavraCensurada("merdinha", LISTA));
  assert.ok(!palavraCensurada("cara", LISTA));
  assert.ok(!palavraCensurada("", LISTA));
  assert.equal(textoCensurado("Que porra, caralho!\nMerda.", LISTA), "Que p****, c******!\nM****.");
});

function palavra(texto: string, de: number, ate: number): PalavraDaLinha {
  return { texto, inicio: de * S, fim: ate * S, clipeId: "c", fimDoClipe: 20 * S };
}

test("os trechos têm folga e se juntam quando se tocam", () => {
  const trechos = trechosCensurados([palavra("olha", 1, 1.3), palavra("porra", 1.4, 1.7), palavra("caralho", 1.75, 2.1), palavra("merda", 5, 5.3)], LISTA);
  assert.equal(trechos.length, 2);
  assert.equal(trechos[0].inicio, Math.round(1.36 * S));
  assert.equal(trechos[0].fim, Math.round(2.14 * S));
});

test("o volume fica em zero só no trecho e volta ao de antes, também com pontos que já havia", () => {
  const sem = volumeSemOsTrechos({ volume: 0.8, duracao: 10 * S }, [{ de: 2 * S, ate: 3 * S }]);
  assert.equal(valorNoTempo(sem, 1 * S), 0.8);
  assert.equal(valorNoTempo(sem, 2 * S - 2), 0.8);
  assert.equal(valorNoTempo(sem, 2.5 * S), 0);
  assert.equal(valorNoTempo(sem, 3 * S), 0.8);
  assert.equal(valorNoTempo(sem, 9 * S), 0.8);
  // Com um fade de 1 a 0,5 ao longo do clipe, fora do trecho a curva continua a mesma
  const keyframes = { volume: [{ t: 0, valor: 1, curva: "linear" as const }, { t: 10 * S, valor: 0.5, curva: "linear" as const }] };
  const comFade = volumeSemOsTrechos({ volume: 1, duracao: 10 * S, keyframes }, [{ de: 4 * S, ate: 5 * S }]);
  assert.ok(Math.abs(valorNoTempo(comFade, 2 * S) - 0.9) < 1e-9);
  assert.equal(valorNoTempo(comFade, 4.5 * S), 0);
  assert.ok(Math.abs(valorNoTempo(comFade, 5 * S) - 0.75) < 1e-9);
  assert.ok(Math.abs(valorNoTempo(comFade, 7.5 * S) - 0.625) < 1e-9);
});

let ultimo = 0;
const ctx: Contexto = {
  novoId: () => `k${++ultimo}`,
  midia: (id) => (id === "palestra" ? { duracao: 600 * S, video: true, audio: true } : id === "bipe" ? { duracao: 2 * S, video: false, audio: true } : null),
};

test("no modo bipe, o bipe toca no tamanho de cada trecho, e a legenda vira asteriscos", () => {
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
  let projeto = executarComando(vazio, { comando: "clipe.inserirTrecho", parametros: { midiaId: "palestra", de: 100 * S, ate: 110 * S, tempo: 0, modo: "inserir" } }, ctx).projeto;
  projeto = executarComando(projeto, { comando: "legenda.importar", parametros: { legendas: [{ inicio: 0, fim: 3 * S, conteudo: "que porra é essa" }], estilo: ESTILOS_DE_LEGENDA[0].texto } }, ctx).projeto;
  const trechos = [
    { inicio: 1 * S, fim: 1.5 * S },
    { inicio: 2 * S, fim: 5 * S },
  ];
  const censurado = comCensura(projeto, ctx, trechos, LISTA, "bipe", "bipe");
  const bipes = censurado.faixas.flatMap((faixa) => faixa.clipes).filter((clipe) => clipe.midia_id === "bipe");
  assert.deepEqual(
    bipes.map((clipe) => [clipe.inicio / S, (clipe.inicio + clipe.duracao) / S]),
    [
      [1, 1.5],
      [2, 4],
    ],
  );
  assert.ok(bipes.every((clipe) => clipe.volume === 0.3));
  const principal = censurado.faixas.find((faixa) => faixa.tipo === "principal")!.clipes[0];
  assert.equal(valorNoTempo(principal.keyframes!.volume!, 1.2 * S), 0);
  assert.equal(censurado.faixas.find((faixa) => faixa.tipo === "legenda")!.clipes[0].texto!.conteudo, "que p**** é essa");
  // No modo silêncio, só o som some
  const calado = comCensura(projeto, ctx, trechos, LISTA, "silencio", null);
  assert.equal(calado.faixas.flatMap((faixa) => faixa.clipes).filter((clipe) => clipe.midia_id === "bipe").length, 0);
});
