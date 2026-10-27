import assert from "node:assert/strict";
import { test } from "node:test";

import { executarComando } from "../projeto/comandos.ts";
import type { Contexto } from "../projeto/edicao.ts";
import { falaDosClipes, type Palavra, palavrasDaLinha } from "../projeto/fala.ts";
import type { Projeto } from "../projeto/modelo.ts";
import { palavrasDoTexto } from "../projeto/texto.ts";
import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { montarCorte, OPCOES_DA_MONTAGEM } from "./montarCorte.ts";
import {
  aplicarPlano,
  type DadosDoPlano,
  depoisDosCortes,
  descreverPlano,
  estadoDoProjeto,
  frasesDaLinha,
  opcoesDoPlano,
  type PlanoDaEdicao,
} from "./pedidoDeEdicao.ts";

const S = TICKS_POR_SEGUNDO;

function contexto(): Contexto {
  let n = 0;
  const midias: Record<string, { duracao: number; video: boolean; audio: boolean }> = {
    palestra: { duracao: 600 * S, video: true, audio: true },
    musica: { duracao: 120 * S, video: false, audio: true },
  };
  return { novoId: () => `n${++n}`, midia: (id) => midias[id] ?? null };
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

const FRASES = [
  "Eu guardava dez reais por dia.",
  "Em um ano tinha o suficiente para recomeçar.",
  "O segredo não é a força de vontade.",
  "É o ambiente que você monta em volta do hábito.",
  "Quando o ambiente ajuda, o hábito fica fácil.",
];

/** As frases em palavras de 0,3 s a cada 0,4 s; depois da segunda, uma pausa de 1,5 s. */
function fala(): Palavra[] {
  const palavras: Palavra[] = [];
  let t = 100;
  FRASES.forEach((frase, i) => {
    for (const texto of frase.split(" ")) {
      palavras.push({ texto, inicio: t, fim: t + 0.3 });
      t += 0.4;
    }
    t += i === 1 ? 1.5 : 0.3;
  });
  return palavras;
}

const PLANO_NEUTRO: PlanoDaEdicao = {
  resumo: "",
  legenda: { acao: "manter", estilo: "manter", tamanho: "manter", cor: "manter", posicao: "manter", caixa_alta: "manter" },
  enfase: { acao: "manter", cor: "manter" },
  titulo: { acao: "manter", texto: "" },
  zoom: { acao: "manter", palavras: [], frases: [] },
  pausas: "manter",
  cortar_frases: [],
  formato: "manter",
  enquadrar: "manter",
  musica: "manter",
  pergunta: { texto: "", opcoes: [] },
  nao_deu: [],
};
const plano = (parcial: Partial<PlanoDaEdicao>): PlanoDaEdicao => ({ ...PLANO_NEUTRO, ...parcial });

/** O corte montado sem limpar as pausas (para o pedido tirar), com legendas, título e ênfase em "dez". */
function corteMontado() {
  const palavras = fala();
  const ctx = contexto();
  const { projeto } = montarCorte({
    projeto: vazio(),
    ctx,
    midia: { id: "palestra", largura: 1920, altura: 1080 },
    corte: { trechos: [{ inicio: 100, fim: palavras.at(-1)!.fim + 0.2 }], titulo: "O segredo do hábito é o ambiente", foco: ["ambiente"] },
    palavras,
    rosto: [],
    enfase: [palavras[2].inicio],
    opcoes: { ...OPCOES_DA_MONTAGEM, limpar: false },
  });
  const mapa = new Map([["palestra", palavras]]);
  const principal = projeto.faixas.find((f) => f.tipo === "principal")!.clipes;
  const frases = frasesDaLinha(palavrasDaLinha(falaDosClipes(principal, mapa)));
  const dados: DadosDoPlano = {
    ctx,
    palavras: mapa,
    frases,
    tamanhos: new Map([["palestra", { largura: 1920, altura: 1080 }]]),
    rostos: new Map(),
    corDaMarca: "#123456",
    tituloPadrao: { texto: "O segredo do hábito é o ambiente", foco: ["ambiente"] },
  };
  return { projeto, dados, palavras };
}

const legendasDe = (projeto: Projeto) => projeto.faixas.filter((f) => f.tipo === "legenda").flatMap((f) => f.clipes);

test("as frases da linha fecham na pontuação e as contas de tempo andam com os cortes", () => {
  const { dados } = corteMontado();
  assert.deepEqual(dados.frases.map((f) => f.texto), FRASES);
  assert.equal(dados.frases[1].n, 1);
  const cortes = [{ inicio: 2 * S, fim: 3 * S }, { inicio: 5 * S, fim: 6 * S }];
  assert.deepEqual([1, 2.5, 4, 5.5, 7].map((t) => depoisDosCortes(t * S, cortes) / S), [1, 2, 3, 4, 5]);
});

test("legendas maiores, amarelas e no alto são refeitas pela fala, com a ênfase de antes", () => {
  const { projeto, dados } = corteMontado();
  const antes = legendasDe(projeto);
  assert.ok(antes[0].texto!.palavras_chave?.length, "a montagem pintou o 'dez'");
  const { projeto: novo, feitos, naoDeu } = aplicarPlano(
    projeto,
    plano({ legenda: { ...PLANO_NEUTRO.legenda, acao: "mudar", tamanho: "maior", cor: "amarelo", posicao: "alto" } }),
    dados,
  );
  const depois = legendasDe(novo);
  assert.ok(Math.abs(depois[0].texto!.tamanho - antes[0].texto!.tamanho * 1.3) < 1e-9);
  assert.equal(depois[0].texto!.cor, "#ffd60a");
  assert.ok(depois.every((clipe) => clipe.transformacao.y === -0.28));
  // A ênfase continua no "dez", achada pelo instante, mesmo com as linhas quebradas de outro jeito
  const comDez = depois.find((clipe) => palavrasDoTexto(clipe.texto!.conteudo).includes("dez"))!;
  assert.deepEqual(comDez.texto!.palavras_chave, [palavrasDoTexto(comDez.texto!.conteudo).indexOf("dez")]);
  assert.deepEqual(feitos, ["legendas refeitas no estilo pedido", "legendas no alto"]);
  assert.deepEqual(naoDeu, []);
});

test("cortar uma frase, tirar as pausas, trocar o título e dar zoom numa frase depois do corte", () => {
  const { projeto, dados } = corteMontado();
  const { projeto: novo, feitos, naoDeu } = aplicarPlano(
    projeto,
    plano({
      cortar_frases: [0],
      pausas: "tirar",
      titulo: { acao: "trocar", texto: "Dez reais por dia" },
      zoom: { acao: "por", palavras: [], frases: [3] },
    }),
    dados,
  );
  // A primeira frase (6 palavras, 2,4 s com a pausa) e a pausa de 1,5 s saíram
  assert.ok(projeto.duracao - novo.duracao > 3.5 * S && projeto.duracao - novo.duracao < 4.3 * S, `${(projeto.duracao - novo.duracao) / S} s`);
  assert.ok(!legendasDe(novo).some((clipe) => clipe.texto!.conteudo.includes("guardava")));
  assert.equal(novo.faixas.find((f) => f.tipo === "texto")!.clipes[0].texto!.conteudo, "DEZ REAIS POR\nDIA");
  // O zoom da frase 3 caiu onde ela está na linha nova
  const principal = novo.faixas.find((f) => f.tipo === "principal")!.clipes;
  const zoom = principal.flatMap((clipe) => (clipe.keyframes?.escala ?? []).map((k) => clipe.inicio + k.t));
  // A frase 3 na linha nova: depois da frase 0 e da pausa de 1,5 s tiradas
  const frase3 = palavrasDaLinha(falaDosClipes(principal, dados.palavras)).find((p) => p.texto === "É")!.inicio;
  assert.ok(zoom.length >= 3 && Math.abs(zoom[0] - frase3) < 1 * S, `${zoom.map((t) => t / S)} contra ${frase3 / S}`);
  assert.deepEqual(feitos, ["1 frase cortada", "1 pausa tirada", "título trocado", "1 zoom"]);
  assert.deepEqual(naoDeu, []);
});

test("tirar o título, as legendas e os zooms; o que não existe vai para o que não deu", () => {
  const { projeto, dados } = corteMontado();
  const comZoom = aplicarPlano(projeto, plano({ zoom: { acao: "por", palavras: ["ambiente"], frases: [] } }), dados).projeto;
  assert.ok(estadoDoProjeto(comZoom).zooms);
  const { projeto: novo, feitos, naoDeu } = aplicarPlano(
    comZoom,
    plano({ titulo: { acao: "tirar", texto: "" }, legenda: { ...PLANO_NEUTRO.legenda, acao: "tirar" }, zoom: { acao: "tirar", palavras: [], frases: [] }, musica: "abaixar", nao_deu: ["pôr um meme"] }),
    dados,
  );
  assert.deepEqual(estadoDoProjeto(novo), { formato: "9:16", legendas: false, titulo: null, zooms: false, musica: false });
  assert.deepEqual(feitos, ["legendas tiradas", "título tirado", "zooms tirados"]);
  assert.deepEqual(naoDeu, ["pôr um meme", "a música: o vídeo não tem música"]);
});

test("abaixar a música, mudar o formato com a imagem inteira e pôr o título padrão", () => {
  const { projeto, dados } = corteMontado();
  const semTitulo = aplicarPlano(projeto, plano({ titulo: { acao: "tirar", texto: "" } }), dados).projeto;
  const comMusica = executarComando(semTitulo, { comando: "clipe.adicionar", parametros: { midiaId: "musica", inicio: 0 } }, dados.ctx).projeto;
  const volume = comMusica.faixas.find((f) => f.tipo === "audio")!.clipes[0].volume;
  const { projeto: novo, feitos } = aplicarPlano(comMusica, plano({ musica: "abaixar", formato: "16:9", enquadrar: "inteiro", titulo: { acao: "por", texto: "" } }), dados);
  assert.equal(novo.proporcao, "16:9");
  assert.ok(Math.abs(novo.faixas.find((f) => f.tipo === "audio")!.clipes[0].volume - volume * 0.4) < 1e-9);
  assert.ok(novo.faixas.find((f) => f.tipo === "principal")!.clipes.every((clipe) => clipe.transformacao.escala === 1));
  assert.equal(estadoDoProjeto(novo).titulo, "O SEGREDO DO HÁBITO É O AMBIENTE");
  assert.deepEqual(feitos, ["formato 16:9", "a imagem inteira", "título", "música mais baixa"]);
});

test("o plano da clipagem vira as opções da montagem, e o resumo para conferir", () => {
  const p = plano({
    legenda: { ...PLANO_NEUTRO.legenda, acao: "mudar", estilo: "karaoke", tamanho: "bem_maior", cor: "marca", posicao: "meio" },
    enfase: { acao: "por", cor: "verde" },
    titulo: { acao: "tirar", texto: "" },
    zoom: { acao: "por", palavras: ["dinheiro"], frases: [] },
    enquadrar: "centro",
  });
  const opcoes = opcoesDoPlano(p, { ...OPCOES_DA_MONTAGEM, limpar: false }, "#123456");
  assert.deepEqual(opcoes, {
    ...OPCOES_DA_MONTAGEM,
    limpar: false,
    legenda: "karaoke",
    corDeDestaque: "#2ee6a6",
    titulo: false,
    zooms: true,
    palavrasDeZoom: ["dinheiro"],
    enquadrar: "centro",
    ajusteDaLegenda: { tamanho: "bem_maior", cor: "#123456", posicao: "meio" },
  });
  assert.equal(opcoesDoPlano(null, OPCOES_DA_MONTAGEM, null), OPCOES_DA_MONTAGEM);
  assert.equal(opcoesDoPlano(plano({ legenda: { ...PLANO_NEUTRO.legenda, acao: "tirar" } }), OPCOES_DA_MONTAGEM, null).legenda, null);
  assert.deepEqual(descreverPlano(p), [
    "Legendas: estilo Karaokê, bem maiores, na cor da marca, no meio",
    "Palavras de ênfase em verde",
    "Tirar o título",
    'Zoom quando a fala diz "dinheiro"',
    "Enquadrar pelo meio",
  ]);
});
