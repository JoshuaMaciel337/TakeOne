// Velocidade com curva: a curva muda a velocidade ao longo do clipe sem mudar a duração dele nem o
// trecho da mídia. `velocidade` continua sendo a média; a curva (pontos u, s, com u de 0 a 1 no tempo
// do clipe e s o quanto mais rápido ou mais devagar) só redistribui o tempo. Espelha
// core/utils/velocidade.py (casos em tests/casos/velocidade.json): o decodificador da prévia pede o
// quadro pela mesma conta que o setpts do render.
//
// Fora de 0 a 1 (ao aparar e esticar o clipe) a curva continua com a velocidade da ponta.
import { type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";

/** (u, s): no instante u do clipe (0 a 1), s vezes a velocidade de base. */
export type PontoDeVelocidade = [number, number];

export const LIMITES_DA_CURVA = { minimo: 0.2, maximo: 5 } as const;
/** O som não acompanha abaixo disto (três atempo em série). */
export const ANDAMENTO_MINIMO = 0.125;

export const CURVAS_PRONTAS: { id: string; nome: string; pontos: PontoDeVelocidade[] }[] = [
  { id: "heroi", nome: "Câmera lenta no meio", pontos: [[0, 1], [0.35, 1], [0.45, 0.25], [0.6, 0.25], [0.7, 1], [1, 1]] },
  { id: "pulo", nome: "Pulo rápido", pontos: [[0, 0.5], [0.4, 0.5], [0.5, 3], [0.6, 0.5], [1, 0.5]] },
  { id: "flash", nome: "Flash", pontos: [[0, 3], [0.3, 3], [0.4, 0.6], [0.6, 0.6], [0.7, 3], [1, 3]] },
  { id: "acelerar", nome: "Acelerando", pontos: [[0, 0.4], [1, 2.5]] },
  { id: "frear", nome: "Freando", pontos: [[0, 2.5], [1, 0.4]] },
  { id: "montagem", nome: "Montagem", pontos: [[0, 1.5], [0.25, 0.5], [0.5, 1.5], [0.75, 0.5], [1, 1.5]] },
];

/** s no instante u (reta entre os pontos; fora deles, a ponta). */
export function fatorNaCurva(pontos: PontoDeVelocidade[], u: number): number {
  if (u <= pontos[0][0]) return pontos[0][1];
  for (let i = 0; i < pontos.length - 1; i++) {
    const [u0, s0] = pontos[i];
    const [u1, s1] = pontos[i + 1];
    if (u < u1) return s0 + ((s1 - s0) * (u - u0)) / (u1 - u0);
  }
  return pontos[pontos.length - 1][1];
}

/** A integral de s de 0 até u (exata: s é reta entre os pontos), também fora de 0 a 1. */
export function integralDaCurva(pontos: PontoDeVelocidade[], u: number): number {
  if (u <= 0) return u * pontos[0][1];
  let soma = 0;
  for (let i = 0; i < pontos.length - 1; i++) {
    const [u0, s0] = pontos[i];
    const [u1] = pontos[i + 1];
    const fim = Math.min(u, u1);
    if (fim > u0) soma += ((fim - u0) * (s0 + fatorNaCurva(pontos, fim))) / 2;
    if (u <= u1) return soma;
  }
  return soma + (u - 1) * pontos[pontos.length - 1][1];
}

/** Quanto do trecho da mídia já passou no instante u do clipe (0 em u = 0, 1 em u = 1). */
export function fracaoNaMidia(pontos: PontoDeVelocidade[], u: number): number {
  return integralDaCurva(pontos, u) / integralDaCurva(pontos, 1);
}

/** A velocidade de verdade no instante u: a de base vezes s, dividida pela média da curva. */
export function velocidadeNaCurva(pontos: PontoDeVelocidade[], velocidade: number, u: number): number {
  return (velocidade * fatorNaCurva(pontos, u)) / integralDaCurva(pontos, 1);
}

type ClipeComVelocidade = { inicio: Tick; duracao: Tick; entrada: Tick; velocidade: number; curva_velocidade?: PontoDeVelocidade[] | null };

/** O instante da mídia no instante `t` da linha do tempo, com a curva. */
export function tempoNaMidiaComCurva(clipe: ClipeComVelocidade & { curva_velocidade: PontoDeVelocidade[] }, t: Tick): Tick {
  const u = (t - clipe.inicio) / clipe.duracao;
  return clipe.entrada + Math.round(clipe.duracao * clipe.velocidade * fracaoNaMidia(clipe.curva_velocidade, u));
}

/**
 * Em que instante do clipe (segundos desde o começo dele) toca o instante `s` da mídia (segundos). Com
 * curva, é a inversa de tempoNaMidiaComCurva, por busca binária (a mídia só anda para a frente); sem
 * ela, a reta de sempre. Fora do trecho do clipe, segue a reta da velocidade média.
 */
export function segundosNoClipe(clipe: Omit<ClipeComVelocidade, "inicio">, s: number): number {
  const entrada = clipe.entrada / TICKS_POR_SEGUNDO;
  const pontos = clipe.curva_velocidade;
  if (!pontos) return (s - entrada) / clipe.velocidade;
  const duracao = clipe.duracao / TICKS_POR_SEGUNDO;
  const fracao = (s - entrada) / (duracao * clipe.velocidade);
  if (fracao <= 0 || fracao >= 1) return (s - entrada) / clipe.velocidade;
  let de = 0;
  let ate = 1;
  for (let i = 0; i < 40; i++) {
    const meio = (de + ate) / 2;
    if (fracaoNaMidia(pontos, meio) < fracao) de = meio;
    else ate = meio;
  }
  return ((de + ate) / 2) * duracao;
}

/** Pontos que uma curva de velocidade pode ter (o mesmo limite da API). */
export const PONTOS_MAXIMOS_DA_CURVA = 16;

/**
 * Tira os pontos que ficam na reta entre os vizinhos (esticar a borda além da curva repete o último
 * valor) e, se ainda passar do máximo, os que menos mudam a curva. As pontas ficam.
 */
function simplificarCurva(pontos: PontoDeVelocidade[]): PontoDeVelocidade[] {
  const lista = [...pontos];
  const desvio = (i: number) => {
    const [ua, sa] = lista[i - 1];
    const [u, s] = lista[i];
    const [ub, sb] = lista[i + 1];
    return Math.abs(s - (sa + ((sb - sa) * (u - ua)) / (ub - ua)));
  };
  for (let i = 1; i < lista.length - 1; ) {
    if (desvio(i) < 1e-9) lista.splice(i, 1);
    else i++;
  }
  while (lista.length > PONTOS_MAXIMOS_DA_CURVA) {
    let menor = 1;
    for (let i = 2; i < lista.length - 1; i++) if (desvio(i) < desvio(menor)) menor = i;
    lista.splice(menor, 1);
  }
  return lista;
}

/**
 * O pedaço [de, ate) da linha do tempo de um clipe com curva (para aparar, dividir e cortar): onde
 * ele começa na mídia, a velocidade média e a curva do pedaço (a mesma, recortada e esticada para 0 a 1).
 */
export function pedacoComCurva(
  clipe: ClipeComVelocidade & { curva_velocidade: PontoDeVelocidade[] },
  de: Tick,
  ate: Tick,
): { entrada: Tick; velocidade: number; curva_velocidade: PontoDeVelocidade[] } {
  const pontos = clipe.curva_velocidade;
  const u0 = (de - clipe.inicio) / clipe.duracao;
  const u1 = (ate - clipe.inicio) / clipe.duracao;
  // Os pontos de dentro do pedaço, com as pontas, levados para 0 a 1
  const dentro = pontos.filter(([u]) => u > u0 && u < u1);
  const recortada: PontoDeVelocidade[] = [[u0, fatorNaCurva(pontos, u0)], ...dentro, [u1, fatorNaCurva(pontos, u1)]].map(
    ([u, s]) => [(u - u0) / (u1 - u0), s] as PontoDeVelocidade,
  );
  const naMidia = clipe.duracao * clipe.velocidade * (fracaoNaMidia(pontos, u1) - fracaoNaMidia(pontos, u0));
  return {
    entrada: tempoNaMidiaComCurva(clipe, de),
    velocidade: naMidia / (ate - de),
    curva_velocidade: simplificarCurva(recortada),
  };
}
