import assert from "node:assert/strict";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { clipeParaAparar, corteVizinho } from "./atalhos.ts";
import type { Projeto } from "./modelo.ts";

const S = TICKS_POR_SEGUNDO;
const clipe = (id: string, inicio: number, duracao: number) => ({ id, inicio: inicio * S, duracao: duracao * S });
const projeto = {
  duracao: 10 * S,
  faixas: [
    { id: "v", tipo: "video", clipes: [clipe("sobre", 1, 3)] },
    { id: "p", tipo: "principal", clipes: [clipe("a", 0, 4), clipe("b", 4, 6)] },
  ],
} as unknown as Projeto;

test("Q e W aparam o clipe marcado sob o cursor, ou o da principal", () => {
  assert.equal(clipeParaAparar(projeto, [], 2 * S)?.id, "a");
  assert.equal(clipeParaAparar(projeto, ["sobre"], 2 * S)?.id, "sobre");
  assert.equal(clipeParaAparar(projeto, ["sobre"], 5 * S)?.id, "b", "o marcado fora do cursor não conta");
  assert.equal(clipeParaAparar(projeto, [], 4 * S), null, "bem no corte não há o que apagar");
});

test("↑ e ↓ andam de corte em corte da principal", () => {
  const meio = S / 60;
  assert.equal(corteVizinho(projeto, 2 * S, 1, meio), 4 * S);
  assert.equal(corteVizinho(projeto, 4 * S, 1, meio), 10 * S, "parado num corte, vai ao seguinte");
  assert.equal(corteVizinho(projeto, 5 * S, -1, meio), 4 * S);
  assert.equal(corteVizinho(projeto, 0, -1, meio), null);
});
