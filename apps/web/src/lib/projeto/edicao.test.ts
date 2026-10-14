import assert from "node:assert/strict";
import { test } from "node:test";

import { duracaoDoQuadro, segundosParaTicks } from "../tempo.ts";
import {
  adicionarClipe,
  adicionarLegenda,
  adicionarTexto,
  ajustarAudio,
  animarClipes,
  alternarFaixa,
  apagarClipes,
  apararClipe,
  type Contexto,
  dividirClipes,
  duplicarClipes,
  ErroEdicao,
  estiloDasLegendas,
  importarLegendas,
  moverClipe,
  mudarFundo,
  mudarTexto,
  normalizarRotacao,
  recortarClipes,
  restaurarClipes,
  transformarClipes,
  VOLUME_MAXIMO,
} from "./edicao.ts";
import { ESTILO_LEGENDA } from "./legendas.ts";
import { ESTILOS_DE_TEXTO, TEXTO_PADRAO } from "./texto.ts";
import { completarProjeto, fatorDosFades, fimDoClipe, type Projeto, RECORTE_PADRAO, TRANSFORMACAO_PADRAO } from "./modelo.ts";

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

test("volume e fades: limites, e os fades acompanham o dividir e o aparar", () => {
  const ctx = contexto();
  const adicionado = adicionarClipe(vazio(), ctx, "video10");
  const id = adicionado.clipeId;
  let projeto = ajustarAudio(adicionado.projeto, [id], { volume: 9, fade_entrada: 2 * S, fade_saida: 20 * S });
  let clipe = principal(projeto)[0];
  assert.equal(clipe.volume, VOLUME_MAXIMO);
  assert.equal(clipe.fade_entrada, 2 * S);
  assert.equal(clipe.fade_saida, 8 * S, "o fade de saída para onde o de entrada acaba");

  assert.equal(fatorDosFades(clipe, 0), 0);
  assert.equal(fatorDosFades(clipe, S), 0.5);
  assert.equal(fatorDosFades(clipe, 2 * S), 1);
  assert.equal(fatorDosFades(clipe, 4 * S), 0.75, "no fade de saída, que começa em 2 s");
  assert.equal(fatorDosFades(clipe, 10 * S), 0);

  projeto = ajustarAudio(projeto, [id], { fade_saida: 3 * S });
  const dividido = dividirClipes(projeto, ctx, 5 * S, [id]).projeto;
  const [esquerda, direita] = principal(dividido);
  assert.deepEqual([esquerda.fade_entrada, esquerda.fade_saida], [2 * S, 0]);
  assert.deepEqual([direita.fade_entrada, direita.fade_saida], [0, 3 * S]);

  const aparado = apararClipe(projeto, ctx, id, "fim", 4 * S);
  clipe = principal(aparado)[0];
  assert.equal(clipe.fade_entrada + clipe.fade_saida <= clipe.duracao, true, "os fades encolhem com o clipe");
});

test("texto: entra numa faixa de texto por cima de tudo, só anda entre faixas de texto e não tem limite de mídia", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  const comSobreposicao = adicionarClipe(projeto, ctx, "video4", { novaFaixa: true });
  projeto = comSobreposicao.projeto;
  const titulo = adicionarTexto(projeto, ctx, 2 * S, ESTILOS_DE_TEXTO[0].texto);
  projeto = titulo.projeto;
  assert.deepEqual(projeto.faixas.map((f) => f.tipo), ["texto", "video", "principal"]);
  const clipe = projeto.faixas[0].clipes[0];
  assert.equal(clipe.midia_id, null);
  assert.equal(clipe.inicio, 2 * S);
  assert.equal(clipe.duracao, 3 * S);
  conferir(projeto);

  // Outro texto no mesmo instante não cabe na mesma faixa: ganha outra, também por cima
  projeto = adicionarTexto(projeto, ctx, 2 * S, TEXTO_PADRAO).projeto;
  assert.deepEqual(projeto.faixas.map((f) => f.tipo), ["texto", "texto", "video", "principal"]);

  const video = projeto.faixas.find((f) => f.tipo === "video")!;
  assert.throws(() => moverClipe(projeto, ctx, titulo.clipeId, { inicio: 0, faixaId: video.id }), /faixa de texto/);
  assert.throws(() => moverClipe(projeto, ctx, video.clipes[0].id, { inicio: 0, faixaId: projeto.faixas[0].id }), /só recebe textos/);

  // Puxar o começo para trás e o fim para a frente, sem mídia limitando
  const esticado = apararClipe(apararClipe(projeto, ctx, titulo.clipeId, "inicio", 0), ctx, titulo.clipeId, "fim", 40 * S);
  const depois = esticado.faixas.flatMap((f) => f.clipes).find((c) => c.id === titulo.clipeId)!;
  assert.equal(depois.inicio, 0);
  assert.equal(depois.duracao, 40 * S);

  const mudado = mudarTexto(projeto, [titulo.clipeId], { conteudo: "Novo", tamanho: 9, cor: "vermelho" });
  const texto = mudado.faixas.flatMap((f) => f.clipes).find((c) => c.id === titulo.clipeId)!.texto!;
  assert.equal(texto.conteudo, "Novo");
  assert.equal(texto.tamanho, 0.3, "o tamanho para no limite");
  assert.equal(texto.cor, "#ffffff", "cor inválida fica a de antes");
  assert.throws(() => mudarTexto(projeto, [video.clipes[0].id], { conteudo: "x" }), /não é um texto/);
});

test("legendas: importadas numa faixa por cima de tudo, presas aos quadros, e o estilo vale para todas", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  projeto = adicionarTexto(projeto, ctx, 0, TEXTO_PADRAO).projeto;
  const quadro = duracaoDoQuadro(TAXA);
  const importadas = importarLegendas(
    projeto,
    ctx,
    [
      { inicio: Math.round(0.51 * S), fim: 2 * S, conteudo: "Primeira" },
      { inicio: 2 * S, fim: 2 * S + quadro / 3, conteudo: "Curta demais" },
      { inicio: 3 * S, fim: 4 * S, conteudo: "Segunda" },
    ],
    ESTILO_LEGENDA,
  );
  projeto = importadas.projeto;
  assert.deepEqual(projeto.faixas.map((f) => f.tipo), ["legenda", "texto", "principal"]);
  const legendas = projeto.faixas[0].clipes;
  assert.deepEqual(legendas.map((c) => c.texto!.conteudo), ["Primeira", "Segunda"]);
  assert.equal(legendas[0].inicio % quadro, 0, "começa num quadro");
  assert.equal(legendas[0].transformacao.y, 0.35);
  conferir(projeto);

  // Adicionar outra legenda e um texto novo: textos continuam abaixo das legendas
  projeto = adicionarLegenda(projeto, ctx, 6 * S, ESTILO_LEGENDA).projeto;
  projeto = adicionarTexto(projeto, ctx, 0, TEXTO_PADRAO).projeto;
  assert.deepEqual(projeto.faixas.map((f) => f.tipo), ["legenda", "texto", "texto", "principal"]);
  assert.equal(projeto.faixas[0].clipes.length, 3);

  projeto = estiloDasLegendas(projeto, projeto.faixas[0].id, { cor: "#ffd60a", conteudo: "não pode mudar" });
  assert.ok(projeto.faixas[0].clipes.every((c) => c.texto!.cor === "#ffd60a"));
  assert.deepEqual(projeto.faixas[0].clipes.map((c) => c.texto!.conteudo), ["Primeira", "Segunda", "Legenda"]);
  assert.throws(() => importarLegendas(projeto, ctx, [], ESTILO_LEGENDA), /não tem legendas/);
});

test("animações: durações dentro do clipe, e ao dividir a entrada fica à esquerda e a saída à direita", () => {
  const ctx = contexto();
  const titulo = adicionarTexto(vazio(), ctx, 0, TEXTO_PADRAO);
  let projeto = animarClipes(titulo.projeto, [titulo.clipeId], {
    entrada: { tipo: "subir", duracao: 1 * S },
    saida: { tipo: "zoom", duracao: 5 * S },
  });
  const clipe = () => projeto.faixas[0].clipes.find((c) => c.id === titulo.clipeId)!;
  assert.equal(clipe().animacao!.saida.duracao, 2 * S, "a saída fica com o que sobra dos 3 s");

  const dividido = dividirClipes(projeto, ctx, 1.5 * S, [titulo.clipeId]).projeto;
  const [esquerda, direita] = dividido.faixas[0].clipes;
  assert.deepEqual([esquerda.animacao!.entrada.tipo, esquerda.animacao!.saida.tipo], ["subir", "nenhuma"]);
  assert.deepEqual([direita.animacao!.entrada.tipo, direita.animacao!.saida.tipo], ["nenhuma", "zoom"]);

  projeto = apararClipe(projeto, ctx, titulo.clipeId, "fim", 2 * S);
  const encolhido = clipe().animacao!;
  assert.ok(encolhido.entrada.duracao + encolhido.saida.duracao <= clipe().duracao, "encolhe ao aparar");
});
