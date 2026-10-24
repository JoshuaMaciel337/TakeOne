import assert from "node:assert/strict";
import { test } from "node:test";

import type { Comando } from "../projeto/comandos.ts";
import { ajustesDaAcao, arquivoDoConjunto, conjuntoDoArquivo, gravavel, ligarCamadas, passoGravado, teclaDoEventoDaAcao, textoDaTecla, trocarIds } from "./acoes.ts";

test("o que entra na gravação", () => {
  assert.equal(gravavel({ comando: "imagem.fundo", parametros: { cor: "#fff" } }), true);
  assert.equal(gravavel({ comando: "camada.pixels", parametros: { clipeId: "c", versao: 3 } }), false);
  assert.equal(gravavel({ comando: "imagem.adicionarPixels", parametros: { midiaId: "m", nome: "Camada 1" } }), true);
  assert.equal(gravavel({ comando: "imagem.adicionarPixels", parametros: { midiaId: "m", nome: "Achatada", versao: 2 } }), false);
  assert.equal(gravavel({ comando: "canal.mudar", parametros: { id: "a", mudanca: { nome: "Alfa 2" } } }), true);
  assert.equal(gravavel({ comando: "canal.mudar", parametros: { id: "a", mudanca: { versao: 4 } } }), false);
});

test("tocar troca os ids da gravação pelos da vez", () => {
  const mapa = new Map<string, string>();
  // No começo: a camada escolhida na gravação vira a escolhida agora
  ligarCamadas(mapa, { clipes: ["c1"], faixas: ["f1"] }, { clipes: ["x1"], faixas: ["y1"] });
  const comando = { comando: "clipe.transformar", parametros: { clipeIds: ["c1", "outra"], transformacao: { opacidade: 0.5 } } } as Comando;
  assert.deepEqual(trocarIds(comando, mapa), { comando: "clipe.transformar", parametros: { clipeIds: ["x1", "outra"], transformacao: { opacidade: 0.5 } } });
  // As chaves dos objetos também (mapas por id)
  assert.deepEqual(trocarIds({ tamanhos: { c1: 1 } }, mapa), { tamanhos: { x1: 1 } });
  // O passo que criou uma camada liga a criada na gravação à criada agora
  ligarCamadas(mapa, { clipes: ["novo"], faixas: ["fn"] }, { clipes: ["n2"], faixas: [] });
  assert.equal(mapa.get("novo"), "n2");
  assert.equal(mapa.has("fn"), false);
  // O passo gravado é uma cópia (mudar o comando depois não muda a gravação)
  const original = { comando: "imagem.fundo", parametros: { cor: "#000000" } } as Comando;
  const passo = passoGravado(original, "mudar o fundo", { clipes: [], faixas: [] }, { clipes: [], faixas: [] });
  (original.parametros as { cor: string }).cor = "#ffffff";
  assert.equal(passo.tipo === "comando" && (passo.comando.parametros as { cor: string }).cor, "#000000");
});

test("as teclas de função", () => {
  assert.deepEqual(teclaDoEventoDaAcao({ key: "F3", shiftKey: true, ctrlKey: false, metaKey: false, altKey: false }), { tecla: "F3", shift: true, ctrl: false });
  assert.equal(teclaDoEventoDaAcao({ key: "F5", shiftKey: false, ctrlKey: false, metaKey: false, altKey: false }), null);
  assert.equal(teclaDoEventoDaAcao({ key: "a", shiftKey: false, ctrlKey: false, metaKey: false, altKey: false }), null);
  assert.equal(textoDaTecla({ tecla: "F9", shift: true, ctrl: true }), "Ctrl+Shift+F9");
});

test("salvar e carregar um conjunto", () => {
  const passo = passoGravado({ comando: "imagem.fundo", parametros: { cor: "#ff0000" } }, "mudar o fundo", { clipes: [], faixas: [] }, { clipes: [], faixas: [] });
  const texto = arquivoDoConjunto({ id: "r1", nome: "Minhas", acoes: [{ id: "a1", nome: "Vermelho", passos: [passo, { tipo: "parada", mensagem: "Pronto", continuar: false, ligado: true }], tecla: { tecla: "F2", shift: false, ctrl: false } }] });
  let n = 0;
  const lido = conjuntoDoArquivo(texto, () => `novo${++n}`);
  assert.equal(lido.nome, "Minhas");
  assert.equal(lido.acoes[0].id, "novo1");
  assert.equal(lido.acoes[0].passos.length, 2);
  // A tecla não vem junto (pode bater com uma deste espaço)
  assert.equal(lido.acoes[0].tecla, null);
  assert.throws(() => conjuntoDoArquivo("{}", () => "x"), /não é um conjunto/);
  assert.throws(() => conjuntoDoArquivo("não é json", () => "x"), /não é um conjunto/);
});

test("a ação no Lote: as camadas de ajuste (com o ajuste final) e o modo", () => {
  const nada = { clipes: [], faixas: [] };
  const ajuste = passoGravado({ comando: "imagem.adicionarAjuste", parametros: { acima: null, ajuste: { tipo: "inverter" } } }, "criar", nada, { clipes: ["c1"], faixas: ["f1"] });
  const posterizar = passoGravado({ comando: "imagem.adicionarAjuste", parametros: { acima: null, ajuste: { tipo: "posterizar", niveis: 4 } } }, "criar", nada, { clipes: ["c2"], faixas: ["f2"] });
  const mudar = passoGravado({ comando: "imagem.ajuste", parametros: { clipeId: "c2", ajuste: { tipo: "posterizar", niveis: 8 } } }, "mudar", nada, nada);
  const fundo = passoGravado({ comando: "imagem.fundo", parametros: { cor: "#000000" } }, "fundo", nada, nada);
  const modo = passoGravado({ comando: "imagem.modo", parametros: { modo: { tipo: "cinza" } } }, "modo", nada, nada);
  const r = ajustesDaAcao({ id: "a", nome: "A", passos: [ajuste, posterizar, mudar, fundo, modo, { tipo: "parada", mensagem: "", continuar: true, ligado: true }] });
  assert.deepEqual(r, { ajustes: [{ tipo: "inverter" }, { tipo: "posterizar", niveis: 8 }], modo: { tipo: "cinza" }, pulados: 1 });
});
