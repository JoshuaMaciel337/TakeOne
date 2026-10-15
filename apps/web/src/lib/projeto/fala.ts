// A fala na linha do tempo: as palavras da transcrição de cada mídia (em segundos da mídia) levadas
// para o tempo de cada clipe que usa a mídia, no trecho e na velocidade dele. É a base das legendas
// automáticas, da limpeza de fala e da edição pelo texto. Função pura.
import { type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import type { Clipe } from "./modelo.ts";

/** Uma palavra da transcrição, em segundos da mídia. */
export type Palavra = { texto: string; inicio: number; fim: number };

/** Uma palavra no tempo da linha do tempo, dentro do clipe dela. */
export type PalavraNoTempo = { texto: string; inicio: Tick; fim: Tick };

export type FalaDoClipe = { clipe: Clipe; palavras: PalavraNoTempo[] };

/**
 * A fala de cada clipe, em ordem na linha do tempo. Entram só as palavras que começam dentro do
 * trecho da mídia que o clipe usa; a que passa do fim do clipe é cortada nele.
 * palavras: id da mídia → palavras da transcrição dela (clipes de mídias sem transcrição ficam de fora).
 */
export function falaDosClipes(clipes: Clipe[], palavras: Map<string, Palavra[]>): FalaDoClipe[] {
  const falas: FalaDoClipe[] = [];
  for (const clipe of [...clipes].sort((a, b) => a.inicio - b.inicio)) {
    const daMidia = clipe.midia_id ? palavras.get(clipe.midia_id) : undefined;
    if (!daMidia) continue;
    const entrada = clipe.entrada / TICKS_POR_SEGUNDO;
    const fimNaMidia = entrada + (clipe.duracao / TICKS_POR_SEGUNDO) * clipe.velocidade;
    const fimDoClipe = clipe.inicio + clipe.duracao;
    const noTempo = (s: number): Tick =>
      Math.min(fimDoClipe, Math.max(clipe.inicio, clipe.inicio + Math.round(((s - entrada) / clipe.velocidade) * TICKS_POR_SEGUNDO)));
    falas.push({
      clipe,
      palavras: daMidia
        .filter((p) => p.inicio >= entrada && p.inicio < fimNaMidia)
        .map((p) => ({ texto: p.texto, inicio: noTempo(p.inicio), fim: noTempo(p.fim) })),
    });
  }
  return falas;
}
