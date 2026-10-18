// Montagem automática a partir de vários clipes: com a nota de cada instante dos vídeos (worker,
// core/utils/qualidade.py) e, se houver, as batidas da música, escolhe os melhores trechos e a duração
// de cada um. Função pura.
//
// Os clipes se revezam na ordem em que a pessoa escolheu (um trecho de cada, depois o próximo), para a
// montagem não ficar presa num vídeo só. De cada clipe sai o melhor trecho que ainda não foi usado, sem
// atravessar um corte de cena e com nota mínima; imagens entram inteiras, uma vez. Com música, cada
// trecho dura um número inteiro de batidas (perto de TAMANHO_IDEAL_S) e os cortes caem nas batidas;
// sem música, todos duram TAMANHO_SEM_MUSICA_S.

/** A nota de um vídeo, como a API devolve: t em segundos da mídia, nota de 0 a 1 e corte de cena. */
export type Qualidade = { t: number[]; nota: number[]; corte: boolean[] };

export type ClipeParaMontar = { midiaId: string; duracaoS: number; imagem?: boolean; qualidade?: Qualidade };

export type TrechoMontado = { midiaId: string; entradaS: number; duracaoS: number };

export type Montagem = {
  trechos: TrechoMontado[];
  /** Onde a música começa a tocar (segundos da música): a primeira batida usada fica no primeiro corte. */
  entradaDaMusicaS: number;
};

export const TAMANHO_IDEAL_S = 2.4;
export const TAMANHO_SEM_MUSICA_S = 2.5;
/** Trecho com nota média abaixo disto não entra (borrado, escuro, tremido). */
export const NOTA_MINIMA = 0.4;
/** Nota dada às imagens paradas, que não têm análise. */
const NOTA_DA_IMAGEM = 0.8;
/** Folga entre dois trechos do mesmo vídeo, para não repetir quase a mesma imagem. */
const FOLGA_S = 0.75;
/** Passo em que o começo de um trecho é procurado. */
const PASSO_S = 0.25;

/**
 * As durações dos trechos: com batidas, de k em k batidas (k para ficar perto do tamanho ideal), a partir
 * da primeira; sem elas, iguais. `alvoS` limita a soma (null: até acabarem os trechos bons ou as batidas).
 */
export function duracoesDosTrechos(batidas: number[] | null, alvoS: number | null, maximo: number): { duracoes: number[]; inicio: number } {
  if (batidas && batidas.length >= 2) {
    const intervalos = batidas.slice(1).map((b, i) => b - batidas[i]).sort((a, b) => a - b);
    const periodo = intervalos[Math.floor(intervalos.length / 2)];
    const passo = Math.max(1, Math.round(TAMANHO_IDEAL_S / periodo));
    const duracoes: number[] = [];
    let soma = 0;
    for (let i = 0; i + passo < batidas.length && duracoes.length < maximo; i += passo) {
      const duracao = batidas[i + passo] - batidas[i];
      if (alvoS !== null && soma + duracao > alvoS + periodo / 2) break;
      duracoes.push(duracao);
      soma += duracao;
    }
    return { duracoes, inicio: batidas[0] };
  }
  const quantos = alvoS === null ? maximo : Math.min(maximo, Math.max(1, Math.round(alvoS / TAMANHO_SEM_MUSICA_S)));
  return { duracoes: Array(quantos).fill(TAMANHO_SEM_MUSICA_S), inicio: 0 };
}

type Usado = { de: number; ate: number };

/** O melhor trecho de `duracao` segundos ainda livre num vídeo, ou null. */
export function melhorTrecho(clipe: ClipeParaMontar, duracao: number, usados: Usado[]): { entradaS: number; nota: number } | null {
  if (clipe.duracaoS < duracao) return null;
  const livre = (de: number) => usados.every((u) => de + duracao + FOLGA_S <= u.de || de >= u.ate + FOLGA_S);
  if (clipe.imagem) return usados.length ? null : { entradaS: 0, nota: NOTA_DA_IMAGEM };
  const q = clipe.qualidade;
  if (!q || !q.t.length) return null;
  let melhor: { entradaS: number; nota: number } | null = null;
  for (let de = 0; de + duracao <= clipe.duracaoS + 1e-9; de += PASSO_S) {
    if (!livre(de)) continue;
    let soma = 0;
    let quantos = 0;
    let cortado = false;
    for (let i = 0; i < q.t.length && q.t[i] < de + duracao; i++) {
      if (q.t[i] < de) continue;
      // Um corte de cena no meio do trecho mostraria duas cenas num corte só
      if (q.corte[i] && q.t[i] > de + 1e-9) cortado = true;
      soma += q.nota[i];
      quantos++;
    }
    if (cortado || !quantos) continue;
    const nota = soma / quantos;
    if (nota >= NOTA_MINIMA && (!melhor || nota > melhor.nota + 1e-9)) melhor = { entradaS: Math.round(de * 1000) / 1000, nota };
  }
  return melhor;
}

/** Os trechos da montagem, na ordem em que entram na linha do tempo. */
export function montar(clipes: ClipeParaMontar[], batidas: number[] | null, alvoS: number | null): Montagem {
  // Sem alvo, no máximo um trecho a cada 2 s de vídeo escolhido (e nunca mais que 200)
  const totalS = clipes.reduce((soma, c) => soma + (c.imagem ? TAMANHO_IDEAL_S : c.duracaoS), 0);
  const maximo = Math.min(200, Math.max(1, Math.ceil(totalS / 2)));
  const { duracoes, inicio } = duracoesDosTrechos(batidas, alvoS, maximo);
  const usados = clipes.map((): Usado[] => []);
  const trechos: TrechoMontado[] = [];
  let vez = 0;
  for (const duracao of duracoes) {
    let escolhido: { indice: number; entradaS: number } | null = null;
    for (let tentativa = 0; tentativa < clipes.length && !escolhido; tentativa++) {
      const indice = (vez + tentativa) % clipes.length;
      const trecho = melhorTrecho(clipes[indice], duracao, usados[indice]);
      if (trecho) escolhido = { indice, entradaS: trecho.entradaS };
    }
    // Nenhum clipe tem mais um trecho bom deste tamanho: a montagem acaba aqui
    if (!escolhido) break;
    const clipe = clipes[escolhido.indice];
    usados[escolhido.indice].push({ de: escolhido.entradaS, ate: escolhido.entradaS + duracao });
    trechos.push({ midiaId: clipe.midiaId, entradaS: escolhido.entradaS, duracaoS: duracao });
    vez = escolhido.indice + 1;
  }
  return { trechos, entradaDaMusicaS: inicio };
}
