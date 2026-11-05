import assert from "node:assert/strict";
import { test } from "node:test";

import { proporcaoMaisPerto } from "./arquivosDoNovoProjeto.ts";

test("a proporção pronta mais perto da mídia", () => {
  assert.equal(proporcaoMaisPerto(1920, 1080), "16:9");
  assert.equal(proporcaoMaisPerto(1080, 1920), "9:16");
  assert.equal(proporcaoMaisPerto(3024, 4032), "3:4");
  assert.equal(proporcaoMaisPerto(1080, 1350), "4:5");
  assert.equal(proporcaoMaisPerto(500, 500), "1:1");
  assert.equal(proporcaoMaisPerto(2560, 1080), "21:9");
});
