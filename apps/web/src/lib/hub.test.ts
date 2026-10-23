import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { CATEGORIAS, enderecoNoEditor, FERRAMENTAS_DO_HUB, ferramentaDoHub, ferramentasDaCategoria, itemAtivo, NO_INICIO, saudacao, SECOES_DO_MENU } from "./hub.ts";

// As páginas do painel ficam em app/app/(painel)/<caminho>/page.tsx
const pagina = (href: string) => new URL(`../app/app/(painel)${href.replace(/^\/app/, "")}/page.tsx`, import.meta.url);
// Os ids das ferramentas do editor, lidos do arquivo (ele importa os ícones, que o node --test não carrega)
const idsDoEditor = [...readFileSync(new URL("../componentes/editor/ferramentas.ts", import.meta.url), "utf-8").matchAll(/\bid: "([a-z]+)"/g)].map((m) => m[1]);

test("o catálogo não repete id e toda ferramenta leva a algum lugar que existe", () => {
  assert.equal(new Set(FERRAMENTAS_DO_HUB.map((ferramenta) => ferramenta.id)).size, FERRAMENTAS_DO_HUB.length);
  for (const ferramenta of FERRAMENTAS_DO_HUB) {
    assert.ok(ferramenta.categorias.length, ferramenta.id);
    if (ferramenta.destino.tipo === "pagina") assert.ok(existsSync(pagina(ferramenta.destino.href)), `${ferramenta.id}: falta a página ${ferramenta.destino.href}`);
    if (ferramenta.destino.tipo === "editor") assert.ok(idsDoEditor.includes(ferramenta.destino.ferramenta), `${ferramenta.id}: ${ferramenta.destino.ferramenta}`);
  }
  for (const id of NO_INICIO) assert.doesNotThrow(() => ferramentaDoHub(id), id);
  for (const item of SECOES_DO_MENU.flatMap((secao) => secao.itens)) if ("href" in item) assert.ok(existsSync(pagina(item.href)), `menu: falta ${item.href}`);
});

test("toda categoria tem ferramenta e as de IA também aparecem na categoria delas", () => {
  for (const { id } of CATEGORIAS) assert.ok(ferramentasDaCategoria(id).length > 0, id);
  assert.equal(ferramentasDaCategoria("todas").length, FERRAMENTAS_DO_HUB.length);
  assert.ok(ferramentasDaCategoria("ia").every((ferramenta) => ferramenta.categorias.some((c) => c !== "ia")));
});

test("o item marcado no menu é o mais específico", () => {
  assert.equal(itemAtivo("/app"), "/app");
  assert.equal(itemAtivo("/app/ferramentas"), "/app/ferramentas");
  assert.equal(itemAtivo("/app/ferramentas/gerar-video"), "/app/ferramentas/gerar-video");
  assert.equal(itemAtivo("/app/projetos"), "/app/projetos");
  assert.equal(itemAtivo("/app/editor/abc"), null);
});

test("endereço do editor e saudação", () => {
  assert.equal(enderecoNoEditor("p1", "legendas"), "/app/editor/p1?ferramenta=legendas");
  assert.equal(enderecoNoEditor("p1", "modelos", { modelo: "tres-dicas" }), "/app/editor/p1?ferramenta=modelos&modelo=tres-dicas");
  assert.equal(enderecoNoEditor("p1", "texto", { animacao: "tarja-nome" }), "/app/editor/p1?ferramenta=texto&animacao=tarja-nome");
  assert.deepEqual([saudacao(4), saudacao(9), saudacao(13), saudacao(20)], ["Boa noite", "Bom dia", "Boa tarde", "Boa noite"]);
});
