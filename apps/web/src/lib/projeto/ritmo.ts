// Batidas da música na linha do tempo, para cortar e animar no ritmo. Funções puras.
//
// O worker acha as batidas em segundos da mídia (core/utils/batidas.py); aqui elas viram instantes da
// linha do tempo pelo trecho e pela velocidade do clipe de música, e saem só as que ele toca.
import { type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import type { Clipe } from "./modelo.ts";

export type Batidas = { bpm: number; batidas: number[]; fortes: number[] };

/** De quantas em quantas batidas cortar: toda batida, a cada 2, a cada compasso (4) ou a cada 2 compassos. */
export const CADENCIAS = [1, 2, 4, 8] as const;

/**
 * Os instantes da linha do tempo em que o clipe toca cada batida (segundos da mídia), em ordem.
 * Clipe com velocidade em curva fica de fora: o tempo dele não anda reto.
 */
export function batidasNaLinha(clipe: Pick<Clipe, "inicio" | "duracao" | "entrada" | "velocidade" | "curva_velocidade">, segundos: number[]): Tick[] {
  if (clipe.curva_velocidade?.length) return [];
  const fimNaMidia = clipe.entrada + clipe.duracao * clipe.velocidade;
  return segundos
    .map((s) => Math.round(s * TICKS_POR_SEGUNDO))
    .filter((t) => t >= clipe.entrada && t <= fimNaMidia)
    .map((t) => clipe.inicio + Math.round((t - clipe.entrada) / clipe.velocidade));
}

/** Uma batida a cada `cada`, a partir da primeira. */
export function aCada<T>(batidas: T[], cada: number): T[] {
  return batidas.filter((_, i) => i % Math.max(1, Math.round(cada)) === 0);
}
