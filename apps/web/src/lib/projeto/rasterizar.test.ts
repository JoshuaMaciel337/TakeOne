import assert from "node:assert/strict";
import { test } from "node:test";

import { arvoreDaImagem, problemaNaArvore } from "./arvore.ts";
import { executarComando } from "./comandos.ts";
import type { Contexto } from "./edicao.ts";
import type { Faixa, Projeto } from "./modelo.ts";
import { planoDosPixels, substituirPorPixels } from "./rasterizar.ts";
import { TEXTO_PADRAO } from "./texto.ts";

function contexto(): Contexto {
  let n = 0;
  return { novoId: () => `n${++n}`, midia: () => null };
}

/** Três textos: c (em cima), b, a (embaixo). */
function tres() {
  const ctx = contexto();
  let projeto: Projeto = {
    id: "p",
    nome: "Imagem",
    proporcao: "1:1",
    tipo: "imagem",
    tamanho: { largura: 400, altura: 400 },
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#ffffff" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
  const ids: string[] = [];
  for (const letra of "abc") {
    const r = executarComando(projeto, { comando: "imagem.adicionarTexto", parametros: { texto: { ...TEXTO_PADRAO, conteudo: letra } } }, ctx);
    projeto = r.projeto;
    ids.push(projeto.faixas.find((f) => f.clipes[0]?.id === r.selecao![0])!.id);
  }
  return { ctx, projeto, a: ids[0], b: ids[1], c: ids[2] };
}

const nome = (faixa: Faixa) => faixa.clipes[0].texto?.conteudo ?? faixa.nome ?? "?";
const conteudos = (projeto: Projeto) => arvoreDaImagem(projeto).map((no) => no.faixa.nome ?? no.clipe.texto?.conteudo);

test("mesclar para baixo: desenha as duas, a de baixo neutra, e a nova fica no lugar dela com as propriedades dela", () => {
  const { ctx, projeto: inicio, b, c } = tres();
  let projeto = executarComando(inicio, { comando: "clipe.transformar", parametros: { clipeIds: [inicio.faixas.find((f) => f.id === b)!.clipes[0].id], transformacao: { opacidade: 0.5 } } }, ctx).projeto;
  projeto = executarComando(projeto, { comando: "clipe.mesclar", parametros: { clipeIds: [projeto.faixas.find((f) => f.id === c)!.clipes[0].id], mesclagem: "multiplicar" } }, ctx).projeto;
  const plano = planoDosPixels(projeto, "baixo", [c], nome);
  // No desenho: c com a mesclagem dela, b sem a opacidade (que fica na camada nova)
  const desenhadas = plano.desenhar.faixas.filter((f) => f.clipes[0]);
  assert.deepEqual(desenhadas.map((f) => [f.clipes[0].texto?.conteudo, f.clipes[0].transformacao.opacidade, f.clipes[0].mesclagem ?? "normal"]), [["c", 1, "multiplicar"], ["b", 1, "normal"]]);
  assert.equal(plano.desenhar.fundo.transparente, true);
  assert.deepEqual([plano.remover, plano.lugar, plano.nome, plano.manter.opacidade], [[c, b], b, "b", 0.5]);
  const { projeto: depois } = substituirPorPixels(projeto, ctx.novoId, { ...plano, midiaId: "m1", versao: 3 });
  assert.deepEqual(conteudos(depois), ["b", "a"]);
  const nova = depois.faixas.find((f) => f.clipes[0]?.pixels)!;
  assert.deepEqual([nova.clipes[0].pixels, nova.clipes[0].transformacao.opacidade, nova.clipes[0].midia_id], [{ versao: 3 }, 0.5, "m1"]);
  // Carimbar para baixo deixa a de cima
  const carimbo = planoDosPixels(projeto, "carimbarBaixo", [c], nome);
  assert.deepEqual(carimbo.remover, [b]);
  // A de baixo de todas não tem onde mesclar
  assert.throws(() => planoDosPixels(projeto, "baixo", [inicio.faixas.find((f) => f.clipes[0]?.texto?.conteudo === "a")!.id], nome), /embaixo/);
});

test("rasterizar guarda a opacidade, a mesclagem e o estilo; rasterizar o estilo grava ele", () => {
  const { ctx, projeto: inicio, b } = tres();
  const clipeB = inicio.faixas.find((f) => f.id === b)!.clipes[0].id;
  let projeto = executarComando(inicio, { comando: "clipe.transformar", parametros: { clipeIds: [clipeB], transformacao: { opacidade: 0.7 } } }, ctx).projeto;
  projeto = executarComando(projeto, { comando: "clipe.silhueta", parametros: { clipeIds: [clipeB], contorno: { cor: "#ff0000", largura: 0.02 } } }, ctx).projeto;
  const plano = planoDosPixels(projeto, "rasterizar", [b], nome);
  const desenhada = plano.desenhar.faixas.find((f) => f.clipes[0])!.clipes[0];
  assert.deepEqual([desenhada.transformacao.opacidade, desenhada.contorno ?? null], [1, null]);
  assert.deepEqual([plano.manter.opacidade, plano.manter.contorno?.cor], [0.7, "#ff0000"]);
  const estilo = planoDosPixels(projeto, "rasterizarEstilo", [b], nome);
  assert.equal(estilo.desenhar.faixas.find((f) => f.clipes[0])!.clipes[0].contorno?.cor, "#ff0000");
  assert.equal(estilo.manter.contorno, undefined);
});

test("mesclar visíveis, achatar e carimbar visíveis; a camada de fundo fica embaixo", () => {
  const { ctx, projeto: inicio, a, b, c } = tres();
  const projeto = executarComando(inicio, { comando: "faixa.alternar", parametros: { faixaId: a, propriedade: "oculta" } }, ctx).projeto;
  const visiveis = planoDosPixels(projeto, "visiveis", [], nome);
  assert.deepEqual([visiveis.remover, visiveis.lugar], [[c, b], c]);
  const achatar = planoDosPixels(projeto, "achatar", [], nome);
  assert.deepEqual([achatar.remover.length, achatar.fundo, achatar.desenhar.fundo.transparente ?? false], [3, true, false]);
  const { projeto: achatado } = substituirPorPixels(projeto, ctx.novoId, { ...achatar, midiaId: "m", versao: 1 });
  const fundo = achatado.faixas.find((f) => f.fundo)!;
  assert.deepEqual([achatado.faixas.filter((f) => f.clipes[0]).length, fundo.nome, fundo.travas], [1, "Fundo", { transparencia: true, posicao: true }]);
  assert.equal(problemaNaArvore(achatado), null);
  // Uma camada nova por cima do fundo pode; abaixo dele, não
  const comNova = executarComando(achatado, { comando: "imagem.adicionarTexto", parametros: { texto: TEXTO_PADRAO } }, ctx).projeto;
  assert.equal(problemaNaArvore(comNova), null);
  const nova = comNova.faixas.find((f) => f.clipes[0]?.texto)!;
  assert.throws(() => executarComando(comNova, { comando: "imagem.mover", parametros: { faixaId: nova.id, para: "fundo" } }, ctx), /fundo fica embaixo/);
  // Camada a partir do fundo
  const solta = executarComando(achatado, { comando: "imagem.camadaDeFundo", parametros: { faixaId: fundo.id, ligar: false } }, ctx).projeto;
  assert.deepEqual([solta.faixas.find((f) => f.id === fundo.id)!.fundo, solta.faixas.find((f) => f.id === fundo.id)!.nome], [false, "Camada 0"]);
  // Carimbar visíveis: uma nova no topo, nada sai
  const carimbo = planoDosPixels(projeto, "carimbarVisiveis", [], nome);
  const { projeto: carimbado } = substituirPorPixels(projeto, ctx.novoId, { ...carimbo, midiaId: "m", versao: 1 });
  assert.deepEqual(conteudos(carimbado), ["Carimbo", "c", "b", "a"]);
});

test("rasterizar refaz o contorno e a sombra na caixa nova (o quadro inteiro)", () => {
  const { ctx, projeto: inicio, b } = tres();
  const clipeB = inicio.faixas.find((f) => f.id === b)!.clipes[0].id;
  const projeto = executarComando(inicio, { comando: "clipe.silhueta", parametros: { clipeIds: [clipeB], contorno: { cor: "#000000", largura: 0.05 }, sombra: { cor: "#000000", opacidade: 0.5, desfoque: 0.02, distancia: 0.04, angulo: 45 } } }, ctx).projeto;
  // A caixa do texto tem um quarto da altura do quadro
  const plano = planoDosPixels(projeto, "rasterizar", [b], nome, () => 0.25);
  assert.ok(Math.abs(plano.manter.contorno!.largura - 0.0125) < 1e-12);
  assert.ok(Math.abs(plano.manter.sombra!.distancia - 0.01) < 1e-12 && Math.abs(plano.manter.sombra!.desfoque - 0.005) < 1e-12);
});

test("a máscara de camada: rasterizar a guarda (com a matriz da caixa nova); aplicar grava nos pixels", () => {
  const { ctx, projeto: inicio, b } = tres();
  const clipeB = inicio.faixas.find((f) => f.id === b)!.clipes[0].id;
  const mascara = { midia_id: "m", versao: 2, ligada: true, vinculada: true, densidade: 1, difusao: 0, matriz: [0.5, 0, 0, 0.5, 0.25, 0.25] as [number, number, number, number, number, number] };
  const projeto = executarComando(inicio, { comando: "mascara.definir", parametros: { clipeId: clipeB, mascara } }, ctx).projeto;
  const nova: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  const raster = planoDosPixels(projeto, "rasterizar", [b], nome, () => null, () => nova);
  assert.equal(raster.desenhar.faixas.find((f) => f.clipes[0])!.clipes[0].mascara_pixels, undefined);
  assert.deepEqual(raster.manter.mascara?.matriz, nova);
  const { projeto: depois } = substituirPorPixels(projeto, ctx.novoId, { ...raster, midiaId: "px", versao: 1 });
  assert.deepEqual(depois.faixas.find((f) => f.clipes[0]?.pixels)!.clipes[0].mascara_pixels?.matriz, nova);
  const aplicar = planoDosPixels(projeto, "aplicarMascara", [b], nome);
  assert.equal(aplicar.desenhar.faixas.find((f) => f.clipes[0])!.clipes[0].mascara_pixels?.versao, 2);
  assert.equal(aplicar.manter.mascara, undefined);
  // Mudar a máscara: a densidade presa entre 0 e 1
  const mudada = executarComando(projeto, { comando: "mascara.mudar", parametros: { clipeId: clipeB, mudanca: { densidade: 3, ligada: false } } }, ctx).projeto;
  const m = mudada.faixas.find((f) => f.id === b)!.clipes[0].mascara_pixels!;
  assert.deepEqual([m.densidade, m.ligada], [1, false]);
  // Num projeto de vídeo, não
  assert.match(problemaNaArvore({ ...projeto, tipo: undefined }) ?? "", /editor de imagem/);
});

test("criar camadas a partir dos efeitos: um plano por efeito (dois no chanfro), na ordem de encostar na original", async () => {
  const { efeitoPadrao } = await import("../imagem/estiloDeCamada.ts");
  const { planosDosEfeitos } = await import("./rasterizar.ts");
  const { ctx, projeto: inicio, b } = tres();
  const clipeId = inicio.faixas.find((f) => f.id === b)!.clipes[0].id;
  const estilo = { efeitos: [efeitoPadrao("sombra", "s"), efeitoPadrao("tracado", "t"), efeitoPadrao("chanfro", "c"), { ...efeitoPadrao("brilho_externo", "g"), ligado: false }] };
  const projeto = executarComando(inicio, { comando: "imagem.estiloDeCamada", parametros: { clipeIds: [clipeId], estilo } }, ctx).projeto;
  const planos = planosDosEfeitos(projeto, b, nome);
  assert.deepEqual(planos.map((p) => [p.nome, p.abaixo]), [
    ["Sombra projetada de b", true],
    ["Sombra do chanfro de b", false],
    ["Realce do chanfro de b", false],
    ["Traçado de b", false],
  ]);
  // A sombra guarda o modo e a opacidade dela; no desenho, só ela, inteira e normal, com o conteúdo escondido
  assert.deepEqual([planos[0].manter.mesclagem, planos[0].manter.opacidade], ["multiplicar", 0.75]);
  const desenhada = planos[0].desenhar.faixas.find((f) => f.id === b)!.clipes[0];
  assert.deepEqual([desenhada.preenchimento, desenhada.estilo_camada!.efeitos.map((e) => [e.tipo, e.modo, e.opacidade])], [0, [["sombra", "normal", 1]]]);
  // A camada nova de um efeito de fora entra logo abaixo da original
  const { projeto: comSombra } = substituirPorPixels(projeto, ctx.novoId, { ...planos[0], midiaId: "m1", versao: 1 });
  const ordem = comSombra.faixas.map((f) => f.nome ?? f.clipes[0]?.texto?.conteudo ?? f.tipo);
  assert.equal(ordem.indexOf("Sombra projetada de b"), ordem.indexOf("b") + 1);
});
