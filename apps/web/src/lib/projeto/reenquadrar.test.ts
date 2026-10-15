import assert from "node:assert/strict";
import { test } from "node:test";

import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { caixaDoClipe } from "./geometria.ts";
import { transformacaoNoTempo } from "./keyframes.ts";
import { RECORTE_PADRAO, TRANSFORMACAO_PADRAO } from "./modelo.ts";
import { type AmostraDeRosto, reenquadrarPeloRosto } from "./reenquadrar.ts";

const S = TICKS_POR_SEGUNDO;
const DEITADO = { largura: 1920, altura: 1080 };
const EM_PE = { largura: 1080, altura: 1920 };

function clipe(duracao: number, entrada = 0) {
  return { inicio: 0, entrada: entrada * S, duracao: duracao * S, velocidade: 1, recorte: RECORTE_PADRAO, transformacao: TRANSFORMACAO_PADRAO };
}

/** Onde o rosto (x, y em frações da mídia) aparece no quadro, com a transformação do instante. */
function rostoNoQuadro(c: ReturnType<typeof clipe>, r: NonNullable<ReturnType<typeof reenquadrarPeloRosto>>, rosto: { x: number; y: number }, t: number) {
  const transformacao = transformacaoNoTempo({ ...c, transformacao: { ...TRANSFORMACAO_PADRAO, escala: r.escala, x: r.x, y: r.y }, keyframes: r.keyframes }, t * S);
  const caixa = caixaDoClipe(transformacao, RECORTE_PADRAO, DEITADO, EM_PE);
  return { x: caixa.cx + (rosto.x - 0.5) * caixa.largura, y: caixa.cy + (rosto.y - 0.5) * caixa.altura, caixa };
}

test("deitado no quadro em pé: cobre o quadro e põe o rosto parado no centro", () => {
  const amostras: AmostraDeRosto[] = Array.from({ length: 10 }, (_, i) => ({ t: i * 0.5, x: 0.3, y: 0.4, a: 0.02 }));
  const c = clipe(5);
  const r = reenquadrarPeloRosto(c, amostras, DEITADO, EM_PE)!;
  assert.ok(r.keyframes.x === undefined && r.keyframes.y === undefined, "rosto parado: câmera parada");
  const { x, caixa } = rostoNoQuadro(c, r, { x: 0.3, y: 0.4 }, 2);
  assert.ok(Math.abs(caixa.altura - 1920) < 1e-6, "cobre a altura do quadro, sem faixa preta");
  assert.ok(Math.abs(x - 540) < 1, `rosto no centro: ${x}`);
});

test("rosto no canto: a imagem para na borda em vez de mostrar o fundo", () => {
  const r = reenquadrarPeloRosto(clipe(2), [{ t: 0, x: 0.02, y: 0.5, a: 0.02 }], DEITADO, EM_PE)!;
  const { caixa } = rostoNoQuadro(clipe(2), r, { x: 0.02, y: 0.5 }, 0);
  assert.ok(Math.abs(caixa.cx - caixa.largura / 2) < 1e-6, "a borda esquerda da imagem encosta na do quadro");
});

test("rosto que anda: a câmera para, anda até ele e para de novo", () => {
  // Parado em 0,3 até 3 s, depois em 0,7
  const amostras: AmostraDeRosto[] = Array.from({ length: 13 }, (_, i) => ({ t: i * 0.5, x: i * 0.5 < 3 ? 0.3 : 0.7, y: 0.4, a: 0.02 }));
  const c = clipe(6);
  const r = reenquadrarPeloRosto(c, amostras, DEITADO, EM_PE)!;
  const pontos = r.keyframes.x!;
  assert.ok(pontos.length >= 3 && pontos.length < 12, `poucos pontos: ${pontos.length}`);
  // Antes do movimento a câmera não deslizou; no fim o rosto está no centro
  assert.ok(Math.abs(rostoNoQuadro(c, r, { x: 0.3, y: 0.4 }, 2).x - 540) < 1);
  assert.ok(Math.abs(rostoNoQuadro(c, r, { x: 0.7, y: 0.4 }, 6).x - 540) < 60, `${rostoNoQuadro(c, r, { x: 0.7, y: 0.4 }, 6).x}`);
  assert.ok(pontos.every((p, i) => i === 0 || p.t > pontos[i - 1].t));
  // Um movimento só: parada, partida e chegada, sem pontos no meio do caminho (que dariam tranco)
  assert.equal(pontos.length, 3, JSON.stringify(pontos.map((p) => [p.t / S, p.valor])));
  assert.ok(Math.abs(rostoNoQuadro(c, r, { x: 0.7, y: 0.4 }, 4).x - 540) < 1, "chega no centro logo que o rosto para");
});

test("só o trecho da mídia que o clipe usa, e null sem rosto", () => {
  const amostras: AmostraDeRosto[] = [{ t: 10, x: 0.8, y: 0.5, a: 0.02 }];
  assert.equal(reenquadrarPeloRosto(clipe(2), amostras, DEITADO, EM_PE), null);
  const r = reenquadrarPeloRosto(clipe(2, 9), amostras, DEITADO, EM_PE)!;
  assert.ok(r.x < 0, "rosto à direita: a imagem anda para a esquerda");
});

test("rostos pequenos demais (ícones, gente ao fundo) e picos isolados não mexem a câmera", () => {
  const amostras: AmostraDeRosto[] = [
    ...Array.from({ length: 8 }, (_, i) => ({ t: i * 0.5, x: 0.3, y: 0.4, a: 0.02 })),
    { t: 4, x: 0.9, y: 0.4, a: 0.003 },     // um ícone no canto
    { t: 4.5, x: 0.3, y: 0.4, a: 0.02 },
    { t: 5, x: 0.6, y: 0.4, a: 0.021 },     // um tremido de uma amostra só
    { t: 5.5, x: 0.3, y: 0.4, a: 0.02 },
  ];
  const r = reenquadrarPeloRosto(clipe(6), amostras, DEITADO, EM_PE)!;
  assert.equal(r.keyframes.x, undefined, "a câmera fica parada");
});
