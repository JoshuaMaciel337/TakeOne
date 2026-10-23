// Nivelar a voz: os trechos falados mais baixo sobem e os mais altos descem, para a fala ficar num volume só.
// Como o abaixar na fala, a conta roda uma vez no editor e a curva fica no clipe (`nivelamento`); a prévia, a
// exportação no navegador e o render só multiplicam o som por ela, então saem iguais por construção.
//
// A base são os níveis que a ingestão já mede (niveis.bin: o pico de cada 10 ms em dB). O nível de cada
// instante é a média de potência dos picos em 0,4 s; onde ele passa do limiar de fala, o ganho leva ao nível
// típico da fala do clipe (a mediana), até 12 dB para cima ou para baixo; no silêncio, o ganho volta a 0 dB
// (sem subir o ruído de fundo). A curva é suavizada (sem pressa: é calculada antes, então "vê" o que vem) e
// guarda só os pontos que fazem diferença.
import { type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import { type Keyframe, valorNoTempo } from "./keyframes.ts";
import type { Clipe } from "./modelo.ts";

/** `forca`: de 0 a 1, quanto da diferença é corrigida. `pontos`: o fator do volume no tempo do clipe. */
export type Nivelamento = { forca: number; pontos: Keyframe[] };

export const NIVEIS_POR_SEGUNDO = 100;
export const FORCA_PADRAO = 0.7;
/** O máximo que o nivelamento sobe ou desce, em dB. */
export const GANHO_MAXIMO_DB = 12;
/** Abaixo disto (pico em dB), é silêncio ou ruído de fundo. */
export const LIMIAR_DE_FALA_DB = -45;
/** A janela da medida do nível e a da suavização do ganho. */
const JANELA_DO_NIVEL_S = 0.4;
const JANELA_DO_GANHO_S = 0.3;
/** Um ponto a cada 50 ms, e só os que se afastam mais que isto da reta entre os vizinhos. */
const PASSO_S = 0.05;
const TOLERANCIA_DB = 0.3;
/** O limite da API para a curva. */
export const PONTOS_MAXIMOS = 4000;

const media = (valores: Float64Array, inicio: number, fim: number) => {
  let soma = 0;
  for (let i = inicio; i < fim; i++) soma += valores[i];
  return soma / Math.max(1, fim - inicio);
};

/**
 * A curva do nivelamento do clipe, a partir dos níveis da mídia inteira, ou null se o trecho dele não tem fala.
 * Clipe com velocidade em curva não nivela (o tempo dele não anda reto).
 */
export function nivelamentoDaVoz(
  clipe: Pick<Clipe, "entrada" | "duracao" | "velocidade" | "curva_velocidade">,
  niveis: Int8Array,
  forca = FORCA_PADRAO,
): Nivelamento | null {
  if (clipe.curva_velocidade?.length) return null;
  const de = Math.max(0, Math.floor((clipe.entrada / TICKS_POR_SEGUNDO) * NIVEIS_POR_SEGUNDO));
  const ate = Math.min(niveis.length, Math.ceil(((clipe.entrada + clipe.duracao * clipe.velocidade) / TICKS_POR_SEGUNDO) * NIVEIS_POR_SEGUNDO));
  if (ate - de < 2) return null;
  // O nível de cada 10 ms: a média de potência dos picos na janela em volta
  const potencia = new Float64Array(ate - de);
  for (let i = de; i < ate; i++) potencia[i - de] = 10 ** (niveis[i] / 10);
  const meia = Math.round((JANELA_DO_NIVEL_S * NIVEIS_POR_SEGUNDO) / 2);
  const nivel = new Float64Array(potencia.length);
  for (let i = 0; i < nivel.length; i++) nivel[i] = 10 * Math.log10(Math.max(1e-10, media(potencia, Math.max(0, i - meia), Math.min(potencia.length, i + meia + 1))));
  const falados = [...nivel].filter((valor) => valor > LIMIAR_DE_FALA_DB).sort((a, b) => a - b);
  if (falados.length < NIVEIS_POR_SEGUNDO / 2) return null;
  const alvo = falados[Math.floor(falados.length / 2)];
  // O ganho de cada 10 ms (no silêncio, 0 dB), suavizado
  const ganho = new Float64Array(nivel.length);
  for (let i = 0; i < nivel.length; i++) ganho[i] = nivel[i] > LIMIAR_DE_FALA_DB ? Math.max(-GANHO_MAXIMO_DB, Math.min(GANHO_MAXIMO_DB, alvo - nivel[i])) * forca : 0;
  const meiaDoGanho = Math.round((JANELA_DO_GANHO_S * NIVEIS_POR_SEGUNDO) / 2);
  const suave = new Float64Array(ganho.length);
  for (let i = 0; i < ganho.length; i++) suave[i] = media(ganho, Math.max(0, i - meiaDoGanho), Math.min(ganho.length, i + meiaDoGanho + 1));
  // Os pontos, no tempo do clipe (o tempo da mídia dividido pela velocidade)
  const emDb = (t: number) => suave[Math.min(suave.length - 1, Math.max(0, Math.round(t * NIVEIS_POR_SEGUNDO)))];
  const duracaoS = clipe.duracao / TICKS_POR_SEGUNDO;
  let tolerancia = TOLERANCIA_DB;
  let pontos: { t: number; db: number }[] = [];
  do {
    pontos = simplificar(
      Array.from({ length: Math.floor(duracaoS / PASSO_S) + 1 }, (_, k) => ({ t: k * PASSO_S, db: emDb(k * PASSO_S * clipe.velocidade + (clipe.entrada / TICKS_POR_SEGUNDO) - de / NIVEIS_POR_SEGUNDO) })),
      tolerancia,
    );
    tolerancia *= 2;
  } while (pontos.length > PONTOS_MAXIMOS);
  return {
    forca,
    pontos: pontos.map(({ t, db }) => ({ t: Math.round(t * TICKS_POR_SEGUNDO), valor: 10 ** (db / 20), curva: "linear" as const })),
  };
}

/** Só os pontos que se afastam mais que `tolerancia` dB da reta entre o último guardado e o seguinte. */
function simplificar(pontos: { t: number; db: number }[], tolerancia: number): { t: number; db: number }[] {
  if (pontos.length <= 2) return pontos;
  const guardados = [pontos[0]];
  for (let i = 1; i < pontos.length - 1; i++) {
    const a = guardados[guardados.length - 1];
    const c = pontos[i + 1];
    const b = pontos[i];
    const naReta = a.db + ((c.db - a.db) * (b.t - a.t)) / (c.t - a.t);
    if (Math.abs(b.db - naReta) > tolerancia) guardados.push(b);
  }
  guardados.push(pontos[pontos.length - 1]);
  return guardados;
}

/** A mesma curva com outra força: em dB, o ganho muda na proporção (sem ler os níveis de novo). */
export function mudarForca(nivelamento: Nivelamento, forca: number): Nivelamento {
  const razao = nivelamento.forca > 0 ? forca / nivelamento.forca : 0;
  return { forca, pontos: nivelamento.pontos.map((ponto) => ({ ...ponto, valor: ponto.valor ** razao })) };
}

/** O fator do nivelamento no instante `t` da linha do tempo (1 sem curva). */
export function fatorDoNivelamento(clipe: Pick<Clipe, "inicio" | "nivelamento">, t: Tick): number {
  const pontos = clipe.nivelamento?.pontos;
  return pontos?.length ? Math.max(0, valorNoTempo(pontos, t - clipe.inicio)) : 1;
}
