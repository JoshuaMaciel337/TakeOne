import assert from "node:assert/strict";
import { test } from "node:test";

import { executarComando } from "../projeto/comandos.ts";
import type { Contexto } from "../projeto/edicao.ts";
import { caixaDoClipe } from "../projeto/geometria.ts";
import type { Clipe, Projeto } from "../projeto/modelo.ts";
import { arrastoDaForma, camadaDoArrasto, OPCOES_DAS_FORMAS_PADRAO } from "./arrasto.ts";
import { refazerForma, TRACO_PADRAO } from "./modelo.ts";

const ctx: Contexto = { novoId: (() => {
  let n = 0;
  return () => `n${++n}`;
})(), midia: () => null };

function vazio(): Projeto {
  return {
    id: "p",
    nome: "Imagem",
    proporcao: "16:9",
    tipo: "imagem",
    tamanho: { largura: 800, altura: 600 },
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#ffffff" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
}
const quadro = { largura: 800, altura: 600 };
const primeiro = (projeto: Projeto): Clipe => projeto.faixas[0].clipes[0];
/** O canto de cima à esquerda da forma (sem a margem) na imagem, numa camada sem giro. */
function cantoNaImagem(clipe: Clipe) {
  const caixa = caixaDoClipe(clipe.transformacao, clipe.recorte, clipe.vetor!.caixa, quadro);
  const k = caixa.largura / clipe.vetor!.caixa.largura;
  const m = clipe.vetor!.margem ?? 0;
  return { x: caixa.cx - caixa.largura / 2 + m * k, y: caixa.cy - caixa.altura / 2 + m * k };
}

test("o arrasto com Shift fica quadrado (e a linha em 45°), com Alt sai do meio", () => {
  assert.deepEqual(arrastoDaForma({ x: 10, y: 10 }, { x: 50, y: 30 }), { x: 10, y: 10, largura: 40, altura: 20, de: { x: 10, y: 10 }, ate: { x: 50, y: 30 } });
  const quadrado = arrastoDaForma({ x: 10, y: 10 }, { x: 50, y: 30 }, { proporcional: true });
  assert.equal(quadrado.largura, 40);
  assert.equal(quadrado.altura, 40);
  const doMeio = arrastoDaForma({ x: 100, y: 100 }, { x: 120, y: 110 }, { doMeio: true });
  assert.deepEqual([doMeio.x, doMeio.y, doMeio.largura, doMeio.altura], [80, 90, 40, 20]);
  const linha = arrastoDaForma({ x: 0, y: 0 }, { x: 100, y: 10 }, { proporcional: true, linha: true });
  assert.ok(Math.abs(linha.ate.y) < 1e-9, "quase deitada vira deitada");
});

test("a forma desenhada fica no lugar do arrasto; mudar o traço ou o tamanho não tira o canto do lugar", () => {
  const arrasto = arrastoDaForma({ x: 100, y: 50 }, { x: 300, y: 150 });
  const { vetor, centro } = camadaDoArrasto("retangulo", arrasto, { ...OPCOES_DAS_FORMAS_PADRAO, traco: { ...TRACO_PADRAO, largura: 6, alinhamento: "fora" } }, "#ff0000");
  let projeto = executarComando(vazio(), { comando: "imagem.adicionarVetor", parametros: { vetor, centro, nome: "Retângulo 1" } }, ctx).projeto;
  const antes = cantoNaImagem(primeiro(projeto));
  assert.ok(Math.abs(antes.x - 100) < 1e-6 && Math.abs(antes.y - 50) < 1e-6, JSON.stringify(antes));
  // O traço mais grosso aumenta a margem; a largura maior estica para a direita
  const maior = refazerForma(primeiro(projeto).vetor!, { forma: { tipo: "retangulo", largura: 400, altura: 100, raios: [0, 0, 0, 0] }, traco: { ...TRACO_PADRAO, largura: 20, alinhamento: "fora" } });
  projeto = executarComando(projeto, { comando: "imagem.mudarVetor", parametros: { clipeId: primeiro(projeto).id, vetor: maior } }, ctx).projeto;
  const depois = cantoNaImagem(primeiro(projeto));
  assert.ok(Math.abs(depois.x - 100) < 1e-6 && Math.abs(depois.y - 50) < 1e-6, JSON.stringify(depois));
  const caixa = caixaDoClipe(primeiro(projeto).transformacao, primeiro(projeto).recorte, maior.caixa, quadro);
  assert.ok(Math.abs(caixa.largura - maior.caixa.largura) < 1e-6, "uma unidade continua valendo um pixel");
});

test("juntar uma forma à camada guarda as duas no lugar e a forma deixa de ser viva", () => {
  const um = camadaDoArrasto("retangulo", arrastoDaForma({ x: 100, y: 100 }, { x: 200, y: 200 }), OPCOES_DAS_FORMAS_PADRAO, "#000000");
  let projeto = executarComando(vazio(), { comando: "imagem.adicionarVetor", parametros: { ...um, nome: "Retângulo 1" } }, ctx).projeto;
  // Gira a camada: a forma nova continua onde foi desenhada
  projeto = executarComando(projeto, { comando: "imagem.transformarCamada", parametros: { clipeId: primeiro(projeto).id, transformacao: { rotacao: 30 } } }, ctx).projeto;
  const caminho = { nos: [{ x: 50, y: 300 }, { x: 80, y: 300 }, { x: 80, y: 330 }], fechado: true, operacao: "somar" as const };
  projeto = executarComando(projeto, { comando: "imagem.juntarAoVetor", parametros: { clipeId: primeiro(projeto).id, caminhos: [caminho], operacao: "subtrair" } }, ctx).projeto;
  const clipe = primeiro(projeto);
  assert.equal(clipe.vetor!.forma, null);
  assert.equal(clipe.vetor!.subcaminhos.length, 2);
  assert.equal(clipe.vetor!.subcaminhos[1].operacao, "subtrair");
  // Leva o primeiro ponto do caminho novo de volta à imagem: (50, 300)
  const caixa = caixaDoClipe(clipe.transformacao, clipe.recorte, clipe.vetor!.caixa, quadro);
  const k = caixa.largura / clipe.vetor!.caixa.largura;
  const no = clipe.vetor!.subcaminhos[1].nos[0];
  const ux = (no.x - clipe.vetor!.caixa.largura / 2) * k;
  const uy = (no.y - clipe.vetor!.caixa.altura / 2) * k;
  const r = (30 * Math.PI) / 180;
  const x = caixa.cx + ux * Math.cos(r) - uy * Math.sin(r);
  const y = caixa.cy + ux * Math.sin(r) + uy * Math.cos(r);
  assert.ok(Math.abs(x - 50) < 1e-6 && Math.abs(y - 300) < 1e-6, `${x}, ${y}`);
});
