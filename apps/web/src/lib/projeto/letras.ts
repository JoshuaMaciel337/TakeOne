// Texto que aparece letra a letra e palavra destacada. Espelha core/utils/letras.py: a mesma conta,
// conferida pelos casos de tests/casos/letras.json. O PNG do texto é um só; o que muda é o trecho
// de letras [de, ate) que aparece, na ordem de leitura. O layout (onde fica cada letra, em frações
// da imagem) vem da API junto com a imagem, e o shader da prévia esconde o resto.
import type { Tick } from "../tempo.ts";
import type { Animacao, Animacoes } from "./animacao.ts";
import type { Texto } from "./texto.ts";

/** Onde fica cada letra no PNG do texto (core/utils/texto.py, layout_do_texto). */
export type LayoutDoTexto = {
  /** Quantas letras, sem as quebras de linha. */
  n: number;
  /** [de, ate) de cada palavra. */
  palavras: [number, number][];
  /** A faixa de cada linha e o x onde cada letra começa, mais o fim. */
  linhas: { y0: number; y1: number; xs: number[] }[];
};

/** [de, ate): as letras que aparecem. */
export type Trecho = [number, number];

/** Máscara em frações da imagem: o que fica antes de `de` e a partir de `ate` some. */
export type Cortes = { de: [number, number, number]; ate: [number, number, number] };

export const TIPOS_LETRA_A_LETRA = ["letras", "palavras"] as const;

/** Folga nas contas com frações: o mesmo instante dá a mesma letra na prévia e no render. */
const EPSILON = 1e-9;

type ClipeComTexto = { inicio: Tick; duracao: Tick; animacao?: Animacoes | null; texto?: Texto | null };

function ativa(item: Animacao | undefined): item is Animacao {
  return !!item && (TIPOS_LETRA_A_LETRA as readonly string[]).includes(item.tipo) && item.duracao > 0;
}

function atePeloProgresso(tipo: string, p: number, layout: LayoutDoTexto): number {
  const { n, palavras } = layout;
  if (tipo === "letras") return Math.min(n, Math.floor(p * n + EPSILON));
  const mostradas = Math.min(palavras.length, Math.floor(p * palavras.length + EPSILON));
  return mostradas >= palavras.length ? n : palavras[mostradas][0];
}

/** Quando cada palavra começa, desde o começo do clipe. Sem tempos, pelo número de letras. */
export function temposDasPalavras(texto: Pick<Texto, "tempos">, layout: LayoutDoTexto, duracao: number): number[] {
  const tempos = texto.tempos;
  if (tempos && tempos.length === layout.palavras.length) return [...tempos];
  const n = Math.max(layout.n, 1);
  return layout.palavras.map(([de]) => (duracao * de) / n);
}

/** A última palavra que já começou em `t` (desde o começo do clipe), ou -1. */
export function palavraNoTempo(tempos: number[], t: number): number {
  let atual = -1;
  tempos.forEach((inicio, indice) => {
    if (inicio <= t + EPSILON) atual = indice;
  });
  return atual;
}

/**
 * O trecho que aparece em `t` (mesma unidade do clipe), ou null quando aparece tudo.
 * destaque: a conta da imagem do destaque, em vez da do texto.
 */
export function trechoVisivel(clipe: ClipeComTexto, layout: LayoutDoTexto, t: number, destaque = false): Trecho | null {
  const { n } = layout;
  const local = t - clipe.inicio;
  if (destaque) {
    const texto = clipe.texto!;
    const atual = palavraNoTempo(temposDasPalavras(texto, layout, clipe.duracao), local);
    if (atual < 0) return [0, 0];
    const de = texto.destaque?.modo === "palavra" ? layout.palavras[atual][0] : 0;
    // Com o texto entrando letra a letra, o destaque não passa do que já apareceu
    const aparecido = trechoVisivel(clipe, layout, t);
    const ate = aparecido ? Math.min(layout.palavras[atual][1], aparecido[1]) : layout.palavras[atual][1];
    return [Math.min(de, ate), ate];
  }
  const animacao = clipe.animacao;
  let ate = n;
  const limitar = (p: number) => Math.min(1, Math.max(0, p));
  if (ativa(animacao?.entrada)) ate = Math.min(ate, atePeloProgresso(animacao.entrada.tipo, limitar(local / animacao.entrada.duracao), layout));
  if (ativa(animacao?.saida)) ate = Math.min(ate, atePeloProgresso(animacao.saida.tipo, limitar((clipe.duracao - local) / animacao.saida.duracao), layout));
  return ate >= n ? null : [0, ate];
}

function posicao(layout: LayoutDoTexto, indice: number): { linha: LayoutDoTexto["linhas"][number]; x: number } {
  let contadas = 0;
  for (const linha of layout.linhas) {
    const letras = linha.xs.length - 1;
    if (indice < contadas + letras) return { linha, x: linha.xs[indice - contadas] };
    contadas += letras;
  }
  return { linha: layout.linhas[layout.linhas.length - 1], x: 1 };
}

/** A máscara do trecho, em frações da imagem (veja `cortes` em core/utils/letras.py). */
export function cortesDoTrecho(layout: LayoutDoTexto, [de, ate]: Trecho): Cortes {
  let corteDe: [number, number, number] = [0, 0, 0];
  if (de > 0) {
    const { linha, x } = posicao(layout, de);
    corteDe = [linha.y0, linha.y1, x];
  }
  let corteAte: [number, number, number] = [1, 1, 1];
  if (ate < layout.n) {
    const { linha, x } = posicao(layout, ate);
    corteAte = [linha.y0, linha.y1, x];
  }
  return { de: corteDe, ate: corteAte };
}

export function temLetraALetra(animacao: Animacoes | null | undefined): boolean {
  return ativa(animacao?.entrada) || ativa(animacao?.saida);
}

/** O texto na cor do destaque, sem fundo nem sombra: ele cobre as letras do texto de baixo. */
export function textoDoDestaque(texto: Texto): Texto {
  return { ...texto, cor: texto.destaque!.cor, fundo_opacidade: 0, sombra: 0, brilho: 0, destaque: null };
}
