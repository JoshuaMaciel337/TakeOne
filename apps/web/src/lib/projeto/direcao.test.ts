import assert from "node:assert/strict";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { animacoesDoPlano, palavrasDepoisDoCorte, type Plano, trechosDosDestaques } from "./direcao.ts";

const S = TICKS_POR_SEGUNDO;
const palavras = ["Oi", "eu", "sou", "a", "Ana", "e", "hoje", "vou", "mostrar", "tudo"].map((texto, i) => ({
  texto,
  inicio: i * S,
  fim: i * S + S / 2,
}));

test("palavras andam para trás o tanto que foi cortado antes delas", () => {
  const depois = palavrasDepoisDoCorte(palavras, [{ inicio: 1 * S, fim: 3 * S }]);
  assert.deepEqual(
    depois.slice(0, 3).map((p) => [p.texto, p.inicio / S]),
    [["Oi", 0], ["a", 1], ["Ana", 2]],
  );
  assert.equal(depois.length, 8);
});

test("cortes que se sobrepõem tiram o tempo uma vez só (o vício dentro da pausa)", () => {
  // Pausa de 0 a 1,85 s e um "ahn" de 0,8 a 1,2 s dentro dela; a fala começa em 2 s
  const fala = [{ texto: "Bom", inicio: 2 * S, fim: 2.4 * S }, { texto: "dia", inicio: 2.5 * S, fim: 2.9 * S }];
  const depois = palavrasDepoisDoCorte(fala, [{ inicio: 0, fim: 1.85 * S }, { inicio: 0.8 * S, fim: 1.2 * S }]);
  assert.deepEqual(depois.map((p) => [p.texto, Number((p.inicio / S).toFixed(2))]), [["Bom", 0.15], ["dia", 0.65]]);
});

test("o plano vira trechos de zoom e animações no tempo da linha", () => {
  const plano: Plano = { titulo: "Mostrar tudo", apresentacao: { nome: "Ana", funcao: "", palavra: 4 }, destaques: [{ de: 6, ate: 9 }], cta: "Siga" };
  assert.deepEqual(trechosDosDestaques(plano, palavras), [{ inicio: 6 * S, fim: 9.5 * S }]);
  const animacoes = animacoesDoPlano(plano, palavras, 12 * S);
  assert.deepEqual(
    animacoes.map((a) => [a.modelo, a.inicio / S]),
    [["titulo", 0], ["tarja", 4], ["cta", 8]],
  );
  // Num vídeo curto não cabe a chamada, e a tarja espera o título sair
  const curto = animacoesDoPlano({ ...plano, apresentacao: { nome: "Ana", funcao: "", palavra: 1 } }, palavras, 5 * S);
  assert.deepEqual(curto.map((a) => [a.modelo, a.inicio / S]), [["titulo", 0], ["tarja", 2.5]]);
});
