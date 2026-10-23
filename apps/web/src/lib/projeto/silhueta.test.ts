import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { coberturaDoContorno, deslocamentoDaSombra, margemDaSilhueta, type Sombra } from "./silhueta.ts";

// Os casos saem de tests/test_silhueta.py (core/utils/silhueta.py)
const casos = JSON.parse(readFileSync(new URL("../../../../../tests/casos/silhueta.json", import.meta.url), "utf8")) as {
  cobertura: { alfa: number; sigma: number; cobertura: number }[];
  margem: { clipe: Parameters<typeof margemDaSilhueta>[0]; altura: number; margem: number }[];
  deslocamento: { sombra: Sombra; altura: number; dx: number; dy: number }[];
};

test("a borda do contorno, a margem e o deslocamento batem com o render", () => {
  for (const caso of casos.cobertura) assert.ok(Math.abs(coberturaDoContorno(caso.alfa, caso.sigma) - caso.cobertura) < 1e-8, JSON.stringify(caso));
  for (const caso of casos.margem) assert.equal(margemDaSilhueta(caso.clipe, caso.altura), caso.margem, JSON.stringify(caso));
  for (const caso of casos.deslocamento) {
    const [dx, dy] = deslocamentoDaSombra(caso.sombra, caso.altura);
    assert.ok(Math.abs(dx - caso.dx) < 1e-8 && Math.abs(dy - caso.dy) < 1e-8, JSON.stringify(caso));
  }
});
