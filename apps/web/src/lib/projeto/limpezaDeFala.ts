// Limpeza de fala: acha na fala dos clipes as pausas longas e os vícios de hesitação ("ahn", "hum",
// "ééé"), como trechos da linha do tempo que o comando linha.removerIntervalos tira. Função pura.
//
// Ficam de fora palavras que também são normais em português ("é", "um", "tipo", "então"): cortar
// essas sem entender a frase estraga mais do que limpa.
import { type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import type { Intervalo } from "./edicao.ts";
import { falaDosClipes, type Palavra } from "./fala.ts";
import type { Clipe } from "./modelo.ts";

export type TipoDeTrecho = "pausa" | "vicio";
export type Trecho = Intervalo & { tipo: TipoDeTrecho; texto: string };

export type OpcoesDeLimpeza = {
  pausas: boolean;
  vicios: boolean;
  /** Uma pausa só é cortada se for maior que isto, em segundos. */
  pausaMinima: number;
  /** Quanto de silêncio fica em volta da fala ao cortar uma pausa, em segundos (para não comer sílaba). */
  folga: number;
};

export const OPCOES_DE_LIMPEZA: OpcoesDeLimpeza = { pausas: true, vicios: true, pausaMinima: 0.7, folga: 0.15 };

/** Hesitações, com as letras repetidas que a transcrição escreve ("ahnn", "éééh", "hummm"). */
const VICIO = /^(a+h+n*|a+n+|ã+h*|h+ã+|h+u+m+|h+m+|u+h+m*|e+h+|é{2,}h*|a+h+m+|m+h*m+)$/;

/** A palavra sem pontuação e em minúsculas, para comparar com os vícios. */
function normalizar(texto: string): string {
  return texto.toLowerCase().replace(/[^\p{L}]/gu, "");
}

export function ehVicio(texto: string): boolean {
  return VICIO.test(normalizar(texto));
}

/** Os trechos a cortar na fala dos clipes, em ordem. */
export function trechosParaLimpar(clipes: Clipe[], palavras: Map<string, Palavra[]>, opcoes: OpcoesDeLimpeza = OPCOES_DE_LIMPEZA): Trecho[] {
  const trechos: Trecho[] = [];
  const minima = opcoes.pausaMinima * TICKS_POR_SEGUNDO;
  const folga = Math.round(opcoes.folga * TICKS_POR_SEGUNDO);
  const pausa = (inicio: Tick, fim: Tick) => {
    if (opcoes.pausas && fim - inicio > minima) trechos.push({ tipo: "pausa", inicio, fim, texto: "" });
  };

  for (const { clipe, palavras: doClipe } of falaDosClipes(clipes, palavras)) {
    // Clipe sem fala nenhuma (uma imagem de apoio, por exemplo) não é tocado
    if (!doClipe.length) continue;
    const fim = clipe.inicio + clipe.duracao;
    // Os vícios saem da conta das pausas: o silêncio em volta deles se junta à pausa vizinha
    const falas = opcoes.vicios ? doClipe.filter((p) => !ehVicio(p.texto)) : doClipe;
    if (opcoes.vicios) {
      for (const palavra of doClipe.filter((p) => ehVicio(p.texto))) trechos.push({ tipo: "vicio", inicio: palavra.inicio, fim: palavra.fim, texto: palavra.texto });
    }
    if (!falas.length) continue;
    pausa(clipe.inicio, falas[0].inicio - folga);
    for (let i = 1; i < falas.length; i++) pausa(falas[i - 1].fim + folga, falas[i].inicio - folga);
    pausa(falas[falas.length - 1].fim + folga, fim);
  }
  return trechos.sort((a, b) => a.inicio - b.inicio);
}

/** Quanto tempo os trechos somam, em segundos, sem contar duas vezes o que se sobrepõe. */
export function segundosDosTrechos(trechos: Intervalo[]): number {
  let total = 0;
  let ate = Number.NEGATIVE_INFINITY;
  for (const trecho of [...trechos].sort((a, b) => a.inicio - b.inicio)) {
    const inicio = Math.max(trecho.inicio, ate);
    if (trecho.fim > inicio) total += trecho.fim - inicio;
    ate = Math.max(ate, trecho.fim);
  }
  return total / TICKS_POR_SEGUNDO;
}
