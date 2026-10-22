// A fala na linha do tempo: as palavras da transcrição de cada mídia (em segundos da mídia) levadas
// para o tempo de cada clipe que usa a mídia, no trecho e na velocidade dele. É a base das legendas
// automáticas, da limpeza de fala e da edição pelo texto. Função pura.
import { type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import type { Clipe } from "./modelo.ts";
import { segundosNoClipe } from "./velocidade.ts";

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
    // Com curva de velocidade, `velocidade` é só a média: o instante vem da inversa da curva
    const noTempo = (s: number): Tick =>
      Math.min(fimDoClipe, Math.max(clipe.inicio, clipe.inicio + Math.round(segundosNoClipe(clipe, s) * TICKS_POR_SEGUNDO)));
    falas.push({
      clipe,
      palavras: daMidia
        .filter((p) => p.inicio >= entrada && p.inicio < fimNaMidia)
        .map((p) => ({ texto: p.texto, inicio: noTempo(p.inicio), fim: noTempo(p.fim) })),
    });
  }
  return falas;
}

/** Uma palavra da fala em ordem na linha do tempo, com o clipe dela. */
export type PalavraDaLinha = PalavraNoTempo & { clipeId: string; fimDoClipe: Tick };

/** Todas as palavras dos clipes, em ordem, numa lista só (para mostrar e selecionar como texto). */
export function palavrasDaLinha(falas: FalaDoClipe[]): PalavraDaLinha[] {
  return falas.flatMap(({ clipe, palavras }) => palavras.map((p) => ({ ...p, clipeId: clipe.id, fimDoClipe: clipe.inicio + clipe.duracao })));
}

/**
 * O trecho a cortar quando as palavras de `de` a `ate` (índices, inclusivos) são apagadas: do começo
 * da primeira até o começo da palavra seguinte do mesmo clipe, levando junto a pausa que vinha
 * depois. Se não há palavra seguinte no clipe, vai até o fim da última apagada.
 */
export function trechoDasPalavras(palavras: PalavraDaLinha[], de: number, ate: number): { inicio: Tick; fim: Tick } {
  const [a, b] = de <= ate ? [de, ate] : [ate, de];
  const ultima = palavras[b];
  const seguinte = palavras[b + 1];
  const fim = seguinte && seguinte.clipeId === ultima.clipeId ? seguinte.inicio : ultima.fim;
  return { inicio: palavras[a].inicio, fim };
}
