import assert from "node:assert/strict";
import { test } from "node:test";

import { executarComando } from "./comandos.ts";
import type { Contexto } from "./edicao.ts";
import type { Projeto } from "./modelo.ts";
import { aplicarConjunto, conjuntoDoDocumento, conjuntosDoCsv, lerCsv, nomeDeVariavel, valorVisivel, type VariaveisDoDocumento } from "./variaveis.ts";
import { textoCorrido, textoNovo } from "../texto/modelo.ts";

function contexto(): Contexto {
  let n = 0;
  const midias: Record<string, { duracao: number; video: boolean; audio: boolean; imagem?: boolean }> = {
    foto: { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, imagem: true },
    outra: { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, imagem: true },
  };
  return { novoId: () => `n${++n}`, midia: (id) => midias[id] ?? null };
}

function documento(ctx: Contexto): Projeto {
  let projeto: Projeto = {
    id: "p",
    nome: "Cartaz",
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
  projeto = executarComando(projeto, { comando: "imagem.adicionarMidia", parametros: { midiaId: "foto" } }, ctx).projeto;
  const texto = { ...textoNovo("Promoção", { tamanho: 60 }), caixa: { largura: 300, altura: 80 }, origem: { x: 0, y: 60 } };
  projeto = executarComando(projeto, { comando: "imagem.adicionarTextoRico", parametros: { texto, ponto: { x: 100, y: 200 }, nome: "Título" } }, ctx).projeto;
  return projeto;
}

test("o nome da variável sai do nome da camada, sem acento e sem repetir", () => {
  assert.equal(nomeDeVariavel("Título principal"), "Titulo_principal");
  assert.equal(nomeDeVariavel("2º preço", ["v2_preco"]), "v2_preco_2");
  assert.equal(valorVisivel("Sim"), true);
  assert.equal(valorVisivel("não"), false);
});

test("o conjunto troca o texto, a visibilidade e a foto; o que falta na biblioteca vira aviso", () => {
  const ctx = contexto();
  const projeto = documento(ctx);
  const [texto, foto] = projeto.faixas.filter((f) => f.tipo !== "principal");
  const definicao: VariaveisDoDocumento = {
    variaveis: [
      { nome: "titulo", tipo: "texto", faixa: texto.id },
      { nome: "foto_visivel", tipo: "visibilidade", faixa: foto.id },
      { nome: "foto", tipo: "imagem", faixa: foto.id },
    ],
    conjuntos: [],
  };
  const para = {
    ctx,
    medir: (t: Parameters<typeof aplicarConjunto>[3]["medir"] extends (x: infer X) => unknown ? X : never) => ({ ...t, caixa: { largura: 500, altura: 80 } }),
    imagem: (valor: string) => (valor === "outra.jpg" ? { midiaId: "outra", tamanho: { largura: 800, altura: 600 } } : null),
    tamanhoDaMidia: () => ({ largura: 1000, altura: 1000 }),
  };
  const { projeto: novo, avisos } = aplicarConjunto(projeto, definicao, { nome: "1", valores: { titulo: "Liquidação", foto_visivel: "não", foto: "outra.jpg" } }, para);
  const [novoTexto, novaFoto] = novo.faixas.filter((f) => f.tipo !== "principal");
  assert.equal(textoCorrido(novoTexto.clipes[0].texto_rico!), "Liquidação");
  assert.equal(novoTexto.clipes[0].texto_rico!.caixa.largura, 500);
  assert.equal(novaFoto.oculta, true);
  assert.equal(novaFoto.clipes[0].midia_id, "outra");
  assert.deepEqual(avisos, []);
  const faltou = aplicarConjunto(projeto, definicao, { nome: "2", valores: { foto: "sumiu.png" } }, para);
  assert.deepEqual(faltou.avisos, ['"sumiu.png" não está na biblioteca (foto).']);
  // O documento de agora vira um conjunto
  const atual = conjuntoDoDocumento(novo, definicao, "Agora", (id) => `${id}.jpg`);
  assert.deepEqual(atual.valores, { titulo: "Liquidação", foto_visivel: "não", foto: "outra.jpg" });
});

test("o CSV com aspas, ponto e vírgula e a coluna do nome", () => {
  const { cabecalho, linhas } = lerCsv('﻿nome;titulo;preço\r\n"Um";"Leve ""2""; pague 1";10\r\nDois;"linha\nquebrada";20\r\n');
  assert.deepEqual(cabecalho, ["nome", "titulo", "preço"]);
  assert.deepEqual(linhas, [
    ["Um", 'Leve "2"; pague 1', "10"],
    ["Dois", "linha\nquebrada", "20"],
  ]);
  const { conjuntos, ignoradas } = conjuntosDoCsv("nome,titulo,extra\nA,Oi,x\n,Olá,y\n", [{ nome: "titulo", tipo: "texto", faixa: "f" }]);
  assert.deepEqual(conjuntos, [
    { nome: "A", valores: { titulo: "Oi" } },
    { nome: "Conjunto 2", valores: { titulo: "Olá" } },
  ]);
  assert.deepEqual(ignoradas, ["extra"]);
});
