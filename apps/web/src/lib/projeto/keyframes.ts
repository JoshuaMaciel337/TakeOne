// Keyframes: posição, escala, rotação e opacidade mudando ao longo do clipe. Cada propriedade tem a
// sua lista de pontos (tempo desde o começo do clipe, valor e a curva até o ponto seguinte). Antes do
// primeiro ponto vale o primeiro valor; depois do último, o último. As animações de entrada e saída e
// as transições continuam por cima (lib/projeto/animacao.ts e transicao.ts).
//
// A mesma conta está em core/utils/keyframes.py, conferida pelos casos de tests/casos/keyframes.json.
// No render ela vira expressões do FFmpeg (posição, escala e rotação) e comandos por quadro (opacidade).
import type { Tick } from "../tempo.ts";
import type { Clipe, Transformacao } from "./modelo.ts";

export type Curva = "linear" | "suave";
/** `t`: tempo desde o começo do clipe, na linha do tempo. `curva`: como o valor vai até o ponto seguinte. */
export type Keyframe = { t: Tick; valor: number; curva: Curva };
export type PropriedadeAnimavel = "x" | "y" | "escala" | "rotacao" | "opacidade";
export type Keyframes = Partial<Record<PropriedadeAnimavel, Keyframe[]>>;

export const PROPRIEDADES_ANIMAVEIS: PropriedadeAnimavel[] = ["x", "y", "escala", "rotacao", "opacidade"];
/** Pontos por propriedade, no máximo (o render monta uma expressão com todos). */
export const KEYFRAMES_POR_PROPRIEDADE = 100;

/** Curva em S: começa e termina devagar. */
function suave(p: number): number {
  return p * p * (3 - 2 * p);
}

/** O valor da propriedade no instante `t` (desde o começo do clipe). A lista vem em ordem. */
export function valorNoTempo(pontos: Keyframe[], t: Tick): number {
  if (t <= pontos[0].t) return pontos[0].valor;
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = pontos[i];
    const b = pontos[i + 1];
    if (t < b.t) {
      const p = (t - a.t) / (b.t - a.t);
      return a.valor + (b.valor - a.valor) * (a.curva === "suave" ? suave(p) : p);
    }
  }
  return pontos[pontos.length - 1].valor;
}

/** A transformação do clipe no instante `t` da linha do tempo, com os keyframes (sem as animações). */
export function transformacaoNoTempo(clipe: Pick<Clipe, "inicio" | "transformacao" | "keyframes">, t: Tick): Transformacao {
  const keyframes = clipe.keyframes;
  if (!keyframes) return clipe.transformacao;
  const resultado = { ...clipe.transformacao };
  for (const propriedade of PROPRIEDADES_ANIMAVEIS) {
    const pontos = keyframes[propriedade];
    if (pontos?.length) resultado[propriedade] = valorNoTempo(pontos, t - clipe.inicio);
  }
  return resultado;
}

/** O ponto da propriedade que está em `t` (com folga de meio quadro), ou undefined. */
export function keyframeEm(pontos: Keyframe[] | undefined, t: Tick, meioQuadro: Tick): Keyframe | undefined {
  return pontos?.find((ponto) => Math.abs(ponto.t - t) <= meioQuadro);
}

/** Os pontos deslocados: o clipe passou a começar `delta` depois no mesmo trecho da mídia. */
export function deslocarKeyframes(keyframes: Keyframes | null | undefined, delta: Tick): Keyframes | null | undefined {
  if (!keyframes || delta === 0) return keyframes;
  const resultado: Keyframes = {};
  for (const propriedade of PROPRIEDADES_ANIMAVEIS) {
    const pontos = keyframes[propriedade];
    if (pontos) resultado[propriedade] = pontos.map((ponto) => ({ ...ponto, t: ponto.t - delta }));
  }
  return resultado;
}
