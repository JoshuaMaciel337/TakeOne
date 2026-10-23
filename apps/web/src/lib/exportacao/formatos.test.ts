import assert from "node:assert/strict";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { arquivoDaExportacao, resumoDaExportacao } from "./formatos.ts";

test("cada formato baixa o seu arquivo e se resume do seu jeito", () => {
  const base = { resolucao: "1080p", largura: 1920, altura: 1080 };
  assert.equal(arquivoDaExportacao({}), "video.mp4");
  assert.equal(arquivoDaExportacao({ formato: "png" }), "quadro.png");
  assert.equal(resumoDaExportacao(base), "1080p · 1920 × 1080");
  assert.equal(resumoDaExportacao({ ...base, formato: "mp4", taxa: 60 }), "1080p · 1920 × 1080 · 60 fps");
  assert.equal(resumoDaExportacao({ ...base, formato: "gif", resolucao: "480p", largura: 854, altura: 480, taxa: 15 }), "GIF · 854 × 480 · 15 fps");
  assert.equal(resumoDaExportacao({ ...base, formato: "png", tempo: 72.5 * TICKS_POR_SEGUNDO }), "Quadro em 1:12,50 · PNG 1080p");
  assert.equal(resumoDaExportacao({ ...base, formato: "wav" }), "Som · WAV");
});
