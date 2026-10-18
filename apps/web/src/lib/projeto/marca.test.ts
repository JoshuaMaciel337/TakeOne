import assert from "node:assert/strict";
import { test } from "node:test";

import { segundosParaTicks } from "../tempo.ts";
import { adicionarClipe, adicionarLegenda, adicionarTexto, aplicarMarcaAosTextos, colocarLogo, type Contexto, ErroEdicao } from "./edicao.ts";
import { caixaDoClipe } from "./geometria.ts";
import { MARGEM_DO_LOGO, TAMANHO_DO_LOGO, transformacaoDoLogo } from "./marca.ts";
import { type Projeto, RECORTE_PADRAO } from "./modelo.ts";
import { TEXTO_PADRAO } from "./texto.ts";
import { ESTILO_LEGENDA } from "./legendas.ts";

const S = segundosParaTicks(1);
const perto = (a: number, b: number, folga = 1e-6) => assert.ok(Math.abs(a - b) < folga, `${a} != ${b}`);

function contexto(): Contexto {
  let n = 0;
  const midias: Record<string, { duracao: number; video: boolean; audio: boolean; transparente?: boolean; imagem?: boolean }> = {
    video: { duracao: 12 * S, video: true, audio: true },
    logo: { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, transparente: true, imagem: true },
  };
  return { novoId: () => `n${++n}`, midia: (id) => midias[id] ?? null };
}

function vazio(): Projeto {
  return {
    id: "p",
    nome: "",
    proporcao: "16:9",
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#000000" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
}

test("o logo fica no canto, com o lado maior em 18% do lado menor do quadro e a margem certa", () => {
  const quadro = { largura: 1920, altura: 1080 };
  for (const imagem of [{ largura: 400, altura: 400 }, { largura: 800, altura: 200 }]) {
    const t = transformacaoDoLogo(imagem, quadro, "superior-direito");
    const caixa = caixaDoClipe(t, RECORTE_PADRAO, imagem, quadro);
    perto(Math.max(caixa.largura, caixa.altura), TAMANHO_DO_LOGO * 1080, 1e-6);
    perto(quadro.largura - (caixa.cx + caixa.largura / 2), MARGEM_DO_LOGO * 1080, 1e-6);
    perto(caixa.cy - caixa.altura / 2, MARGEM_DO_LOGO * 1080, 1e-6);
  }
  const embaixo = transformacaoDoLogo({ largura: 400, altura: 400 }, quadro, "inferior-esquerdo");
  assert.ok(embaixo.x < 0 && embaixo.y > 0);
});

test("o logo entra por cima dos vídeos e abaixo dos textos, do começo ao fim", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video");
  ({ projeto } = adicionarTexto(projeto, ctx, 0, TEXTO_PADRAO));
  const t = transformacaoDoLogo({ largura: 400, altura: 400 }, { largura: 16, altura: 9 }, "superior-direito");
  const { projeto: comLogo, clipeId } = colocarLogo(projeto, ctx, "logo", t);
  assert.deepEqual(comLogo.faixas.map((f) => f.tipo), ["texto", "video", "principal"]);
  const logo = comLogo.faixas[1].clipes[0];
  assert.equal(logo.id, clipeId);
  assert.equal(logo.inicio, 0);
  assert.equal(logo.duracao, 12 * S);
  assert.ok(!logo.remover_fundo, "a transparência vem do PNG");
  assert.throws(() => colocarLogo(projeto, ctx, "video", t), ErroEdicao);
});

test("a marca vai para os textos: fonte de título e cor nos títulos, fonte de texto e cor das palavras-chave nas legendas", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video");
  ({ projeto } = adicionarTexto(projeto, ctx, 0, TEXTO_PADRAO));
  ({ projeto } = adicionarLegenda(projeto, ctx, 0, ESTILO_LEGENDA));
  const comMarca = aplicarMarcaAosTextos(projeto, "manuscrita", "texto", "#ff624a");
  const titulo = comMarca.faixas.find((f) => f.tipo === "texto")!.clipes[0].texto!;
  const legenda = comMarca.faixas.find((f) => f.tipo === "legenda")!.clipes[0].texto!;
  assert.deepEqual([titulo.fonte, titulo.cor], ["manuscrita", "#ff624a"]);
  assert.deepEqual([legenda.fonte, legenda.cor_chave, legenda.cor], ["texto", "#ff624a", ESTILO_LEGENDA.cor]);
  // Sem cor na marca, só as fontes mudam
  const soFontes = aplicarMarcaAosTextos(projeto, "manuscrita", "texto", null);
  assert.equal(soFontes.faixas.find((f) => f.tipo === "texto")!.clipes[0].texto!.cor, TEXTO_PADRAO.cor);
  assert.throws(() => aplicarMarcaAosTextos(adicionarClipe(vazio(), ctx, "video").projeto, "display", "texto", null), ErroEdicao);
});
