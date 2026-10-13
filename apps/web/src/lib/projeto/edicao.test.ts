import assert from "node:assert/strict";
import { test } from "node:test";

import { duracaoDoQuadro, segundosParaTicks } from "../tempo.ts";
import {
  adicionarClipe,
  alternarFaixa,
  apagarClipes,
  apararClipe,
  type Contexto,
  dividirClipes,
  duplicarClipes,
  ErroEdicao,
  moverClipe,
  mudarFundo,
  normalizarRotacao,
  recortarClipes,
  restaurarClipes,
  transformarClipes,
} from "./edicao.ts";
import { completarProjeto, fimDoClipe, type Projeto, RECORTE_PADRAO, TRANSFORMACAO_PADRAO } from "./modelo.ts";

const S = segundosParaTicks(1);
const TAXA = { num: 30, den: 1 };
const QUADRO = duracaoDoQuadro(TAXA);

function contexto(): Contexto {
  let n = 0;
  const midias: Record<string, { duracao: number; video: boolean; audio: boolean }> = {
    video10: { duracao: 10 * S, video: true, audio: true },
    video4: { duracao: 4 * S, video: true, audio: true },
    musica: { duracao: 30 * S, video: false, audio: true },
  };
  return { novoId: () => `n${++n}`, midia: (id) => midias[id] ?? null };
}

function vazio(): Projeto {
  return {
    id: "p",
    nome: "Teste",
    proporcao: "9:16",
    taxa: TAXA,
    fundo: { cor: "#000000" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
}

/** Confere as regras que a API também confere: principal encostada e nada sobreposto. */
function conferir(projeto: Projeto) {
  for (const faixa of projeto.faixas) {
    let fim = 0;
    for (const clipe of [...faixa.clipes].sort((a, b) => a.inicio - b.inicio)) {
      if (faixa.tipo === "principal") assert.equal(clipe.inicio, fim, "principal com espaço vazio");
      assert.ok(clipe.inicio >= fim, "clipes sobrepostos");
      assert.ok(clipe.duracao >= QUADRO);
      fim = fimDoClipe(clipe);
    }
  }
}

function principal(projeto: Projeto) {
  return projeto.faixas.find((faixa) => faixa.tipo === "principal")!.clipes;
}

test("vídeo entra na principal, encostado; áudio vai para uma faixa de áudio", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  ({ projeto } = adicionarClipe(projeto, ctx, "video4"));
  ({ projeto } = adicionarClipe(projeto, ctx, "video4", { inicio: 0 }));
  assert.deepEqual(principal(projeto).map((c) => [c.midia_id, c.inicio / S]), [["video4", 0], ["video10", 4], ["video4", 14]]);

  ({ projeto } = adicionarClipe(projeto, ctx, "musica", { inicio: 2 * S }));
  const audio = projeto.faixas.find((f) => f.tipo === "audio")!;
  assert.equal(audio.clipes[0].inicio, 2 * S);
  assert.equal(projeto.duracao, 32 * S);
  assert.equal(projeto.faixas.at(-1)!.tipo, "audio");
  conferir(projeto);

  assert.throws(() => adicionarClipe(projeto, ctx, "musica", { faixaId: "principal" }), ErroEdicao);
  assert.throws(() => adicionarClipe(projeto, ctx, "nao-existe"), ErroEdicao);
});

test("dividir no cursor e apagar fechando o espaço na principal", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  const dividido = dividirClipes(projeto, ctx, 3 * S, []);
  projeto = dividido.projeto;
  const [esquerda, direita] = principal(projeto);
  assert.deepEqual([esquerda.duracao, direita.inicio, direita.duracao, direita.entrada], [3 * S, 3 * S, 7 * S, 3 * S]);
  assert.deepEqual(dividido.novos, [direita.id]);

  projeto = apagarClipes(projeto, [esquerda.id]);
  assert.deepEqual(principal(projeto).map((c) => [c.inicio, c.entrada]), [[0, 3 * S]]);
  conferir(projeto);

  // Na borda do clipe não há o que dividir
  assert.throws(() => dividirClipes(projeto, ctx, 0, []), ErroEdicao);
});

test("aparar respeita a mídia e fecha o espaço na principal", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video4");
  ({ projeto } = adicionarClipe(projeto, ctx, "video10"));
  const [a, b] = principal(projeto);

  // Encurtar o fim do primeiro puxa o segundo
  projeto = apararClipe(projeto, ctx, a.id, "fim", 1 * S);
  assert.deepEqual(principal(projeto).map((c) => [c.inicio, c.duracao]), [[0, S], [S, 10 * S]]);

  // Esticar além do que a mídia tem para no fim dela
  projeto = apararClipe(projeto, ctx, a.id, "fim", 99 * S);
  assert.equal(principal(projeto)[0].duracao, 4 * S);

  // Começo: entra 2 s na mídia, e o clipe continua encostado
  projeto = apararClipe(projeto, ctx, b.id, "inicio", 6 * S);
  const segundo = principal(projeto)[1];
  assert.deepEqual([segundo.inicio, segundo.entrada, segundo.duracao], [4 * S, 2 * S, 8 * S]);

  // Não passa de um quadro de duração nem antes do começo da mídia
  projeto = apararClipe(projeto, ctx, b.id, "inicio", 0);
  assert.deepEqual([principal(projeto)[1].entrada, principal(projeto)[1].duracao], [0, 10 * S]);
  projeto = apararClipe(projeto, ctx, b.id, "fim", 0);
  assert.equal(principal(projeto)[1].duracao, QUADRO);
  conferir(projeto);
});

test("mover na principal troca a ordem; soltar por cima de outro clipe cria faixa nova", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  const segundoClipe = adicionarClipe(projeto, ctx, "video4");
  projeto = segundoClipe.projeto;
  const segundo = segundoClipe.clipeId;
  projeto = moverClipe(projeto, ctx, segundo, { faixaId: "principal", inicio: 0 });
  assert.deepEqual(principal(projeto).map((c) => c.midia_id), ["video4", "video10"]);

  // Para uma faixa de sobreposição nova, e de volta por cima dela: ganha outra faixa
  projeto = moverClipe(projeto, ctx, segundo, { novaFaixa: true, inicio: 5 * S });
  const sobre = projeto.faixas.filter((f) => f.tipo === "video");
  assert.equal(sobre.length, 1);
  assert.equal(projeto.faixas.indexOf(sobre[0]), 0, "sobreposição fica acima da principal");
  assert.equal(sobre[0].clipes[0].inicio, 5 * S);

  const outro = adicionarClipe(projeto, ctx, "video4", { faixaId: sobre[0].id, inicio: 6 * S });
  assert.equal(outro.projeto.faixas.filter((f) => f.tipo === "video").length, 2);
  conferir(outro.projeto);

  // Faixa que fica vazia some
  projeto = moverClipe(projeto, ctx, segundo, { faixaId: "principal", inicio: 99 * S });
  assert.deepEqual(projeto.faixas.map((f) => f.tipo), ["principal"]);
  assert.throws(() => moverClipe(projeto, ctx, "nao-existe", { faixaId: "principal", inicio: 0 }), ErroEdicao);
});

test("duplicar e faixa travada", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video4");
  const comMusica = adicionarClipe(projeto, ctx, "musica", { inicio: 0 });
  projeto = comMusica.projeto;
  const musica = comMusica.clipeId;
  const dup = duplicarClipes(projeto, ctx, [principal(projeto)[0].id, musica]);
  projeto = dup.projeto;
  assert.deepEqual(principal(projeto).map((c) => c.inicio), [0, 4 * S]);
  const audio = projeto.faixas.find((f) => f.tipo === "audio")!;
  assert.deepEqual(audio.clipes.map((c) => c.inicio), [0, 30 * S]);
  conferir(projeto);

  projeto = alternarFaixa(projeto, "principal", "travada");
  assert.throws(() => apagarClipes(projeto, [principal(projeto)[0].id]), /travada/);
  assert.throws(() => dividirClipes(projeto, ctx, 2 * S, []), /travada/);
});

test("apagar numa faixa livre deixa o espaço, a não ser que peça para fechar", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "musica", { inicio: 0 });
  const audio = projeto.faixas.find((f) => f.tipo === "audio")!;
  const primeiro = audio.clipes[0].id;
  const segundoClipe = adicionarClipe(projeto, ctx, "musica", { faixaId: audio.id, inicio: 40 * S });
  projeto = segundoClipe.projeto;
  const segundo = segundoClipe.clipeId;

  const comEspaco = apagarClipes(projeto, [primeiro]);
  assert.equal(comEspaco.faixas.find((f) => f.tipo === "audio")!.clipes[0].inicio, 40 * S);
  const fechado = apagarClipes(projeto, [primeiro], true);
  assert.equal(fechado.faixas.find((f) => f.tipo === "audio")!.clipes[0].inicio, 10 * S);
  assert.ok(segundo);
});

test("transformar, recortar e restaurar mudam só a imagem do clipe, com limites", () => {
  const ctx = contexto();
  const adicionado = adicionarClipe(vazio(), ctx, "video10");
  const clipeId = adicionado.clipeId;
  let projeto = adicionado.projeto;
  assert.deepEqual(principal(projeto)[0].transformacao, TRANSFORMACAO_PADRAO);

  projeto = transformarClipes(projeto, [clipeId], { x: 0.2, escala: 50, rotacao: 270, opacidade: -1 });
  assert.deepEqual(principal(projeto)[0].transformacao, { x: 0.2, y: 0, escala: 20, rotacao: -90, opacidade: 0 });

  projeto = recortarClipes(projeto, [clipeId], { x: 0.9, y: -1, largura: 0.5, altura: 2 });
  const recorte = principal(projeto)[0].recorte;
  assert.equal(recorte.x, 0.9);
  assert.equal(recorte.y, 0);
  assert.ok(Math.abs(recorte.largura - 0.1) < 1e-12, "o recorte não passa da borda da mídia");
  assert.equal(recorte.altura, 1);

  const dividido = dividirClipes(projeto, ctx, 5 * S, [clipeId]).projeto;
  assert.deepEqual(principal(dividido)[1].transformacao, principal(projeto)[0].transformacao, "as duas metades ficam iguais");

  projeto = restaurarClipes(projeto, [clipeId]);
  assert.deepEqual(principal(projeto)[0].transformacao, TRANSFORMACAO_PADRAO);
  assert.deepEqual(principal(projeto)[0].recorte, RECORTE_PADRAO);

  const comMusica = adicionarClipe(projeto, ctx, "musica");
  assert.throws(() => transformarClipes(comMusica.projeto, [comMusica.clipeId], { x: 0.1 }), /áudio/);
  assert.throws(() => transformarClipes(projeto, ["nao-existe"], { x: 0.1 }), ErroEdicao);
  projeto = alternarFaixa(projeto, "principal", "travada");
  assert.throws(() => transformarClipes(projeto, [clipeId], { x: 0.1 }), /travada/);
});

test("fundo aceita só cor em hexadecimal", () => {
  assert.equal(mudarFundo(vazio(), "#FF6A3D").fundo.cor, "#ff6a3d");
  assert.throws(() => mudarFundo(vazio(), "vermelho"), ErroEdicao);
});

test("o giro fica sempre entre -180 e 180 graus", () => {
  assert.deepEqual([0, 180, 181, -180, 360, 725, -450].map(normalizarRotacao), [0, 180, -179, 180, 0, 5, -90]);
});

test("projeto antigo, sem transformação nem recorte, é completado", () => {
  const { projeto } = adicionarClipe(vazio(), contexto(), "video10");
  const antigo = structuredClone(projeto) as Projeto;
  const clipe = principal(antigo)[0] as Partial<Projeto["faixas"][number]["clipes"][number]>;
  delete clipe.transformacao;
  delete clipe.recorte;
  assert.deepEqual(completarProjeto(antigo), projeto);
});
