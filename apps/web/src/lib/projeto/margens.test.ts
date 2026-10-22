import assert from "node:assert/strict";
import { test } from "node:test";

import { AREAS_COBERTAS_EM_PE, desenhoDasGuias, MODOS_DAS_GUIAS, modoValido, proximoModo } from "./margens.ts";

test("as guias de cada modo", () => {
  assert.deepEqual(desenhoDasGuias("desligadas", true), { contornos: [], linhas: [], cobertas: [] });
  const seguras = desenhoDasGuias("seguras", false);
  assert.deepEqual(seguras.contornos[1], { x: 0.1, y: 0.1, largura: 0.8, altura: 0.8 });
  assert.equal(desenhoDasGuias("tercos", false).linhas.length, 4);
  assert.equal(desenhoDasGuias("em-pe", true).cobertas.length, 3);
  // Deitado, as áreas do celular não valem: ficam as margens
  assert.deepEqual(desenhoDasGuias("em-pe", false), seguras);
});

test("as áreas cobertas ficam dentro do quadro e deixam o meio livre", () => {
  for (const area of AREAS_COBERTAS_EM_PE) {
    assert.ok(area.x >= 0 && area.y >= 0 && area.x + area.largura <= 1 + 1e-9 && area.y + area.altura <= 1 + 1e-9, area.nome);
    const meio = { x: 0.5, y: 0.5 };
    assert.ok(!(meio.x >= area.x && meio.x <= area.x + area.largura && meio.y >= area.y && meio.y <= area.y + area.altura), area.nome);
  }
});

test("o botão passa por todos os modos e volta ao começo", () => {
  let modo = MODOS_DAS_GUIAS[0].id;
  const vistos = new Set([modo]);
  for (let i = 1; i < MODOS_DAS_GUIAS.length; i++) vistos.add((modo = proximoModo(modo)));
  assert.equal(vistos.size, MODOS_DAS_GUIAS.length);
  assert.equal(proximoModo(modo), "desligadas");
  assert.equal(modoValido("qualquer"), "desligadas");
  assert.equal(modoValido("tercos"), "tercos");
});
