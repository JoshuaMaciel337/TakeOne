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

/** Uma tentativa abandonada tem no máximo tantas palavras e começa até tanto tempo antes do retake. */
const PALAVRAS_DA_TENTATIVA = 20;
const DISTANCIA_DO_RETAKE = 15;
/** Quantas palavras seguidas a versão boa precisa repetir da tentativa. */
const PALAVRAS_IGUAIS = 2;
const FIM_DE_FRASE = /[.!?…]["»”)]?$/;
const PONTUACAO = /[,;:.!?…]["»”)]?$/;
/** Pausa (segundos) que marca o começo de uma frase e o recomeço da fala. */
const PAUSA_DE_FRASE = 0.3;
const PAUSA_DO_RECOMECO = 0.25;

/** Hesitações, com as letras repetidas que a transcrição escreve ("ahnn", "éééh", "hummm"). */
const VICIO = /^(a+h+n*|a+n+|ã+h*|h+ã+|h+u+m+|h+m+|u+h+m*|e+h+|é{2,}h*|a+h+m+|m+h*m+)$/;

/** A palavra sem pontuação e em minúsculas, para comparar com os vícios. */
function normalizar(texto: string): string {
  return texto.toLowerCase().replace(/[^\p{L}]/gu, "");
}

export function ehVicio(texto: string): boolean {
  return VICIO.test(normalizar(texto));
}

/**
 * Os retakes de um clipe: a pessoa começa, para e diz de novo. A versão boa começa repetindo as
 * palavras da tentativa (pelo menos duas). Conta como retake quando a tentativa é repetida inteira
 * ("Olha só isso. Olha só isso.") ou quando ela foi abandonada no meio, sem fim de frase ("Hoje eu
 * vou… Hoje eu vou mostrar"). "Eu quero isso. Eu quero aquilo." não é: a primeira frase terminou.
 * A tentativa começa num início de frase (depois de um ponto ou de uma pausa) e a versão boa
 * recomeça depois de uma pausa ou de uma pontuação; sem isso, pares comuns que se repetem na fala
 * ("do Premiere... funções do Premiere") viravam retake. O corte vai da primeira palavra da
 * tentativa até a primeira da versão boa.
 */
function retakes(palavras: PalavraNoTempo[]): Trecho[] {
  const lista = palavras.filter((p) => !ehVicio(p.texto));
  const normais = lista.map((p) => normalizar(p.texto));
  const trechos: Trecho[] = [];
  const pausaAntes = (k: number) => (k === 0 ? Number.POSITIVE_INFINITY : (lista[k].inicio - lista[k - 1].fim) / TICKS_POR_SEGUNDO);
  const comecaFrase = (k: number) => k === 0 || FIM_DE_FRASE.test(lista[k - 1].texto) || pausaAntes(k) >= PAUSA_DE_FRASE;
  const recomeca = (k: number) => PONTUACAO.test(lista[k - 1].texto) || pausaAntes(k) >= PAUSA_DO_RECOMECO;
  for (let i = 0; i < lista.length; i++) {
    if (!comecaFrase(i)) continue;
    for (let j = i + 1; j < lista.length && j - i <= PALAVRAS_DA_TENTATIVA; j++) {
      if ((lista[j].inicio - lista[i].inicio) / TICKS_POR_SEGUNDO > DISTANCIA_DO_RETAKE) break;
      let iguais = 0;
      while (j + iguais < lista.length && i + iguais < j && normais[i + iguais] === normais[j + iguais]) iguais++;
      if (iguais < PALAVRAS_IGUAIS || !recomeca(j)) continue;
      const inteira = iguais === j - i;
      const abandonada = !FIM_DE_FRASE.test(lista[j - 1].texto);
      if (!inteira && !abandonada) continue;
      trechos.push({ tipo: "retake", inicio: lista[i].inicio, fim: lista[j].inicio, texto: lista.slice(i, j).map((p) => p.texto).join(" ") });
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
