// Tabela de amostras (quadros comprimidos) de um vídeo, para o decodificador da prévia achar o que
// decodificar. Funções puras, sem WebCodecs e sem o leitor de MP4, para poderem ser testadas.
//
// As amostras ficam na ordem de decodificação. Com quadros B, essa ordem é diferente da de exibição,
// e o tempo de exibição de cada uma vem do `cts` menos o início da lista de edição (`elst`), como o
// FFmpeg faz no render.

/** Tempos em microssegundos, a unidade do WebCodecs. */
export type Amostra = {
  /** Byte do arquivo onde a amostra começa. */
  posicao: number;
  tamanho: number;
  /** Instante em que o quadro aparece. */
  tempo: number;
  duracao: number;
  /** Quadro-chave: a decodificação pode começar nele. */
  chave: boolean;
};

/** O que o leitor de MP4 devolve de cada amostra. */
export type AmostraDoArquivo = { offset: number; size: number; cts: number; duration: number; is_sync: boolean };

export function montarAmostras(amostras: AmostraDoArquivo[], escalaDeTempo: number, inicioDaEdicao = 0): Amostra[] {
  const microssegundos = (valor: number) => Math.round((valor * 1_000_000) / escalaDeTempo);
  return amostras.map((amostra) => ({
    posicao: amostra.offset,
    tamanho: amostra.size,
    tempo: microssegundos(amostra.cts - inicioDaEdicao),
    duracao: microssegundos(amostra.duration),
    chave: amostra.is_sync,
  }));
}

/** Índices das amostras na ordem de exibição. */
export function ordemDeExibicao(amostras: Amostra[]): number[] {
  return amostras.map((_, indice) => indice).sort((a, b) => amostras[a].tempo - amostras[b].tempo);
}

/**
 * A amostra (índice na ordem de decodificação) que está na tela no instante `t`: a última que começa
 * até `t`. Antes do primeiro quadro, o primeiro; depois do último, o último.
 */
export function amostraNoTempo(amostras: Amostra[], exibicao: number[], t: number): number {
  if (!exibicao.length) return -1;
  let baixo = 0;
  let alto = exibicao.length - 1;
  let achado = 0;
  while (baixo <= alto) {
    const meio = (baixo + alto) >> 1;
    if (amostras[exibicao[meio]].tempo <= t) {
      achado = meio;
      baixo = meio + 1;
    } else {
      alto = meio - 1;
    }
  }
  return exibicao[achado];
}

/** O quadro-chave de onde a decodificação tem que começar para chegar à amostra. */
export function chaveAnterior(amostras: Amostra[], indice: number): number {
  for (let i = indice; i > 0; i--) if (amostras[i].chave) return i;
  return 0;
}

/** Fim (exclusivo) do grupo de quadros que começa no quadro-chave `inicio`. */
export function fimDoGrupo(amostras: Amostra[], inicio: number): number {
  let fim = inicio + 1;
  while (fim < amostras.length && !amostras[fim].chave) fim++;
  return fim;
}

/** Bytes do arquivo que contêm as amostras de `inicio` até `fim` (exclusivo): [primeiro, último + 1). */
export function bytesDasAmostras(amostras: Amostra[], inicio: number, fim: number): [number, number] {
  let primeiro = Number.POSITIVE_INFINITY;
  let ultimo = 0;
  for (let i = inicio; i < fim; i++) {
    primeiro = Math.min(primeiro, amostras[i].posicao);
    ultimo = Math.max(ultimo, amostras[i].posicao + amostras[i].tamanho);
  }
  return [primeiro, ultimo];
}

/** Folga para o arredondamento dos microssegundos. */
const FOLGA_US = 500;

/**
 * Entre quadros decodificados (em ordem de exibição), o que fica na tela no instante `t`:
 * o último que começa até `t`. -1 se todos começam depois.
 */
export function quadroParaMostrar(inicios: number[], t: number): number {
  let escolhido = -1;
  for (let i = 0; i < inicios.length; i++) {
    if (inicios[i] <= t + FOLGA_US) escolhido = i;
    else break;
  }
  return escolhido;
}
