// Ímã da linha do tempo: ao arrastar, a borda do clipe gruda no começo e no fim dos outros clipes,
// no cursor e no zero, quando chega perto deles.
import type { Tick } from "../tempo.ts";
import { fimDoClipe, type Projeto } from "./modelo.ts";

export function pontosDeEncaixe(projeto: Projeto, cursor: Tick, ignorar: ReadonlySet<string>): Tick[] {
  const pontos = new Set<Tick>([0, cursor]);
  for (const faixa of projeto.faixas) {
    for (const clipe of faixa.clipes) {
      if (ignorar.has(clipe.id)) continue;
      pontos.add(clipe.inicio);
      pontos.add(fimDoClipe(clipe));
    }
  }
  return [...pontos];
}

/** O ponto mais perto de `valor`, se estiver a no máximo `tolerancia`; senão null. */
export function pontoMaisProximo(valor: Tick, pontos: readonly Tick[], tolerancia: Tick): Tick | null {
  let melhor: Tick | null = null;
  for (const ponto of pontos) {
    if (Math.abs(ponto - valor) <= tolerancia && (melhor === null || Math.abs(ponto - valor) < Math.abs(melhor - valor))) melhor = ponto;
  }
  return melhor;
}

/**
 * Para mover um clipe inteiro: tenta grudar o começo ou o fim, o que estiver mais perto.
 * Devolve o novo começo e o ponto onde grudou (para desenhar a linha guia).
 */
export function encaixarIntervalo(inicio: Tick, duracao: Tick, pontos: readonly Tick[], tolerancia: Tick): { inicio: Tick; guia: Tick | null } {
  const peloInicio = pontoMaisProximo(inicio, pontos, tolerancia);
  const peloFim = pontoMaisProximo(inicio + duracao, pontos, tolerancia);
  const distInicio = peloInicio === null ? Infinity : Math.abs(peloInicio - inicio);
  const distFim = peloFim === null ? Infinity : Math.abs(peloFim - (inicio + duracao));
  if (peloInicio !== null && distInicio <= distFim) return { inicio: peloInicio, guia: peloInicio };
  if (peloFim !== null) return { inicio: peloFim - duracao, guia: peloFim };
  return { inicio, guia: null };
}
