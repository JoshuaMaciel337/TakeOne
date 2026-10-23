import assert from "node:assert/strict";
import { test } from "node:test";

import { duracaoDoQuadro, segundosParaTicks } from "../tempo.ts";
import {
  adicionarAjuste,
  adicionarClipe,
  adicionarLegenda,
  adicionarTexto,
  adicionarMarcador,
  ajustarAudio,
  apagarMarcador,
  mudarMarcador,
  ajustarMusicaAoVideo,
  animarClipes,
  definirTransicao,
  deslizarConteudo,
  moverCorte,
  alternarFaixa,
  apagarClipes,
  apararClipe,
  aplicarEfeito,
  colarAjustes,
  congelarQuadro,
  inverterClipes,
  fluidoNoClipe,
  colarClipes,
  virarClipes,
  chaveLumaClipes,
  arredondarClipes,
  preencherVaga,
  type Contexto,
  dividirClipes,
  DURACAO_IMAGEM_S,
  estabilizarClipes,
  montarNaLinha,
  trocarMidiaDosClipes,
  removerFundo,
  duplicarClipes,
  ErroEdicao,
  estiloDasLegendas,
  importarLegendas,
  juntarLegendas,
  substituirNasLegendas,
  zoomNosTrechos,
  moverClipe,
  mudarCor,
  limparKeyframes,
  moverKeyframe,
  mudarKeyframe,
  mudarFundo,
  mudarTexto,
  mudarVelocidade,
  normalizarRotacao,
  palavrasChaveDasLegendas,
  cortarNoRitmo,
  curvarVelocidade,
  pulsarNoRitmo,
  PULSO_NO_RITMO,
  recortarClipes,
  removerIntervalos,
  restaurarClipes,
  separarSom,
  devolverSom,
  transformarClipes,
  VOLUME_MAXIMO,
} from "./edicao.ts";
import { transformacaoNoTempo, volumeNoTempo } from "./keyframes.ts";
import { CURVAS_PRONTAS } from "./velocidade.ts";
import { ESTILO_LEGENDA } from "./legendas.ts";
import { ajustarTexto, alternarPalavraChave, ESTILOS_DE_TEXTO, palavrasDoTexto, TEXTO_PADRAO } from "./texto.ts";
import { completarProjeto, fatorDosFades, fimDoClipe, textoDosCapitulos, zeroDoFluido, type Projeto, RECORTE_PADRAO, TRANSFORMACAO_PADRAO } from "./modelo.ts";

const S = segundosParaTicks(1);
const TAXA = { num: 30, den: 1 };
const QUADRO = duracaoDoQuadro(TAXA);

function contexto(): Contexto {
  let n = 0;
  const midias: Record<string, { duracao: number; video: boolean; audio: boolean; transparente?: boolean; imagem?: boolean }> = {
    video10: { duracao: 10 * S, video: true, audio: true },
    video4: { duracao: 4 * S, video: true, audio: true },
    // Duração "real", que não divide em segundos inteiros
    video47: { duracao: segundosParaTicks(47.047), video: true, audio: true },
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

test("estabilizar e recortar o fundo não andam juntos; imagem e animação não se estabilizam", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  const id = principal(projeto)[0].id;
  projeto = removerFundo(projeto, [id], true);
  projeto = estabilizarClipes(projeto, ctx, [id], true);
  assert.deepEqual([principal(projeto)[0].estabilizar, principal(projeto)[0].remover_fundo], [true, false]);
  projeto = removerFundo(projeto, [id], true);
  assert.deepEqual([principal(projeto)[0].estabilizar, principal(projeto)[0].remover_fundo], [false, true]);
  // Desligar não mexe no outro
  projeto = removerFundo(projeto, [id], false);
  assert.equal(principal(projeto)[0].estabilizar, false);

  ({ projeto } = adicionarClipe(projeto, ctx, "foto"));
  ({ projeto } = adicionarClipe(projeto, ctx, "animacao", { inicio: 0 }));
  const foto = principal(projeto).find((c) => c.midia_id === "foto")!;
  const animacao = projeto.faixas.find((f) => f.tipo === "video")!.clipes[0];
  assert.throws(() => estabilizarClipes(projeto, ctx, [foto.id], true), ErroEdicao);
  assert.throws(() => estabilizarClipes(projeto, ctx, [animacao.id], true), ErroEdicao);
  // Desligar sempre pode (um projeto antigo não trava)
  assert.doesNotThrow(() => estabilizarClipes(projeto, ctx, [foto.id], false));
});

test("a montagem entra no fim da principal, com os cortes somados antes de ir para o quadro e a música por baixo", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video4");
  // Três trechos de 0,7 s: somados, os cortes ficam em 4,7 / 5,4 / 6,1 s (no quadro mais próximo)
  const trechos = [
    { midiaId: "video10", entrada: 2 * S, duracao: 0.7 * S },
    { midiaId: "foto", entrada: 0, duracao: 0.7 * S },
    { midiaId: "video10", entrada: 9.8 * S, duracao: 0.7 * S },
  ];
  const montado = montarNaLinha(projeto, ctx, trechos, { midiaId: "musica", entrada: S / 2 });
  projeto = montado.projeto;
  const selecao = montado.selecao;
  const clipes = principal(projeto);
  assert.equal(clipes.length, 4);
  assert.deepEqual(selecao, clipes.slice(1).map((c) => c.id));
  assert.deepEqual(clipes.slice(1).map((c) => Math.round((c.inicio / S) * 30)), [120, 141, 162]);
  assert.equal(clipes[3].entrada + clipes[3].duracao <= 10 * S, true, "o trecho não passa do fim da mídia");
  assert.ok(clipes.slice(1).every((c) => c.volume === 0), "com música, o som dos clipes fica mudo");
  const trilha = projeto.faixas.find((f) => f.tipo === "audio")!.clipes[0];
  assert.equal(trilha.inicio, 4 * S);
  assert.equal(trilha.entrada, S / 2);
  assert.equal(trilha.inicio + trilha.duracao, fimDoClipe(clipes[3]));
  assert.ok(trilha.fade_saida > 0);
  conferir(projeto);
  assert.throws(() => montarNaLinha(projeto, ctx, [], null), ErroEdicao);
});

test("trocar a imagem de um clipe guarda o resto dele; vídeo não troca", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  ({ projeto } = adicionarClipe(projeto, ctx, "logo", { inicio: S }));
  const faixa = projeto.faixas.find((f) => f.tipo === "video")!;
  const antes = faixa.clipes[0];
  projeto = transformarClipes(projeto, [antes.id], { x: 0.3, escala: 0.5 });
  const trocado = trocarMidiaDosClipes(projeto, ctx, [antes.id], "foto").faixas.find((f) => f.tipo === "video")!.clipes[0];
  assert.equal(trocado.midia_id, "foto");
  assert.deepEqual([trocado.id, trocado.inicio, trocado.duracao, trocado.transformacao.x, trocado.transformacao.escala], [antes.id, S, antes.duracao, 0.3, 0.5]);
  assert.throws(() => trocarMidiaDosClipes(projeto, ctx, [antes.id], "video4"), ErroEdicao);
  assert.throws(() => trocarMidiaDosClipes(projeto, ctx, [principal(projeto)[0].id], "foto"), ErroEdicao);
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

test("zoom nos destaques: destaque que passa da borda do clipe não repete keyframe no mesmo instante", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  ({ projeto } = adicionarClipe(projeto, ctx, "video10"));
  // De 9,7 s a 12 s: no primeiro clipe só sobra o pedaço até 10 s (o caso da auditoria)
  projeto = zoomNosTrechos(projeto, [{ inicio: 9.7 * S, fim: 12 * S }]);
  for (const clipe of principal(projeto)) {
    const ts = (clipe.keyframes?.escala ?? []).map((p) => p.t);
    for (let i = 1; i < ts.length; i++) assert.ok(ts[i] > ts[i - 1], `keyframes em ordem estrita: ${ts.join(", ")}`);
  }
  // Muitos destaques: nunca passa do limite e só entram grupos inteiros (o último ponto volta à escala de base)
  let longo = adicionarClipe(vazio(), ctx, "video47").projeto;
  const trechos = Array.from({ length: 40 }, (_, i) => ({ inicio: i * S + 0.3 * S, fim: i * S + 0.6 * S }));
  longo = zoomNosTrechos(longo, trechos);
  const pontos = principal(longo)[0].keyframes!.escala!;
  assert.ok(pontos.length <= 100);
  assert.equal(pontos[pontos.length - 1].valor, 1);
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

test("keyframes: o cronômetro desliga a animação no valor do cursor, e o keyframe muda de instante", () => {
  const ctx = contexto();
  let projeto = adicionarClipe(vazio(), ctx, "video10").projeto;
  const id = principal(projeto)[0].id;
  projeto = mudarKeyframe(projeto, id, "x", 1 * S, "alternar");
  projeto = mudarKeyframe(projeto, id, "x", 3 * S, "alternar");
  projeto = transformarClipes(projeto, [id], { x: 0.4 }, 3 * S);
  projeto = mudarKeyframe(projeto, id, "escala", 2 * S, "alternar");

  // Mover o ponto de 3 s para 5 s: o valor vai junto; para cima de outro ponto, não
  projeto = moverKeyframe(projeto, id, "x", 3 * S, 5 * S);
  assert.deepEqual(principal(projeto)[0].keyframes?.x?.map((k) => [k.t / S, k.valor]), [[1, 0], [5, 0.4]]);
  assert.throws(() => moverKeyframe(projeto, id, "x", 5 * S, 1 * S), ErroEdicao);
  assert.throws(() => moverKeyframe(projeto, id, "x", 4 * S, 2 * S), ErroEdicao);

  // Desligar em 3 s: x fica no meio do caminho (0,2) e a escala continua animada
  projeto = limparKeyframes(projeto, id, "x", 3 * S);
  const clipe = principal(projeto)[0];
  assert.equal(clipe.keyframes?.x, undefined);
  assert.ok(Math.abs(clipe.transformacao.x - 0.2) < 1e-9);
  assert.equal(clipe.keyframes?.escala?.length, 1);
  projeto = limparKeyframes(projeto, id, "escala", 3 * S);
  assert.equal(principal(projeto)[0].keyframes, null);
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

test("velocidade e aparar com contas que não dão ticks inteiros (130%, 70% e o tempo da linha com zoom)", () => {
  const ctx = contexto();
  let p = adicionarClipe(vazio(), ctx, "video47").projeto;
  const id = principal(p)[0].id;
  // Antes, 47,047 s a 1,3× dava 9190168615384,615 ticks e o BigInt lançava RangeError
  for (const velocidade of [1.3, 0.7, 0.55, 1.1, 1.45]) {
    const q = mudarVelocidade(p, id, velocidade);
    conferir(q);
    const clipe = principal(q)[0];
    assert.ok(Number.isInteger(clipe.duracao), `duração inteira a ${velocidade}×`);
    assert.equal(clipe.duracao % QUADRO, 0, `duração no quadro a ${velocidade}×`);
  }
  p = mudarVelocidade(p, id, 1.3);
  // Tempo do ponteiro com o zoom mudado (fracionário): apara no quadro mais perto, sem quebrar
  const aparado = apararClipe(p, ctx, id, "fim", 20 * S + 0.37);
  conferir(aparado);
  assert.equal(principal(aparado)[0].duracao % QUADRO, 0);
  const comeco = apararClipe(aparado, ctx, id, "inicio", 3 * S + 0.61);
  conferir(comeco);
  assert.ok(Number.isInteger(principal(comeco)[0].entrada));
});

test("dividir um clipe com transição: ela fica só na metade da direita", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  projeto = adicionarClipe(projeto, ctx, "video4").projeto;
  projeto = definirTransicao(projeto, principal(projeto)[0].id, { tipo: "escurecer", duracao: S / 2 });
  const [esquerda, direita, ultimo] = principal(dividirClipes(projeto, ctx, 4 * S, []).projeto);
  assert.equal(esquerda.transicao, null, "no meio da tomada não aparece transição");
  assert.deepEqual(direita.transicao, { tipo: "escurecer", duracao: S / 2 });
  assert.equal(ultimo.transicao ?? null, null);
});

test("mudar a velocidade não tira o abaixar na fala do lugar da fala", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "musica");
  const pontos = [4.7, 5, 8, 8.5].map((t, i) => ({ t: Math.round(t * S), valor: i === 1 || i === 2 ? 0.25 : 1, curva: "linear" as const }));
  projeto = {
    ...projeto,
    faixas: projeto.faixas.map((faixa) => ({ ...faixa, clipes: faixa.clipes.map((clipe) => ({ ...clipe, abaixamento: { db: -12, pontos } })) })),
  };
  const musica = projeto.faixas.find((faixa) => faixa.tipo === "audio")!.clipes[0];
  const rapida = mudarVelocidade(projeto, musica.id, 2).faixas.find((faixa) => faixa.tipo === "audio")!.clipes[0];
  assert.deepEqual(rapida.abaixamento?.pontos, pontos);
});

test("velocidade com curva: pedaço lento demais é recusado e esticar a borda não passa de 16 pontos", () => {
  const ctx = contexto();
  const heroi = CURVAS_PRONTAS.find((curva) => curva.id === "heroi")!.pontos;
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  const id = principal(projeto)[0].id;
  projeto = curvarVelocidade(mudarVelocidade(projeto, id, 0.3), id, heroi);
  const fim = fimDoClipe(principal(projeto)[0]);
  // A 30%, o pedaço entre 50% e 55% fica só na parte lenta da curva: a 9%, abaixo do mínimo da API
  const metade = dividirClipes(projeto, ctx, Math.round(fim * 0.5), []).projeto;
  assert.throws(() => dividirClipes(metade, ctx, Math.round(fim * 0.55), []), ErroEdicao);

  let longo = adicionarClipe(vazio(), ctx, "video47").projeto;
  const longoId = principal(longo)[0].id;
  longo = apararClipe(curvarVelocidade(longo, longoId, heroi), ctx, longoId, "fim", 20 * S);
  for (let vez = 1; vez <= 11; vez++) longo = apararClipe(longo, ctx, longoId, "fim", fimDoClipe(principal(longo)[0]) + S / 2);
  const curva = principal(longo)[0].curva_velocidade!;
  assert.ok(curva.length <= 16, `${curva.length} pontos`);
  assert.equal(curva[0][0], 0);
  assert.equal(curva[curva.length - 1][0], 1);
  assert.ok(curva.every((ponto, i) => i === 0 || ponto[0] > curva[i - 1][0]), "pontos em ordem");
});

test("o editor recusa passar dos limites de clipes da API", () => {
  const ctx = contexto();
  const { projeto } = adicionarClipe(vazio(), ctx, "video10");
  const legendas = Array.from({ length: 1501 }, (_, i) => ({ inicio: i * QUADRO * 2, fim: i * QUADRO * 2 + QUADRO, conteudo: `L${i}` }));
  assert.throws(() => importarLegendas(projeto, ctx, legendas, ESTILO_LEGENDA), /no máximo 1500 clipes/);
});

test("legendas: juntar seguidas, dividir pelas palavras e substituir na faixa", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  const legendas = [
    { inicio: 0, fim: 2 * S, conteudo: "Bom dia", tempos: [0, S], palavras_chave: [1] },
    { inicio: 2 * S, fim: 4 * S, conteudo: "pessoal tudo bem", tempos: [2 * S, 2.5 * S, 3 * S], palavras_chave: [0] },
    { inicio: 5 * S, fim: 6 * S, conteudo: "Tchau" },
  ];
  projeto = importarLegendas(projeto, ctx, legendas, ESTILO_LEGENDA).projeto;
  const faixa = () => projeto.faixas.find((f) => f.tipo === "legenda")!;
  const [a, b, c] = faixa().clipes;
  assert.throws(() => juntarLegendas(projeto, [a.id, c.id]), /seguidas/);
  const junta = juntarLegendas(projeto, [b.id, a.id]);
  const [unida, resto] = junta.projeto.faixas.find((f) => f.tipo === "legenda")!.clipes;
  assert.equal(unida.texto!.conteudo, "Bom dia pessoal tudo bem");
  assert.deepEqual([unida.inicio, unida.duracao], [0, 4 * S]);
  assert.deepEqual(unida.texto!.tempos, [0, S, 2 * S, 2.5 * S, 3 * S]);
  assert.deepEqual(unida.texto!.palavras_chave, [1, 2], "as palavras-chave da segunda andam as palavras da primeira");
  assert.equal(resto.id, c.id);

  // Dividir no cursor reparte as palavras pelo tempo delas
  projeto = junta.projeto;
  const cursor = 69 * QUADRO; // 2,3 s, num quadro inteiro
  const dividido = dividirClipes(projeto, ctx, cursor, [unida.id]).projeto;
  const [esquerda, direita] = dividido.faixas.find((f) => f.tipo === "legenda")!.clipes;
  assert.equal(esquerda.texto!.conteudo, "Bom dia pessoal");
  assert.equal(direita.texto!.conteudo, "tudo bem");
  assert.deepEqual(direita.texto!.tempos, [2.5 * S - cursor, 3 * S - cursor]);
  assert.deepEqual([esquerda.texto!.palavras_chave, direita.texto!.palavras_chave], [[1, 2], []]);

  // Substituir: sem diferenciar maiúsculas; com o número de palavras mudado, os tempos saem
  const trocado = substituirNasLegendas(projeto, faixa().id, "PESSOAL", "gente");
  assert.equal(trocado.trocas, 1);
  const legenda = trocado.projeto.faixas.find((f) => f.tipo === "legenda")!.clipes[0];
  assert.equal(legenda.texto!.conteudo, "Bom dia gente tudo bem");
  assert.ok(legenda.texto!.tempos, "o mesmo número de palavras guarda os tempos");
  const outro = substituirNasLegendas(projeto, faixa().id, "tudo bem", "beleza").projeto.faixas.find((f) => f.tipo === "legenda")!.clipes[0];
  assert.equal(outro.texto!.tempos, null);
  assert.throws(() => substituirNasLegendas(projeto, faixa().id, "nada disso", "x"), /Nenhuma/);
});

test("colar põe os clipes copiados no cursor, com ids novos e o mesmo espaçamento", () => {
  const ctx = contexto();
  let projeto = adicionarClipe(vazio(), ctx, "video10").projeto;
  const curto = adicionarClipe(projeto, ctx, "video4");
  projeto = curto.projeto;
  const titulo = adicionarTexto(projeto, ctx, 2 * S, TEXTO_PADRAO);
  projeto = titulo.projeto;
  const achar = (id: string) => projeto.faixas.flatMap((f) => f.clipes.map((clipe) => ({ clipe, faixa: f }))).find(({ clipe }) => clipe.id === id)!;
  const copiados = [curto.clipeId, titulo.clipeId].map((id) => {
    const { clipe, faixa } = achar(id);
    return { clipe: structuredClone(clipe), tipo: faixa.tipo, faixaId: faixa.id };
  });

  // No corte entre os dois vídeos: a cópia da principal entra ali e a principal continua encostada
  const colado = colarClipes(projeto, ctx, copiados, 10 * S);
  conferir(colado.projeto);
  const clipes = principal(colado.projeto);
  assert.deepEqual(clipes.map((clipe) => clipe.midia_id), ["video10", "video4", "video4"]);
  assert.equal(clipes[1].id, colado.novos[0]);
  assert.notEqual(clipes[1].id, curto.clipeId);
  // O texto guarda a distância até o clipe mais cedo copiado (ele, a 2 s): entra no cursor
  const texto = colado.projeto.faixas.flatMap((f) => f.clipes).find((clipe) => clipe.id === colado.novos[1])!;
  assert.equal(texto.inicio, 10 * S);
  assert.equal(texto.texto!.conteudo, TEXTO_PADRAO.conteudo);
  assert.equal(colado.novos.length, 2);
  assert.throws(() => colarClipes(projeto, ctx, [], 0), /Copie/);
});

test("colar ajustes leva só o que vale para cada clipe marcado", () => {
  const ctx = contexto();
  let projeto = adicionarClipe(vazio(), ctx, "video10").projeto;
  const origem = principal(projeto)[0].id;
  const alvo = adicionarClipe(projeto, ctx, "video4");
  const titulo = adicionarTexto(alvo.projeto, ctx, 0, TEXTO_PADRAO);
  projeto = mudarCor(titulo.projeto, [origem], { temperatura: 0.5 });
  projeto = aplicarEfeito(projeto, [origem], { tipo: "granulacao", intensidade: 1 });
  projeto = ajustarAudio(projeto, [origem], { volume: 2 });
  const fonte = principal(projeto)[0];

  const colado = colarAjustes(projeto, ctx, fonte, [origem, alvo.clipeId, titulo.clipeId], ["cor", "efeito", "audio"]);
  assert.equal(colado.alterados, 2, "a origem marcada fica como está");
  const todos = colado.projeto.faixas.flatMap((f) => f.clipes);
  const video = todos.find((clipe) => clipe.id === alvo.clipeId)!;
  const texto = todos.find((clipe) => clipe.id === titulo.clipeId)!;
  assert.equal(video.cor!.temperatura, 0.5);
  assert.deepEqual(video.efeito, { tipo: "granulacao", intensidade: 1 });
  assert.equal(video.volume, 2);
  // O texto ganha a cor; a granulação é só de mídia e o som não existe nele
  assert.equal(texto.cor!.temperatura, 0.5);
  assert.ok(!texto.efeito);
  assert.deepEqual([...colado.deFora].sort(), ["audio", "efeito"]);
  // Cópia de verdade: mudar a origem depois não muda o colado
  assert.notEqual(video.cor, fonte.cor);

  // A música, numa faixa de áudio, recebe o som; os fades do clipe de 10 s cabem no de 4 s
  const musica = adicionarClipe(projeto, ctx, "musica");
  projeto = ajustarAudio(musica.projeto, [origem], { fade_entrada: 3 * S, fade_saida: 3 * S });
  const comFades = principal(projeto)[0];
  const noSom = colarAjustes(projeto, ctx, comFades, [musica.clipeId, alvo.clipeId], ["cor", "audio"]);
  const [somColado, curtoColado] = [musica.clipeId, alvo.clipeId].map((id) => noSom.projeto.faixas.flatMap((f) => f.clipes).find((clipe) => clipe.id === id)!);
  assert.equal(somColado.volume, 2);
  assert.ok(!somColado.cor, "a música não ganha cor");
  assert.deepEqual([curtoColado.fade_entrada, curtoColado.fade_saida], [3 * S, S]);

  assert.throws(() => colarAjustes(projeto, ctx, fonte, [origem], ["cor"]), /Marque/);
  assert.throws(() => colarAjustes(projeto, ctx, fonte, [titulo.clipeId], ["audio"]), /Nenhum/);
});

test("virar liga e desliga cada sentido; sem nenhum, o campo some", () => {
  const ctx = contexto();
  const video = adicionarClipe(vazio(), ctx, "video10");
  let projeto = virarClipes(video.projeto, [video.clipeId], "horizontal");
  assert.deepEqual(principal(projeto)[0].virar, { horizontal: true, vertical: false });
  projeto = virarClipes(projeto, [video.clipeId], "vertical");
  assert.deepEqual(principal(projeto)[0].virar, { horizontal: true, vertical: true });
  projeto = virarClipes(virarClipes(projeto, [video.clipeId], "horizontal"), [video.clipeId], "vertical");
  assert.equal(principal(projeto)[0].virar, null);
  const musica = adicionarClipe(projeto, ctx, "musica");
  assert.throws(() => virarClipes(musica.projeto, [musica.clipeId], "horizontal"), /áudio/);
});

test("a chave de luminância vale em vídeos e imagens, nos limites, e sai com null", () => {
  const ctx = contexto();
  const video = adicionarClipe(vazio(), ctx, "video10");
  let projeto = chaveLumaClipes(video.projeto, [video.clipeId], { tirar: "claro", limiar: 1.4, suavidade: -1 });
  assert.deepEqual(principal(projeto)[0].chave_luma, { tirar: "claro", limiar: 1, suavidade: 0 });
  projeto = chaveLumaClipes(projeto, [video.clipeId], null);
  assert.equal(principal(projeto)[0].chave_luma, null);
  const titulo = adicionarTexto(projeto, ctx, 0, TEXTO_PADRAO);
  assert.throws(() => chaveLumaClipes(titulo.projeto, [titulo.clipeId], { tirar: "escuro", limiar: 0.1, suavidade: 0.1 }), /vídeos e imagens/);
});

test("cantos nos limites; zerados ou null, o campo some", () => {
  const ctx = contexto();
  const video = adicionarClipe(vazio(), ctx, "video10");
  let projeto = arredondarClipes(video.projeto, [video.clipeId], { raio: 0.9, borda: 0.4, cor: "#FF0000" });
  assert.deepEqual(principal(projeto)[0].cantos, { raio: 0.5, borda: 0.25, cor: "#ff0000" });
  projeto = arredondarClipes(projeto, [video.clipeId], { raio: 0, borda: 0, cor: "#ffffff" });
  assert.equal(principal(projeto)[0].cantos, null);
  assert.throws(() => arredondarClipes(projeto, [video.clipeId], { raio: 0.1, borda: 0, cor: "vermelho" }), /Cor/);
});

test("preencher a vaga troca a mídia do começo, encurta se ela for curta e a principal anda junto", () => {
  const ctx = contexto();
  let projeto = adicionarClipe(vazio(), ctx, "video10").projeto;
  projeto = adicionarClipe(projeto, ctx, "video10").projeto;
  const [primeiro, segundo] = principal(projeto);
  projeto = ajustarAudio(projeto, [primeiro.id], { voz_limpa: true });
  projeto = preencherVaga(projeto, ctx, primeiro.id, "video4");
  conferir(projeto);
  const [cena, depois] = principal(projeto);
  assert.deepEqual([cena.midia_id, cena.entrada, cena.duracao, cena.voz_limpa], ["video4", 0, 4 * S, false]);
  assert.equal(depois.id, segundo.id);
  assert.equal(depois.inicio, 4 * S, "a principal fecha o espaço");
  // Uma foto no lugar do vídeo: a duração da vaga fica
  projeto = preencherVaga(projeto, ctx, depois.id, "foto");
  assert.equal(principal(projeto)[1].duracao, 10 * S);
  assert.throws(() => preencherVaga(projeto, ctx, cena.id, "musica"), /vídeo ou uma imagem/);
  assert.throws(() => preencherVaga(projeto, ctx, "nao-existe", "video4"));
});

test("deslizar o conteúdo: o clipe fica no lugar e o trecho da mídia anda, preso ao que ela tem", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  const clipe = principal(projeto)[0];
  projeto = apararClipe(projeto, ctx, clipe.id, "inicio", 2 * S);
  // A principal encosta o clipe no começo: o fim em 4 s deixa o trecho de 2 a 6 s da mídia
  projeto = apararClipe(projeto, ctx, clipe.id, "fim", 4 * S);
  // Agora mostra de 2 a 6 s da mídia, no começo da linha
  assert.deepEqual([principal(projeto)[0].inicio, principal(projeto)[0].duracao, principal(projeto)[0].entrada], [0, 4 * S, 2 * S]);
  // Arrastar o conteúdo para a esquerda mostra o que vem depois
  projeto = deslizarConteudo(projeto, ctx, clipe.id, -3 * S);
  assert.deepEqual([principal(projeto)[0].inicio, principal(projeto)[0].duracao, principal(projeto)[0].entrada], [0, 4 * S, 5 * S]);
  // Para no fim da mídia (6 s de entrada, com 4 s de trecho num vídeo de 10 s)
  projeto = deslizarConteudo(projeto, ctx, clipe.id, -10 * S);
  assert.equal(principal(projeto)[0].entrada, 6 * S);
  assert.throws(() => deslizarConteudo(projeto, ctx, clipe.id, -S), /depois deste trecho/);
  // E no começo
  projeto = deslizarConteudo(projeto, ctx, clipe.id, 20 * S);
  assert.equal(principal(projeto)[0].entrada, 0);
  conferir(projeto);
  // Imagem não desliza
  ({ projeto } = adicionarClipe(projeto, ctx, "foto"));
  assert.throws(() => deslizarConteudo(projeto, ctx, principal(projeto)[1].id, S), ErroEdicao);
});

test("mover o corte: um clipe cresce o que o vizinho encolhe, e nada mais anda", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  ({ projeto } = adicionarClipe(projeto, ctx, "video10"));
  ({ projeto } = adicionarClipe(projeto, ctx, "video4"));
  const [a, b] = principal(projeto);
  // O primeiro só tem a mídia até 10 s; o segundo começa com a entrada em 0: aparo para haver folga
  projeto = apararClipe(projeto, ctx, a.id, "fim", 6 * S);
  projeto = apararClipe(projeto, ctx, b.id, "inicio", 9 * S);
  const antes = principal(projeto);
  assert.deepEqual(antes.map((c) => [c.inicio / S, c.duracao / S]), [[0, 6], [6, 7], [13, 4]]);
  assert.equal(antes[1].entrada, 3 * S);
  // O corte vai de 6 s para 8 s: a passa a mostrar 0 a 8 s; b começa 2 s depois, na mídia também
  projeto = moverCorte(projeto, ctx, a.id, 8 * S);
  const depois = principal(projeto);
  assert.deepEqual(depois.map((c) => [c.inicio / S, c.duracao / S]), [[0, 8], [8, 5], [13, 4]]);
  assert.equal(depois[1].entrada, 5 * S);
  // Para trás, b só volta até o começo da mídia dela (3 + 2 = 5 s antes)
  projeto = moverCorte(projeto, ctx, a.id, 0);
  assert.deepEqual(principal(projeto).map((c) => [c.inicio / S, c.duracao / S]), [[0, 3], [3, 10], [13, 4]]);
  assert.equal(principal(projeto)[1].entrada, 0);
  conferir(projeto);
  // Sem vizinho encostado não há corte
  assert.throws(() => moverCorte(projeto, ctx, principal(projeto)[2].id, 20 * S), /encostados/);
});

test("camada de ajuste: entra numa faixa de sobreposição nova, apara como imagem e não vai para a principal", () => {
  const ctx = contexto();
  let { projeto } = adicionarClipe(vazio(), ctx, "video10");
  const r = adicionarAjuste(projeto, ctx, 2 * S);
  projeto = r.projeto;
  const faixa = projeto.faixas.find((f) => f.clipes.some((c) => c.id === r.clipeId))!;
  assert.equal(faixa.tipo, "video");
  const ajuste = faixa.clipes[0];
  assert.equal(ajuste.ajuste, true);
  assert.equal(ajuste.midia_id, null);
  assert.equal(ajuste.inicio, 2 * S);
  // Estica sem limite de mídia
  projeto = apararClipe(projeto, ctx, ajuste.id, "fim", 30 * S);
  assert.equal(projeto.faixas.find((f) => f.id === faixa.id)!.clipes[0].duracao, 28 * S);
  // Na principal não entra
  assert.throws(() => moverClipe(projeto, ctx, ajuste.id, { faixaId: "principal", inicio: 0 }), ErroEdicao);
  conferir(projeto);
});

test("keyframes de volume: pôr, mexer no instante, aparar, restaurar a imagem e colar o som", () => {
  const ctx = contexto();
  let projeto = adicionarClipe(vazio(), ctx, "video10").projeto;
  const id = principal(projeto)[0].id;
  // Sem keyframes, o volume do cursor é o fixo
  projeto = ajustarAudio(projeto, [id], { volume: 0.5, tempo: 2 * S });
  assert.equal(principal(projeto)[0].volume, 0.5);

  // Dois pontos: 50% em 1 s e 200% em 3 s
  projeto = mudarKeyframe(projeto, id, "volume", 1 * S, "alternar");
  projeto = mudarKeyframe(projeto, id, "volume", 3 * S, "alternar");
  projeto = ajustarAudio(projeto, [id], { volume: 2, tempo: 3 * S });
  let clipe = principal(projeto)[0];
  assert.deepEqual(clipe.keyframes?.volume?.map((k) => [k.t / S, k.valor]), [[1, 0.5], [3, 2]]);
  assert.equal(clipe.volume, 0.5, "com keyframes, o fixo não muda");
  assert.ok(Math.abs(volumeNoTempo(clipe, 2 * S) - 1.25) < 1e-9);
  assert.equal(volumeNoTempo(clipe, 0), 0.5);
  assert.equal(volumeNoTempo(clipe, 9 * S), 2);

  // Aparar o começo: o volume segue o mesmo trecho da mídia
  const aparado = principal(apararClipe(projeto, ctx, id, "inicio", 1 * S))[0];
  assert.ok(Math.abs(volumeNoTempo(aparado, 1 * S) - 1.25) < 1e-9);

  // Restaurar a imagem não tira os keyframes do som
  const restaurado = principal(restaurarClipes(projeto, [id]))[0];
  assert.deepEqual(restaurado.keyframes, { volume: clipe.keyframes?.volume });

  // Colar a imagem de outro clipe mantém o volume; colar o som leva os pontos
  projeto = adicionarClipe(projeto, ctx, "video4").projeto;
  const outro = principal(projeto)[1];
  const comImagem = principal(colarAjustes(projeto, ctx, outro, [id], ["imagem"]).projeto)[0];
  assert.deepEqual(comImagem.keyframes?.volume, clipe.keyframes?.volume);
  const comSom = principal(colarAjustes(projeto, ctx, clipe, [outro.id], ["audio"]).projeto)[1];
  assert.deepEqual(comSom.keyframes?.volume, clipe.keyframes?.volume);

  // Tirar os dois: o volume fica no do último ponto tirado
  projeto = mudarKeyframe(projeto, id, "volume", 1 * S, "alternar");
  projeto = mudarKeyframe(projeto, id, "volume", 3 * S, "alternar");
  clipe = principal(projeto)[0];
  assert.equal(clipe.keyframes, null);
  assert.equal(clipe.volume, 2);

  // Nas faixas de áudio também (as outras propriedades não valem lá)
  const comMusica = adicionarClipe(projeto, ctx, "musica");
  const musica = comMusica.clipeId;
  const comPonto = mudarKeyframe(comMusica.projeto, musica, "volume", 1 * S, "alternar");
  assert.equal(comPonto.faixas.find((f) => f.tipo === "audio")?.clipes[0].keyframes?.volume?.length, 1);
  assert.throws(() => mudarKeyframe(comMusica.projeto, musica, "x", 1 * S, "alternar"), ErroEdicao);
});

test("separar o som: o áudio vai para uma faixa própria com o mesmo trecho e o vídeo fica mudo", () => {
  const ctx = contexto();
  let projeto = adicionarClipe(vazio(), ctx, "video10").projeto;
  projeto = adicionarClipe(projeto, ctx, "video4").projeto;
  const [primeiro, segundo] = principal(projeto);
  projeto = ajustarAudio(projeto, [primeiro.id], { volume: 1.5, fade_entrada: S });
  projeto = mudarVelocidade(projeto, segundo.id, 2);
  const resultado = separarSom(projeto, ctx, [primeiro.id, principal(projeto)[1].id]);
  conferir(resultado.projeto);
  const audios = resultado.projeto.faixas.filter((f) => f.tipo === "audio");
  assert.equal(audios.length, 1, "os dois cabem na mesma faixa");
  const [somA, somB] = audios[0].clipes;
  assert.deepEqual(resultado.novos, [somA.id, somB.id]);
  assert.deepEqual([somA.inicio, somA.duracao, somA.entrada, somA.volume, somA.fade_entrada], [0, 10 * S, 0, 1.5, S]);
  assert.deepEqual([somB.inicio, somB.duracao, somB.velocidade], [10 * S, 2 * S, 2]);
  assert.ok(principal(resultado.projeto).every((c) => c.som_separado));

  // Corte em L: o vídeo de 10 s aparado em 8 s; o som dele, separado, continua 1 s por cima do seguinte
  let curto = apararClipe(projeto, ctx, primeiro.id, "fim", 8 * S);
  const separado = separarSom(curto, ctx, [primeiro.id]);
  curto = apararClipe(separado.projeto, ctx, separado.novos[0], "fim", 9 * S);
  const somL = curto.faixas.find((f) => f.tipo === "audio")!.clipes[0];
  assert.deepEqual([somL.inicio, somL.duracao, principal(curto)[1].inicio], [0, 9 * S, 8 * S]);

  // Separar de novo não faz nada; devolver liga o som do vídeo
  assert.throws(() => separarSom(resultado.projeto, ctx, [primeiro.id]), ErroEdicao);
  assert.equal(principal(devolverSom(resultado.projeto, [primeiro.id]))[0].som_separado, false);
});

test("ajustar a música ao vídeo: pedaços encostados que acabam no fim da música, junto com o vídeo", () => {
  const ctx = contexto();
  let projeto = adicionarClipe(vazio(), ctx, "video10").projeto;
  const musica = adicionarClipe(projeto, ctx, "musica");
  projeto = ajustarAudio(musica.projeto, [musica.clipeId], { volume: 0.4, fade_entrada: S });
  const fortes = Array.from({ length: 15 }, (_, i) => i * 2);
  const { projeto: ajustado, novos } = ajustarMusicaAoVideo(projeto, ctx, musica.clipeId, fortes);
  conferir(ajustado);
  const pedacos = ajustado.faixas.find((f) => f.tipo === "audio")!.clipes;
  assert.deepEqual(novos, pedacos.map((c) => c.id));
  assert.equal(pedacos[0].id, musica.clipeId);
  assert.equal(pedacos.reduce((soma, c) => soma + c.duracao, 0), 10 * S, "acaba junto com o vídeo");
  const ultimo = pedacos[pedacos.length - 1];
  assert.equal(ultimo.entrada + ultimo.duracao, 30 * S, "no fim da música");
  assert.ok(pedacos.every((c, i) => i === 0 || c.inicio === fimDoClipe(pedacos[i - 1])), "encostados");
  assert.ok(pedacos.every((c) => c.volume === 0.4));
  assert.equal(pedacos[0].fade_entrada, S);
  assert.throws(() => ajustarMusicaAoVideo(ajustado, ctx, principal(ajustado)[0].id, fortes), ErroEdicao);
});

test("texto em arco: desliga o destaque e o letra a letra, e o letra a letra endireita o texto", () => {
  const ctx = contexto();
  const criado = adicionarTexto(vazio(), ctx, 0, { ...TEXTO_PADRAO, conteudo: "Oi gente", destaque: { modo: "karaoke", cor: "#ffd60a" } });
  let projeto = criado.projeto;
  const id = criado.clipeId;
  projeto = animarClipes(projeto, [id], { entrada: { tipo: "letras", duracao: S } });
  projeto = mudarTexto(projeto, [id], { curvatura: 0.4 });
  let clipe = projeto.faixas.find((f) => f.tipo === "texto")!.clipes[0];
  assert.equal(clipe.texto?.curvatura, 0.4);
  assert.equal(clipe.texto?.destaque, null, "o arco tira o destaque");
  assert.equal(clipe.animacao?.entrada.tipo, "nenhuma", "e o letra a letra");
  projeto = animarClipes(projeto, [id], { saida: { tipo: "palavras", duracao: S } });
  clipe = projeto.faixas.find((f) => f.tipo === "texto")!.clipes[0];
  assert.equal(clipe.texto?.curvatura, 0, "o palavra a palavra endireita");
  projeto = mudarTexto(projeto, [id], { curvatura: -0.3 });
  projeto = mudarTexto(projeto, [id], { destaque: { modo: "palavra", cor: "#ffffff" } });
  clipe = projeto.faixas.find((f) => f.tipo === "texto")!.clipes[0];
  assert.equal(clipe.texto?.curvatura, 0, "o destaque endireita");
});

test("congelar o quadro: divide o vídeo e põe a foto do instante entre as metades", () => {
  const ctx = contexto();
  let projeto = adicionarClipe(vazio(), ctx, "video10").projeto;
  const id = principal(projeto)[0].id;
  projeto = transformarClipes(projeto, [id], { escala: 1.5 });
  const { projeto: congelado, clipeId } = congelarQuadro(projeto, ctx, id, 4 * S, "foto", 3 * S);
  conferir(congelado);
  const [antes, foto, depois] = principal(congelado);
  assert.equal(foto.id, clipeId);
  assert.deepEqual([antes.inicio, antes.duracao], [0, 4 * S]);
  assert.deepEqual([foto.midia_id, foto.inicio, foto.duracao, foto.transformacao.escala], ["foto", 4 * S, 3 * S, 1.5]);
  assert.deepEqual([depois.inicio, depois.entrada, depois.duracao], [7 * S, 4 * S, 6 * S], "o resto do vídeo vem depois, empurrado");
  // No fim do clipe, a foto entra depois dele, sem dividir
  const noFim = congelarQuadro(projeto, ctx, id, 10 * S, "foto", 3 * S).projeto;
  assert.deepEqual(principal(noFim).map((c) => c.midia_id), ["video10", "foto"]);
  // Fora da principal, não
  const comFoto = adicionarClipe(projeto, ctx, "video4", { novaFaixa: true, faixaId: undefined, inicio: 0 });
  const sobreposto = comFoto.projeto.faixas.find((f) => f.tipo === "video")?.clipes[0];
  if (sobreposto) assert.throws(() => congelarQuadro(comFoto.projeto, ctx, sobreposto.id, S, "foto", 3 * S), ErroEdicao);
});

test("ao contrário: tira o que é do original, e ligar o que é do original desliga o ao contrário", () => {
  const ctx = contexto();
  let projeto = adicionarClipe(vazio(), ctx, "video10").projeto;
  const id = principal(projeto)[0].id;
  projeto = estabilizarClipes(projeto, ctx, [id], true);
  projeto = ajustarAudio(projeto, [id], { voz_limpa: true, tom: 3 });
  projeto = inverterClipes(projeto, ctx, [id], true);
  let clipe = principal(projeto)[0];
  assert.deepEqual([clipe.inverter, clipe.estabilizar, clipe.voz_limpa, clipe.tom], [true, false, false, 0]);
  projeto = estabilizarClipes(projeto, ctx, [id], true);
  clipe = principal(projeto)[0];
  assert.deepEqual([clipe.inverter, clipe.estabilizar], [false, true]);
  // Foto não toca ao contrário
  const comFoto = adicionarClipe(projeto, ctx, "foto").projeto;
  assert.throws(() => inverterClipes(comFoto, ctx, [principal(comFoto)[1].id], true), ErroEdicao);
});

test("câmera lenta suave: tira o que não combina e só vale dentro do trecho pronto", () => {
  const ctx = contexto();
  let projeto = adicionarClipe(vazio(), ctx, "video10").projeto;
  const id = principal(projeto)[0].id;
  projeto = inverterClipes(projeto, ctx, [id], true);
  projeto = fluidoNoClipe(projeto, ctx, id, { de: 0, ate: 3 });
  let clipe = principal(projeto)[0];
  assert.deepEqual([clipe.fluido, clipe.inverter], [{ de: 0, ate: 3 }, false]);
  projeto = estabilizarClipes(projeto, ctx, [id], true);
  clipe = principal(projeto)[0];
  assert.equal(clipe.fluido, null, "estabilizar desliga a câmera lenta suave");
  // O trecho pronto: o clipe de 10 s não cabe em 0–3 s; um de 2 s, a meia velocidade (1 s de mídia), cabe
  const midia = { arquivos: ["fluido_0_3000_proxy.mp4"], fluidos: { fluido_0_3000: { status: "pronta", de: 0, ate: 3, zero: 0 } } };
  assert.equal(zeroDoFluido({ ...clipe, fluido: { de: 0, ate: 3 } }, midia), null);
  assert.equal(zeroDoFluido({ ...clipe, fluido: { de: 0, ate: 3 }, entrada: S, duracao: 2 * S, velocidade: 0.5 }, midia), 0);
  assert.equal(zeroDoFluido({ ...clipe, fluido: { de: 0, ate: 3 }, entrada: S, duracao: 2 * S, velocidade: 0.5 }, { ...midia, arquivos: [] }), null);
});

test("marcadores: pôr no quadro do cursor, mudar, apagar e virar capítulos", () => {
  const ctx = contexto();
  let projeto = adicionarClipe(vazio(), ctx, "video10").projeto;
  const um = adicionarMarcador(projeto, ctx, 61 * S + 3);
  projeto = um.projeto;
  // No mesmo quadro, devolve o que já existe
  assert.equal(adicionarMarcador(projeto, ctx, 61 * S).id, um.id);
  projeto = adicionarMarcador(projeto, ctx, 0).projeto;
  assert.deepEqual(projeto.marcadores?.map((m) => [m.t, m.nome]), [[0, "Marcador 2"], [61 * S, "Marcador 1"]]);
  projeto = mudarMarcador(projeto, um.id, { nome: "  Dicas finais  ", cor: "#3D8BFF" });
  assert.equal(textoDosCapitulos(projeto.marcadores ?? []), "00:00 Marcador 2\n01:01 Dicas finais");
  assert.equal(projeto.marcadores?.[1].cor, "#3d8bff");
  projeto = apagarMarcador(projeto, um.id);
  assert.equal(projeto.marcadores?.length, 1);
  assert.throws(() => mudarMarcador(projeto, um.id, { nome: "x" }), ErroEdicao);
});
