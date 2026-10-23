import assert from "node:assert/strict";
import { test } from "node:test";

import { abrirPainel, ALTURA_DO_GRUPO_AVULSO, alternarPainel, ativarAba, estadoValido, type EstadoDaArea, fecharGrupo, fecharPainel, moverGrupo, ondeEsta } from "./areaDeTrabalho.ts";

const PADRAO: EstadoDaArea = {
  direita: [
    { id: "cor", abas: ["cor", "amostras"], ativa: "cor", altura: 190 },
    { id: "propriedades", abas: ["propriedades", "ajustes"], ativa: "propriedades", altura: 250 },
    { id: "camadas", abas: ["camadas", "historico"], ativa: "camadas" },
  ],
};

test("fechar uma aba passa a ativa à vizinha, e o grupo vazio sai", () => {
  let estado = fecharPainel(PADRAO, "cor");
  assert.deepEqual(estado.direita[0], { id: "cor", abas: ["amostras"], ativa: "amostras", altura: 190 });
  estado = fecharPainel(estado, "amostras");
  assert.deepEqual(estado.direita.map((g) => g.id), ["propriedades", "camadas"]);
  assert.equal(PADRAO.direita.length, 3, "o padrão não muda");
});

test("abrir um painel fechado devolve ele ao grupo e ao lugar do padrão", () => {
  let estado = fecharGrupo(PADRAO, "cor");
  estado = abrirPainel(estado, "amostras", PADRAO);
  assert.deepEqual(estado.direita.map((g) => g.id), ["cor", "propriedades", "camadas"], "volta em cima");
  assert.deepEqual(estado.direita[0].abas, ["amostras"]);
  estado = abrirPainel(estado, "cor", PADRAO);
  assert.deepEqual(estado.direita[0].abas, ["cor", "amostras"], "na ordem do padrão");
  assert.equal(estado.direita[0].ativa, "cor");
  // Aberto, só ativa a aba
  estado = abrirPainel(estado, "historico", PADRAO);
  assert.equal(estado.direita[2].ativa, "historico");
  assert.deepEqual(alternarPainel(estado, "historico", PADRAO).direita[2].abas, ["camadas"]);
  assert.equal(ondeEsta(estado, "ajustes")?.indice, 1);
});

test("ativar aba, mover grupo e conferir o estado guardado", () => {
  const ativo = ativarAba(PADRAO, "propriedades", "ajustes");
  assert.equal(ativo.direita[1].ativa, "ajustes");
  assert.deepEqual(moverGrupo(PADRAO, "camadas", -1).direita.map((g) => g.id), ["cor", "camadas", "propriedades"]);
  const paineis = ["cor", "amostras", "propriedades", "ajustes", "camadas", "historico"];
  assert.ok(estadoValido(PADRAO, paineis));
  assert.ok(!estadoValido({ direita: [{ id: "x", abas: ["cor", "cor"], ativa: "cor" }] }, paineis), "repetido");
  assert.ok(!estadoValido({ direita: [{ id: "x", abas: ["sumiu"], ativa: "sumiu" }] }, paineis), "painel que não existe mais");
  assert.ok(!estadoValido(null, paineis));
});

test("o painel que não está no padrão abre num grupo só dele, em cima", () => {
  const estado = abrirPainel(structuredClone(PADRAO), "pinceis", PADRAO);
  const [coluna] = Object.keys(PADRAO);
  assert.deepEqual(estado[coluna][0], { id: "grupo-pinceis", abas: ["pinceis"], ativa: "pinceis", altura: ALTURA_DO_GRUPO_AVULSO });
  assert.equal(estado[coluna].length, PADRAO[coluna].length + 1);
});
