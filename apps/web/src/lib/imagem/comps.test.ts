import assert from "node:assert/strict";
import { test } from "node:test";

import { executarComando } from "../projeto/comandos.ts";
import type { Contexto } from "../projeto/edicao.ts";
import type { Projeto } from "../projeto/modelo.ts";
import { TEXTO_PADRAO } from "../projeto/texto.ts";
import { aplicarComp, atualizarComp, camadasQueSumiram, novaComp } from "./comps.ts";

function doisTextos() {
  let n = 0;
  const ctx: Contexto = { novoId: () => `n${++n}`, midia: () => null };
  let projeto: Projeto = {
    id: "p",
    nome: "Imagem",
    proporcao: "1:1",
    tipo: "imagem",
    tamanho: { largura: 1000, altura: 1000 },
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#ffffff" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
  for (const conteudo of ["a", "b"]) projeto = executarComando(projeto, { comando: "imagem.adicionarTexto", parametros: { texto: { ...TEXTO_PADRAO, conteudo } } }, ctx).projeto;
  const faixas = projeto.faixas.filter((f) => f.clipes.length).map((f) => f.id);
  return { projeto, faixas };
}

const mudar = (projeto: Projeto, faixaId: string, mudanca: (f: Projeto["faixas"][number]) => Projeto["faixas"][number]): Projeto => ({ ...projeto, faixas: projeto.faixas.map((f) => (f.id === faixaId ? mudanca(f) : f)) });

test("a comp guarda o olho, a posição e a aparência, e aplicar volta a eles", () => {
  const { projeto, faixas } = doisTextos();
  const comp = novaComp(projeto, "c1", { nome: "A", comentario: "", visibilidade: true, posicao: true, aparencia: true });
  assert.equal(Object.keys(comp.camadas).length, 2);
  // Depois: o primeiro escondido, andado, em multiplicar e a 40%
  const depois = mudar(projeto, faixas[0], (f) => ({ ...f, oculta: true, clipes: [{ ...f.clipes[0], mesclagem: "multiplicar", transformacao: { ...f.clipes[0].transformacao, x: 0.3, opacidade: 0.4 } }] }));
  const voltou = aplicarComp(depois, comp);
  const f0 = voltou.faixas.find((f) => f.id === faixas[0])!;
  assert.equal(f0.oculta, false);
  assert.equal(f0.clipes[0].transformacao.x, 0);
  assert.equal(f0.clipes[0].transformacao.opacidade, 1);
  assert.equal(f0.clipes[0].mesclagem, "normal");
  // Aplicar sem mudança devolve o mesmo projeto
  assert.equal(aplicarComp(projeto, comp), projeto);
});

test("só as partes ligadas valem, e as camadas novas ficam como estão", () => {
  const { projeto, faixas } = doisTextos();
  const soOlho = novaComp(projeto, "c", { nome: "Só o olho", comentario: "", visibilidade: true, posicao: false, aparencia: false });
  const depois = mudar(projeto, faixas[1], (f) => ({ ...f, oculta: true, clipes: [{ ...f.clipes[0], transformacao: { ...f.clipes[0].transformacao, y: 0.2 } }] }));
  const aplicado = aplicarComp(depois, soOlho).faixas.find((f) => f.id === faixas[1])!;
  assert.equal(aplicado.oculta, false);
  assert.equal(aplicado.clipes[0].transformacao.y, 0.2);
  // Atualizar guarda o de agora; a camada que sumiu conta no aviso
  const atualizada = atualizarComp(soOlho, depois);
  assert.equal(atualizada.camadas[faixas[1]].oculta, true);
  const semUma = { ...depois, faixas: depois.faixas.filter((f) => f.id !== faixas[0]) };
  assert.equal(camadasQueSumiram(semUma, atualizada), 1);
});
