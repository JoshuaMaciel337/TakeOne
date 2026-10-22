import assert from "node:assert/strict";
import { test } from "node:test";

import type { Midia } from "../tipos.ts";
import type { Clipe, Projeto } from "./modelo.ts";
import { FONTE_DE_SOM_MAXIMA_S, pendenciaParaONavegador } from "./pendencias.ts";

const midia = (arquivos: string[], extra: Partial<Midia> = {}) =>
  ({ id: "m", status: "pronta", duracao: 60, audio: { codec: "aac" }, arquivos: ["proxy.mp4", ...arquivos], ...extra }) as unknown as Midia;
const projeto = (clipe: Partial<Clipe>) =>
  ({ faixas: [{ id: "f", tipo: "principal", muda: false, clipes: [{ id: "c", midia_id: "m", ...clipe }] }] }) as unknown as Projeto;

test("no navegador: espera o que o worker ainda está gerando, como o render", () => {
  const casos: [Partial<Clipe>, string[], RegExp | null][] = [
    [{}, [], null],
    [{ remover_fundo: true }, [], /recorte do fundo/],
    [{ remover_fundo: true }, ["mascara.mp4"], null],
    [{ estabilizar: true }, [], /estabilização/],
    [{ estabilizar: true, imagem_limpa: true }, ["estavel_proxy.mp4"], /estabilização/],
    [{ imagem_limpa: true }, ["limpo_proxy.mp4"], null],
    [{ voz_limpa: true }, [], /voz limpa/],
    [{ tom: 3 }, [], /tom da voz/],
    [{ tom: 3 }, ["tom_p3.m4a"], null],
  ];
  for (const [clipe, arquivos, esperado] of casos) {
    const motivo = pendenciaParaONavegador(projeto(clipe), new Map([["m", midia(arquivos)]]));
    if (esperado) assert.match(motivo ?? "", esperado, JSON.stringify(clipe));
    else assert.equal(motivo, null, JSON.stringify(clipe));
  }
  assert.match(pendenciaParaONavegador(projeto({}), new Map([["m", midia([], { status: "processando" } as Partial<Midia>)]])) ?? "", /preparada/);
  assert.match(pendenciaParaONavegador(projeto({}), new Map()) ?? "", /excluída/);
  assert.match(pendenciaParaONavegador(projeto({}), new Map([["m", midia([], { duracao: FONTE_DE_SOM_MAXIMA_S + 1 })]])) ?? "", /minutos/);
});
