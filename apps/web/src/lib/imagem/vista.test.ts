import assert from "node:assert/strict";
import { test } from "node:test";

import { alvosDoEncaixe, ENCAIXAR_EM_TUDO, encaixarValor, guiasDaForma, guiasDoLayout, juntarGuias, LAYOUT_PADRAO, marcasDaRegua, pixelsDaUnidade } from "./vista.ts";

test("as unidades da régua", () => {
  assert.equal(pixelsDaUnidade("pol", 300, 0), 300);
  assert.ok(Math.abs(pixelsDaUnidade("cm", 254, 0) - 100) < 1e-9);
  assert.equal(pixelsDaUnidade("pct", 72, 800), 8);
});

test("as marcas da régua: as grandes com número, longe o bastante umas das outras", () => {
  const marcas = marcasDaRegua(0, 1000, 1, "px", 72, 1000);
  const grandes = marcas.filter((m) => m.nivel === 0);
  // A 100% em pixels, a cada 100 (60 é o mínimo; o passo redondo seguinte é 100)
  assert.deepEqual(grandes.slice(0, 3).map((m) => [m.pos, m.rotulo]), [[0, "0"], [100, "100"], [200, "200"]]);
  assert.equal(marcas.filter((m) => m.pos > 0 && m.pos < 100).length, 9, "nove pequenas entre duas grandes");
  // Em centímetros a 254 ppp e 50%: 1 cm = 50 px na tela; as grandes a cada 2 cm
  const cm = marcasDaRegua(0, 2000, 0.5, "cm", 254, 2000).filter((m) => m.nivel === 0);
  assert.deepEqual(cm.slice(0, 3).map((m) => m.rotulo), ["0", "2", "4"]);
});

test("o layout de guias: colunas que dividem o espaço, com margens", () => {
  const g = guiasDoLayout({ ...LAYOUT_PADRAO, colunas: 2, medianiz: 20, margens: { topo: 10, esquerda: 50, base: 10, direita: 50 } }, { largura: 1000, altura: 500 });
  assert.deepEqual(g.verticais, [50, 490, 510, 950]);
  assert.deepEqual(g.horizontais, [10, 490]);
  const fixas = guiasDoLayout({ ...LAYOUT_PADRAO, colunas: 2, largura: 100, medianiz: 0, margens: { topo: 0, esquerda: 0, base: 0, direita: 0 } }, { largura: 1000, altura: 500 });
  assert.deepEqual(fixas.verticais, [400, 500, 600], "duas colunas de 100 no meio");
});

test("as guias da forma, juntar e o encaixe", () => {
  const forma = guiasDaForma({ esquerda: 10, topo: 20, direita: 110, base: 70 });
  assert.deepEqual(forma, { verticais: [10, 60, 110], horizontais: [20, 45, 70] });
  assert.deepEqual(juntarGuias(forma, { verticais: [60, 5], horizontais: [] }).verticais, [5, 10, 60, 110]);
  const alvos = alvosDoEncaixe({ ...ENCAIXAR_EM_TUDO, camadas: false }, { guias: { verticais: [333], horizontais: [] }, espacoDaGrade: 250, outras: [], documento: { largura: 1000, altura: 500 } });
  assert.ok(alvos.verticais.includes(333) && alvos.verticais.includes(250) && alvos.verticais.includes(500));
  assert.deepEqual(encaixarValor(329, alvos.verticais, 5), { valor: 333, alvo: 333 });
  assert.deepEqual(encaixarValor(300, alvos.verticais, 5), { valor: 300, alvo: null });
  // Grade fina demais não vira alvo (o encaixe ficaria em todo lugar)
  const fina = alvosDoEncaixe({ guias: false, grade: true, camadas: false, limites: false }, { guias: null, espacoDaGrade: 1, outras: [], documento: { largura: 1000, altura: 500 } });
  assert.equal(fina.verticais.length, 0);
});
