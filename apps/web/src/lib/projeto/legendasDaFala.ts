// Legendas automáticas: as palavras da transcrição de cada mídia (em segundos da mídia) viram linhas
// de legenda no tempo da linha do tempo. Cada clipe mostra só a fala do trecho da mídia que ele usa,
// na velocidade dele, e uma linha nunca passa de um clipe para o outro. Função pura.
import { type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import type { Legenda } from "./legendas.ts";
import type { Clipe } from "./modelo.ts";

/** Uma palavra da transcrição, em segundos da mídia. */
export type Palavra = { texto: string; inicio: number; fim: number };

export type OpcoesDaFala = {
  /** Caracteres que cabem numa linha (veja opcoesParaOQuadro). */
  maxCaracteres: number;
  /** Uma legenda tem até este número de linhas, quebradas no ponto mais equilibrado. */
  maxLinhas: number;
  /** Uma linha fica no máximo este tempo na tela, em segundos. */
  maxSegundos: number;
  /** Uma pausa maior que esta (segundos) na fala começa uma linha nova. */
  pausa: number;
};

export const OPCOES_DA_FALA: OpcoesDaFala = { maxCaracteres: 42, maxLinhas: 1, maxSegundos: 4.5, pausa: 0.6 };

/** Largura média de uma letra, em frações do tamanho da fonte (as fontes do TakeOne, em negrito). */
const LARGURA_DA_LETRA = 0.6;
/** A legenda ocupa no máximo esta fração da largura do quadro. */
const LARGURA_UTIL = 0.9;

/**
 * Quantas letras cabem numa linha no quadro do projeto, com o tamanho da letra do estilo (fração do
 * lado menor do quadro). No 9:16, com o tamanho padrão, uns 21; no 16:9, uns 38.
 */
export function opcoesParaOQuadro(proporcao: string, tamanhoDaLetra: number): OpcoesDaFala {
  const [l, a] = proporcao.split(":").map(Number);
  const larguraEmLadosMenores = l && a ? l / Math.min(l, a) : 1;
  const maxCaracteres = Math.max(10, Math.floor((LARGURA_UTIL * larguraEmLadosMenores) / (LARGURA_DA_LETRA * tamanhoDaLetra)));
  return { ...OPCOES_DA_FALA, maxCaracteres, maxLinhas: 2 };
}

/** As palavras em até `maxLinhas` linhas de até `max` letras, ou null se não couberem. Duas linhas ficam equilibradas. */
export function quebrarEmLinhas(palavras: string[], max: number, maxLinhas: number): string[] | null {
  const inteira = palavras.join(" ");
  if (inteira.length <= max) return [inteira];
  if (maxLinhas < 2) return null;
  let melhor: string[] | null = null;
  for (let i = 1; i < palavras.length; i++) {
    const linhas = [palavras.slice(0, i).join(" "), palavras.slice(i).join(" ")];
    if (linhas.some((linha) => linha.length > max)) continue;
    if (!melhor || Math.max(...linhas.map((x) => x.length)) < Math.max(...melhor.map((x) => x.length))) melhor = linhas;
  }
  return melhor;
}

/** Fim de frase: a linha termina aqui, mesmo com espaço sobrando. */
const FIM_DE_FRASE = /[.!?…]["»”)]?$/;

/**
 * As legendas da fala dos clipes, em ordem e sem sobreposição.
 * palavras: id da mídia → palavras da transcrição dela (as mídias sem transcrição ficam de fora).
 */
export function legendasDaFala(clipes: Clipe[], palavras: Map<string, Palavra[]>, opcoes: OpcoesDaFala = OPCOES_DA_FALA): Legenda[] {
  const legendas: Legenda[] = [];
  for (const clipe of [...clipes].sort((a, b) => a.inicio - b.inicio)) {
    const daMidia = clipe.midia_id ? palavras.get(clipe.midia_id) : undefined;
    if (!daMidia?.length) continue;
    const entrada = clipe.entrada / TICKS_POR_SEGUNDO;
    const fimNaMidia = entrada + (clipe.duracao / TICKS_POR_SEGUNDO) * clipe.velocidade;
    const fimDoClipe = clipe.inicio + clipe.duracao;
    // Segundos da mídia → tick da linha do tempo, dentro do clipe
    const noTempo = (s: number): Tick =>
      Math.min(fimDoClipe, Math.max(clipe.inicio, clipe.inicio + Math.round(((s - entrada) / clipe.velocidade) * TICKS_POR_SEGUNDO)));

    let linha: Palavra[] = [];
    const fechar = () => {
      if (!linha.length) return;
      const inicio = noTempo(linha[0].inicio);
      const fim = noTempo(linha[linha.length - 1].fim);
      const textos = linha.map((p) => p.texto);
      const conteudo = (quebrarEmLinhas(textos, opcoes.maxCaracteres, opcoes.maxLinhas) ?? [textos.join(" ")]).join("\n");
      if (fim > inicio) legendas.push({ inicio, fim, conteudo });
      linha = [];
    };
    // Só as palavras que começam dentro do trecho que o clipe usa
    for (const palavra of daMidia.filter((p) => p.inicio >= entrada && p.inicio < fimNaMidia)) {
      const anterior = linha.at(-1);
      if (anterior) {
        const cabe = quebrarEmLinhas([...linha, palavra].map((p) => p.texto), opcoes.maxCaracteres, opcoes.maxLinhas) !== null;
        const pausa = (palavra.inicio - anterior.fim) / clipe.velocidade;
        const duracao = (palavra.fim - linha[0].inicio) / clipe.velocidade;
        if (pausa > opcoes.pausa || !cabe || duracao > opcoes.maxSegundos) fechar();
      }
      linha.push(palavra);
      if (FIM_DE_FRASE.test(palavra.texto)) fechar();
    }
    fechar();
  }
  return legendas;
}
