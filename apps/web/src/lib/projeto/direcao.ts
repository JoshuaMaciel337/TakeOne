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

/** Duração das animações que o plano põe no vídeo (s). */
export const DURACOES_DO_PLANO = { titulo: 2.5, tarja: 4, cta: 4 } as const;

/**
 * As palavras no tempo que a linha do tempo vai ter depois de tirar os trechos: as que caem num trecho
 * somem, e as outras andam para trás o tanto que foi tirado antes delas.
 */
export function palavrasDepoisDoCorte<P extends PalavraNoTempo>(palavras: P[], trechos: Intervalo[]): P[] {
  const cortes = [...trechos].sort((a, b) => a.inicio - b.inicio);
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
    // Depois do título, para os dois não se cobrirem
    const inicio = Math.max(palavras[apresentacao.palavra].inicio, plano.titulo ? DURACOES_DO_PLANO.titulo * s : 0);
    animacoes.push({ modelo: "tarja", campos: { nome: apresentacao.nome, funcao: apresentacao.funcao }, inicio, duracao: DURACOES_DO_PLANO.tarja });
  }
  if (plano.cta && duracaoDoVideo >= (DURACOES_DO_PLANO.cta + DURACOES_DO_PLANO.titulo) * s) {
    animacoes.push({ modelo: "cta", campos: { texto: plano.cta }, inicio: duracaoDoVideo - DURACOES_DO_PLANO.cta * s, duracao: DURACOES_DO_PLANO.cta });
  }
  return animacoes;
}
