import assert from "node:assert/strict";
import { test } from "node:test";

import { caminhosDaMascaraNoDocumento, caminhosNoEspacoDaMascara, novaMascaraVetorial, vincularMascaraVetorial } from "./mascaraVetorial.ts";

const quadro = { largura: 400, altura: 200 };
const documento = { largura: 800, altura: 400 };
const caminho = [{ nos: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }], fechado: true, operacao: "somar" as const }];
const caixa = { cx: 100, cy: 50, largura: 100, altura: 50, rotacao: 0, opacidade: 1 };

test("vinculada, a máscara anda com a camada; desvinculada, fica no documento", () => {
  const mascara = novaMascaraVetorial("ocultar", caminho, caixa, quadro);
  // Na caixa de quando foi feita, os caminhos aparecem onde estão
  assert.deepEqual(caminhosDaMascaraNoDocumento(mascara, caixa, quadro, documento)[0].nos.map((no) => [Math.round(no.x), Math.round(no.y)]), [[100, 100], [300, 100], [300, 300]]);
  // A camada andou 50 px da prévia para a direita (100 px do documento): a vinculada vai junto
  const andou = { ...caixa, cx: 150 };
  assert.deepEqual(caminhosDaMascaraNoDocumento(mascara, andou, quadro, documento)[0].nos.map((no) => Math.round(no.x)), [200, 400, 400]);
  const solta = vincularMascaraVetorial(mascara, false, caixa, quadro, documento);
  assert.deepEqual(caminhosDaMascaraNoDocumento(solta, andou, quadro, documento)[0].nos.map((no) => Math.round(no.x)), [100, 300, 300]);
  // A volta (do documento ao espaço da máscara) desfaz a ida
  const ida = caminhosDaMascaraNoDocumento(mascara, andou, quadro, documento);
  const volta = caminhosNoEspacoDaMascara(ida, mascara, andou, quadro, documento);
  assert.ok(volta[0].nos.every((no, i) => Math.abs(no.x - caminho[0].nos[i].x) < 1e-6 && Math.abs(no.y - caminho[0].nos[i].y) < 1e-6));
});
