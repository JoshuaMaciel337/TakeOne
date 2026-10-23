import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { type Clipe, RECORTE_PADRAO, type Transformacao, TRANSFORMACAO_PADRAO } from "./modelo.ts";
import { desfoqueNaTransicao, fatorDaMistura, janelasDaPrincipal, janelasDoSom, type Revelado, reveladoNaTransicao, type TipoTransicao, transformacaoNaTransicao } from "./transicao.ts";

type Caso = {
  nome: string;
  tipo: TipoTransicao;
  papel: "sai" | "entra";
  inicio: number;
  duracao: number;
  t: number;
  esperado: Transformacao;
  revelado?: Revelado;
  desfoque?: number;
};
const { base, casos } = JSON.parse(readFileSync(new URL("../../../../../tests/casos/transicao.json", import.meta.url), "utf-8")) as {
  base: Transformacao;
  casos: Caso[];
};
const S = TICKS_POR_SEGUNDO;

for (const caso of casos) {
  test(`transição: ${caso.nome}`, () => {
    const efeito = { tipo: caso.tipo, papel: caso.papel, inicio: caso.inicio * S, duracao: caso.duracao * S };
    const resultado = transformacaoNaTransicao(base, [efeito], caso.t * S);
    for (const chave of Object.keys(caso.esperado) as (keyof Transformacao)[]) {
      assert.ok(Math.abs(resultado[chave] - caso.esperado[chave]) < 1e-9, `${chave}: ${resultado[chave]} ≠ ${caso.esperado[chave]}`);
    }
    if (caso.desfoque !== undefined) {
      assert.ok(Math.abs(desfoqueNaTransicao([efeito], caso.t * S) - caso.desfoque) < 1e-12);
    }
    if (caso.revelado) {
      const revelado = reveladoNaTransicao([efeito], caso.t * S);
      for (const chave of Object.keys(caso.revelado) as (keyof Revelado)[]) {
        assert.ok(Math.abs(revelado[chave] - caso.revelado[chave]) < 1e-9, `${chave}: ${revelado[chave]} ≠ ${caso.revelado[chave]}`);
      }
    }
  });
}

test("janelas: a transição cobre o corte pela metade e estende os dois clipes", () => {
  const clipe = (id: string, inicio: number, duracao: number, transicao?: Clipe["transicao"]) =>
    ({ id, inicio: inicio * S, duracao: duracao * S, transicao }) as Clipe;
  const janelas = janelasDaPrincipal(
    [clipe("a", 0, 4, { tipo: "fusao", duracao: 1 * S }), clipe("b", 4, 3, { tipo: "empurrar", duracao: 2 * S }), clipe("c", 7, 2)],
    S / 30,
  );
  assert.deepEqual(janelas.get("a"), { inicio: 0, fim: 4.5 * S, efeitos: [{ tipo: "fusao", papel: "sai", inicio: 3.5 * S, duracao: S }] });
  const b = janelas.get("b")!;
  assert.deepEqual([b.inicio / S, b.fim / S], [3.5, 8]);
  assert.deepEqual(b.efeitos.map((e) => `${e.tipo}:${e.papel}`), ["fusao:entra", "empurrar:sai"]);
  assert.deepEqual([janelas.get("c")!.inicio / S, janelas.get("c")!.fim / S], [6, 9]);
});

test("janelas: transição com número ímpar de quadros começa num quadro", () => {
  const q = S / 30;
  const clipe = (id: string, inicio: number, duracao: number, transicao?: Clipe["transicao"]) => ({ id, inicio, duracao, transicao }) as Clipe;
  // 0,5 s a 30 fps: 15 quadros, 7 antes do corte e 8 depois
  const janelas = janelasDaPrincipal([clipe("a", 0, 60 * q, { tipo: "fusao", duracao: S / 2 }), clipe("b", 60 * q, 60 * q)], q);
  assert.deepEqual([janelas.get("b")!.inicio / q, janelas.get("a")!.fim / q], [53, 68]);
  assert.equal(janelas.get("a")!.efeitos[0].duracao, 15 * q);
  // 0,5 s a 25 fps (12,5 quadros) vira 13 quadros inteiros
  const q25 = S / 25;
  const a25 = janelasDaPrincipal([clipe("a", 0, 50 * q25, { tipo: "fusao", duracao: S / 2 }), clipe("b", 50 * q25, 50 * q25)], q25);
  assert.deepEqual([a25.get("b")!.inicio / q25, a25.get("a")!.fim / q25], [44, 57]);
});

test("mistura do som: só nas transições marcadas e em potência constante (os números de test_transicao.py)", () => {
  const base = { midia_id: "m", entrada: 0, velocidade: 1, volume: 1, fade_entrada: 0, fade_saida: 0, transformacao: TRANSFORMACAO_PADRAO, recorte: RECORTE_PADRAO };
  const clipes: Clipe[] = [
    { ...base, id: "a", inicio: 0, duracao: 60, transicao: { tipo: "fusao", duracao: 20, misturar_som: true } },
    { ...base, id: "b", inicio: 60, duracao: 60, transicao: { tipo: "fusao", duracao: 20 } },
    { ...base, id: "c", inicio: 120, duracao: 60 },
  ];
  const janelas = janelasDoSom(clipes, 1);
  assert.deepEqual([janelas.get("a")!.fim, janelas.get("b")!.inicio, janelas.get("b")!.fim, janelas.get("c")!.inicio], [70, 50, 120, 120]);
  const sai = janelas.get("a")!.efeitos;
  const entra = janelas.get("b")!.efeitos;
  assert.equal(fatorDaMistura(sai, 50), 1);
  assert.ok(Math.abs(fatorDaMistura(sai, 70)) < 1e-12);
  assert.deepEqual([fatorDaMistura(entra, 50), fatorDaMistura(entra, 70)], [0, 1]);
  for (const t of [55, 60, 63.3]) assert.ok(Math.abs(fatorDaMistura(sai, t) ** 2 + fatorDaMistura(entra, t) ** 2 - 1) < 1e-12);
  assert.ok(Math.abs(fatorDaMistura(entra, 60) - Math.SQRT1_2) < 1e-12);
});
