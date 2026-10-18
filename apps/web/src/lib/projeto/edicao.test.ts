import assert from "node:assert/strict";
import { test } from "node:test";

import { duracaoDoQuadro, segundosParaTicks } from "../tempo.ts";
import {
  adicionarClipe,
  adicionarLegenda,
  adicionarTexto,
  ajustarAudio,
  animarClipes,
  definirTransicao,
  alternarFaixa,
  apagarClipes,
  apararClipe,
  type Contexto,
  dividirClipes,
  DURACAO_IMAGEM_S,
  duplicarClipes,
  ErroEdicao,
  estiloDasLegendas,
  importarLegendas,
  zoomNosTrechos,
  moverClipe,
  mudarCor,
  mudarKeyframe,
  mudarFundo,
  mudarTexto,
  mudarVelocidade,
  normalizarRotacao,
  palavrasChaveDasLegendas,
  cortarNoRitmo,
  pulsarNoRitmo,
  PULSO_NO_RITMO,
  recortarClipes,
  removerIntervalos,
  restaurarClipes,
  transformarClipes,
  VOLUME_MAXIMO,
} from "./edicao.ts";
import { transformacaoNoTempo } from "./keyframes.ts";
import { ESTILO_LEGENDA } from "./legendas.ts";
import { ajustarTexto, alternarPalavraChave, ESTILOS_DE_TEXTO, palavrasDoTexto, TEXTO_PADRAO } from "./texto.ts";
import { completarProjeto, fatorDosFades, fimDoClipe, type Projeto, RECORTE_PADRAO, TRANSFORMACAO_PADRAO } from "./modelo.ts";

const S = segundosParaTicks(1);
const TAXA = { num: 30, den: 1 };
const QUADRO = duracaoDoQuadro(TAXA);

function contexto(): Contexto {
  let n = 0;
  const midias: Record<string, { duracao: number; video: boolean; audio: boolean; transparente?: boolean; imagem?: boolean }> = {
    video10: { duracao: 10 * S, video: true, audio: true },
    video4: { duracao: 4 * S, video: true, audio: true },
    musica: { duracao: 30 * S, video: false, audio: true },
    animacao: { duracao: 3 * S, video: true, audio: false, transparente: true },
    foto: { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, imagem: true },
    logo: { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, transparente: true, imagem: true },
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

test("animação entra por cima, no cursor e com a transparência ligada", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  ({ projeto } = adicionarClipe(projeto, ctx, "animacao", { inicio: 2 * S }));
  const sobreposicao = projeto.faixas.find((f) => f.tipo === "video")!;
  assert.equal(sobreposicao.clipes[0].inicio, 2 * S);
  assert.equal(sobreposicao.clipes[0].remover_fundo, true);
  assert.equal(principal(projeto).length, 1);
  conferir(projeto);
});

test("imagem entra com 5 s e estica para os dois lados quanto quiser", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "foto");
  const foto = principal(projeto)[0];
  assert.equal(foto.duracao, DURACAO_IMAGEM_S * S);
  // Pelo fim, sem limite de mídia
  projeto = apararClipe(projeto, ctx, foto.id, "fim", 60 * S);
  assert.equal(principal(projeto)[0].duracao, 60 * S);
  // Dividida, a segunda metade pode voltar pelo começo e fica com a entrada em zero
  ({ projeto } = dividirClipes(projeto, ctx, 20 * S, []));
  const segunda = principal(projeto)[1];
  projeto = apararClipe(projeto, ctx, segunda.id, "inicio", 10 * S);
  const depois = principal(projeto)[1];
  assert.equal(depois.entrada, 0);
  assert.equal(depois.duracao, 50 * S);
  conferir(projeto);
});

test("imagem transparente vai por cima sem ligar o recorte do fundo", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  ({ projeto } = adicionarClipe(projeto, ctx, "logo", { inicio: 1 * S }));
  const sobreposicao = projeto.faixas.find((f) => f.tipo === "video")!;
  assert.equal(sobreposicao.clipes[0].inicio, 1 * S);
  assert.ok(!sobreposicao.clipes[0].remover_fundo, "a transparência já vem no próprio arquivo");
  assert.equal(principal(projeto).length, 1);
  conferir(projeto);
});

test("zoom nos destaques: a escala sobe antes do trecho, fica e volta depois", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  projeto = zoomNosTrechos(projeto, [{ inicio: 2 * S, fim: 4 * S }, { inicio: 3 * S, fim: 5 * S }, { inicio: 7 * S, fim: 8 * S }]);
  const pontos = principal(projeto)[0].keyframes!.escala!;
  // O segundo trecho começa dentro do primeiro e fica de fora
  assert.equal(pontos.length, 8);
  assert.deepEqual(
    pontos.slice(0, 4).map((p) => [Math.round((p.t / S) * 100) / 100, Math.round(p.valor * 100) / 100]),
    [[1.73, 1], [2.23, 1.12], [3.98, 1.12], [4.33, 1]],
  );
  assert.ok(pontos.every((p) => p.curva === "suave"));
  // Quem já tem keyframes de escala fica como está
  assert.deepEqual(zoomNosTrechos(projeto, [{ inicio: 0, fim: 2 * S }]), projeto);
  conferir(projeto);
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

test("palavras-chave: contadas como no desenho, limpas, importadas com as legendas e trocadas em todas", () => {
  assert.deepEqual(palavrasDoTexto("Hoje vou\r\n  mostrar  três"), ["Hoje", "vou", "mostrar", "três"]);
  const base = { ...TEXTO_PADRAO, conteudo: "a b c" };
  assert.deepEqual(alternarPalavraChave({ ...base, palavras_chave: [2] }, 0), [0, 2]);
  assert.equal(alternarPalavraChave({ ...base, palavras_chave: [2] }, 2), null);
  const limpo = ajustarTexto(base, { palavras_chave: [3, 1, 1, -2, 1.5, 999], cor_chave: "#FF0000" });
  assert.deepEqual(limpo.palavras_chave, [1, 3]);
  assert.equal(limpo.cor_chave, "#ff0000");
  assert.equal(ajustarTexto(base, { palavras_chave: [] }).palavras_chave, null);
  assert.equal(ajustarTexto(base, { cor_chave: "vermelho" }).cor_chave, "#ffd400");

  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  projeto = importarLegendas(
    projeto,
    ctx,
    [
      { inicio: 0, fim: 2 * S, conteudo: "Economize duas horas", palavras_chave: [2] },
      { inicio: 2 * S, fim: 4 * S, conteudo: "todo dia" },
    ],
    ESTILO_LEGENDA,
  ).projeto;
  const [primeira, segunda] = projeto.faixas[0].clipes;
  assert.deepEqual(primeira.texto!.palavras_chave, [2]);
  assert.equal(segunda.texto!.palavras_chave, null);
  // O estilo do painel não apaga as palavras-chave
  projeto = estiloDasLegendas(projeto, projeto.faixas[0].id, ESTILO_LEGENDA);
  assert.deepEqual(projeto.faixas[0].clipes[0].texto!.palavras_chave, [2]);
  // A IA troca todas: quem não está no mapa fica sem
  projeto = palavrasChaveDasLegendas(projeto, { [segunda.id]: [1] }, "#00ff00");
  assert.equal(projeto.faixas[0].clipes[0].texto!.palavras_chave, null);
  assert.deepEqual(projeto.faixas[0].clipes[1].texto!.palavras_chave, [1]);
  assert.equal(projeto.faixas[0].clipes[1].texto!.cor_chave, "#00ff00");
  conferir(projeto);
  assert.throws(() => palavrasChaveDasLegendas(vazio(), {}, null), /não tem legendas/);
});

test("no ritmo: cada clipe da principal termina na última batida que cabe, e pulsa em cada batida", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video4");
  ({ projeto } = adicionarClipe(projeto, ctx, "video10"));
  ({ projeto } = adicionarClipe(projeto, ctx, "video4"));
  // Batidas a cada 0,75 s, desde 0,1 s
  const batidas = Array.from({ length: 30 }, (_, i) => Math.round((0.1 + 0.75 * i) * S));
  const cortado = cortarNoRitmo(projeto, ctx, batidas);
  const [a, b, c] = principal(cortado);
  const naBatida = (t: number) => batidas.some((x) => Math.abs(x - t) <= QUADRO / 2);
  assert.ok(naBatida(a.inicio + a.duracao) && naBatida(b.inicio + b.duracao) && naBatida(c.inicio + c.duracao));
  assert.ok(a.duracao <= 4 * S && b.duracao <= 10 * S, "nenhum clipe cresce além da mídia");
  conferir(cortado);
  assert.throws(() => cortarNoRitmo(cortado, ctx, batidas), /já estão nas batidas/);
  assert.throws(() => cortarNoRitmo(vazio(), ctx, batidas), /faixa principal/);

  const pulsado = pulsarNoRitmo(cortado, batidas);
  const pontos = principal(pulsado)[0].keyframes!.escala!;
  assert.equal(pontos.length % 3, 0);
  assert.ok(pontos.length <= 100);
  // O pico cai no quadro da batida e a imagem volta à escala de antes
  const pico = pontos[1];
  assert.equal(pico.valor, principal(cortado)[0].transformacao.escala * PULSO_NO_RITMO.escala);
  assert.ok(naBatida(principal(pulsado)[0].inicio + pico.t));
  assert.equal(pontos[2].valor, principal(cortado)[0].transformacao.escala);
  // Clipe que já tem zoom fica como está
  assert.throws(() => pulsarNoRitmo(pulsado, batidas), /Nenhum clipe/);
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

test("cor: limites, filtro existente e intensidade até 200%", () => {
  const ctx = contexto();
  const { projeto, clipeId } = adicionarClipe(vazio(), ctx, "video10");
  const mudado = mudarCor(projeto, [clipeId], { exposicao: 5, saturacao: -3, filtro: "noite", intensidade: 9 });
  const cor = principal(mudado)[0].cor!;
  assert.deepEqual([cor.exposicao, cor.saturacao, cor.filtro, cor.intensidade], [2, -1, "noite", 2]);
  assert.throws(() => mudarCor(projeto, [clipeId], { filtro: "inventado" }), /não existe/);
  const comMusica = adicionarClipe(projeto, ctx, "musica");
  assert.throws(() => mudarCor(comMusica.projeto, [comMusica.clipeId], { saturacao: 1 }), /áudio/);
});

test("transições: só entre vizinhos da principal, cabem nos dois clipes e somem quando o vizinho sai", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  projeto = adicionarClipe(projeto, ctx, "video4").projeto;
  const [a, b] = principal(projeto);
  projeto = definirTransicao(projeto, a.id, { tipo: "fusao", duracao: 9 * S });
  assert.deepEqual(principal(projeto)[0].transicao, { tipo: "fusao", duracao: 4 * S }, "no máximo o menor dos dois");
  assert.throws(() => definirTransicao(projeto, b.id, { tipo: "zoom", duracao: S }), /vizinhos/);

  // Aparar o segundo encolhe a transição; apagar o segundo tira a transição do primeiro
  const aparado = apararClipe(projeto, ctx, b.id, "fim", 12 * S);
  assert.equal(principal(aparado)[0].transicao!.duracao, 2 * S);
  const semVizinho = apagarClipes(projeto, [b.id]);
  assert.equal(principal(semVizinho)[0].transicao, null);
  assert.equal(definirTransicao(projeto, a.id, null).faixas[0].clipes[0].transicao, null);
});

test("remover intervalos corta os clipes e fecha o espaço em todas as faixas", () => {
  const ctx = contexto();
  let projeto = adicionarClipe(vazio(), ctx, "video10").projeto;
  projeto = adicionarClipe(projeto, ctx, "video4").projeto;
  projeto = importarLegendas(projeto, ctx, [
    { inicio: 1 * S, fim: 2 * S, conteudo: "antes" },
    { inicio: 3 * S, fim: 4 * S, conteudo: "no corte" },
    { inicio: 11 * S, fim: 12 * S, conteudo: "depois" },
  ], ESTILO_LEGENDA).projeto;
  const [a, b] = principal(projeto);
  projeto = { ...projeto, faixas: projeto.faixas.map((f) => (f.tipo === "principal" ? { ...f, clipes: f.clipes.map((c) => (c.id === a.id ? { ...c, fade_entrada: S / 2, fade_saida: S / 2 } : c)) } : f)) };

  // Tira 2,5 s a 4 s do primeiro clipe e 9 s a 11 s, que pega o fim do primeiro e o começo do segundo
  const resultado = removerIntervalos(projeto, ctx, [{ inicio: 9 * S, fim: 11 * S }, { inicio: 2.5 * S, fim: 4 * S }]);
  conferir(resultado);
  const clipes = principal(resultado);
  assert.deepEqual(clipes.map((c) => [c.inicio / S, c.duracao / S, c.entrada / S]), [
    [0, 2.5, 0],     // o começo do primeiro, com o mesmo id e o fade de entrada
    [2.5, 5, 4],     // de 4 s a 9 s da mídia, com o fade de saída
    [7.5, 3, 1],     // o segundo, sem o primeiro segundo dele
  ]);
  assert.equal(clipes[0].id, a.id);
  // O fade de entrada fica no primeiro pedaço; o de saída, no último pedaço do mesmo clipe
  assert.deepEqual([clipes[0].fade_entrada, clipes[0].fade_saida, clipes[1].fade_entrada, clipes[1].fade_saida], [S / 2, 0, 0, S / 2]);
  assert.equal(clipes[2].id, b.id, "o segundo clipe perdeu só o começo e guarda o id");
  assert.equal(resultado.duracao, 10.5 * S);

  // As legendas andam junto: a que estava dentro do corte some, a de depois recua os 3,5 s tirados antes dela
  const legendas = resultado.faixas.find((f) => f.tipo === "legenda")!.clipes;
  assert.deepEqual(legendas.map((c) => [c.inicio / S, c.duracao / S, c.texto?.conteudo]), [
    [1, 1, "antes"],
    [7.5, 1, "depois"],
  ]);
  assert.throws(() => removerIntervalos(projeto, ctx, [{ inicio: 0, fim: QUADRO / 2 }]), ErroEdicao);
});

test("keyframes: pôr, mexer no instante, mudar a curva e tirar", () => {
  const ctx = contexto();
  let projeto = adicionarClipe(vazio(), ctx, "video10").projeto;
  const id = principal(projeto)[0].id;
  // Sem keyframes, mexer muda o valor fixo
  projeto = transformarClipes(projeto, [id], { x: 0.1 }, 2 * S);
  assert.equal(principal(projeto)[0].transformacao.x, 0.1);

  // Dois pontos em x: em 1 s com o valor atual, em 3 s movido para 0,5
  projeto = mudarKeyframe(projeto, id, "x", 1 * S, "alternar");
  projeto = mudarKeyframe(projeto, id, "x", 3 * S, "alternar");
  projeto = transformarClipes(projeto, [id], { x: 0.5, escala: 0.8 }, 3 * S);
  let clipe = principal(projeto)[0];
  assert.deepEqual(clipe.keyframes?.x?.map((k) => [k.t / S, k.valor]), [[1, 0.1], [3, 0.5]]);
  assert.equal(clipe.transformacao.x, 0.1, "com keyframes, o valor fixo não muda");
  assert.equal(clipe.transformacao.escala, 0.8, "a escala não tem keyframes: muda o valor fixo");
  assert.ok(Math.abs(transformacaoNoTempo(clipe, 2 * S).x - 0.3) < 1e-9);
  // Mexer entre os pontos cria outro, no instante
  projeto = transformarClipes(projeto, [id], { x: 0 }, 2 * S);
  assert.deepEqual(principal(projeto)[0].keyframes?.x?.map((k) => [k.t / S, k.valor]), [[1, 0.1], [2, 0], [3, 0.5]]);

  projeto = mudarKeyframe(projeto, id, "x", 2 * S, "suave");
  assert.equal(principal(projeto)[0].keyframes?.x?.[1].curva, "suave");
  assert.throws(() => mudarKeyframe(projeto, id, "x", 2.5 * S, "suave"), ErroEdicao);

  // Tirar todos: o clipe fica parado no valor do último ponto tirado
  for (const t of [1, 2, 3]) projeto = mudarKeyframe(projeto, id, "x", t * S, "alternar");
  clipe = principal(projeto)[0];
  assert.equal(clipe.keyframes, null);
  assert.equal(clipe.transformacao.x, 0.5);
});

test("keyframes: aparar, dividir e cortar trechos não mudam o movimento na tela", () => {
  const ctx = contexto();
  let projeto = adicionarClipe(vazio(), ctx, "video10").projeto;
  const id = principal(projeto)[0].id;
  projeto = mudarKeyframe(projeto, id, "escala", 2 * S, "alternar");
  projeto = mudarKeyframe(projeto, id, "escala", 6 * S, "alternar");
  projeto = transformarClipes(projeto, [id], { escala: 2 }, 6 * S);
  const antes = (t: number) => transformacaoNoTempo(principal(projeto)[0], t * S).escala;
  const em4 = antes(4);

  // Dividir em 3 s: a metade da direita continua de onde a esquerda parou
  const dividido = dividirClipes(projeto, ctx, 3 * S, [id]).projeto;
  const direita = principal(dividido)[1];
  assert.ok(Math.abs(transformacaoNoTempo(direita, 4 * S).escala - em4) < 1e-9);

  // Aparar o começo para 1 s: o clipe vai para 0 na principal, e o movimento acompanha o mesmo trecho da mídia
  const aparado = apararClipe(projeto, ctx, id, "inicio", 1 * S);
  const clipe = principal(aparado)[0];
  assert.equal(clipe.inicio, 0);
  assert.ok(Math.abs(transformacaoNoTempo(clipe, 3 * S).escala - em4) < 1e-9);
  conferir(aparado);
});

test("velocidade: o mesmo trecho da mídia em outra duração, empurrando a principal", () => {
  const ctx = contexto();
  let p = adicionarClipe(vazio(), ctx, "video10").projeto;
  p = adicionarClipe(p, ctx, "video4").projeto;
  const [primeiro, segundo] = principal(p);
  p = mudarKeyframe(p, primeiro.id, "x", 4 * S, "alternar");
  p = mudarVelocidade(p, primeiro.id, 2);
  conferir(p);
  const [rapido, depois] = principal(p);
  assert.equal(rapido.velocidade, 2);
  assert.equal(rapido.duracao, 5 * S, "10 s de mídia em 5 s");
  assert.equal(depois.id, segundo.id);
  assert.equal(depois.inicio, 5 * S, "o seguinte encosta");
  assert.equal(rapido.keyframes?.x?.[0].t, 2 * S, "o keyframe anda junto");
  // Os limites: de 0,1× a 10×
  assert.equal(principal(mudarVelocidade(p, primeiro.id, 50))[0].velocidade, 10);
});
