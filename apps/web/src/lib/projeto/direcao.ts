// "Criar automaticamente": o plano que o LLM local devolve (core/modelos/direcao.py) e como ele vira
// coisas no tempo da linha do tempo. O plano só aponta números de palavras da fala já limpa.
import { TICKS_POR_SEGUNDO, type Tick } from "../tempo.ts";
import type { Intervalo } from "./edicao.ts";
import type { PalavraNoTempo } from "./fala.ts";

export type Plano = {
  titulo: string;
  apresentacao: { nome: string; funcao: string; palavra: number } | null;
  destaques: { de: number; ate: number }[];
  cta: string | null;
};

/** Palavras que o modelo lê de uma vez (MAXIMO_DE_PALAVRAS em core/modelos/direcao.py, medido no contexto dele). */
export const PALAVRAS_DO_PLANO = 900;
/** Numa fala mais longa, quantas das enviadas são do fim: a chamada para a ação costuma estar lá. */
const PALAVRAS_DO_FIM = 250;
/** Letras por palavra que a API aceita (um link transcrito vira uma palavra enorme). */
export const LETRAS_POR_PALAVRA = 60;

/** As posições (em `palavras`) que vão ao modelo: todas, ou o começo e o fim de uma fala longa. */
export function palavrasParaOPlano(total: number): number[] {
  if (total <= PALAVRAS_DO_PLANO) return Array.from({ length: total }, (_, i) => i);
  const comeco = PALAVRAS_DO_PLANO - PALAVRAS_DO_FIM;
  return [...Array.from({ length: comeco }, (_, i) => i), ...Array.from({ length: PALAVRAS_DO_FIM }, (_, i) => total - PALAVRAS_DO_FIM + i)];
}

/** O plano com os números das palavras enviadas (`enviadas`, de palavrasParaOPlano) trocados pelos da fala inteira. */
export function planoNaFala(plano: Plano, enviadas: number[]): Plano {
  const na = (i: number) => (Number.isInteger(i) && i >= 0 && i < enviadas.length ? enviadas[i] : -1);
  const palavra = plano.apresentacao ? na(plano.apresentacao.palavra) : -1;
  return {
    ...plano,
    apresentacao: plano.apresentacao && palavra >= 0 ? { ...plano.apresentacao, palavra } : null,
    destaques: plano.destaques.map(({ de, ate }) => ({ de: na(de), ate: na(ate) })).filter(({ de, ate }) => de >= 0 && ate >= de),
  };
}

/** Duração das animações que o plano põe no vídeo (s). */
export const DURACOES_DO_PLANO = { titulo: 2.5, tarja: 4, cta: 4 } as const;

/**
 * As palavras no tempo que a linha do tempo vai ter depois de tirar os trechos: as que caem num trecho
 * somem, e as outras andam para trás o tanto que foi tirado antes delas.
 */
export function palavrasDepoisDoCorte<P extends PalavraNoTempo>(palavras: P[], trechos: Intervalo[]): P[] {
  // Os trechos da limpeza se sobrepõem (o vício fica dentro da pausa vizinha, as pausas dentro do retake):
  // juntos primeiro, como removerIntervalos faz, senão o tempo sobreposto era tirado duas vezes
  const cortes: Intervalo[] = [];
  for (const trecho of [...trechos].sort((a, b) => a.inicio - b.inicio)) {
    const ultimo = cortes[cortes.length - 1];
    if (ultimo && trecho.inicio <= ultimo.fim) ultimo.fim = Math.max(ultimo.fim, trecho.fim);
    else cortes.push({ inicio: trecho.inicio, fim: trecho.fim });
  }
  const tirado = (t: Tick) => cortes.reduce((soma, corte) => soma + Math.max(0, Math.min(t, corte.fim) - corte.inicio), 0);
  return palavras
    .filter((palavra) => !cortes.some((corte) => palavra.inicio >= corte.inicio && palavra.fim <= corte.fim))
    .map((palavra) => ({ ...palavra, inicio: palavra.inicio - tirado(palavra.inicio), fim: palavra.fim - tirado(palavra.fim) }));
}

/** Os trechos para dar zoom, no tempo da linha do tempo. */
export function trechosDosDestaques(plano: Plano, palavras: PalavraNoTempo[]): Intervalo[] {
  return plano.destaques
    .filter(({ de, ate }) => de >= 0 && ate < palavras.length && de <= ate)
    .map(({ de, ate }) => ({ inicio: palavras[de].inicio, fim: palavras[ate].fim }));
}

export type AnimacaoDoPlano = { modelo: "titulo" | "tarja" | "cta"; campos: Record<string, string>; inicio: Tick; duracao: number };

/** As animações do plano: o título no começo, a tarja quando a pessoa diz o nome e a chamada no fim. */
export function animacoesDoPlano(plano: Plano, palavras: PalavraNoTempo[], duracaoDoVideo: Tick): AnimacaoDoPlano[] {
  const animacoes: AnimacaoDoPlano[] = [];
  const s = TICKS_POR_SEGUNDO;
  if (plano.titulo) animacoes.push({ modelo: "titulo", campos: { texto: plano.titulo }, inicio: 0, duracao: DURACOES_DO_PLANO.titulo });
  const apresentacao = plano.apresentacao;
  if (apresentacao && apresentacao.palavra < palavras.length) {
    // Depois do título, para os dois não se cobrirem, e antes do fim: a tarja que passasse do fim alongava o vídeo
    // com segundos só dela sobre o fundo. Sem lugar entre os dois, fica de fora
    const depoisDoTitulo = plano.titulo ? DURACOES_DO_PLANO.titulo * s : 0;
    const inicio = Math.min(Math.max(palavras[apresentacao.palavra].inicio, depoisDoTitulo), duracaoDoVideo - DURACOES_DO_PLANO.tarja * s);
    if (inicio >= depoisDoTitulo) animacoes.push({ modelo: "tarja", campos: { nome: apresentacao.nome, funcao: apresentacao.funcao }, inicio, duracao: DURACOES_DO_PLANO.tarja });
  }
  if (plano.cta && duracaoDoVideo >= (DURACOES_DO_PLANO.cta + DURACOES_DO_PLANO.titulo) * s) {
    animacoes.push({ modelo: "cta", campos: { texto: plano.cta }, inicio: duracaoDoVideo - DURACOES_DO_PLANO.cta * s, duracao: DURACOES_DO_PLANO.cta });
  }
  return animacoes;
}
