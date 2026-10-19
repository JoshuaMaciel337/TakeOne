import assert from "node:assert/strict";
import { test } from "node:test";

import { segundosParaTicks } from "../tempo.ts";
import { aplicarModelo, type Contexto } from "./edicao.ts";
import { fimDoClipe, type Projeto } from "./modelo.ts";
import { formasDoModelo, MODELOS_DE_PROJETO, planoDoModelo, resolverCor } from "./modelos.ts";
import { ESTILOS_DE_TEXTO } from "./texto.ts";

const S = segundosParaTicks(1);

function contexto(): Contexto {
  let n = 0;
  const midias: Record<string, { duracao: number; video: boolean; audio: boolean; transparente?: boolean; imagem?: boolean }> = {
    longo: { duracao: 20 * S, video: true, audio: true },
    curto: { duracao: 2 * S, video: true, audio: true },
    foto: { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, imagem: true },
    forma: { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, transparente: true, imagem: true },
  };
  return { novoId: () => `n${++n}`, midia: (id) => midias[id] ?? null };
}

function vazio(): Projeto {
  return {
    id: "p",
    nome: "",
    proporcao: "9:16",
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#000000" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
}

test("todo modelo se sustenta: cenas, campos e estilos existem e os tempos cabem", () => {
  const ids = new Set<string>();
  for (const modelo of MODELOS_DE_PROJETO) {
    assert.ok(!ids.has(modelo.id), modelo.id);
    ids.add(modelo.id);
    const cenas = new Map(modelo.cenas.map((cena) => [cena.id, cena]));
    assert.equal(cenas.size, modelo.cenas.length, `${modelo.id}: cenas repetidas`);
    const campos = modelo.textos.map((texto) => texto.campo);
    assert.equal(new Set(campos).size, campos.length, `${modelo.id}: campos repetidos`);
    for (const [i, cena] of modelo.cenas.entries()) {
      const proxima = modelo.cenas[i + 1];
      if (cena.transicao) assert.ok(proxima && cena.transicao.duracaoS <= Math.min(cena.duracaoS, proxima.duracaoS), `${modelo.id}/${cena.id}: transição`);
    }
    for (const item of [...modelo.textos, ...modelo.formas]) {
      const cena = cenas.get(item.cena);
      assert.ok(cena, `${modelo.id}: cena ${item.cena}`);
      assert.ok(item.deS >= 0 && item.deS < cena.duracaoS && (item.ateS === undefined || (item.ateS > item.deS && item.ateS <= cena.duracaoS)), `${modelo.id}/${item.cena}: tempo`);
      assert.ok(Math.abs(item.posicao.x) <= 0.5 && Math.abs(item.posicao.y) <= 0.5, `${modelo.id}: posição dentro do quadro`);
    }
    for (const texto of modelo.textos) assert.ok(ESTILOS_DE_TEXTO.some((estilo) => estilo.id === texto.estilo), `${modelo.id}: estilo ${texto.estilo}`);
  }
  assert.ok(MODELOS_DE_PROJETO.length >= 9);
});

test("as cores @n vêm do kit de marca, e da paleta do modelo quando o kit não tem", () => {
  assert.equal(resolverCor("@1", ["#123456"], ["#ff0000", "#00ff00"]), "#123456");
  assert.equal(resolverCor("@2", ["#123456"], ["#ff0000", "#00ff00"]), "#00ff00");
  assert.equal(resolverCor("#abcdef", ["#123456"], ["#ff0000"]), "#abcdef");
  const produto = MODELOS_DE_PROJETO.find((m) => m.id === "produto")!;
  assert.deepEqual(formasDoModelo(produto, []).map((f) => f.cor), ["#ff624a", "#ff624a"]);
  assert.deepEqual(formasDoModelo(produto, ["#2b6cff"]).map((f) => f.cor), ["#2b6cff", "#2b6cff"]);
});

test("o modelo entra no fim da principal: cenas, transições, zoom lento nas fotos e textos no tempo da cena", () => {
  const ctx = contexto();
  const modelo = MODELOS_DE_PROJETO.find((m) => m.id === "tres-dicas")!;
  // A segunda cena com um vídeo de 2 s: ela encurta, e o que vem depois anda junto
  // Vídeos deitados num modelo em pé: cada cena cobre o quadro
  const tamanhos = { foto: { largura: 1000, altura: 1000, imagem: true }, curto: { largura: 1920, altura: 1080, imagem: false }, longo: { largura: 1920, altura: 1080, imagem: false } };
  const plano = planoDoModelo(modelo, { abertura: "foto", dica1: "curto", dica2: "longo", dica3: "longo" }, { titulo: "Meu título", dica1: "  " }, formasDoModelo(modelo, []).map(() => "forma"), tamanhos, { largura: 9, altura: 16 }, []);
  const { projeto, selecao } = aplicarModelo(vazio(), ctx, plano);
  const principal = projeto.faixas.find((f) => f.tipo === "principal")!.clipes;
  assert.deepEqual(principal.map((c) => c.duracao / S), [3, 2, 3, 3]);
  assert.deepEqual(selecao, principal.map((c) => c.id));
  assert.deepEqual(principal.map((c) => c.transicao?.tipo ?? null), ["zoom", "zoom", "zoom", null]);
  // A foto quadrada cobre o 9:16 com escala 16/9; o vídeo deitado, com (16/9)²
  assert.ok(Math.abs(principal[0].keyframes!.escala![0].valor - 16 / 9) < 1e-9 && Math.abs(principal[0].keyframes!.escala!.at(-1)!.valor - (16 / 9) * 1.12) < 1e-9, "a foto ganha zoom lento");
  assert.ok(Math.abs(principal[1].transformacao.escala - (16 / 9) ** 2) < 1e-9);
  assert.equal(principal[1].keyframes, undefined, "o vídeo não");
  const textos = projeto.faixas.filter((f) => f.tipo === "texto").flatMap((f) => f.clipes);
  assert.equal(textos.length, 8);
  assert.ok(textos.some((c) => c.texto!.conteudo === "Meu título"));
  assert.ok(textos.some((c) => c.texto!.conteudo === "Comece pelo mais simples"), "campo vazio volta ao padrão");
  // A dica 1 fica dentro da cena dela, que agora vai de 3 a 5 s
  const dica1 = textos.find((c) => c.texto!.conteudo === "Comece pelo mais simples")!;
  assert.ok(dica1.inicio >= 3 * S && fimDoClipe(dica1) <= 5 * S);
  for (const faixa of projeto.faixas) {
    const ordenados = [...faixa.clipes].sort((a, b) => a.inicio - b.inicio);
    ordenados.forEach((c, i) => i && assert.ok(c.inicio >= fimDoClipe(ordenados[i - 1]), `${faixa.tipo}: sobreposição`));
    for (const c of faixa.clipes) if (c.animacao) assert.ok(c.animacao.entrada.duracao + c.animacao.saida.duracao <= c.duracao);
  }
  assert.equal(projeto.faixas.filter((f) => f.tipo === "video").flatMap((f) => f.clipes).length, 3, "os três círculos dos números");
  assert.throws(() => planoDoModelo(modelo, { abertura: "foto" }, {}, [], {}, { largura: 9, altura: 16 }, []), /Primeira dica/);
});
