import assert from "node:assert/strict";
import { test } from "node:test";

import { nomeParaEnviar } from "./extensoesAceitas.ts";

test("o nome com extensão conhecida sobe como está", () => {
  assert.equal(nomeParaEnviar("IMG_9755.HEIC", "image/heic"), "IMG_9755.HEIC");
  assert.equal(nomeParaEnviar("foto.jpg", ""), "foto.jpg");
});

test("sem extensão (a galeria de alguns celulares), a extensão vem do tipo", () => {
  assert.equal(nomeParaEnviar("IMG_9755", "image/jpeg"), "IMG_9755.jpg");
  assert.equal(nomeParaEnviar("IMG_9755", "image/heic"), "IMG_9755.heic");
  assert.equal(nomeParaEnviar("video", "video/quicktime"), "video.mov");
  assert.equal(nomeParaEnviar("", "image/png"), "arquivo.png");
});

test("sem extensão e sem tipo conhecido, o arquivo é recusado", () => {
  assert.equal(nomeParaEnviar("documento", "application/pdf"), null);
  assert.equal(nomeParaEnviar("IMG_9755", ""), null);
});
