import assert from "node:assert/strict";
import { test } from "node:test";

import { expandirParaDesenhar, SUFIXO_DO_RECORTE } from "./fundoDesfocado.ts";
import type { Clipe, Projeto } from "./modelo.ts";

const clipe = (id: string, extra: Partial<Clipe> = {}): Clipe =>
  ({ id, midia_id: "m", inicio: 0, duracao: 10, entrada: 0, velocidade: 1, volume: 1, transformacao: { x: 0, y: 0, escala: 1, rotacao: 0, opacidade: 1 }, ...extra }) as Clipe;

test("o clipe com fundo desfocado vira a cópia desfocada e, por cima, a recortada sem som", () => {
  const projeto = {
    faixas: [
      { id: "t", tipo: "texto", clipes: [] },
      { id: "p", tipo: "principal", clipes: [clipe("a", { fundo_desfocado: 0.7, transicao: { tipo: "fusao", duracao: 5 } }), clipe("b")] },
    ],
  } as unknown as Projeto;
  const desenhado = expandirParaDesenhar(projeto);
  assert.deepEqual(desenhado.faixas.map((f) => [f.id, f.tipo]), [["t", "texto"], [`p${SUFIXO_DO_RECORTE}`, "video"], ["p", "principal"]]);
  const recortado = desenhado.faixas[1].clipes[0];
  assert.equal(recortado.id, `a${SUFIXO_DO_RECORTE}`);
  assert.ok(recortado.remover_fundo && recortado.som_separado && !recortado.transicao && !recortado.fundo_desfocado);
  const [desfocado, outro] = desenhado.faixas[2].clipes;
  assert.deepEqual(desfocado.efeito, { tipo: "desfoque", intensidade: 0.7 });
  assert.ok(!desfocado.remover_fundo && desfocado.transicao, "a transição fica na de baixo");
  assert.equal(outro, projeto.faixas[1].clipes[1]);
  const sem = { faixas: [{ id: "p", tipo: "principal", clipes: [clipe("x")] }] } as unknown as Projeto;
  assert.equal(expandirParaDesenhar(sem), sem, "sem fundo desfocado, o mesmo projeto");
});
