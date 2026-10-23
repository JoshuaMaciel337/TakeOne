import assert from "node:assert/strict";
import { test } from "node:test";

import { executarComando } from "./comandos.ts";
import type { Contexto } from "./edicao.ts";
import { camadasDaImagem, DURACAO_DA_CAMADA, ESCALA_DO_RECORTADO, problemaNoTamanho, TAMANHOS_PRONTOS } from "./imagem.ts";
import type { Projeto } from "./modelo.ts";
import { TEXTO_PADRAO } from "./texto.ts";

function contexto(): Contexto {
  let n = 0;
  const midias: Record<string, { duracao: number; video: boolean; audio: boolean; imagem?: boolean; transparente?: boolean }> = {
    foto: { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, imagem: true },
    logo: { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, imagem: true, transparente: true },
    video: { duracao: 10, video: true, audio: true },
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

test("camadas entram por cima, mudam de ordem, duplicam e saem; a principal fica embaixo", () => {
  const ctx = contexto();
  let r = executarComando(vazio(), { comando: "imagem.adicionarMidia", parametros: { midiaId: "foto" } }, ctx);
  const foto = r.selecao![0];
  r = executarComando(r.projeto, { comando: "imagem.adicionarTexto", parametros: { texto: TEXTO_PADRAO } }, ctx);
  const texto = r.selecao![0];
  let projeto = r.projeto;
  const ordem = () => camadasDaImagem(projeto).map(({ clipe }) => clipe.id);
  assert.deepEqual(ordem(), [texto, foto], "a mais nova fica na frente");
  assert.equal(projeto.faixas.at(-1)!.tipo, "principal");
  assert.equal(camadasDaImagem(projeto)[1].clipe.duracao, DURACAO_DA_CAMADA);

  // O texto vai para trás da foto (no vídeo, texto fica sempre por cima; na imagem não)
  const faixaDoTexto = camadasDaImagem(projeto)[0].faixa.id;
  projeto = executarComando(projeto, { comando: "imagem.mover", parametros: { faixaId: faixaDoTexto, para: "baixo" } }, ctx).projeto;
  assert.deepEqual(ordem(), [foto, texto]);
  projeto = executarComando(projeto, { comando: "imagem.mover", parametros: { faixaId: faixaDoTexto, para: "baixo" } }, ctx).projeto;
  assert.deepEqual(ordem(), [foto, texto], "no fundo, não passa da principal");
  assert.equal(projeto.faixas.at(-1)!.tipo, "principal");

  // Duplicar põe a cópia logo acima, com outro id e um pouco deslocada
  const faixaDaFoto = camadasDaImagem(projeto)[0].faixa.id;
  r = executarComando(projeto, { comando: "imagem.duplicar", parametros: { faixaId: faixaDaFoto } }, ctx);
  projeto = r.projeto;
  const copia = camadasDaImagem(projeto)[0].clipe;
  assert.equal(copia.id, r.selecao![0]);
  assert.equal(copia.midia_id, "foto");
  assert.ok(copia.transformacao.x > 0);
  assert.equal(camadasDaImagem(projeto).length, 3);

  // As propriedades usam os comandos do clipe de sempre
  projeto = executarComando(projeto, { comando: "clipe.transformar", parametros: { clipeIds: [foto], transformacao: { escala: 2 } } }, ctx).projeto;
  assert.equal(camadasDaImagem(projeto).find(({ clipe }) => clipe.id === foto)!.clipe.transformacao.escala, 2);

  projeto = executarComando(projeto, { comando: "imagem.apagar", parametros: { faixaId: camadasDaImagem(projeto)[0].faixa.id } }, ctx).projeto;
  assert.deepEqual(ordem(), [foto, texto]);
});

test("só imagens entram; fundo transparente e tamanho com limites", () => {
  const ctx = contexto();
  assert.throws(() => executarComando(vazio(), { comando: "imagem.adicionarMidia", parametros: { midiaId: "video" } }, ctx), /imagens/);
  let projeto = executarComando(vazio(), { comando: "imagem.fundo", parametros: { transparente: true } }, ctx).projeto;
  assert.deepEqual(projeto.fundo, { cor: "#ffffff", transparente: true });
  projeto = executarComando(projeto, { comando: "imagem.tamanho", parametros: { largura: 1080, altura: 1920 } }, ctx).projeto;
  assert.deepEqual(projeto.tamanho, { largura: 1080, altura: 1920 });
  assert.throws(() => executarComando(projeto, { comando: "imagem.tamanho", parametros: { largura: 9000, altura: 10 } }, ctx), /16 a 8192/);
  assert.match(problemaNoTamanho({ largura: 7000, altura: 7000 })!, /36 milhões/);
  for (const pronto of TAMANHOS_PRONTOS) assert.equal(problemaNoTamanho(pronto), null, pronto.id);
});

test("a foto cabe no quadro e o logo entra com metade do tamanho", () => {
  const ctx = contexto();
  let projeto = executarComando(vazio(), { comando: "imagem.adicionarMidia", parametros: { midiaId: "foto" } }, ctx).projeto;
  projeto = executarComando(projeto, { comando: "imagem.adicionarMidia", parametros: { midiaId: "logo" } }, ctx).projeto;
  const [logo, foto] = camadasDaImagem(projeto);
  assert.equal(foto.clipe.transformacao.escala, 1);
  assert.equal(logo.clipe.transformacao.escala, ESCALA_DO_RECORTADO);
});
