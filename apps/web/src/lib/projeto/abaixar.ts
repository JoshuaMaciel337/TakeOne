// Abaixar na fala (ducking): o som do clipe (a música, quase sempre) desce enquanto alguém fala nas
// outras faixas e volta depois. Como o "Seguir o rosto", a conta é feita uma vez, aqui, e vira uma
// curva de volume gravada no clipe (`abaixamento`); a prévia e o render só tocam a curva
// (valorNoTempo e core/utils/som.py). Mudou a fala, a pessoa refaz. Função pura.
import { type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import { type Keyframe, valorNoTempo } from "./keyframes.ts";
import type { Clipe } from "./modelo.ts";

/** Curva de volume do clipe: fator de 0 a 1 sobre o volume, nos instantes desde o começo dele. */
export type Abaixamento = { db: number; pontos: Keyframe[] };

/** Trecho de fala, na linha do tempo. */
export type TrechoDeFala = { inicio: Tick; fim: Tick };

/** Quanto o som desce antes da fala começar, e quanto leva para voltar depois que ela acaba. */
export const ATAQUE_S = 0.3;
export const SOLTURA_S = 0.5;
/** Falas separadas por menos que isto viram uma só: o som não sobe e desce a cada respiração. */
export const PAUSA_QUE_JUNTA_S = ATAQUE_S + SOLTURA_S;
export const DB_PADRAO = -12;
export const DB_LIMITES = { minimo: -40, maximo: -3 };

/** O fator da curva no instante `t` da linha do tempo (1 sem curva), como o volume do render. */
export function fatorDoAbaixamento(clipe: Pick<Clipe, "inicio" | "abaixamento">, t: Tick): number {
  const pontos = clipe.abaixamento?.pontos;
  return pontos?.length ? Math.max(0, valorNoTempo(pontos, t - clipe.inicio)) : 1;
}

function juntar(trechos: TrechoDeFala[], pausa: Tick): TrechoDeFala[] {
  const ordenados = [...trechos].filter((t) => t.fim > t.inicio).sort((a, b) => a.inicio - b.inicio);
  const juntos: TrechoDeFala[] = [];
  for (const trecho of ordenados) {
    const ultimo = juntos.at(-1);
    if (ultimo && trecho.inicio - ultimo.fim < pausa) ultimo.fim = Math.max(ultimo.fim, trecho.fim);
    else juntos.push({ ...trecho });
  }
  return juntos;
}

/**
 * A curva que abaixa o clipe `db` decibéis durante as falas, ou null se nenhuma fala cai nele.
 * O som começa a descer ATAQUE_S antes da fala e volta em SOLTURA_S depois dela, em linha reta.
 */
export function abaixamentoNaFala(clipe: Pick<Clipe, "inicio" | "duracao">, falas: TrechoDeFala[], db = DB_PADRAO): Abaixamento | null {
  const ataque = Math.round(ATAQUE_S * TICKS_POR_SEGUNDO);
  const soltura = Math.round(SOLTURA_S * TICKS_POR_SEGUNDO);
  const fator = 10 ** (db / 20);
  const fim = clipe.duracao;
  // Os trechos no tempo do clipe, só os que mexem nele
  const trechos = juntar(falas, Math.round(PAUSA_QUE_JUNTA_S * TICKS_POR_SEGUNDO))
    .map((t) => ({ inicio: t.inicio - clipe.inicio, fim: t.fim - clipe.inicio }))
    .filter((t) => t.fim + soltura > 0 && t.inicio - ataque < fim);
  if (!trechos.length) return null;

  // O fator em cada instante: as rampas não se cruzam (a pausa que junta é maior que as duas)
  const valor = (t: number) => {
    let v = 1;
    for (const trecho of trechos) {
      if (t >= trecho.inicio - ataque && t < trecho.inicio) v = Math.min(v, 1 - ((1 - fator) * (t - (trecho.inicio - ataque))) / ataque);
      else if (t >= trecho.inicio && t <= trecho.fim) v = fator;
      else if (t > trecho.fim && t < trecho.fim + soltura) v = Math.min(v, fator + ((1 - fator) * (t - trecho.fim)) / soltura);
    }
    return v;
  };
  // A curva é reta entre estes instantes; as pontas do clipe entram com o valor que têm ali
  const instantes = new Set<number>([0, fim]);
  for (const trecho of trechos) for (const t of [trecho.inicio - ataque, trecho.inicio, trecho.fim, trecho.fim + soltura]) instantes.add(Math.min(Math.max(t, 0), fim));
  const pontos: Keyframe[] = [...instantes].sort((a, b) => a - b).map((t) => ({ t, valor: valor(t), curva: "linear" }));
  // Sem pontos repetidos no meio de trechos retos
  const enxutos = pontos.filter((ponto, i) => i === 0 || i === pontos.length - 1 || !(ponto.valor === pontos[i - 1].valor && ponto.valor === pontos[i + 1].valor));
  return { db, pontos: enxutos };
}

/** A mesma curva com outra profundidade: cada ponto desce na mesma proporção do caminho. */
export function mudarProfundidade(abaixamento: Abaixamento, db: number): Abaixamento {
  const antes = 1 - 10 ** (abaixamento.db / 20);
  const depois = 1 - 10 ** (db / 20);
  return { db, pontos: abaixamento.pontos.map((ponto) => ({ ...ponto, valor: 1 - ((1 - ponto.valor) * depois) / antes })) };
}
