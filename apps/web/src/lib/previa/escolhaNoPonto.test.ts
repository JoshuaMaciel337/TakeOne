import assert from "node:assert/strict";
import { test } from "node:test";

import { escolhaNoPonto } from "./escolhaNoPonto.ts";

test("o clique escolhe a camada de cima", () => {
  assert.equal(escolhaNoPonto(["logo", "video"], null, false), "logo");
  assert.equal(escolhaNoPonto(["logo", "video"], "video", false), "logo", "o mouse sobre a escolhida ainda pega a de cima");
  assert.equal(escolhaNoPonto([], "video", false), null);
});

test("no toque, tocar de novo na escolhida passa à de baixo e dá a volta", () => {
  assert.equal(escolhaNoPonto(["animacao", "video"], null, true), "animacao");
  assert.equal(escolhaNoPonto(["animacao", "video"], "animacao", true), "video");
  assert.equal(escolhaNoPonto(["animacao", "video"], "video", true), "animacao");
  assert.equal(escolhaNoPonto(["video"], "video", true), "video");
  assert.equal(escolhaNoPonto(["logo", "video"], "texto", true), "logo", "a escolhida fora do ponto não conta");
});
