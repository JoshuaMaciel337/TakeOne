// Ajustar a música à duração do vídeo: em vez de cortar o fim, tira (ou repete) compassos do meio, sempre
// cortando em tempos fortes, para a música começar como começava e acabar no fim dela, junto com o vídeo.
// Funções puras, em segundos da mídia; os tempos fortes vêm das batidas do worker (lib/projeto/ritmo.ts).

/** Um trecho da mídia, em segundos. */
export type Trecho = { inicio: number; fim: number };
/** Os trechos em sequência e quanto ainda sobrou no fim (cortado com um fade, quando nenhum corte serve). */
export type PlanoDaMusica = { trechos: Trecho[]; sobra: number };

/** Os cortes ficam a pelo menos isto das pontas de cada trecho, para nenhum pedaço sair curto demais. */
export const MARGEM_DO_CORTE_S = 1;
/** Abaixo disso de diferença, a música já tem a duração do vídeo. */
const TOLERANCIA_S = 0.05;
/** O trecho que se repete, para alongar, fica entre 15% e 85% da música (longe da introdução e do final). */
const MIOLO = [0.15, 0.85] as const;

const duracaoDos = (trechos: Trecho[]) => trechos.reduce((soma, t) => soma + t.fim - t.inicio, 0);

/**
 * O plano para a música que começa em `entrada` (segundos da mídia) e vai até `fim` tocar `alvo` segundos.
 * Para encurtar, tira o trecho entre dois tempos fortes cuja distância é a mais perto do que sobra; para
 * alongar, repete o miolo (de um tempo forte a outro) até passar do alvo e depois encurta como acima. O que
 * nenhum par de tempos fortes acerta fica para o fim: falta (a música acaba um pouco antes) ou sobra (cortada
 * com um fade). Sem tempos fortes, só corta o fim.
 */
export function planoDaMusica(entrada: number, fim: number, fortes: number[], alvo: number): PlanoDaMusica {
  const duracao = fim - entrada;
  if (alvo <= 0) return { trechos: [], sobra: 0 };
  if (Math.abs(duracao - alvo) <= TOLERANCIA_S) return { trechos: [{ inicio: entrada, fim }], sobra: 0 };
  let trechos: Trecho[] = [{ inicio: entrada, fim }];
  const ordenados = [...fortes].filter((f) => f > entrada && f < fim).sort((a, b) => a - b);
  if (alvo > duracao) {
    // Repetir o miolo: do primeiro tempo forte depois de 15% ao último antes de 85%
    const miolo = ordenados.filter((f) => f >= entrada + MIOLO[0] * duracao && f <= entrada + MIOLO[1] * duracao);
    const de = miolo[0];
    const ate = miolo[miolo.length - 1];
    if (de === undefined || ate - de < 2 * MARGEM_DO_CORTE_S) return { trechos, sobra: 0 };
    const vezes = Math.ceil((alvo - duracao) / (ate - de));
    trechos = [{ inicio: entrada, fim: ate }, ...Array.from({ length: vezes - 1 }, () => ({ inicio: de, fim: ate })), { inicio: de, fim }];
  }
  const excesso = duracaoDos(trechos) - alvo;
  if (excesso > TOLERANCIA_S) trechos = semUmTrecho(trechos, ordenados, excesso, alvo);
  const sobra = Math.max(0, duracaoDos(trechos) - alvo);
  if (sobra > TOLERANCIA_S) {
    // O que nenhum corte acertou sai do fim (com um fade, no comando)
    let resto = sobra;
    while (resto > 0 && trechos.length) {
      const ultimo = trechos[trechos.length - 1];
      const tamanho = ultimo.fim - ultimo.inicio;
      if (tamanho > resto) {
        trechos = [...trechos.slice(0, -1), { ...ultimo, fim: ultimo.fim - resto }];
        resto = 0;
      } else {
        trechos = trechos.slice(0, -1);
        resto -= tamanho;
      }
    }
    return { trechos, sobra };
  }
  return { trechos, sobra: 0 };
}

/** Cortes que erram até isto a mais que o melhor ainda valem, se ficarem mais perto do meio (uma batida a 120 BPM). */
const FOLGA_PARA_O_MEIO_S = 0.5;

/**
 * Tira de um dos trechos o pedaço entre dois tempos fortes com a distância mais perto de `excesso`. Valem
 * primeiro os que tiram pelo menos o excesso (a música acaba no final dela, um pouco antes do vídeo, em vez
 * de perder o fim num fade). Entre os que erram até FOLGA_PARA_O_MEIO_S a mais que o melhor, fica o corte mais
 * perto do meio da música no vídeo (`alvo`), onde ele chama menos atenção que perto da introdução ou do final.
 */
function semUmTrecho(trechos: Trecho[], fortes: number[], excesso: number, alvo: number): Trecho[] {
  const candidatos: { i: number; de: number; ate: number; erro: number; meio: number }[] = [];
  let antes = 0;
  for (const [i, trecho] of trechos.entries()) {
    const dentro = fortes.filter((f) => f >= trecho.inicio + MARGEM_DO_CORTE_S && f <= trecho.fim - MARGEM_DO_CORTE_S);
    for (let a = 0; a < dentro.length; a++) {
      for (let b = a + 1; b < dentro.length; b++) {
        candidatos.push({ i, de: dentro[a], ate: dentro[b], erro: Math.abs(dentro[b] - dentro[a] - excesso), meio: Math.abs(antes + dentro[a] - trecho.inicio - alvo / 2) });
      }
    }
    antes += trecho.fim - trecho.inicio;
  }
  if (!candidatos.length) return trechos;
  const inteiros = candidatos.filter((c) => c.ate - c.de >= excesso - TOLERANCIA_S);
  const escolhas = inteiros.length ? inteiros : candidatos;
  const menorErro = Math.min(...escolhas.map((c) => c.erro));
  const { i, de, ate } = escolhas.filter((c) => c.erro <= menorErro + FOLGA_PARA_O_MEIO_S).reduce((melhor, c) => (c.meio < melhor.meio ? c : melhor));
  const trecho = trechos[i];
  return [...trechos.slice(0, i), { inicio: trecho.inicio, fim: de }, { inicio: ate, fim: trecho.fim }, ...trechos.slice(i + 1)];
}
