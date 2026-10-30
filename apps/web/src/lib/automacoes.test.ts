import assert from "node:assert/strict";
import { test } from "node:test";

import { type Esteira, situacaoDaEsteira } from "./automacoes.ts";

const base: Esteira = {
  id: "e1",
  origem: "link",
  titulo: "Palestra",
  status: "importando",
  midia_id: "m1",
  clipagem_id: null,
  automacao_id: null,
  quantos: 3,
  horario: null,
  comecar_em: null,
  videos: 0,
  erro: null,
  criado_em: "2026-10-30T20:00:00-03:00",
  concluida_em: null,
};

test("a situação de cada passo da esteira", () => {
  assert.deepEqual(situacaoDaEsteira(base), { texto: "Baixando e preparando o vídeo", andando: true, erro: false });
  assert.equal(situacaoDaEsteira({ ...base, status: "procurando" }).texto, "Procurando os cortes");
  assert.equal(situacaoDaEsteira({ ...base, status: "montando" }).andando, true);
  assert.deepEqual(situacaoDaEsteira({ ...base, status: "pronta", videos: 3 }), { texto: "3 cortes prontos", andando: false, erro: false });
  assert.equal(situacaoDaEsteira({ ...base, status: "pronta", videos: 1 }).texto, "1 corte pronto");
  assert.equal(situacaoDaEsteira({ ...base, status: "pronta", erro: "O Clipar não achou cortes neste vídeo." }).texto, "O Clipar não achou cortes neste vídeo.");
  assert.deepEqual(situacaoDaEsteira({ ...base, status: "erro", erro: "O vídeo não entrou" }), { texto: "O vídeo não entrou", andando: false, erro: true });
  assert.equal(situacaoDaEsteira({ ...base, status: "cancelada" }).andando, false);
});

test("o horário da busca aparece como hoje, amanhã ou a data", () => {
  const agora = new Date(2026, 9, 30, 21, 0);
  const hoje = new Date(2026, 9, 30, 23, 0).toISOString();
  const amanha = new Date(2026, 9, 31, 2, 0).toISOString();
  const depois = new Date(2026, 10, 2, 2, 0).toISOString();
  assert.equal(situacaoDaEsteira({ ...base, status: "esperando", comecar_em: hoje }, agora).texto, "Procura os cortes às 23:00");
  assert.equal(situacaoDaEsteira({ ...base, status: "esperando", comecar_em: amanha }, agora).texto, "Procura os cortes amanhã às 02:00");
  assert.match(situacaoDaEsteira({ ...base, status: "esperando", comecar_em: depois }, agora).texto, /^Procura os cortes em 02\/11\/2026 às 02:00$/);
});
