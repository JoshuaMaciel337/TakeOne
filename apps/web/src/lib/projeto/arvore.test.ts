import assert from "node:assert/strict";
import { test } from "node:test";

import { arvoreDaImagem, camadaVisivel, type NoDaCamada, problemaNaArvore } from "./arvore.ts";
import { executarComando } from "./comandos.ts";
import type { Contexto } from "./edicao.ts";
import { camadasDaImagem } from "./imagem.ts";
import type { Projeto } from "./modelo.ts";
import { TEXTO_PADRAO } from "./texto.ts";

function contexto(): Contexto {
  let n = 0;
  const midias: Record<string, { duracao: number; video: boolean; audio: boolean; imagem?: boolean }> = {
    foto: { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, imagem: true },
  };
  return { novoId: () => `n${++n}`, midia: (id) => midias[id] ?? null };
}

function vazio(): Projeto {
  return {
    id: "p",
    nome: "Imagem",
    proporcao: "1:1",
    tipo: "imagem",
    tamanho: { largura: 1080, altura: 1080 },
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#ffffff" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
}

/** Três camadas: c (em cima), b, a (embaixo). Devolve o projeto e os ids das faixas. */
function tres() {
  const ctx = contexto();
  let projeto = vazio();
  const faixa = (p: Projeto, clipeId: string) => p.faixas.find((f) => f.clipes[0]?.id === clipeId)!.id;
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const r = executarComando(projeto, { comando: "imagem.adicionarTexto", parametros: { texto: { ...TEXTO_PADRAO, conteudo: "abc"[i] } } }, ctx);
    projeto = r.projeto;
    ids.push(faixa(projeto, r.selecao![0]));
  }
  const [a, b, c] = ids;
  return { ctx, projeto, a, b, c };
}

/** A árvore em texto: o conteúdo de cada camada, pastas entre colchetes e recortadas depois de ">". */
function desenho(nos: NoDaCamada[]): string {
  return nos
    .map((no) => {
      const nome = no.clipe.pasta ? `[${desenho(no.filhos)}]` : (no.clipe.texto?.conteudo ?? "?");
      return no.recortadas.length ? `${nome}>${desenho(no.recortadas)}` : nome;
    })
    .join(" ");
}

test("agrupar põe as escolhidas numa pasta no lugar da de cima; desagrupar devolve", () => {
  const { ctx, projeto: inicio, b, c } = tres();
  assert.equal(desenho(arvoreDaImagem(inicio)), "c b a");
  const r = executarComando(inicio, { comando: "imagem.agrupar", parametros: { faixaIds: [c, b] } }, ctx);
  let projeto = r.projeto;
  assert.equal(desenho(arvoreDaImagem(projeto)), "[c b] a");
  const pasta = projeto.faixas.find((f) => f.clipes[0]?.id === r.selecao![0])!;
  assert.equal(pasta.clipes[0].mesclagem, "passagem");
  assert.equal(pasta.nome, "Grupo 1");

  // Uma camada nova acima de uma de dentro nasce dentro da pasta
  projeto = executarComando(projeto, { comando: "imagem.adicionarTexto", parametros: { texto: { ...TEXTO_PADRAO, conteudo: "d" }, acima: b } }, ctx).projeto;
  assert.equal(desenho(arvoreDaImagem(projeto)), "[c d b] a");

  projeto = executarComando(projeto, { comando: "imagem.desagrupar", parametros: { faixaId: pasta.id } }, ctx).projeto;
  assert.equal(desenho(arvoreDaImagem(projeto)), "c d b a");
});

test("máscara de corte prende na primeira não recortada de baixo, entre irmãs", () => {
  const { ctx, projeto: inicio, b, c } = tres();
  let projeto = executarComando(inicio, { comando: "imagem.camada", parametros: { faixaIds: [c, b], mudanca: { recortada: true } } }, ctx).projeto;
  assert.equal(desenho(arvoreDaImagem(projeto)), "a>c b");
  // A de baixo de tudo recortada não tem base: aparece como comum
  const so = executarComando(inicio, { comando: "imagem.camada", parametros: { faixaIds: [inicio.faixas.at(-2)!.id], mudanca: { recortada: true } } }, ctx).projeto;
  assert.equal(desenho(arvoreDaImagem(so)), "c b a");
  // A pasta também pode ser a base
  projeto = executarComando(inicio, { comando: "imagem.agrupar", parametros: { faixaIds: [b] } }, ctx).projeto;
  projeto = executarComando(projeto, { comando: "imagem.camada", parametros: { faixaIds: [c], mudanca: { recortada: true } } }, ctx).projeto;
  assert.equal(desenho(arvoreDaImagem(projeto)), "[b]>c a");
});

test("mover entre pastas, mover só entre irmãs e não pôr uma pasta dentro dela mesma", () => {
  const { ctx, projeto: inicio, a, b, c } = tres();
  const r = executarComando(inicio, { comando: "imagem.agrupar", parametros: { faixaIds: [b] } }, ctx);
  let projeto = r.projeto;
  const pasta = projeto.faixas.find((f) => f.clipes[0]?.id === r.selecao![0])!.id;
  // a entra na pasta, acima de b
  projeto = executarComando(projeto, { comando: "imagem.moverPara", parametros: { faixaIds: [a], pai: pasta, acimaDe: b } }, ctx).projeto;
  assert.equal(desenho(arvoreDaImagem(projeto)), "c [a b]");
  // No fundo da pasta
  projeto = executarComando(projeto, { comando: "imagem.moverPara", parametros: { faixaIds: [a], pai: pasta, acimaDe: null } }, ctx).projeto;
  assert.equal(desenho(arvoreDaImagem(projeto)), "c [b a]");
  // Subir a pasta passa por cima de c; a de dentro sobe só entre as irmãs
  projeto = executarComando(projeto, { comando: "imagem.mover", parametros: { faixaId: pasta, para: "topo" } }, ctx).projeto;
  assert.equal(desenho(arvoreDaImagem(projeto)), "[b a] c");
  projeto = executarComando(projeto, { comando: "imagem.mover", parametros: { faixaId: a, para: "cima" } }, ctx).projeto;
  assert.equal(desenho(arvoreDaImagem(projeto)), "[a b] c");
  // A pasta numa pasta dentro dela
  const r2 = executarComando(projeto, { comando: "imagem.agrupar", parametros: { faixaIds: [a] } }, ctx);
  const dentro = r2.projeto.faixas.find((f) => f.clipes[0]?.id === r2.selecao![0])!.id;
  assert.throws(() => executarComando(r2.projeto, { comando: "imagem.moverPara", parametros: { faixaIds: [pasta], pai: dentro, acimaDe: null } }, ctx), /dentro dela mesma/);
  // Inverter a ordem
  const inv = executarComando(inicio, { comando: "imagem.inverter", parametros: { faixaIds: [a, b, c] } }, ctx).projeto;
  assert.equal(desenho(arvoreDaImagem(inv)), "a b c");
});

test("duplicar e apagar uma pasta levam o que está dentro; esconder a pasta esconde as de dentro", () => {
  const { ctx, projeto: inicio, b, c } = tres();
  const r = executarComando(inicio, { comando: "imagem.agrupar", parametros: { faixaIds: [c, b] } }, ctx);
  const pasta = r.projeto.faixas.find((f) => f.clipes[0]?.id === r.selecao![0])!.id;
  const dup = executarComando(r.projeto, { comando: "imagem.duplicar", parametros: { faixaId: pasta } }, ctx);
  assert.equal(desenho(arvoreDaImagem(dup.projeto)), "[c b] [c b] a");
  // As cópias ficam na pasta copiada, com ids novos
  const ids = new Set(dup.projeto.faixas.map((f) => f.id));
  assert.equal(ids.size, dup.projeto.faixas.length);
  const apagado = executarComando(dup.projeto, { comando: "imagem.apagar", parametros: { faixaId: pasta } }, ctx).projeto;
  assert.equal(desenho(arvoreDaImagem(apagado)), "[c b] a");
  assert.equal(camadasDaImagem(apagado).length, 4);

  const escondida = executarComando(r.projeto, { comando: "faixa.alternar", parametros: { faixaId: pasta, propriedade: "oculta" } }, ctx).projeto;
  const deC = escondida.faixas.find((f) => f.id === c)!;
  assert.equal(camadaVisivel(escondida, deC), false);
  const semOcultas = executarComando(escondida, { comando: "imagem.apagarOcultas", parametros: {} }, ctx).projeto;
  assert.equal(desenho(arvoreDaImagem(semOcultas)), "a");
});

test("travas, nome e regras da árvore", () => {
  const { ctx, projeto: inicio, b, c } = tres();
  let projeto = executarComando(inicio, { comando: "imagem.camada", parametros: { faixaIds: [c], mudanca: { nome: "  Título  ", travas: { posicao: true }, rotulo: "azul" } } }, ctx).projeto;
  const faixaC = projeto.faixas.find((f) => f.id === c)!;
  assert.deepEqual([faixaC.nome, faixaC.travas, faixaC.rotulo], ["Título", { posicao: true }, "azul"]);
  assert.throws(() => executarComando(projeto, { comando: "clipe.transformar", parametros: { clipeIds: [faixaC.clipes[0].id], transformacao: { x: 0.1 } } }, ctx), /travada/);
  // Tirar todas as travas apaga o campo
  projeto = executarComando(projeto, { comando: "imagem.camada", parametros: { faixaIds: [c], mudanca: { travas: { posicao: false } } } }, ctx).projeto;
  assert.equal(projeto.faixas.find((f) => f.id === c)!.travas, null);
  assert.throws(() => executarComando(projeto, { comando: "imagem.camada", parametros: { faixaIds: [c], mudanca: { nome: "   " } } }, ctx), /nome/);

  // Pai que não é pasta e campos da imagem num vídeo
  const ruim = { ...projeto, faixas: projeto.faixas.map((f) => (f.id === b ? { ...f, pai: c } : f)) };
  assert.match(problemaNaArvore(ruim) ?? "", /não existe/);
  const video: Projeto = { ...projeto, tipo: undefined, faixas: projeto.faixas.map((f) => (f.id === b ? { ...f, recortada: true } : f)) };
  assert.match(problemaNaArvore(video) ?? "", /só existem no editor de imagem/);
  assert.equal(problemaNaArvore(projeto), null);
  // O projeto de vídeo como a API devolve: os campos da imagem vêm com null (e false), não ausentes. Com o
  // preenchimento conferido por "!== undefined", nenhum comando passava num projeto aberto do servidor
  const doServidor: Projeto = {
    ...projeto,
    tipo: undefined,
    faixas: projeto.faixas.map((f) => ({
      ...f,
      pai: null,
      recortada: false,
      travas: null,
      rotulo: null,
      vinculo: null,
      nome: null,
      aberta: false,
      fundo: false,
      clipes: f.clipes.map((clipe) => ({ ...clipe, pasta: false, pixels: null, mascara_pixels: null, preenchimento: null, mesclagem: "normal" })),
    })),
  };
  assert.equal(problemaNaArvore(doServidor), null);
});
