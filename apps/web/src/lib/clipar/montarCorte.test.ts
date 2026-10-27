import assert from "node:assert/strict";
import { test } from "node:test";

import type { Contexto } from "../projeto/edicao.ts";
import type { Palavra } from "../projeto/fala.ts";
import type { Projeto } from "../projeto/modelo.ts";
import { palavrasDoTexto } from "../projeto/texto.ts";
import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { linhasDoTitulo, montarCorte, OPCOES_DA_MONTAGEM, palavrasDeFoco, zoomsNasPalavrasDeFoco } from "./montarCorte.ts";

const S = TICKS_POR_SEGUNDO;

function contexto(): Contexto {
  let n = 0;
  return { novoId: () => `n${++n}`, midia: (id) => (id === "palestra" ? { duracao: 600 * S, video: true, audio: true } : null) };
}

function vazio(proporcao: Projeto["proporcao"] = "9:16"): Projeto {
  return {
    id: "p",
    nome: "Corte",
    proporcao,
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#000000" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
}

/** Frases de palavras de 0,3 s a cada 0,4 s, com uma pausa de `pausa` segundos entre elas. */
function fala(frases: string[], inicio: number, pausa = 0.3): Palavra[] {
  const palavras: Palavra[] = [];
  let t = inicio;
  for (const frase of frases) {
    for (const texto of frase.split(" ")) {
      palavras.push({ texto, inicio: t, fim: t + 0.3 });
      t += 0.4;
    }
    t += pausa;
  }
  return palavras;
}

const FRASES = [
  "Eu guardava dez reais por dia.",
  "Em um ano tinha o suficiente para recomeçar.",
  "O segredo não é a força de vontade.",
  "É o ambiente que você monta em volta do hábito.",
  "Quando o ambiente ajuda, o hábito fica fácil.",
];

test("o título quebra em linhas que cabem e as palavras de foco viram números", () => {
  assert.deepEqual(linhasDoTitulo("O PODER DOS MINI-HÁBITOS NO SEU DIA", 14, 3), ["O PODER DOS", "MINI-HÁBITOS", "NO SEU DIA"]);
  assert.equal(linhasDoTitulo("PALAVRAGIGANTESCADEMAIS", 10, 3), null);
  assert.equal(linhasDoTitulo("UM DOIS TRES QUATRO CINCO SEIS", 5, 3), null);
  assert.deepEqual(palavrasDeFoco("O PODER DOS\nMINI-HÁBITOS", ["mini-hábitos", "poder"]), [1, 3]);
  assert.deepEqual(palavrasDeFoco("Guarde R$ 10", ["R$ 10"]), [1, 2]);
});

test("os zooms caem nas palavras de foco, longe do título e um do outro", () => {
  const palavras = ["hábito", "x", "hábito", "y", "hábito", "z", "hábito", "w", "hábito"].map((texto, i) => ({ texto, inicio: i * 3 * S, fim: (i * 3 + 0.4) * S }));
  // O de 0 s fica de fora (o título), o de 3 s fica, o de 6 s está perto demais, e no máximo 3
  assert.deepEqual(zoomsNasPalavrasDeFoco(palavras, ["Hábito"]).map((z) => z.inicio / S), [6, 12, 18]);
  assert.deepEqual(zoomsNasPalavrasDeFoco(palavras, ["de"]), [], "palavras curtas não viram zoom");
});

test("o corte montado: os trechos, o enquadramento, a limpeza, as legendas, o título e os zooms", () => {
  // Um corte de dois trechos; no primeiro, uma pausa de 1,5 s entre as frases 2 e 3
  const primeiro = fala(FRASES.slice(0, 3), 100, 0.3);
  const pausado = primeiro.map((p, i) => (i >= 13 ? { ...p, inicio: p.inicio + 1.5, fim: p.fim + 1.5 } : p));
  const segundo = fala(FRASES.slice(3), 200);
  const palavras = [...pausado, ...segundo];
  const corte = {
    trechos: [
      { inicio: 100, fim: pausado.at(-1)!.fim + 0.2 },
      { inicio: 200, fim: segundo.at(-1)!.fim + 0.2 },
    ],
    titulo: "O segredo do hábito é o ambiente",
    foco: ["ambiente"],
  };
  const rosto = [0, 2, 4, 6].map((t) => ({ t: 100 + t, x: 0.7, y: 0.4, a: 0.02 }));
  const { projeto, feitos } = montarCorte({
    projeto: vazio(),
    ctx: contexto(),
    midia: { id: "palestra", largura: 1920, altura: 1080 },
    corte,
    palavras,
    rosto,
    // "dez", a terceira palavra, e "ambiente", no segundo trecho
    enfase: [pausado[2].inicio, segundo[2].inicio],
  });
  const principal = projeto.faixas.find((f) => f.tipo === "principal")!.clipes;
  // A pausa saiu: o primeiro trecho virou dois clipes, e o segundo trecho é o terceiro clipe
  assert.equal(principal.length, 3);
  assert.equal(principal[0].entrada, 100 * S);
  const total = (corte.trechos[0].fim - corte.trechos[0].inicio + corte.trechos[1].fim - corte.trechos[1].inicio) * S;
  assert.ok(projeto.duracao < total - 1.2 * S && projeto.duracao > total - 2 * S, `${projeto.duracao / S} s`);
  // Deitado num quadro em pé: o clipe cobre o quadro e o rosto, à direita, puxa a imagem para a esquerda
  assert.ok(principal[0].transformacao.escala > 3 && principal[0].transformacao.x < 0, JSON.stringify(principal[0].transformacao));
  assert.ok(principal[2].transformacao.escala > 3 && principal[2].transformacao.x === 0, "sem rosto no trecho, no meio");

  const legendas = projeto.faixas.find((f) => f.tipo === "legenda")!.clipes;
  assert.ok(legendas.length >= 5);
  // No 9:16, a legenda quebra em duas linhas; as palavras de ênfase são achadas pelo tempo
  assert.equal(legendas[0].texto!.conteudo, "Eu guardava dez\nreais por dia.");
  assert.deepEqual(legendas[0].texto!.palavras_chave, [2]);
  const comAmbiente = legendas.find((legenda) => legenda.texto!.conteudo.includes("ambiente que"))!;
  assert.deepEqual(comAmbiente.texto!.palavras_chave, [palavrasDoTexto(comAmbiente.texto!.conteudo).indexOf("ambiente")]);
  assert.equal(legendas.filter((legenda) => legenda.texto!.palavras_chave).length, 2);
  assert.equal(legendas[0].texto!.cor_chave, OPCOES_DA_MONTAGEM.corDeDestaque);
  assert.ok(legendas[0].texto!.destaque, "o estilo padrão é a palavra falada");

  const titulo = projeto.faixas.find((f) => f.tipo === "texto")!.clipes[0];
  assert.equal(titulo.inicio, 0);
  assert.ok(titulo.texto!.conteudo.includes("\n"), "o título quebra em linhas no 9:16");
  assert.deepEqual(titulo.texto!.palavras_chave, [6]);
  assert.equal(titulo.animacao?.entrada.tipo, "palavras");
  assert.ok(titulo.transformacao.y < 0);

  // "ambiente" é dita duas vezes no segundo trecho, a menos de 6 s uma da outra: um zoom só
  assert.ok(feitos.includes("1 zoom"), feitos.join(", "));
  assert.ok(feitos.includes("título") && feitos.includes("enquadrado no rosto"));
});

test("sem legendas, título nem limpeza, só os trechos enquadrados", () => {
  const palavras = fala(FRASES, 10);
  const { projeto, feitos } = montarCorte({
    projeto: vazio("16:9"),
    ctx: contexto(),
    midia: { id: "palestra", largura: 1920, altura: 1080 },
    corte: { trechos: [{ inicio: 10, fim: 40 }], titulo: "Um título", foco: [] },
    palavras,
    rosto: [],
    opcoes: { ...OPCOES_DA_MONTAGEM, limpar: false, legenda: null, titulo: false, zooms: false },
  });
  assert.equal(projeto.faixas.length, 1);
  assert.equal(projeto.duracao, 30 * S);
  // No mesmo formato da mídia, o clipe já cobre o quadro: nada a reenquadrar
  assert.equal(projeto.faixas[0].clipes[0].transformacao.escala, 1);
  assert.deepEqual(feitos, []);
});
