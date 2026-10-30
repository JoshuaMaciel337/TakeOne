import assert from "node:assert/strict";
import { test } from "node:test";

import { executarComando } from "../projeto/comandos.ts";
import type { Contexto } from "../projeto/edicao.ts";
import type { Palavra } from "../projeto/fala.ts";
import { caixaDoClipe } from "../projeto/geometria.ts";
import type { Clipe, Projeto } from "../projeto/modelo.ts";
import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import {
  cenasDaPrincipal,
  divisoesNasTrocas,
  enquadramentoParado,
  foraDosTrechos,
  intervalosDoTrecho,
  janelaNoQuadro,
  layoutAutomatico,
  porTrechoNoCorte,
  preencherACena,
  tempoParaOTrecho,
  trechoDasPalavrasDoOriginal,
  trechoParaEstender,
  trechosNoCorte,
} from "./editorDoCorte.ts";
import { montarCorte } from "./montarCorte.ts";

const S = TICKS_POR_SEGUNDO;
const MIDIA = { largura: 1920, altura: 1080 };
const QUADRO = { largura: 9, altura: 16 };

function contexto(prefixo = "n"): Contexto {
  let n = 0;
  return {
    novoId: () => `${prefixo}${++n}`,
    midia: (id) => (id === "palestra" ? { duracao: 600 * S, video: true, audio: true } : id === "musica" ? { duracao: 50 * S, video: false, audio: true } : null),
  };
}

function vazio(): Projeto {
  return {
    id: "p",
    nome: "Corte",
    proporcao: "9:16",
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#000000" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
}

/** Palavras de 0,3 s a cada 0,4 s do instante `inicio` em diante, com uma pausa de 1,2 s depois de cada frase. */
function fala(inicio: number, fim: number): Palavra[] {
  const palavras: Palavra[] = [];
  let n = 0;
  for (let t = inicio; t + 0.3 <= fim; n++) {
    palavras.push({ texto: n % 6 === 5 ? `palavra${n}.` : `palavra${n}`, inicio: t, fim: t + 0.3 });
    t += n % 6 === 5 ? 1.6 : 0.4;
  }
  return palavras;
}

const PALAVRAS = fala(80, 260);

/** Um corte de dois trechos montado como no Clipar (com o título, as legendas e a limpeza das pausas). */
function corteMontado(rosto = [{ t: 100, x: 0.3, y: 0.4, a: 0.02 }]) {
  return montarCorte({
    projeto: vazio(),
    ctx: contexto(),
    midia: { id: "palestra", ...MIDIA },
    corte: {
      trechos: [
        { inicio: 100, fim: 112 },
        { inicio: 200, fim: 208 },
      ],
      titulo: "Um título",
      foco: [],
    },
    palavras: PALAVRAS,
    rosto,
  }).projeto;
}

const principalDe = (projeto: Projeto) => projeto.faixas.find((faixa) => faixa.tipo === "principal")!.clipes;
const legendasDe = (projeto: Projeto) => projeto.faixas.find((faixa) => faixa.tipo === "legenda")!.clipes;

test("as cenas: os pedaços de um trecho (a limpeza das pausas) ficam juntos, o pulo começa outra", () => {
  const projeto = corteMontado();
  const principal = principalDe(projeto);
  assert.ok(principal.length > 2, "a limpeza dividiu os trechos");
  const cenas = cenasDaPrincipal(principal);
  assert.equal(cenas.length, 2);
  assert.ok(Math.abs(cenas[0].de - 100) < 0.05 && cenas[1].de >= 200 - 0.05, JSON.stringify(cenas.map((c) => [c.de, c.ate])));
  assert.equal(cenas[0].clipeIds.length + cenas[1].clipeIds.length, principal.length);
  assert.equal(cenas[0].fim, cenas[1].inicio);
  // Uma troca de câmera num pulo da limpeza separa a cena em duas
  const pulo = principal.map((clipe) => ({ de: clipe.entrada / S, ate: clipe.entrada / S + clipe.duracao / S }))[1].de - 0.1;
  assert.equal(cenasDaPrincipal(principal, [pulo]).length, 3);
  // Uma troca no meio de um clipe pede uma divisão ali (e nada perto das pontas)
  const clipe = principal.find((c) => c.duracao > S)!;
  const meio = clipe.entrada / S + clipe.duracao / S / 2;
  assert.deepEqual(divisoesNasTrocas([clipe], [meio, clipe.entrada / S + 0.1]), [{ tempo: clipe.inicio + Math.round((clipe.duracao / S / 2) * S), clipeId: clipe.id }]);
});

test("layout automático: duas pessoas pelos dois grupos de rostos; tela e rosto pela proporção", () => {
  // A da esquerda é o rosto principal metade do tempo; a outra aparece como "outro" rosto
  const amostras = Array.from({ length: 20 }, (_, i) => ({
    t: 100 + i * 0.5,
    ...(i % 2 ? { x: 0.25, y: 0.42, a: 0.012 } : { x: 0.74, y: 0.47, a: 0.01 }),
    outros: [(i % 2 ? [0.74, 0.47, 0.01] : [0.25, 0.42, 0.012]) as [number, number, number]],
  }));
  const duas = layoutAutomatico("duas_pessoas", amostras, { de: 100, ate: 110 }, MIDIA, QUADRO);
  if (duas.tipo !== "duas_pessoas") throw new Error(duas.tipo);
  assert.equal(duas.divisao, 0.5);
  assert.ok(Math.abs(duas.quadros[0].x - 0.25) < 1e-9 && Math.abs(duas.quadros[1].x - 0.74) < 1e-9, JSON.stringify(duas.quadros));
  // O rosto um pouco acima do meio da região, com zoom para a cabeça e os ombros
  assert.ok(duas.quadros[0].y > 0.42 && duas.quadros[0].zoom > 1, JSON.stringify(duas.quadros[0]));
  // Fora do trecho, ou com uma pessoa só, os lugares comuns
  const sem = layoutAutomatico("duas_pessoas", amostras, { de: 300, ate: 310 }, MIDIA, QUADRO);
  assert.deepEqual(sem.tipo !== "caber" && sem.quadros.map((q) => q.x), [0.3, 0.7]);

  const tela = layoutAutomatico("tela_rosto", amostras.map((a) => ({ ...a, x: 0.85, y: 0.8, outros: undefined })), { de: 100, ate: 110 }, MIDIA, QUADRO);
  assert.ok(tela.tipo === "tela_rosto");
  // A imagem 16:9 inteira cabe na largura de um quadro 9:16 numa faixa de 31,6% da altura
  assert.ok(Math.abs(tela.divisao - 9 / (16 * (16 / 9))) < 1e-9, String(tela.divisao));
  assert.deepEqual(tela.quadros[0], { x: 0.5, y: 0.5, zoom: 1 });
  assert.equal(tela.quadros[1].x, 0.85);
  assert.deepEqual(layoutAutomatico("caber", [], { de: 0, ate: 1 }, MIDIA, QUADRO), { tipo: "caber", desfoque: 0.6 });
});

test("enquadramento parado: o ponto escolhido no meio do quadro, sem mostrar a borda", () => {
  const clipe = { recorte: { x: 0, y: 0, largura: 1, altura: 1 }, virar: null };
  const meio = enquadramentoParado(clipe, { x: 0.5, y: 0.5 }, 1, MIDIA, QUADRO);
  assert.equal(meio.x, 0);
  assert.ok(Math.abs(meio.escala - (16 / 9) ** 2) < 1e-9);
  // Um ponto na borda fica preso: a caixa encosta na borda do quadro
  const borda = enquadramentoParado(clipe, { x: 0, y: 0.5 }, 1, MIDIA, QUADRO);
  const caixa = caixaDoClipe({ ...borda, rotacao: 0, opacidade: 1 }, clipe.recorte, MIDIA, QUADRO);
  assert.ok(Math.abs(caixa.cx - caixa.largura / 2) < 1e-9, "a borda esquerda da imagem na borda do quadro");
  // A janela que o painel desenha volta ao ponto: o meio dela é o ponto escolhido
  const ponto = { x: 0.3, y: 0.5 };
  const parado = enquadramentoParado(clipe, ponto, 1.5, MIDIA, QUADRO);
  const janela = janelaNoQuadro({ inicio: 0, duracao: S, transformacao: { ...parado, rotacao: 0, opacidade: 1 }, recorte: clipe.recorte } as unknown as Clipe, 0, MIDIA, QUADRO);
  assert.ok(Math.abs(janela.x + janela.largura / 2 - 0.3) < 1e-9 && Math.abs(janela.y + janela.altura / 2 - 0.5) < 1e-9, JSON.stringify(janela));
  // Virada na horizontal, a janela continua no ponto da mídia como ela é
  const virado = { ...clipe, virar: { horizontal: true, vertical: false } };
  const paradoVirado = enquadramentoParado(virado, ponto, 1.5, MIDIA, QUADRO);
  const janelaVirada = janelaNoQuadro({ inicio: 0, duracao: S, transformacao: { ...paradoVirado, rotacao: 0, opacidade: 1 }, recorte: clipe.recorte, virar: virado.virar } as unknown as Clipe, 0, MIDIA, QUADRO);
  assert.ok(Math.abs(janelaVirada.x + janelaVirada.largura / 2 - 0.3) < 1e-9);
});

test("os trechos do original no corte, o que falta e onde entra", () => {
  const principal = principalDe(corteMontado());
  const trechos = trechosNoCorte(principal, "palestra");
  // As pausas tiradas ficam fora (elas não têm palavras)
  assert.equal(trechos.length, principal.length);
  assert.ok(trechos[0].de === 100 && trechos.at(-1)!.ate <= 208);
  assert.deepEqual(foraDosTrechos(90, 100.2, trechos), [{ de: 90, ate: 100 }]);
  assert.deepEqual(foraDosTrechos(102, 103, trechos), []);
  assert.equal(tempoParaOTrecho(principal, "palestra", 50), 0);
  assert.equal(tempoParaOTrecho(principal, "palestra", 150), cenasDaPrincipal(principal)[0].fim);
  assert.equal(tempoParaOTrecho(principal, "palestra", 300), principal.at(-1)!.inicio + principal.at(-1)!.duracao);
  assert.deepEqual(trechoParaEstender(principal, "palestra", "comeco", 600), { de: 95, ate: 100 });
  assert.equal(trechoParaEstender(principal, "palestra", "fim", trechos.at(-1)!.ate), null, "o original acabou");
});

test("estender o começo: a parte nova entra antes, com o enquadramento e as legendas; o título fica no zero", () => {
  const ctx = contexto("x");
  let projeto = corteMontado();
  // Um logo do começo ao fim e uma música até o fim, como os extras dos modelos
  const fim = projeto.duracao;
  const logo: Clipe = { ...principalDe(projeto)[0], id: "logo", midia_id: "palestra", inicio: 0, duracao: fim, keyframes: null };
  const musica: Clipe = { ...principalDe(projeto)[0], id: "musica", midia_id: "musica", inicio: 0, duracao: fim, entrada: 0, keyframes: null };
  projeto = {
    ...projeto,
    faixas: [
      { id: "logo", tipo: "video", oculta: false, muda: false, travada: false, clipes: [logo] },
      ...projeto.faixas,
      { id: "som", tipo: "audio", oculta: false, muda: false, travada: false, clipes: [musica] },
    ],
  };
  const legendasAntes = legendasDe(projeto);
  const primeiraAntes = principalDe(projeto)[0];
  const rosto = [{ t: 96, x: 0.3, y: 0.4, a: 0.02 }];
  const { projeto: estendido, clipeId } = porTrechoNoCorte(projeto, ctx, { midiaId: "palestra", de: 95, ate: 100, palavras: PALAVRAS, rosto, midia: MIDIA });
  const principal = principalDe(estendido);
  const novo = principal.find((clipe) => clipe.id === clipeId)!;
  assert.equal(novo.inicio, 0);
  assert.equal(novo.entrada, 95 * S);
  const mais = novo.duracao;
  assert.equal(mais, 5 * S);
  assert.equal(principal.find((clipe) => clipe.id === primeiraAntes.id)!.inicio, mais);
  // O enquadramento da vizinha: cobre o quadro, e o rosto (à esquerda) puxa a imagem para a direita
  assert.ok(novo.transformacao.escala > 3 && novo.transformacao.x > 0, JSON.stringify(novo.transformacao));
  // O título continua no zero; o logo cobre tudo; a música (que acaba em 50 s) cresce se dá
  const titulo = estendido.faixas.find((faixa) => faixa.tipo === "texto")!.clipes[0];
  assert.equal(titulo.inicio, 0);
  const logoDepois = estendido.faixas.find((faixa) => faixa.id === "logo")!.clipes[0];
  assert.deepEqual([logoDepois.inicio, logoDepois.duracao], [0, fim + mais]);
  const musicaDepois = estendido.faixas.find((faixa) => faixa.id === "som")!.clipes[0];
  assert.deepEqual([musicaDepois.inicio, musicaDepois.duracao], [0, fim + mais]);
  // As legendas de antes andaram junto com a fala, e as da parte nova entraram antes delas, no mesmo estilo
  const legendas = legendasDe(estendido);
  assert.equal(legendas.find((clipe) => clipe.id === legendasAntes[0].id)!.inicio, legendasAntes[0].inicio + mais);
  const novas = legendas.filter((clipe) => !legendasAntes.some((antes) => antes.id === clipe.id));
  assert.ok(novas.length >= 1 && novas.every((clipe) => clipe.inicio + clipe.duracao <= mais), JSON.stringify(novas.map((c) => [c.inicio, c.duracao])));
  assert.equal(novas[0].texto!.fonte, legendasAntes[0].texto!.fonte);
  assert.deepEqual(novas[0].transformacao, legendasAntes[0].transformacao);
  assert.ok(novas[0].texto!.tempos?.every((t) => t >= 0));
});

test("estender o fim: a parte nova entra no fim e o que ia até o fim vai junto", () => {
  const ctx = contexto("x");
  let projeto = corteMontado([]);
  const fim = projeto.duracao;
  const chamada: Clipe = { ...principalDe(projeto)[0], id: "chamada", midia_id: "palestra", inicio: fim - 3 * S, duracao: 3 * S, keyframes: null };
  projeto = { ...projeto, faixas: [{ id: "cta", tipo: "video", oculta: false, muda: false, travada: false, clipes: [chamada] }, ...projeto.faixas] };
  const trecho = trechoParaEstender(principalDe(projeto), "palestra", "fim", 600)!;
  const { projeto: estendido, clipeId } = porTrechoNoCorte(projeto, ctx, { midiaId: "palestra", ...trecho, palavras: PALAVRAS, rosto: [], midia: MIDIA });
  const novo = principalDe(estendido).find((clipe) => clipe.id === clipeId)!;
  assert.equal(novo.inicio, fim);
  // Sem rosto, o enquadramento parado da vizinha (cobrindo o quadro, no meio)
  const vizinha = principalDe(projeto).at(-1)!;
  assert.equal(novo.transformacao.escala, vizinha.transformacao.escala);
  const chamadaDepois = estendido.faixas.find((faixa) => faixa.id === "cta")!.clipes[0];
  assert.equal(chamadaDepois.inicio, fim - 3 * S + novo.duracao);
  assert.ok(legendasDe(estendido).length > legendasDe(projeto).length);
});

test("tirar do corte: os intervalos da linha que mostram o trecho do original", () => {
  const ctx = contexto("x");
  const projeto = corteMontado();
  const principal = principalDe(projeto);
  const intervalos = intervalosDoTrecho(principal, "palestra", 102, 103.5);
  assert.equal(intervalos.length, 1);
  assert.equal(intervalos[0].fim - intervalos[0].inicio, 1.5 * S);
  // A sobra de 0,03 s até o fim do clipe sai junto
  assert.equal(intervalosDoTrecho(principal, "palestra", 102, 104)[0].fim, principal.find((c) => c.entrada / S > 101 && c.entrada / S < 102)!.inicio + principal.find((c) => c.entrada / S > 101 && c.entrada / S < 102)!.duracao);
  const cortado = executarComando(projeto, { comando: "linha.removerIntervalos", parametros: { intervalos } }, ctx).projeto;
  assert.equal(cortado.duracao, projeto.duracao - 1.5 * S);
  assert.deepEqual(foraDosTrechos(102.2, 103.3, trechosNoCorte(principalDe(cortado), "palestra")), [{ de: 102.2, ate: 103.3 }]);
});

test("pôr e tirar as mesmas palavras do original volta ao corte de antes, sem sobra", () => {
  const ctx = contexto("x");
  const projeto = corteMontado();
  const principal = principalDe(projeto);
  // As quatro palavras logo depois do fim do primeiro trecho (112 s)
  const depois = PALAVRAS.findIndex((p) => p.inicio >= 112);
  const trecho = trechoDasPalavrasDoOriginal(PALAVRAS, depois, depois + 3);
  assert.ok(trecho.de >= PALAVRAS[depois - 1].fim && trecho.ate <= PALAVRAS[depois + 4].inicio);
  const faltam = foraDosTrechos(trecho.de, trecho.ate, trechosNoCorte(principal, "palestra"));
  let atual = projeto;
  for (const pedaco of faltam) atual = porTrechoNoCorte(atual, ctx, { midiaId: "palestra", ...pedaco, palavras: PALAVRAS, rosto: [], midia: MIDIA }).projeto;
  assert.ok(atual.duracao > projeto.duracao);
  const intervalos = intervalosDoTrecho(principalDe(atual), "palestra", trecho.de, trecho.ate);
  const tirado = executarComando(atual, { comando: "linha.removerIntervalos", parametros: { intervalos } }, ctx).projeto;
  assert.deepEqual(
    principalDe(tirado).map((c) => [c.entrada, c.duracao]),
    principal.map((c) => [c.entrada, c.duracao]),
  );
});

test("com o layout, a parte nova herda o layout e também o enquadramento; o preencher cobre o quadro", () => {
  const ctx = contexto("x");
  const montado = corteMontado();
  const ids = principalDe(montado).map((clipe) => clipe.id);
  const layout = { tipo: "duas_pessoas" as const, divisao: 0.5, quadros: [{ x: 0.3, y: 0.4, zoom: 1.4 }, { x: 0.7, y: 0.4, zoom: 1.4 }] as [never, never] };
  const comLayout = executarComando(montado, { comando: "clipe.layout", parametros: { clipeIds: ids, layout } }, ctx).projeto;
  const { projeto, clipeId } = porTrechoNoCorte(comLayout, ctx, { midiaId: "palestra", de: 95, ate: 100, palavras: PALAVRAS, rosto: [{ t: 96, x: 0.3, y: 0.4, a: 0.02 }], midia: MIDIA });
  const novo = principalDe(projeto).find((clipe) => clipe.id === clipeId)!;
  assert.deepEqual(novo.layout, principalDe(comLayout)[0].layout);
  assert.ok(novo.transformacao.escala > 3, "guarda o enquadramento para quando voltar ao preencher");
  // Um clipe que não cobre o quadro (escala 1) passa a cobrir; os outros ficam como estão
  const semEnquadrar = { ...projeto, faixas: projeto.faixas.map((f) => (f.tipo === "principal" ? { ...f, clipes: f.clipes.map((c) => (c.id === clipeId ? { ...c, transformacao: { ...c.transformacao, escala: 1, x: 0 }, keyframes: null } : c)) } : f)) };
  const { projeto: preenchido, seguiu } = preencherACena(semEnquadrar, ctx, principalDe(semEnquadrar).map((c) => c.id), [{ t: 96, x: 0.3, y: 0.4, a: 0.02 }], MIDIA);
  assert.ok(seguiu);
  assert.ok(principalDe(preenchido).every((clipe) => !clipe.layout && clipe.transformacao.escala > 3));
  const outro = principalDe(semEnquadrar).find((c) => c.id !== clipeId)!;
  assert.deepEqual(principalDe(preenchido).find((c) => c.id === outro.id)!.transformacao, outro.transformacao);
});
