// Limpeza de fala: acha na fala dos clipes as pausas longas, os vícios de hesitação ("ahn", "hum",
// "ééé") e os retakes (a frase começada e abandonada antes da versão boa), como trechos da linha do
// tempo que o comando linha.removerIntervalos tira. Função pura.
//
// Ficam de fora palavras que também são normais em português ("é", "um", "tipo", "então"): cortar
// essas sem entender a frase estraga mais do que limpa.
import { type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import type { Intervalo } from "./edicao.ts";
import { falaDosClipes, type Palavra, type PalavraNoTempo } from "./fala.ts";
import type { Clipe } from "./modelo.ts";

export type TipoDeTrecho = "pausa" | "vicio" | "retake";
export type Trecho = Intervalo & { tipo: TipoDeTrecho; texto: string };

export type OpcoesDeLimpeza = {
  pausas: boolean;
  vicios: boolean;
  retakes: boolean;
  /** Uma pausa só é cortada se for maior que isto, em segundos. */
  pausaMinima: number;
  /** Quanto de silêncio fica em volta da fala ao cortar uma pausa, em segundos (para não comer sílaba). */
  folga: number;
};

export const OPCOES_DE_LIMPEZA: OpcoesDeLimpeza = { pausas: true, vicios: true, retakes: true, pausaMinima: 0.7, folga: 0.15 };

/** Uma frase acaba no ponto final (ou ! ? …) ou numa pausa maior que esta, em segundos. */
const PAUSA_ENTRE_FRASES = 0.5;
/** O retake vem até este tempo depois da tentativa abandonada, em segundos. */
const DISTANCIA_DO_RETAKE = 15;
/** Quantas palavras do começo as duas frases precisam ter iguais (ou a frase inteira, se for menor). */
const PALAVRAS_IGUAIS = 3;

/** Hesitações, com as letras repetidas que a transcrição escreve ("ahnn", "éééh", "hummm"). */
const VICIO = /^(a+h+n*|a+n+|ã+h*|h+ã+|h+u+m+|h+m+|u+h+m*|e+h+|é{2,}h*|a+h+m+|m+h*m+)$/;

/** A palavra sem pontuação e em minúsculas, para comparar com os vícios. */
function normalizar(texto: string): string {
  return texto.toLowerCase().replace(/[^\p{L}]/gu, "");
}

export function ehVicio(texto: string): boolean {
  return VICIO.test(normalizar(texto));
}

/** As frases da fala de um clipe: quebram no fim de frase ou numa pausa. */
function frases(palavras: PalavraNoTempo[]): PalavraNoTempo[][] {
  const resultado: PalavraNoTempo[][] = [];
  let atual: PalavraNoTempo[] = [];
  for (const palavra of palavras) {
    const anterior = atual.at(-1);
    if (anterior && (palavra.inicio - anterior.fim) / TICKS_POR_SEGUNDO > PAUSA_ENTRE_FRASES) {
      resultado.push(atual);
      atual = [];
    }
    atual.push(palavra);
    if (/[.!?…]["»”)]?$/.test(palavra.texto)) {
      resultado.push(atual);
      atual = [];
    }
  }
  if (atual.length) resultado.push(atual);
  return resultado;
}

/**
 * Retake: a tentativa começa igual à versão boa (as primeiras palavras, ou ela inteira se for curta) e
 * é mais curta, ou as duas frases são idênticas (a mesma frase dita duas vezes, fica a segunda).
 */
function ehRetake(tentativa: PalavraNoTempo[], boa: PalavraNoTempo[]): boolean {
  const texto = (frase: PalavraNoTempo[]) => frase.map((p) => normalizar(p.texto)).join(" ");
  if (tentativa.length === boa.length && tentativa.length >= 2) return texto(tentativa) === texto(boa);
  if (tentativa.length > boa.length) return false;
  const quantas = Math.min(PALAVRAS_IGUAIS, tentativa.length);
  if (quantas < 2) return false;
  for (let i = 0; i < quantas; i++) if (normalizar(tentativa[i].texto) !== normalizar(boa[i].texto)) return false;
  return true;
}

/** Os retakes de um clipe: da primeira palavra da tentativa até a primeira da versão boa. */
function retakes(palavras: PalavraNoTempo[]): Trecho[] {
  const lista = frases(palavras.filter((p) => !ehVicio(p.texto)));
  const trechos: Trecho[] = [];
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length && (lista[j][0].inicio - lista[i][0].inicio) / TICKS_POR_SEGUNDO <= DISTANCIA_DO_RETAKE; j++) {
      if (!ehRetake(lista[i], lista[j])) continue;
      trechos.push({ tipo: "retake", inicio: lista[i][0].inicio, fim: lista[j][0].inicio, texto: lista.slice(i, j).flat().map((p) => p.texto).join(" ") });
      i = j - 1;
      break;
    }
  }
  return trechos;
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
    if (opcoes.retakes) trechos.push(...retakes(doClipe));
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
