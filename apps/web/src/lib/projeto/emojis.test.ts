import assert from "node:assert/strict";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { executarComando } from "./comandos.ts";
import type { Contexto } from "./edicao.ts";
import { comEmojisNasLegendas, legendasParaEmojis, semEmojis } from "./emojis.ts";
import { caixaDoClipe } from "./geometria.ts";
import { ESTILOS_DE_LEGENDA } from "./legendas.ts";
import type { Projeto } from "./modelo.ts";

const S = TICKS_POR_SEGUNDO;
let ultimo = 0;
function contexto(): Contexto {
  return {
    novoId: () => `e${++ultimo}`,
    midia: (id) => (id.startsWith("emoji") ? { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, transparente: true, imagem: true } : null),
  };
}

function comLegendas(): Projeto {
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
  const legendas = [
    { inicio: 0, fim: 2, texto: "Ganhei dinheiro" },
    { inicio: 2, fim: 4, texto: "com isso aqui" },
    { inicio: 5, fim: 7.5, texto: "em três dias" },
  ].map((item) => ({ inicio: item.inicio * S, fim: item.fim * S, conteudo: item.texto }));
  return executarComando(vazio, { comando: "legenda.importar", parametros: { legendas, estilo: ESTILOS_DE_LEGENDA[0].texto } }, contexto()).projeto;
}

const ehEmoji = (id: string) => id.startsWith("emoji");

test("cada emoji entra acima da legenda dele, no tempo dela, numa faixa só", () => {
  const projeto = comLegendas();
  const [primeira, , terceira] = legendasParaEmojis(projeto);
  assert.equal(primeira.texto, "Ganhei dinheiro");
  const emojis = [
    { legendaId: terceira.id, midiaId: "emoji-cem", largura: 136, altura: 128 },
    { legendaId: primeira.id, midiaId: "emoji-dinheiro", largura: 136, altura: 128 },
  ];
  const com = comEmojisNasLegendas(projeto, contexto(), emojis, ehEmoji);
  const faixas = com.faixas.filter((faixa) => faixa.clipes.some((clipe) => clipe.midia_id?.startsWith("emoji")));
  assert.equal(faixas.length, 1);
  const [a, b] = faixas[0].clipes;
  const legendas = com.faixas.find((faixa) => faixa.tipo === "legenda")!.clipes;
  assert.equal(a.inicio, legendas[0].inicio);
  assert.equal(a.duracao, legendas[0].duracao);
  assert.equal(b.inicio + b.duracao, legendas[2].inicio + legendas[2].duracao);
  // O lado maior com 13% do lado menor, e acima da legenda
  const caixa = caixaDoClipe(a.transformacao, a.recorte, { largura: 136, altura: 128 }, { largura: 1080, altura: 1920 });
  assert.ok(Math.abs(caixa.largura - 0.13 * 1080) < 1e-6);
  assert.ok(a.transformacao.y < legendas[0].transformacao.y);
  assert.equal(a.animacao?.entrada.tipo, "zoom");
  // Pedir de novo troca os de antes
  const deNovo = comEmojisNasLegendas(com, contexto(), [{ legendaId: primeira.id, midiaId: "emoji-fogo", largura: 136, altura: 128 }], ehEmoji);
  const todos = deNovo.faixas.flatMap((faixa) => faixa.clipes).filter((clipe) => ehEmoji(clipe.midia_id ?? ""));
  assert.deepEqual(
    todos.map((clipe) => clipe.midia_id),
    ["emoji-fogo"],
  );
  assert.equal(semEmojis(deNovo, ehEmoji).faixas.length, projeto.faixas.length);
});

test("sem nenhuma legenda que ainda exista, avisa", () => {
  assert.throws(() => comEmojisNasLegendas(comLegendas(), contexto(), [{ legendaId: "sumiu", midiaId: "emoji-fogo", largura: 136, altura: 128 }], ehEmoji), /não estão mais/);
});
