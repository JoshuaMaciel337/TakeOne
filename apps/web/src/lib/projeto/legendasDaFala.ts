// Legendas automáticas: a fala dos clipes (lib/projeto/fala.ts) vira linhas de legenda. Uma linha
// nunca passa de um clipe para o outro, quebra em pausas e fins de frase e cabe na largura do quadro.
// Função pura.
import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { falaDosClipes, type Palavra, type PalavraNoTempo } from "./fala.ts";
import type { Legenda } from "./legendas.ts";
import type { Clipe } from "./modelo.ts";

export type { Palavra } from "./fala.ts";

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

/** As legendas da fala dos clipes, em ordem e sem sobreposição. */
export function legendasDaFala(clipes: Clipe[], palavras: Map<string, Palavra[]>, opcoes: OpcoesDaFala = OPCOES_DA_FALA): Legenda[] {
  const legendas: Legenda[] = [];
  for (const { palavras: doClipe } of falaDosClipes(clipes, palavras)) {
    let linha: PalavraNoTempo[] = [];
    const fechar = () => {
      if (!linha.length) return;
      const textos = linha.map((p) => p.texto);
      const conteudo = (quebrarEmLinhas(textos, opcoes.maxCaracteres, opcoes.maxLinhas) ?? [textos.join(" ")]).join("\n");
      const inicio = linha[0].inicio;
      const fim = linha[linha.length - 1].fim;
      if (fim > inicio) legendas.push({ inicio, fim, conteudo, tempos: linha.map((p) => p.inicio) });
      linha = [];
    };
    for (const palavra of doClipe) {
      const anterior = linha.at(-1);
      if (anterior) {
        const cabe = quebrarEmLinhas([...linha, palavra].map((p) => p.texto), opcoes.maxCaracteres, opcoes.maxLinhas) !== null;
        const pausa = (palavra.inicio - anterior.fim) / TICKS_POR_SEGUNDO;
        const duracao = (palavra.fim - linha[0].inicio) / TICKS_POR_SEGUNDO;
        if (pausa > opcoes.pausa || !cabe || duracao > opcoes.maxSegundos) fechar();
      }
      linha.push(palavra);
      if (FIM_DE_FRASE.test(palavra.texto)) fechar();
    }
    fechar();
  }
  return legendas;
}
