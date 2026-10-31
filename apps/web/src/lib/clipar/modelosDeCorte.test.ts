import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Contexto } from "../projeto/edicao.ts";
import { MARCA_VAZIA } from "../projeto/marca.ts";
import type { Clipe, Projeto } from "../projeto/modelo.ts";
import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import type { Midia } from "../tipos.ts";
import {
  ABERTURAS,
  camposDaAbertura,
  camposDaChamada,
  comExtras,
  DURACAO_DA_CHAMADA,
  inicioDaChamada,
  MODELOS_PRONTOS,
  modeloDasOpcoes,
  opcoesDoModelo,
  partesDoModelo,
  planoDoModelo,
  RECEITA_PADRAO,
  receitaDoProjeto,
  receitaValida,
  resumoDaReceita,
} from "./modelosDeCorte.ts";

const S = TICKS_POR_SEGUNDO;
const pronto = (id: string) => MODELOS_PRONTOS.find((modelo) => modelo.id === id)!.receita;

function contexto(): Contexto {
  let n = 0;
  const midias: Record<string, { duracao: number; video: boolean; audio: boolean; transparente?: boolean; imagem?: boolean }> = {
    palestra: { duracao: 600 * S, video: true, audio: true },
    musica: { duracao: 90 * S, video: false, audio: true },
    logo: { duracao: 5 * S, video: true, audio: false, transparente: true, imagem: true },
    chamada: { duracao: 4 * S, video: true, audio: false, transparente: true },
  };
  return { novoId: () => `n${++n}`, midia: (id) => midias[id] ?? null };
}

function clipe(id: string, inicio: number, duracao: number, extra: Partial<Clipe> = {}): Clipe {
  return {
    id,
    midia_id: "palestra",
    inicio: inicio * S,
    duracao: duracao * S,
    entrada: inicio * S,
    velocidade: 1,
    volume: 1,
    fade_entrada: 0,
    fade_saida: 0,
    transformacao: { x: 0, y: 0, escala: 1, rotacao: 0, opacidade: 1 },
    recorte: { x: 0, y: 0, largura: 1, altura: 1 },
    ...extra,
  };
}

function projeto(faixas: Projeto["faixas"] = []): Projeto {
  return {
    id: "p",
    nome: "Corte",
    proporcao: "9:16",
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#000000" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [clipe("a", 0, 10), clipe("b", 10, 20)] }, ...faixas],
    versao: 1,
    duracao: 30 * S,
    criado_em: "",
    atualizado_em: "",
  };
}

test("a receita guardada ganha o que falta e perde o que não vale", () => {
  assert.deepEqual(receitaValida({}), RECEITA_PADRAO);
  const lida = receitaValida({ legenda: null, legenda_animada: "nao_existe", cor: "verde", transicoes: "flash", tamanho: "gigante", chamada: { modelo: "x", texto: "a".repeat(80) }, musica: { midia_id: "m", volume: 7 } });
  assert.equal(lida.legenda, null);
  assert.equal(lida.legenda_animada, null);
  assert.equal(lida.cor, null);
  assert.equal(lida.transicoes, "flash");
  assert.equal(lida.tamanho, "normal");
  assert.deepEqual(lida.chamada, { modelo: "chamada_seguir", texto: "a".repeat(60) });
  assert.deepEqual(lida.musica, { midia_id: "m", volume: 1, abaixar: true });
  // Toda receita pronta passa pela conferência sem mudar
  for (const modelo of MODELOS_PRONTOS) assert.deepEqual(receitaValida(modelo.receita), modelo.receita, modelo.id);
});

test("o modelo da clipagem: o escolhido, o de pregação das clipagens de antes, ou o padrão", () => {
  assert.equal(modeloDasOpcoes({}).id, "padrao");
  assert.equal(modeloDasOpcoes({ modelo_edicao: "pregacao" }).id, "pregacao");
  const escolhido = modeloDasOpcoes({ modelo_corte: { id: "meu", nome: "Meu", receita: { titulo: false } as never } });
  assert.equal(escolhido.id, "meu");
  assert.equal(escolhido.receita.titulo, false);
  assert.equal(escolhido.receita.legenda, "palavra");
});

test("a receita vira as opções da montagem, as partes de pregação e o plano do editor", () => {
  const conversa = opcoesDoModelo(pronto("conversa"), "#123456");
  assert.deepEqual(conversa, { limpar: true, legenda: "caixa", titulo: true, zooms: false, corDeDestaque: "#123456", enquadrar: "rosto", ajusteDaLegenda: { posicao: "meio" } });
  assert.equal(partesDoModelo(pronto("padrao")), null);
  assert.deepEqual(partesDoModelo(pronto("ritmo")), { cor: "vivido", transicoes: "flash", sons: true });
  assert.deepEqual(partesDoModelo(pronto("pregacao")), { cor: "cinema", voz: { efeito: "radio" }, transicoes: "luz", sons: true, graficos: {}, imagens: {}, cartela: {} });
  // Com a legenda animada, as legendas de sempre ficam por baixo (a trilha sai delas)
  assert.equal(opcoesDoModelo(pronto("ritmo"), "#fff").legenda, "palavra");
  assert.deepEqual(opcoesDoModelo(pronto("ritmo"), "#fff").ajusteDaLegenda, { tamanho: "maior" });

  const minimalista = planoDoModelo(pronto("minimalista"), ["foco"]);
  assert.equal(minimalista.legenda.estilo, "contorno");
  assert.equal(minimalista.legenda.tamanho, "menor");
  assert.equal(minimalista.titulo.acao, "tirar");
  assert.equal(minimalista.zoom.acao, "tirar");
  assert.equal(minimalista.enfase.acao, "tirar");
  const padrao = planoDoModelo(RECEITA_PADRAO, ["hábito"]);
  assert.deepEqual(padrao.zoom, { acao: "por", palavras: ["hábito"], frases: [] });
  assert.equal(padrao.pausas, "tirar");
  // Sem as palavras de foco, o zoom fica como está (não há onde pôr)
  assert.equal(planoDoModelo(RECEITA_PADRAO).zoom.acao, "manter");
  assert.equal(planoDoModelo({ ...RECEITA_PADRAO, legenda: null }).legenda.acao, "tirar");
});

test("a chamada entra nos últimos segundos, antes da cartela, com o texto no campo dela e as cores da marca", () => {
  const p = projeto();
  assert.equal(inicioDaChamada(p, false), 30 * S - DURACAO_DA_CHAMADA * S);
  assert.equal(inicioDaChamada(p, true), 30 * S - 3.5 * S - DURACAO_DA_CHAMADA * S);
  assert.equal(inicioDaChamada({ ...p, faixas: [{ ...p.faixas[0], clipes: [clipe("a", 0, 5)] }] }, false), null);
  const marca = { ...MARCA_VAZIA, cores: ["#ff0000", "#00ff00"] };
  assert.deepEqual(camposDaChamada({ ...RECEITA_PADRAO, chamada: { modelo: "chamada_comente", texto: " EU QUERO " } }, marca), { palavra: "EU QUERO", cor_1: "#ff0000", cor_2: "#00ff00" });
  assert.deepEqual(camposDaChamada({ ...RECEITA_PADRAO, chamada: { modelo: "cta", texto: "" } }, MARCA_VAZIA), {});
});

test("os extras: a música até o fim, baixa e abaixando na fala, o logo e a chamada por cima", () => {
  const ctx = contexto();
  const { projeto: novo, feitos } = comExtras(projeto(), ctx, {
    musica: { midiaId: "musica", volume: 0.2, falas: [{ inicio: 2 * S, fim: 5 * S }] },
    logo: { midiaId: "logo", transformacao: { x: 0.3, y: -0.4, escala: 0.2, rotacao: 0, opacidade: 1 } },
    chamada: { midiaId: "chamada", inicio: 26 * S },
  });
  assert.deepEqual(feitos, ["a música", "o logo", "a chamada no fim"]);
  const todos = novo.faixas.flatMap((faixa) => faixa.clipes.map((c) => ({ ...c, tipo: faixa.tipo })));
  const musica = todos.find((c) => c.midia_id === "musica")!;
  assert.equal(musica.tipo, "audio");
  assert.equal(musica.inicio, 0);
  assert.equal(musica.duracao, 30 * S, "aparada no fim do corte");
  assert.equal(musica.volume, 0.2);
  assert.ok(musica.fade_saida > 0);
  assert.ok(musica.abaixamento && musica.abaixamento.pontos.length > 0);
  assert.equal(todos.find((c) => c.midia_id === "logo")!.transformacao.x, 0.3);
  const chamada = todos.find((c) => c.midia_id === "chamada")!;
  assert.equal(chamada.inicio, 26 * S);
  // A chamada fica na faixa de cima
  const faixaDaChamada = novo.faixas.findIndex((faixa) => faixa.clipes.some((c) => c.midia_id === "chamada"));
  const faixaDoLogo = novo.faixas.findIndex((faixa) => faixa.clipes.some((c) => c.midia_id === "logo"));
  assert.ok(faixaDaChamada > faixaDoLogo);
});

test("a receita lida de um projeto montado", () => {
  const midias = new Map<string, Midia>([
    ["trilha", { id: "trilha", legenda_animada: { estilo: "pulando", proporcao: "9:16", duracao: 30, palavras: 60 } } as unknown as Midia],
    ["seguir", { id: "seguir", animacao: { modelo: "chamada_seguir", campos: { chamada: "Segue aí" }, proporcao: "9:16", duracao: 4 } } as unknown as Midia],
    ["som", { id: "som", efeito_sonoro: { id: "camera", chave: "x" } } as unknown as Midia],
    ["musica", { id: "musica" } as unknown as Midia],
    ["logo", { id: "logo" } as unknown as Midia],
  ]);
  const base = projeto([
    {
      id: "leg",
      tipo: "legenda",
      oculta: true,
      muda: false,
      travada: false,
      clipes: [
        clipe("l1", 0, 2, {
          midia_id: null,
          transformacao: { x: 0, y: 0, escala: 1, rotacao: 0, opacidade: 1 },
          texto: { conteudo: "OLÁ", fonte: "texto", tamanho: 0.06, cor: "#ffffff", caixa_alta: false, fundo_opacidade: 0.65 } as never,
        }),
      ],
    },
    { id: "v2", tipo: "video", oculta: false, muda: false, travada: false, clipes: [clipe("t", 0, 30, { midia_id: "trilha" }), clipe("lg", 0, 30, { midia_id: "logo" }), clipe("cta", 26, 4, { midia_id: "seguir" })] },
    { id: "a1", tipo: "audio", oculta: false, muda: false, travada: false, clipes: [clipe("s", 9.5, 0.4, { midia_id: "som" }), clipe("m", 0, 30, { midia_id: "musica", volume: 0.15 })] },
  ]);
  base.faixas[0].clipes[0] = { ...base.faixas[0].clipes[0], cor: { filtro: "vivido" } as never, transicao: { tipo: "flash", duracao: 0.3 * S } };
  const receita = receitaDoProjeto(base, midias, "logo");
  assert.equal(receita.legenda, "caixa");
  assert.equal(receita.posicao, "meio");
  assert.equal(receita.legenda_animada, "pulando");
  assert.equal(receita.cor, "vivido");
  assert.equal(receita.transicoes, "flash");
  assert.equal(receita.sons, true);
  assert.equal(receita.logo, true);
  assert.deepEqual(receita.chamada, { modelo: "chamada_seguir", texto: "Segue aí" });
  assert.deepEqual(receita.musica, { midia_id: "musica", volume: 0.15, abaixar: false });
  assert.equal(receita.titulo, false);
  assert.equal(receita.zooms, false);
  assert.equal(receita.enquadrar, "inteiro");
});

test("o resumo da receita para o cartão", () => {
  assert.deepEqual(resumoDaReceita(pronto("conversa")), ["Legenda caixa escura no meio", "Rosto no quadro", "Sem pausas", "Título", "Cor suave", "Logo do kit", "Botão seguir no fim"]);
  assert.deepEqual(resumoDaReceita({ ...RECEITA_PADRAO, legenda: null, limpar: false, titulo: false, zooms: false, enquadrar: "inteiro" }), ["Sem legendas", "A imagem inteira"]);
  assert.ok(resumoDaReceita(pronto("ritmo")).includes("Flash com som"));
});


test("cada abertura é um gancho da biblioteca com o campo que recebe o título", () => {
  for (const abertura of ABERTURAS) {
    const html = readFileSync(new URL(`../../../../../core/animacoes/${abertura.id}.html`, import.meta.url), "utf8");
    const dados = JSON.parse(html.split('<script type="application/json" id="modelo">')[1].split("</script>")[0]);
    assert.equal(dados.categoria, "ganchos", abertura.id);
    const campo = dados.campos.find((item: { id: string; tipo: string }) => item.id === abertura.campo);
    assert.ok(campo, `${abertura.id}: sem o campo ${abertura.campo}`);
    assert.equal(campo.tipo, abertura.campo === "linhas" ? "linhas" : "texto", abertura.id);
  }
});

test("a abertura leva o título nas linhas e nas cores da marca, e tira o título de texto", () => {
  const marca = { ...MARCA_VAZIA, cores: ["#112233", "#445566"] };
  assert.deepEqual(camposDaAbertura("gancho_tela_tingida", "o hábito que mudou a minha vida", marca), {
    linhas: "O HÁBITO QUE\nMUDOU A MINHA\nVIDA",
    cor_1: "#112233",
    cor_2: "#445566",
  });
  assert.deepEqual(camposDaAbertura("gancho_pergunta", "  Por que   você desiste? ", MARCA_VAZIA), { texto: "Por que você desiste?" });
  assert.deepEqual(camposDaAbertura("nenhum", "x", marca), {});
  const receita = receitaValida({ ...RECEITA_PADRAO, abertura: "gancho_digitado" });
  assert.equal(receita.abertura, "gancho_digitado");
  assert.equal(receitaValida({ ...RECEITA_PADRAO, abertura: "nao_existe" }).abertura, null);
  assert.equal(opcoesDoModelo(receita, "#ffffff").titulo, false);
  assert.equal(opcoesDoModelo(RECEITA_PADRAO, "#ffffff").titulo, true);
  assert.ok(resumoDaReceita(receita).includes("Abertura: título digitado"));
});
