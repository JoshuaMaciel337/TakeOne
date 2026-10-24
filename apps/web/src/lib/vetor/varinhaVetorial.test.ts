import assert from "node:assert/strict";
import { test } from "node:test";

import type { Projeto } from "../projeto/modelo.ts";
import { camadasParecidas, VARINHA_VETORIAL_PADRAO } from "./varinhaVetorial.ts";

const transformacao = { x: 0, y: 0, escala: 1, rotacao: 0, opacidade: 1 };
const forma = (id: string, cor: string, traco?: { cor: string; largura: number }, extra: Record<string, unknown> = {}) => ({
  id: `f${id}`,
  tipo: "video",
  oculta: false,
  muda: false,
  travada: false,
  clipes: [{ id, transformacao, vetor: { caixa: { largura: 10, altura: 10 }, subcaminhos: [], preenchimento: { tipo: "cor", cor }, traco: traco ? { tinta: { tipo: "cor", cor: traco.cor }, largura: traco.largura } : null }, ...extra }],
});
const projeto = {
  faixas: [
    { id: "principal", tipo: "principal", clipes: [] },
    forma("a", "#ff0000", { cor: "#000000", largura: 4 }),
    forma("b", "#f01010", { cor: "#000000", largura: 10 }),
    forma("c", "#00ff00", { cor: "#000000", largura: 4 }),
    forma("d", "#ff0000", undefined, { mesclagem: "multiplicar" }),
  ],
} as unknown as Projeto;

test("pela cor do preenchimento, com a tolerância", () => {
  assert.deepEqual(camadasParecidas(projeto, "a", VARINHA_VETORIAL_PADRAO), ["a", "b", "d"]);
  assert.deepEqual(camadasParecidas(projeto, "a", { ...VARINHA_VETORIAL_PADRAO, preenchimento: { usar: true, tolerancia: 0 } }), ["a", "d"]);
});

test("pelo traço, pela largura e pela mesclagem", () => {
  const soTraco = { ...VARINHA_VETORIAL_PADRAO, preenchimento: { usar: false, tolerancia: 0 }, traco: { usar: true, tolerancia: 0 } };
  assert.deepEqual(camadasParecidas(projeto, "a", soTraco), ["a", "b", "c"]);
  const largura = { ...soTraco, largura: { usar: true, tolerancia: 2 } };
  assert.deepEqual(camadasParecidas(projeto, "a", largura), ["a", "c"]);
  const mesclagem = { ...VARINHA_VETORIAL_PADRAO, mesclagem: { usar: true } };
  assert.deepEqual(camadasParecidas(projeto, "d", mesclagem), ["d"]);
});
