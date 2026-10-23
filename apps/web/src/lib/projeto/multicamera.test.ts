import assert from "node:assert/strict";
import { test } from "node:test";

import { duracaoDoQuadro, segundosParaTicks } from "../tempo.ts";
import { adicionarClipe, type Contexto, desfazerMulticamera, ErroEdicao, sincronizarCameras, trocarCamera } from "./edicao.ts";
import { fimDoClipe, type Projeto } from "./modelo.ts";
import { atrasoNaLinha, atrasoPeloSom } from "./multicamera.ts";

const S = segundosParaTicks(1);
const TAXA = { num: 30, den: 1 };
const QUADRO = duracaoDoQuadro(TAXA);

/** Sorteio com semente (as mesmas gravações em toda execução). */
function sorteador(semente: number) {
  let estado = semente >>> 0;
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    return estado / 2 ** 32;
  };
}

/** Os níveis de uma cena de `segundos` s: silêncio de fundo e ataques (sílabas, palmas) sorteados. */
function cena(segundos: number, semente: number): number[] {
  const sorteio = sorteador(semente);
  const niveis: number[] = [];
  let nivel = -60;
  for (let i = 0; i < segundos * 100; i++) {
    nivel = sorteio() < 0.04 ? -10 - sorteio() * 20 : Math.max(-60, nivel - 1.5);
    niveis.push(nivel);
  }
  return niveis;
}

/** O que uma câmera grava da cena: de `de` a `ate` s, com outro volume e o próprio ruído. */
function gravar(niveis: number[], de: number, ate: number, ganho: number, semente: number): Int8Array {
  const sorteio = sorteador(semente);
  return Int8Array.from(niveis.slice(de * 100, ate * 100).map((n) => Math.round(Math.max(-90, n + ganho + (sorteio() - 0.5) * 6))));
}

test("o atraso pelo som acha onde a segunda gravação começa", () => {
  const niveis = cena(120, 7);
  const primeira = gravar(niveis, 0, 100, 0, 1);
  // A segunda câmera ligou 12,34 s depois, mais baixa e com outro ruído
  const segunda = gravar(niveis.slice(34 / 100), 12, 110, -14, 2);
  const encaixe = atrasoPeloSom(primeira, segunda)!;
  assert.ok(Math.abs(encaixe.atraso - 12) < 0.02, String(encaixe.atraso));
  assert.ok(encaixe.confianca > 1.5, String(encaixe.confianca));
  // Ao contrário: a primeira começou antes, o atraso é negativo
  assert.ok(Math.abs(atrasoPeloSom(segunda, primeira)!.atraso + 12) < 0.02);
  // Uma câmera que ligou antes e desligou no meio
  const terceira = gravar(niveis, 0, 40, 6, 3);
  const comeco = gravar(niveis, 25, 120, 0, 4);
  assert.ok(Math.abs(atrasoPeloSom(comeco, terceira)!.atraso + 25) < 0.02);
});

test("gravações de cenas diferentes não encaixam", () => {
  assert.equal(atrasoPeloSom(gravar(cena(60, 1), 0, 60, 0, 1), gravar(cena(60, 2), 0, 60, 0, 2)), null);
  // Curtas demais para decidir
  assert.equal(atrasoPeloSom(Int8Array.from([1, 2, 3]), Int8Array.from([1, 2, 3])), null);
});

test("o atraso na linha soma o lugar do clipe de referência", () => {
  // A referência começa aos 2 s da linha, a partir de 5 s da mídia; a câmera ligou 3 s depois dela
  assert.equal(atrasoNaLinha({ inicio: 2 * S, entrada: 5 * S }, { atraso: 3, confianca: 2 }), 0);
  assert.equal(atrasoNaLinha({ inicio: 0, entrada: 0 }, { atraso: -1.5, confianca: 2 }), -1.5 * S);
});

function contexto(): Contexto {
  let n = 0;
  const midias: Record<string, { duracao: number; video: boolean; audio: boolean }> = {
    principal: { duracao: 20 * S, video: true, audio: true },
    camA: { duracao: 20 * S, video: true, audio: true },
    camB: { duracao: 8 * S, video: true, audio: true },
  };
  return { novoId: () => `n${++n}`, midia: (id) => midias[id] ?? null };
}

function projetoComReferencia(ctx: Contexto): Projeto {
  const vazio: Projeto = {
    id: "p",
    nome: "Teste",
    proporcao: "16:9",
    taxa: TAXA,
    fundo: { cor: "#000000" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
  return adicionarClipe(vazio, ctx, "principal").projeto;
}

const camera = (projeto: Projeto, midiaId: string) => projeto.faixas.find((faixa) => faixa.multicamera?.midia_id === midiaId)!;
const trechos = (projeto: Projeto, midiaId: string) => camera(projeto, midiaId).clipes.map((c) => [c.inicio / S, fimDoClipe(c) / S, c.entrada / S]);

test("sincronizar põe cada câmera inteira no lugar, muda, logo acima da principal", () => {
  const ctx = contexto();
  // A câmera A ligou 1,5 s antes da principal; a B, 4 s depois
  const { projeto, selecao } = sincronizarCameras(projetoComReferencia(ctx), ctx, [
    { midiaId: "camA", atraso: -1.5 * S },
    { midiaId: "camB", atraso: 4 * S },
  ]);
  assert.deepEqual(projeto.faixas.map((f) => f.multicamera?.midia_id ?? f.tipo), ["camA", "camB", "principal"]);
  // A câmera A perde o 1,5 s de antes do começo do vídeo
  assert.deepEqual(trechos(projeto, "camA"), [[0, 18.5, 1.5]]);
  assert.deepEqual(trechos(projeto, "camB"), [[4, 12, 0]]);
  assert.ok(camera(projeto, "camA").clipes.every((c) => c.volume === 0), "o som fica na principal");
  assert.equal(selecao.length, 2);
  // De novo: troca a faixa da câmera, não cria outra
  const outra = sincronizarCameras(projeto, ctx, [{ midiaId: "camB", atraso: 5 * S }]).projeto;
  assert.equal(outra.faixas.length, 3);
  assert.deepEqual(trechos(outra, "camB"), [[5, 13, 0]]);
});

test("trocar a câmera no cursor vai até a próxima troca e guarda o encaixe", () => {
  const ctx = contexto();
  let projeto = sincronizarCameras(projetoComReferencia(ctx), ctx, [
    { midiaId: "camA", atraso: 0 },
    { midiaId: "camB", atraso: 4 * S },
  ]).projeto;
  const faixaA = camera(projeto, "camA").id;
  const faixaB = camera(projeto, "camB").id;
  // A principal do começo até a próxima ponta (o começo da B, aos 4 s)
  projeto = trocarCamera(projeto, ctx, 0, null).projeto;
  assert.deepEqual(trechos(projeto, "camA"), [[4, 20, 4]]);
  // A B aos 6 s: sai a A de 6 a 12 (o fim da B); a B, que já estava ali por baixo da A, fica num clipe só
  projeto = trocarCamera(projeto, ctx, 6 * S, faixaB).projeto;
  assert.deepEqual(trechos(projeto, "camA"), [[4, 6, 4], [12, 20, 12]]);
  assert.deepEqual(trechos(projeto, "camB"), [[4, 12, 0]]);
  // A A de volta aos 6 s: os pedaços dela se juntam num clipe só, no mesmo encaixe, e a B sai até o fim dela
  projeto = trocarCamera(projeto, ctx, 6 * S, faixaA).projeto;
  assert.deepEqual(trechos(projeto, "camA"), [[4, 20, 4]]);
  assert.deepEqual(trechos(projeto, "camB"), [[4, 6, 0]]);
  // A A no começo: ela grava desde 0 e volta a cobrir tudo
  projeto = trocarCamera(projeto, ctx, 0, faixaA).projeto;
  assert.deepEqual(trechos(projeto, "camA"), [[0, 20, 0]]);
  // A B aos 15 s: ela já desligou
  assert.throws(() => trocarCamera(projeto, ctx, 15 * S, faixaB), (e) => e instanceof ErroEdicao && /não gravou/.test(e.message));
  // O cursor no meio de um quadro vai para o quadro; a B entra até desligar e a A volta depois
  const noQuadro = trocarCamera(projeto, ctx, 8 * S + QUADRO / 3, faixaB).projeto;
  assert.deepEqual(trechos(noQuadro, "camB"), [[4, 6, 0], [8, 12, 4]]);
  assert.deepEqual(trechos(noQuadro, "camA"), [[0, 8, 0], [12, 20, 12]]);
});

test("desfazer a multicâmera deixa os clipes e tira as faixas vazias", () => {
  const ctx = contexto();
  let projeto = sincronizarCameras(projetoComReferencia(ctx), ctx, [
    { midiaId: "camA", atraso: 0 },
    { midiaId: "camB", atraso: 4 * S },
  ]).projeto;
  projeto = trocarCamera(projeto, ctx, 4 * S, camera(projeto, "camA").id).projeto;
  assert.equal(camera(projeto, "camB").clipes.length, 0);
  const desfeito = desfazerMulticamera(projeto);
  assert.deepEqual(desfeito.faixas.map((f) => f.tipo), ["video", "principal"]);
  assert.ok(desfeito.faixas.every((f) => !f.multicamera));
  assert.throws(() => trocarCamera(desfeito, ctx, 0, null), /Sincronize/);
});
