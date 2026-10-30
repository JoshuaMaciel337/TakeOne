import assert from "node:assert/strict";
import { test } from "node:test";

import { transformacaoAnimada } from "../projeto/animacao.ts";
import { executarComando } from "../projeto/comandos.ts";
import type { Contexto } from "../projeto/edicao.ts";
import { caixaDoClipe } from "../projeto/geometria.ts";
import type { Clipe, Projeto } from "../projeto/modelo.ts";
import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import {
  barraDoProjeto,
  comABarraAtualizada,
  comBarraDeProgresso,
  comDistracao,
  comQuadroNaCaixa,
  ESPESSURA_DA_BARRA,
  escolhaDaDistracao,
  instanteDoQuadro,
  PROPORCAO_DA_BARRA,
  semABarra,
} from "./retencao.ts";

const S = TICKS_POR_SEGUNDO;
const FORMA = { largura: 2048, altura: Math.round(2048 / PROPORCAO_DA_BARRA) };

let ultimo = 0;
function contexto(): Contexto {
  return {
    novoId: () => `n${++ultimo}`,
    midia: (id) => {
      if (id === "palestra") return { duracao: 600 * S, video: true, audio: true };
      if (id === "areia") return { duracao: 7 * S, video: true, audio: true };
      if (["trilho", "barra", "foto"].includes(id)) return { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, transparente: id !== "foto", imagem: true };
      return null;
    },
  };
}

function corte(proporcao: Projeto["proporcao"] = "9:16", segundos = 20): Projeto {
  const projeto: Projeto = {
    id: "p",
    nome: "Corte",
    proporcao,
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#000000" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
  return executarComando(projeto, { comando: "clipe.inserirTrecho", parametros: { midiaId: "palestra", de: 100 * S, ate: (100 + segundos) * S, tempo: 0, modo: "inserir" } }, contexto()).projeto;
}

const todos = (projeto: Projeto): Clipe[] => projeto.faixas.flatMap((faixa) => faixa.clipes);
const daBarra = (id: string) => id === "trilho" || id === "barra";
const BARRA = { trilhoId: "trilho", barraId: "barra", posicao: "baixo" as const };

test("a barra cobre a largura com a espessura pedida, encostada embaixo, e anda do começo ao fim", () => {
  for (const proporcao of ["9:16", "16:9", "1:1"] as const) {
    const projeto = comBarraDeProgresso(corte(proporcao), contexto(), BARRA);
    const [l, a] = proporcao.split(":").map(Number);
    const quadro = { largura: (1080 * l) / Math.min(l, a), altura: (1080 * a) / Math.min(l, a) };
    const barra = todos(projeto).find((clipe) => clipe.midia_id === "barra")!;
    const trilho = todos(projeto).find((clipe) => clipe.midia_id === "trilho")!;
    assert.equal(barra.inicio, 0);
    assert.equal(barra.duracao, 20 * S);
    assert.equal(trilho.transformacao.opacidade, 0.35);
    // No meio do vídeo, a barra vai até a metade do quadro
    const meio = caixaDoClipe(transformacaoAnimada(barra, 10 * S), barra.recorte, FORMA, quadro);
    assert.ok(Math.abs(meio.largura - quadro.largura) < 1e-6, proporcao);
    assert.ok(Math.abs(meio.altura - ESPESSURA_DA_BARRA * 1080) < 1, `${proporcao}: ${meio.altura}`);
    assert.ok(Math.abs(meio.cx + meio.largura / 2 - quadro.largura / 2) < 1, `${proporcao}: ${meio.cx}`);
    assert.ok(Math.abs(meio.cy + meio.altura / 2 - quadro.altura) < 1, `${proporcao}: encostada embaixo`);
    const fim = caixaDoClipe(transformacaoAnimada(barra, 20 * S), barra.recorte, FORMA, quadro);
    assert.ok(Math.abs(fim.cx - quadro.largura / 2) < 1);
    // A barra fica por cima do trilho (as faixas vão de cima para baixo)
    const ordem = projeto.faixas.map((faixa) => faixa.clipes[0]?.midia_id);
    assert.ok(ordem.indexOf("barra") < ordem.indexOf("trilho"));
  }
});

test("a barra no alto, e pôr de novo troca a que havia", () => {
  const embaixo = comBarraDeProgresso(corte(), contexto(), BARRA);
  const noAlto = comBarraDeProgresso(embaixo, contexto(), { ...BARRA, posicao: "alto" });
  assert.equal(todos(noAlto).filter((clipe) => clipe.midia_id === "barra").length, 1);
  assert.equal(noAlto.faixas.length, embaixo.faixas.length);
  assert.deepEqual(barraDoProjeto(noAlto, daBarra), { ...BARRA, posicao: "alto" });
  assert.ok(todos(noAlto).find((clipe) => clipe.midia_id === "barra")!.transformacao.y < 0);
  const sem = semABarra(noAlto, daBarra);
  assert.equal(barraDoProjeto(sem, daBarra), null);
  assert.equal(sem.faixas.length, 1);
});

test("depois de estender o corte, a barra volta a acabar no fim", () => {
  const ctx = contexto();
  const comBarra = comBarraDeProgresso(corte(), ctx, BARRA);
  assert.equal(comABarraAtualizada(comBarra, ctx, daBarra), comBarra);
  const estendido = executarComando(comBarra, { comando: "clipe.inserirTrecho", parametros: { midiaId: "palestra", de: 120 * S, ate: 125 * S, tempo: 20 * S, modo: "inserir" } }, ctx).projeto;
  const atualizado = comABarraAtualizada(estendido, ctx, daBarra);
  const barra = todos(atualizado).filter((clipe) => clipe.midia_id === "barra");
  assert.equal(barra.length, 1);
  assert.equal(barra[0].duracao, 25 * S);
  assert.equal(barra[0].keyframes!.x!.at(-1)!.t, 25 * S);
});

test("a retenção fica por cima dos vídeos que já havia, com a barra no alto de tudo", () => {
  const ctx = contexto();
  let projeto = executarComando(corte(), { comando: "clipe.adicionar", parametros: { midiaId: "foto", inicio: 0, novaFaixa: true } }, ctx).projeto;
  projeto = comDistracao(projeto, ctx, { midiaId: "areia", largura: 1920, altura: 1080, fracao: 0 }).projeto;
  projeto = comQuadroNaCaixa(projeto, ctx, { midiaId: "foto", largura: 1920, altura: 1080 }).projeto;
  projeto = comBarraDeProgresso(projeto, ctx, BARRA);
  const ordem = projeto.faixas.map((faixa) => (faixa.tipo === "principal" ? "principal" : faixa.clipes[0]?.midia_id));
  assert.deepEqual(ordem, ["barra", "trilho", "foto", "areia", "foto", "principal"]);
});

test("o quadro do original sai do trecho do corte", () => {
  const trechos = [
    { de: 100, ate: 112 },
    { de: 120, ate: 130 },
  ];
  assert.equal(instanteDoQuadro(trechos, "inicio", "c01"), 100.5);
  assert.equal(instanteDoQuadro(trechos, "fim", "c01"), 129.5);
  assert.equal(instanteDoQuadro(trechos, "meio", "c01"), 115);
  const a = instanteDoQuadro(trechos, "sorteado", "c01");
  assert.equal(a, instanteDoQuadro(trechos, "sorteado", "c01"));
  assert.notEqual(a, instanteDoQuadro(trechos, "sorteado", "c02"));
  assert.ok(a >= 100.5 && a <= 129.5);
});

test("o quadro entra numa caixa no alto, depois do título, com 80% da largura no vídeo em pé", () => {
  const { projeto, clipeId } = comQuadroNaCaixa(corte(), contexto(), { midiaId: "foto", largura: 1920, altura: 1080 });
  const clipe = todos(projeto).find((item) => item.id === clipeId)!;
  assert.equal(clipe.inicio, 3 * S);
  assert.equal(clipe.duracao, 3 * S);
  assert.ok(clipe.cantos && clipe.animacao?.entrada.tipo === "zoom");
  const caixa = caixaDoClipe(clipe.transformacao, clipe.recorte, { largura: 1920, altura: 1080 }, { largura: 1080, altura: 1920 });
  assert.ok(Math.abs(caixa.largura - 0.8 * 1080) < 1e-6);
  assert.ok(caixa.cy - caixa.altura / 2 > 0, "dentro do quadro");
  // Num corte curto, ela cabe no fim
  const curto = comQuadroNaCaixa(corte("9:16", 4), contexto(), { midiaId: "foto", largura: 1920, altura: 1080 });
  const noCurto = todos(curto.projeto).find((item) => item.id === curto.clipeId)!;
  assert.equal(noCurto.inicio + noCurto.duracao, 4 * S);
});

test("o vídeo de distração cobre a faixa de baixo do começo ao fim, mudo, recomeçando quando acaba", () => {
  const { projeto, clipeIds } = comDistracao(corte(), contexto(), { midiaId: "areia", largura: 1920, altura: 1080, fracao: 0.5 });
  const clipes = todos(projeto).filter((clipe) => clipeIds.includes(clipe.id));
  assert.equal(clipes[0].inicio, 0);
  assert.equal(clipes[0].entrada, 2.5 * S);
  assert.equal(clipes.at(-1)!.inicio + clipes.at(-1)!.duracao, 20 * S);
  assert.equal(clipes.reduce((soma, clipe) => soma + clipe.duracao, 0), 20 * S);
  for (const clipe of clipes) {
    assert.equal(clipe.volume, 0);
    assert.ok(clipe.entrada + clipe.duracao <= 7 * S);
    const caixa = caixaDoClipe(clipe.transformacao, clipe.recorte, { largura: 1920, altura: 1080 }, { largura: 1080, altura: 1920 });
    assert.ok(Math.abs(caixa.largura - 1080) < 1e-6);
    assert.ok(Math.abs(caixa.altura - 0.38 * 1920) < 1e-6);
    assert.ok(Math.abs(caixa.cy + caixa.altura / 2 - 1920) < 1e-6);
  }
  // No vídeo deitado, uma caixa no canto de baixo
  const deitado = comDistracao(corte("16:9"), contexto(), { midiaId: "areia", largura: 1080, altura: 1920, fracao: 0 });
  const clipe = todos(deitado.projeto).find((item) => item.id === deitado.clipeIds[0])!;
  const caixa = caixaDoClipe(clipe.transformacao, clipe.recorte, { largura: 1080, altura: 1920 }, { largura: 1920, altura: 1080 });
  assert.ok(Math.abs(caixa.largura - 0.32 * 1920) < 1e-6);
  assert.ok(caixa.cx + caixa.largura / 2 < 1920 && caixa.cy + caixa.altura / 2 < 1080);
  assert.ok(caixa.cx > 1920 / 2);
});

test("cada corte pega um vídeo e um trecho da lista pelo sorteio", () => {
  const ids = ["a", "b", "c"];
  assert.deepEqual(escolhaDaDistracao(ids, "c01"), escolhaDaDistracao(ids, "c01"));
  const escolhidos = new Set(["c01", "c02", "c03", "c04", "c05", "c06"].map((id) => escolhaDaDistracao(ids, id)!.midiaId));
  assert.ok(escolhidos.size > 1);
  assert.equal(escolhaDaDistracao([], "c01"), null);
});
