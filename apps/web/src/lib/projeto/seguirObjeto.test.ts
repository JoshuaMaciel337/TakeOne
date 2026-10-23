import assert from "node:assert/strict";
import { test } from "node:test";

import { segundosParaTicks } from "../tempo.ts";
import { valorNoTempo } from "./keyframes.ts";
import { type Clipe, RECORTE_PADRAO, TRANSFORMACAO_PADRAO } from "./modelo.ts";
import { caixaDoClipe } from "./geometria.ts";
import { caminhoConfiavel, caminhoDoSeguidor, objetoNoInstante, type PontoDoObjeto, pontoNoQuadro, retanguloNaImagem } from "./seguirObjeto.ts";
import { seguirObjetoClipe } from "./edicao.ts";

const S = segundosParaTicks(1);
const TAXA = { num: 30, den: 1 };
const QUADRO = { largura: 16, altura: 9 };
const MIDIA = { largura: 1600, altura: 900 };

function video(extra: Partial<Clipe> = {}): Clipe {
  return { id: "v", midia_id: "m", inicio: 0, duracao: 4 * S, entrada: 0, velocidade: 1, volume: 1, fade_entrada: 0, fade_saida: 0, curva_fade: "linear", transformacao: TRANSFORMACAO_PADRAO, recorte: RECORTE_PADRAO, ...extra };
}

/** Objeto andando reto em x de 0,2 a 0,8 entre 0 e 4 s da mídia, um ponto por quadro. */
function andandoReto(nota = () => 0.9): PontoDoObjeto[] {
  return Array.from({ length: 121 }, (_, k) => [k / 30, 0.2 + (0.6 * k) / 120, 0.5, 0.1, 0.1, nota()] as PontoDoObjeto);
}

const perto = (a: number, b: number, folga = 1e-3) => assert.ok(Math.abs(a - b) < folga, `${a} != ${b}`);

test("o ponto da imagem vai para o quadro pela caixa do clipe, com zoom e giro", () => {
  const reto = pontoNoQuadro(video(), 0, { x: 0.75, y: 0.5 }, MIDIA, QUADRO);
  perto(reto.x, 0.25);
  perto(reto.y, 0);
  // Ampliado 2× e girado 90°: o que estava à direita do centro vai para baixo
  const girado = pontoNoQuadro(video({ transformacao: { ...TRANSFORMACAO_PADRAO, escala: 2, rotacao: 90 } }), 0, { x: 0.75, y: 0.5 }, MIDIA, QUADRO);
  perto(girado.x, 0);
  perto(girado.y, 8 / 9);
  // Com recorte, a fração é da imagem inteira
  const recortado = pontoNoQuadro(video({ recorte: { x: 0.5, y: 0, largura: 0.5, altura: 1 } }), 0, { x: 0.75, y: 0.5 }, MIDIA, QUADRO);
  perto(recortado.x, 0);
});

test("no vídeo virado, o objeto aparece espelhado e o retângulo marcado volta à mídia como ela é", () => {
  const virar = { horizontal: true, vertical: false };
  // O rastreador viu o objeto à direita da mídia; virada, ela mostra o objeto à esquerda do centro
  perto(pontoNoQuadro(video({ virar }), 0, { x: 0.75, y: 0.5 }, MIDIA, QUADRO).x, -0.25);
  // A metade direita do que aparece, no meio da tela: na mídia, o ponto 0,25
  const tela = { largura: 640, altura: 360 };
  const recorte = { x: 0.5, y: 0, largura: 0.5, altura: 1 };
  const marcado = retanguloNaImagem(caixaDoClipe(TRANSFORMACAO_PADRAO, recorte, MIDIA, tela), recorte, { esquerda: 315, topo: 175, largura: 10, altura: 10 }, virar)!;
  perto(marcado.x + marcado.largura / 2, 0.25);
  perto(marcado.y + marcado.altura / 2, 0.5);
});

test("objeto no meio de um buraco passa reto, e nas pontas fica parado", () => {
  const pontos: PontoDoObjeto[] = [
    [1, 0.2, 0.2, 0.1, 0.1, 1],
    [2, 0.4, 0.6, 0.1, 0.1, 1],
  ];
  assert.deepEqual(objetoNoInstante(pontos, 0), { x: 0.2, y: 0.2 });
  const meio = objetoNoInstante(pontos, 1.5)!;
  perto(meio.x, 0.3);
  perto(meio.y, 0.4);
  assert.deepEqual(objetoNoInstante(pontos, 9), { x: 0.4, y: 0.6 });
});

test("o seguidor anda o mesmo que o objeto e guarda a distância do instante marcado", () => {
  const texto = { inicio: S, duracao: 2 * S, transformacao: { ...TRANSFORMACAO_PADRAO, x: 0.1, y: -0.3 }, keyframes: null };
  const caminho = caminhoDoSeguidor(texto, video(), andandoReto(), MIDIA, QUADRO, TAXA, 2 * S)!;
  // Caminho reto: dois pontos bastam em x; y não muda
  assert.equal(caminho.x.length, 2);
  assert.equal(caminho.y.length, 2);
  // Aos 2 s (marcado) o objeto está em 0,5 da imagem (o centro): o texto fica onde estava
  perto(valorNoTempo(caminho.x, S), 0.1);
  // Aos 1 s o objeto estava 0,15 da imagem à esquerda: 0,15 do quadro (a imagem ocupa o quadro todo)
  perto(valorNoTempo(caminho.x, 0), 0.1 - 0.15);
  perto(valorNoTempo(caminho.x, 2 * S - S / 30), 0.1 + 0.15 - 0.6 / 120, 2e-3);
  for (const ponto of caminho.y) perto(ponto.valor, -0.3);
});

test("os pontos em que o rastreador perdeu o objeto ficam de fora", () => {
  const pontos = andandoReto();
  for (let k = 50; k < 70; k++) pontos[k] = [k / 30, 0.95, 0.05, 0.1, 0.1, 0.05];
  const texto = { inicio: 0, duracao: 4 * S, transformacao: TRANSFORMACAO_PADRAO, keyframes: null };
  const caminho = caminhoDoSeguidor(texto, video(), pontos, MIDIA, QUADRO, TAXA, 0)!;
  assert.equal(caminho.x.length, 2, "o buraco é preenchido pela reta");
  assert.ok(caminho.y.every((p) => Math.abs(p.valor) < 1e-3));
});

test("com o vídeo a 2×, o objeto é lido no dobro do tempo da mídia", () => {
  const texto = { inicio: 0, duracao: 2 * S, transformacao: TRANSFORMACAO_PADRAO, keyframes: null };
  const caminho = caminhoDoSeguidor(texto, video({ duracao: 2 * S, velocidade: 2 }), andandoReto(), MIDIA, QUADRO, TAXA, 0)!;
  // Marcado em 0 (objeto 0,3 à esquerda do centro, texto no centro): o texto fica 0,3 à direita do objeto.
  // Na linha, aos 1 s, a mídia está em 2 s: o objeto no centro e o texto 0,3 à direita
  perto(valorNoTempo(caminho.x, S), 0.3, 2e-3);
});

test("caminho comprido e torto cabe no limite de keyframes", () => {
  let x = 0.5;
  const pontos: PontoDoObjeto[] = Array.from({ length: 60 * 30 }, (_, k) => {
    x = Math.min(0.9, Math.max(0.1, x + Math.sin(k * 0.37) * 0.01));
    return [k / 30, x, 0.5 + 0.2 * Math.sin(k / 20), 0.1, 0.1, 0.9];
  });
  const texto = { inicio: 0, duracao: 60 * S, transformacao: TRANSFORMACAO_PADRAO, keyframes: null };
  const caminho = caminhoDoSeguidor(texto, video({ duracao: 60 * S }), pontos, MIDIA, QUADRO, TAXA, 0)!;
  assert.ok(caminho.x.length <= 100 && caminho.y.length <= 100);
  assert.ok(caminho.y.length > 20, "a curva lenta ainda tem pontos de sobra");
});

test("sem o objeto no trecho em comum, não há caminho", () => {
  const texto = { inicio: 10 * S, duracao: S, transformacao: TRANSFORMACAO_PADRAO, keyframes: null };
  assert.equal(caminhoDoSeguidor(texto, video(), andandoReto(), MIDIA, QUADRO, TAXA, 10 * S), null);
  assert.equal(caminhoDoSeguidor({ ...texto, inicio: 0 }, video(), [], MIDIA, QUADRO, TAXA, 0), null);
});

test("seguir o objeto troca só os keyframes de posição", () => {
  const seguidor = video({ id: "t", keyframes: { x: [{ t: 0, valor: 0.3, curva: "suave" }, { t: S, valor: 0.1, curva: "suave" }], escala: [{ t: 0, valor: 1, curva: "linear" }, { t: S, valor: 2, curva: "linear" }] } });
  const projeto = {
    id: "p",
    nome: "",
    proporcao: "16:9" as const,
    taxa: TAXA,
    fundo: { cor: "#000000" },
    faixas: [{ id: "principal", tipo: "principal" as const, oculta: false, muda: false, travada: false, clipes: [seguidor] }],
    versao: 1,
    duracao: 4 * S,
    criado_em: "",
    atualizado_em: "",
  };
  const caminho = { x: [{ t: 0, valor: 0.2, curva: "linear" as const }, { t: 2 * S, valor: 0.4, curva: "linear" as const }], y: [{ t: 0, valor: 0, curva: "linear" as const }] };
  const novo = seguirObjetoClipe(projeto, "t", caminho).faixas[0].clipes[0];
  assert.deepEqual(novo.keyframes?.x?.map((p) => p.valor), [0.2, 0.4]);
  assert.equal(novo.keyframes?.y, undefined, "um ponto só vira a posição fixa");
  assert.equal(novo.transformacao.y, 0);
  assert.equal(novo.keyframes?.escala?.length, 2);
});

test("o retângulo desenhado na prévia vira frações da imagem do clipe, com zoom, giro e recorte", () => {
  const tela = { largura: 640, altura: 360 };
  // Clipe inteiro no quadro: o retângulo do meio é o meio da imagem
  const caixa = caixaDoClipe(TRANSFORMACAO_PADRAO, RECORTE_PADRAO, MIDIA, tela);
  const meio = retanguloNaImagem(caixa, RECORTE_PADRAO, { esquerda: 288, topo: 162, largura: 64, altura: 36 })!;
  for (const [obtido, esperado] of [[meio.x, 0.45], [meio.y, 0.45], [meio.largura, 0.1], [meio.altura, 0.1]]) perto(obtido, esperado);
  // Ampliado 2×: o mesmo retângulo cobre metade da imagem que cobria
  const ampliada = retanguloNaImagem(caixaDoClipe({ ...TRANSFORMACAO_PADRAO, escala: 2 }, RECORTE_PADRAO, MIDIA, tela), RECORTE_PADRAO, { esquerda: 288, topo: 162, largura: 64, altura: 36 })!;
  perto(ampliada.largura, 0.05);
  perto(ampliada.x, 0.475);
  // Girado 90°: um retângulo largo na tela é alto na imagem
  const girada = retanguloNaImagem(caixaDoClipe({ ...TRANSFORMACAO_PADRAO, rotacao: 90 }, RECORTE_PADRAO, MIDIA, tela), RECORTE_PADRAO, { esquerda: 300, topo: 175, largura: 40, altura: 10 })!;
  assert.ok(girada.altura / girada.largura > 2);
  // Com recorte da metade direita, o meio da tela é o ponto 0,75 da imagem
  const recorte = { x: 0.5, y: 0, largura: 0.5, altura: 1 };
  const recortada = retanguloNaImagem(caixaDoClipe(TRANSFORMACAO_PADRAO, recorte, MIDIA, tela), recorte, { esquerda: 315, topo: 175, largura: 10, altura: 10 })!;
  perto(recortada.x + recortada.largura / 2, 0.75);
  // Fora da imagem (nas faixas pretas de um vídeo deitado num quadro em pé): nada
  const emPe = { largura: 360, altura: 640 };
  assert.equal(retanguloNaImagem(caixaDoClipe(TRANSFORMACAO_PADRAO, RECORTE_PADRAO, MIDIA, emPe), RECORTE_PADRAO, { esquerda: 10, topo: 10, largura: 50, altura: 50 }), null);
});

test("a suavização segue uma parábola sem atraso e tira o tremido do rastreador", () => {
  const quadros = Array.from({ length: 90 }, (_, i) => i / 30);
  const verdade = (t: number) => ({ x: 0.2 + 0.3 * t - 0.12 * t * t, y: 0.5 + 0.1 * t * t });
  // Sem ruído: a parábola da janela é a própria parábola (menos nas duas pontas, onde a janela de 1 é a média)
  const limpo = caminhoConfiavel(quadros.map((t): PontoDoObjeto => [t, verdade(t).x, verdade(t).y, 0.1, 0.1, 1]));
  for (const p of limpo.slice(2, -2)) {
    assert.ok(Math.abs(p[1] - verdade(p[0]).x) < 1e-9 && Math.abs(p[2] - verdade(p[0]).y) < 1e-9);
  }
  // Com o ruído do rastreador (2 px em 1280), o erro cai a menos da metade
  let semente = 11;
  const ruido = () => ((semente = (semente * 16807) % 2147483647) / 2147483647 - 0.5) * (4 / 1280) * Math.sqrt(3);
  const medidos = quadros.map((t): PontoDoObjeto => [t, verdade(t).x + ruido(), verdade(t).y + ruido(), 0.1, 0.1, 1]);
  const erro = (lista: PontoDoObjeto[]) => Math.sqrt(lista.reduce((s, p) => s + (p[1] - verdade(p[0]).x) ** 2 + (p[2] - verdade(p[0]).y) ** 2, 0) / lista.length);
  assert.ok(erro(caminhoConfiavel(medidos)) < 0.5 * erro(medidos), `${erro(caminhoConfiavel(medidos))} contra ${erro(medidos)}`);
});
