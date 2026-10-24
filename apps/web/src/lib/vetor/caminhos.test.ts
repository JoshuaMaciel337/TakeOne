import assert from "node:assert/strict";
import { test } from "node:test";

import { caminhoDeRecorte, nomeLivre, porNoCaminho, salvarTrabalho } from "./caminhos.ts";

const sub = (x: number) => ({ nos: [{ x, y: 0 }, { x: x + 10, y: 10 }], fechado: false, operacao: "somar" as const });

test("a caneta sem caminho escolhido faz um caminho de trabalho novo, que substitui o anterior; com um escolhido, soma nele", () => {
  let n = 0;
  const novoId = () => `c${++n}`;
  let { caminhos, id } = porNoCaminho([], null, sub(0), novoId);
  assert.deepEqual([caminhos.length, caminhos[0].trabalho, id], [1, true, "c1"]);
  ({ caminhos, id } = porNoCaminho(caminhos, id, sub(20), novoId));
  assert.equal(caminhos[0].subcaminhos.length, 2);
  // Sem escolha: um caminho de trabalho novo no lugar do antigo
  ({ caminhos, id } = porNoCaminho(caminhos, null, sub(40), novoId));
  assert.deepEqual([caminhos.length, id, caminhos[0].subcaminhos.length], [1, "c2", 1]);
  // Salvo, ele fica, e o próximo de trabalho entra ao lado
  caminhos = salvarTrabalho(caminhos, "c2", nomeLivre(caminhos));
  assert.equal(caminhos[0].nome, "Caminho 1");
  ({ caminhos } = porNoCaminho(caminhos, null, sub(60), novoId));
  assert.deepEqual(
    caminhos.map((caminho) => caminho.nome),
    ["Caminho 1", "Caminho de trabalho"],
  );
  assert.deepEqual(
    caminhoDeRecorte(caminhos, "c2").map((caminho) => Boolean(caminho.recorte)),
    [true, false],
  );
});
