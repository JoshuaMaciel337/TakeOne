import assert from "node:assert/strict";
import { test } from "node:test";

import type { Contexto } from "../projeto/edicao.ts";
import type { PalavraDaLinha } from "../projeto/fala.ts";
import type { Clipe, Projeto } from "../projeto/modelo.ts";
import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { cartelaDoTitulo, comMidiasDoPlano, escalaQueCobre, fimDaPrimeiraFrase, planoDaPregacao } from "./modeloDePregacao.ts";

const S = TICKS_POR_SEGUNDO;

function contexto(): Contexto {
  let n = 0;
  const midias: Record<string, { duracao: number; video: boolean; audio: boolean; transparente?: boolean }> = {
    palestra: { duracao: 600 * S, video: true, audio: true },
    camera: { duracao: 0.4 * S, video: false, audio: true },
    coracao: { duracao: 3.5 * S, video: true, audio: false, transparente: true },
    apoio: { duracao: 20 * S, video: true, audio: true },
  };
  return { novoId: () => `n${++n}`, midia: (id) => midias[id] ?? null };
}

function clipe(id: string, inicio: number, duracao: number): Clipe {
  return { id, midia_id: "palestra", inicio: inicio * S, duracao: duracao * S, entrada: inicio * S, velocidade: 1, volume: 1, fade_entrada: 0, fade_saida: 0, transformacao: { x: 0, y: 0, escala: 1, rotacao: 0, opacidade: 1 }, recorte: { x: 0, y: 0, largura: 1, altura: 1 } };
}

function projeto(): Projeto {
  return {
    id: "p",
    nome: "Corte",
    proporcao: "9:16",
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#000000" },
    // Quatro pedaços (os cortes da limpeza da fala) em 6, 9 e 16 s
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [clipe("a", 0, 6), clipe("b", 6, 3), clipe("c", 9, 7), clipe("d", 16, 14)] }],
    versao: 1,
    duracao: 30 * S,
    criado_em: "",
    atualizado_em: "",
  };
}

/** Palavras de 0,3 s a cada 0,4 s, a partir de `inicio` segundos. */
function fala(texto: string, inicio: number): PalavraDaLinha[] {
  return texto.split(" ").map((p, i) => ({ texto: p, inicio: (inicio + i * 0.4) * S, fim: (inicio + i * 0.4 + 0.3) * S, clipeId: "a", fimDoClipe: 6 * S }));
}

const PALAVRAS = [
  ...fala("Quanto menos contato com a palavra.", 0.2),
  ...fala("mais longe você fica e a sua mente se enche de mentira", 3.2),
  ...fala("então abra a bíblia todo dia e ore com a sua família", 12),
];

test("a primeira frase com tamanho de frase e as partes da cartela", () => {
  assert.equal(fimDaPrimeiraFrase(PALAVRAS), Math.round(((0.2 + 5 * 0.4 + 0.3) * S + 3.2 * S) / 2));
  assert.equal(fimDaPrimeiraFrase(fala("Olá. tudo bem com você hoje", 0)), null, "o olá é curto demais e a frase seguinte não fecha");
  assert.deepEqual(cartelaDoTitulo("A mentira sai!"), { linha_1: "A MENTIRA", linha_2: "SAI" });
  assert.deepEqual(cartelaDoTitulo("Quando a gente para de ouvir a voz de Deus tudo muda"), { linha_1: "A VOZ DE DEUS TUDO", linha_2: "MUDA" });
  assert.equal(cartelaDoTitulo("Fé"), null);
  assert.ok(Math.abs(escalaQueCobre(1920, 1080, "9:16") - (16 / 9) / (9 / 16)) < 1e-9);
});

test("o plano põe a cor, a voz de rádio, as luzes nos cortes e pede os sons, os gráficos, as imagens e a cartela", () => {
  const ctx = contexto();
  const plano = planoDaPregacao(projeto(), ctx, PALAVRAS, "A mentira sai");
  const principal = plano.projeto.faixas.find((faixa) => faixa.tipo === "principal")!.clipes;
  assert.ok(principal.every((c) => c.cor?.filtro === "cinema"));
  // A primeira frase virou um clipe próprio, com a voz de rádio; o resto continua sem efeito
  assert.equal(principal[0].efeitos_voz?.grave, -10);
  assert.ok(!principal[1].efeitos_voz);
  // As luzes: o corte da frase (clarão), e depois só os cortes a 4 s ou mais do anterior, alternando
  const luzes = principal.filter((c) => c.transicao).map((c) => [c.transicao!.tipo, Math.round((c.inicio + c.duracao) / S)]);
  assert.deepEqual(luzes, [
    ["clarao", 3],
    ["flash", 9],
    ["clarao", 16],
  ]);
  // A "palavra" da primeira frase chama a Bíblia; a mente vem a menos de 8 s dela e fica de fora
  assert.deepEqual(
    plano.graficos.map((g) => [g.modelo, g.inicio / S]),
    [["pregacao_biblia", 2]],
  );
  // O swish entra com o gráfico, o whoosh antes de cada clarão, o clique no flash e o impacto na cartela
  assert.deepEqual(
    plano.sons.map((som) => som.efeito),
    ["swish", "whoosh", "camera", "whoosh", "impacto"],
  );
  // A bíblia aberta pede a imagem de apoio; a família vem perto demais dela
  assert.deepEqual(
    plano.imagens.map((imagem) => [imagem.busca, imagem.inicio / S]),
    [["lendo a bíblia", 13.2]],
  );
  assert.deepEqual(plano.cartela, { linha_1: "A MENTIRA", linha_2: "SAI", inicio: 26.5 * S, duracao: 3.5 * S });
});

test("as mídias prontas entram: o som no áudio, o gráfico por cima, a imagem muda cobrindo o quadro e cortada", () => {
  const ctx = contexto();
  const plano = planoDaPregacao(projeto(), ctx, PALAVRAS, "A mentira sai");
  const final = comMidiasDoPlano(plano.projeto, ctx, [
    { tipo: "som", midiaId: "camera", inicio: 9 * S },
    { tipo: "grafico", midiaId: "coracao", inicio: 4 * S },
    { tipo: "imagem", midiaId: "apoio", inicio: 13 * S, duracao: 2.4 * S, largura: 1920, altura: 1080 },
  ]);
  const todos = final.faixas.flatMap((faixa) => faixa.clipes.map((c) => ({ c, tipo: faixa.tipo })));
  const som = todos.find(({ c }) => c.midia_id === "camera")!;
  assert.equal(som.tipo, "audio");
  assert.equal(todos.find(({ c }) => c.midia_id === "coracao")!.tipo, "video");
  const apoio = todos.find(({ c }) => c.midia_id === "apoio")!;
  assert.equal(apoio.tipo, "video", "a imagem de apoio fica por cima, não na principal");
  assert.equal(apoio.c.duracao, 2.4 * S);
  assert.equal(apoio.c.volume, 0);
  assert.ok(Math.abs(apoio.c.transformacao.escala - (16 / 9) / (9 / 16)) < 1e-6);
});
