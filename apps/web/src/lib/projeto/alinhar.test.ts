import assert from "node:assert/strict";
import { test } from "node:test";

import { alinhar, type CaixaNoQuadro, caixaNoQuadro, deslocar, distribuir, mudancaComVinculadas, unidadesDaSelecao } from "./alinhar.ts";
import { executarComando } from "./comandos.ts";
import type { Contexto } from "./edicao.ts";
import type { Projeto } from "./modelo.ts";
import { TEXTO_PADRAO } from "./texto.ts";

function contexto(): Contexto {
  let n = 0;
  return { novoId: () => `n${++n}`, midia: () => null };
}

/** Três textos (a, b, c, de baixo para cima) e os ids das faixas e dos clipes. */
function tres() {
  const ctx = contexto();
  let projeto: Projeto = {
    id: "p",
    nome: "Imagem",
    proporcao: "1:1",
    tipo: "imagem",
    tamanho: { largura: 1000, altura: 1000 },
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#ffffff" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
  const faixas: string[] = [];
  const clipes: string[] = [];
  for (let i = 0; i < 3; i++) {
    const r = executarComando(projeto, { comando: "imagem.adicionarTexto", parametros: { texto: { ...TEXTO_PADRAO, conteudo: "abc"[i] } } }, ctx);
    projeto = r.projeto;
    clipes.push(r.selecao![0]);
    faixas.push(projeto.faixas.find((f) => f.clipes[0]?.id === r.selecao![0])!.id);
  }
  return { ctx, projeto, faixas, clipes };
}

const x = (projeto: Projeto, clipeId: string) => projeto.faixas.find((f) => f.clipes[0]?.id === clipeId)!.clipes[0].transformacao.x;

test("a caixa girada 90° troca largura e altura", () => {
  const caixa = caixaNoQuadro({ cx: 500, cy: 500, largura: 200, altura: 100, rotacao: 90 }, { largura: 1000, altura: 1000 });
  assert.ok(Math.abs(caixa.x0 - 0.45) < 1e-9 && Math.abs(caixa.y0 - 0.4) < 1e-9);
});

test("a pasta escolhida leva as de dentro; vinculadas andam juntas; travadas ficam", () => {
  const { ctx, projeto: inicio, faixas, clipes } = tres();
  const [a, b, c] = faixas;
  const g = executarComando(inicio, { comando: "imagem.agrupar", parametros: { faixaIds: [a, b] } }, ctx);
  let projeto = g.projeto;
  // A pasta e uma de dentro escolhidas: uma unidade só, com as duas
  const unidades = unidadesDaSelecao(projeto, [g.selecao![0], clipes[0]]);
  assert.equal(unidades.length, 1);
  assert.deepEqual(new Set(unidades[0].clipeIds), new Set([clipes[0], clipes[1]]));

  projeto = executarComando(projeto, { comando: "imagem.vincular", parametros: { faixaIds: [b, c], ligar: true } }, ctx).projeto;
  const mudancas = mudancaComVinculadas(projeto, projeto.faixas.find((f) => f.id === c)!.clipes[0], { x: 0.1, escala: 2 });
  assert.deepEqual(mudancas, [
    { clipeId: clipes[2], transformacao: { x: 0.1, escala: 2 } },
    { clipeId: clipes[1], transformacao: { x: 0.1, y: 0 } },
  ]);

  projeto = executarComando(projeto, { comando: "imagem.camada", parametros: { faixaIds: [b], mudanca: { travas: { posicao: true } } } }, ctx).projeto;
  assert.deepEqual(
    deslocar(projeto, [clipes[2]], 0.2, 0).map((m) => m.clipeId),
    [clipes[2]],
  );
  const movido = executarComando(projeto, { comando: "imagem.posicoes", parametros: { mudancas: deslocar(projeto, [clipes[2]], 0.2, 0) } }, ctx).projeto;
  assert.equal(x(movido, clipes[2]), 0.2);
  assert.equal(x(movido, clipes[1]), 0);
});

test("alinhar pela caixa de todas, ou pelo quadro com uma só, e distribuir", () => {
  const { projeto, clipes } = tres();
  const caixas = new Map<string, CaixaNoQuadro>([
    [clipes[0], { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 }],
    [clipes[1], { x0: 0.3, y0: 0.5, x1: 0.5, y1: 0.6 }],
    [clipes[2], { x0: 0.8, y0: 0.2, x1: 0.9, y1: 0.3 }],
  ]);
  const esquerda = alinhar(projeto, clipes, caixas, "esquerda");
  assert.deepEqual(
    esquerda.map((m) => [m.clipeId, Math.round(m.transformacao.x! * 1000) / 1000]).sort(),
    [
      [clipes[1], -0.2],
      [clipes[2], -0.7],
    ],
  );
  // Uma só: o centro no centro do quadro
  const so = alinhar(projeto, [clipes[2]], caixas, "centroH");
  assert.ok(Math.abs(so[0].transformacao.x! - -0.35) < 1e-9);
  // Distribuir os centros: 0,15 e 0,85 ficam; o do meio vai a 0,5 (estava em 0,4)
  const centros = distribuir(projeto, clipes, caixas, "centroH");
  assert.equal(centros.length, 1);
  assert.ok(Math.abs(centros[0].transformacao.x! - 0.1) < 1e-9);
  // O mesmo vão: 0,8 de largura total, 0,4 ocupados, vão de 0,2; a do meio começa em 0,4 (estava em 0,3)
  const espaco = distribuir(projeto, clipes, caixas, "espacoH");
  assert.ok(Math.abs(espaco[0].transformacao.x! - 0.1) < 1e-9);
});
