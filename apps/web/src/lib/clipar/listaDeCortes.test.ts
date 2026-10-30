import assert from "node:assert/strict";
import { test } from "node:test";

import { type Corte, ordenarCortes } from "../clipagens.ts";
import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { centroDoRosto, enfaseNoCorte, enquadrarNaCaixa, FILTRO_PADRAO, filtrarCortes, instanteNaMidia, instanteNoCorte, legendasDoCorte, nomeDeArquivo, palavraFalada, srtDoCorte } from "./listaDeCortes.ts";

const S = TICKS_POR_SEGUNDO;

function corte(id: string, extra: Partial<Corte> = {}): Corte {
  return {
    id,
    trechos: [{ inicio: 10, fim: 40 }],
    duracao: 30,
    titulo: `Corte ${id}`,
    foco: [],
    resumo: "",
    categoria: "dica",
    notas: null,
    motivos: null,
    nota: 50,
    propaganda: false,
    ...extra,
  };
}

test("os filtros juntam a avaliação, a duração e a busca sem acento em todas as palavras", () => {
  const cortes = [
    corte("a", { avaliacao: "gostei", duracao: 25, texto: "A ação começa aqui" }),
    corte("b", { avaliacao: "nao_gostei", duracao: 55, titulo: "Dinheiro e hábito" }),
    corte("c", { duracao: 120, resumo: "Sobre a AÇÃO de guardar dinheiro" }),
  ];
  const ids = (filtro: Partial<typeof FILTRO_PADRAO>) => filtrarCortes(cortes, { ...FILTRO_PADRAO, ...filtro }).map((c) => c.id);
  assert.deepEqual(ids({}), ["a", "b", "c"]);
  assert.deepEqual(ids({ avaliacao: "gostei" }), ["a"]);
  assert.deepEqual(ids({ avaliacao: "sem" }), ["c"]);
  assert.deepEqual(ids({ duracao: "ate60" }), ["b"]);
  assert.deepEqual(ids({ duracao: "mais" }), ["c"]);
  assert.deepEqual(ids({ busca: "acao" }), ["a", "c"]);
  assert.deepEqual(ids({ busca: "  dinheiro   ACAO " }), ["c"]);
  assert.deepEqual(ids({ busca: "habito", avaliacao: "gostei" }), []);
});

test("a parte 2, sem nota, vem logo depois do corte que ela continua", () => {
  const cortes = [corte("a", { nota: 60 }), corte("b", { nota: 90 }), corte("p", { nota: null, parte_de: "b", trechos: [{ inicio: 50, fim: 80 }] }), corte("q", { nota: null, parte_de: "p" })];
  assert.deepEqual(ordenarCortes(cortes, "nota").map((c) => c.id), ["b", "p", "q", "a"]);
});

test("as legendas do corte andam pelos trechos encostados, e o .srt sai delas", () => {
  const palavras = [
    { texto: "antes", inicio: 9, fim: 9.5 },
    { texto: "Olá,", inicio: 10.2, fim: 10.6 },
    { texto: "mundo.", inicio: 10.7, fim: 11.2 },
    { texto: "fora", inicio: 15, fim: 15.4 },
    { texto: "Depois", inicio: 20.1, fim: 20.5 },
    { texto: "veio.", inicio: 20.6, fim: 21 },
  ];
  const doCorte = { trechos: [{ inicio: 10, fim: 12 }, { inicio: 20, fim: 22 }] };
  const legendas = legendasDoCorte(doCorte, "m", palavras, "9:16");
  assert.deepEqual(
    legendas.map((l) => [l.conteudo, l.inicio / S, l.fim / S]),
    [
      ["Olá, mundo.", 0.2, 1.2],
      ["Depois veio.", 2.1, 3],
    ],
  );
  assert.equal(palavraFalada(legendas[0], 0.1 * S), -1);
  assert.equal(palavraFalada(legendas[0], 0.8 * S), 1);
  assert.equal(srtDoCorte(doCorte, "m", palavras, "9:16"), "1\n00:00:00,200 --> 00:00:01,200\nOlá, mundo.\n\n2\n00:00:02,100 --> 00:00:03,000\nDepois veio.\n");
});

test("o tempo da prévia passa de um trecho ao outro e volta", () => {
  const doCorte = { trechos: [{ inicio: 10, fim: 12 }, { inicio: 20, fim: 25 }] };
  assert.deepEqual(instanteNaMidia(doCorte, 1), { trecho: 0, midia: 11 });
  assert.deepEqual(instanteNaMidia(doCorte, 2.5), { trecho: 1, midia: 20.5 });
  assert.equal(instanteNaMidia(doCorte, 7), null);
  assert.equal(instanteNoCorte(doCorte, 1, 20.5), 2.5);
  assert.equal(nomeDeArquivo("Ação: o poder dos mini-hábitos!", "srt"), "acao-o-poder-dos-mini-habitos.srt");
  assert.equal(nomeDeArquivo("!!!", "srt"), "corte.srt");
});

test("a prévia cobre a caixa com o rosto no meio, sem sobrar borda", () => {
  const amostras = [
    { t: 1, x: 0.7, y: 0.4, a: 0.1 },
    { t: 2, x: 0.72, y: 0.42, a: 0.1 },
    { t: 3, x: 0.1, y: 0.4, a: 0.1 },
    { t: 50, x: 0.2, y: 0.5, a: 0.1 },
  ];
  assert.deepEqual(centroDoRosto(amostras, 0, 10), { x: 0.7, y: 0.4 });
  assert.deepEqual(centroDoRosto(amostras, 20, 30), { x: 0.5, y: 0.5 });
  // Um vídeo deitado de 1280 × 720 numa caixa em pé de 180 × 320: a imagem fica com 569 × 320
  const caixa = enquadrarNaCaixa({ largura: 180, altura: 320 }, { largura: 1280, altura: 720 }, { x: 0.7, y: 0.4 });
  assert.equal(Math.round(caixa.largura), 569);
  assert.equal(caixa.altura, 320);
  assert.equal(Math.round(caixa.x), Math.round(90 - 0.7 * caixa.largura));
  assert.equal(caixa.y, 0);
  // Na beira, a imagem para na borda
  assert.equal(Math.round(enquadrarNaCaixa({ largura: 180, altura: 320 }, { largura: 1280, altura: 720 }, { x: 0.99, y: 0.5 }).x), 180 - 569);
  assert.equal(enquadrarNaCaixa({ largura: 180, altura: 320 }, { largura: 1280, altura: 720 }, { x: 0, y: 0.5 }).x, 0);
});

test("a ênfase vai para o tempo do corte, pelo trecho em que cai", () => {
  const doCorte = { trechos: [{ inicio: 10, fim: 12 }, { inicio: 20, fim: 25 }], enfase: [10.5, 21, 15] };
  assert.deepEqual(enfaseNoCorte(doCorte), [0.5 * S, 3 * S]);
});
