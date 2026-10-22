// Keyframes: posição, escala, rotação e opacidade mudando ao longo do clipe. Cada propriedade tem a
// sua lista de pontos (tempo desde o começo do clipe, valor e a curva até o ponto seguinte). Antes do
// primeiro ponto vale o primeiro valor; depois do último, o último. As animações de entrada e saída e
// as transições continuam por cima (lib/projeto/animacao.ts e transicao.ts).
//
// Por cima dos pontos, cada propriedade pode ter uma expressão: "repetir" (depois do último ponto, o
// movimento volta do primeiro, em ciclo ou em vaivém) e "tremer" (um tremido suave, que soma ao valor;
// sem pontos, treme em volta do valor fixo). O tremido é uma soma de três senos de frequências que não
// se repetem juntas, porque o FFmpeg faz a mesma conta numa expressão.
//
// A mesma conta está em core/utils/keyframes.py, conferida pelos casos de tests/casos/keyframes.json.
// No render ela vira expressões do FFmpeg (posição, escala e rotação) e comandos por quadro (opacidade).
import type { Tick } from "../tempo.ts";
import type { Clipe, Transformacao } from "./modelo.ts";

export type Curva = "linear" | "suave" | "acelerar" | "frear" | "parado";

/** As curvas na ordem do seletor do painel. */
export const CURVAS_DE_KEYFRAME: { id: Curva; nome: string }[] = [
  { id: "linear", nome: "Linear" },
  { id: "suave", nome: "Suave" },
  { id: "acelerar", nome: "Acelerando" },
  { id: "frear", nome: "Freando" },
  { id: "parado", nome: "Parado" },
];
/** `t`: tempo desde o começo do clipe, na linha do tempo. `curva`: como o valor vai até o ponto seguinte. */
export type Keyframe = { t: Tick; valor: number; curva: Curva };
export type PropriedadeAnimavel = "x" | "y" | "escala" | "rotacao" | "opacidade";
export type Keyframes = Partial<Record<PropriedadeAnimavel, Keyframe[]>>;

export type Repeticao = "ciclo" | "vaivem";
/**
 * `periodo`: duração de um ciclo do tremido (mesma unidade dos tempos). `amplitude`: quanto ele soma, no
 * máximo, na unidade da propriedade. `deslocamento`: o tempo que o tremido já tinha andado quando o clipe
 * começou (aparar o começo e dividir somam aqui, para o movimento continuar igual).
 */
export type Tremor = { periodo: Tick; amplitude: number; deslocamento: Tick };
export type Expressao = { repetir?: Repeticao | null; tremer?: Tremor | null };
export type Expressoes = Partial<Record<PropriedadeAnimavel, Expressao>>;

export const PROPRIEDADES_ANIMAVEIS: PropriedadeAnimavel[] = ["x", "y", "escala", "rotacao", "opacidade"];
/** Fase do tremido de cada propriedade, para x e y não tremerem juntos. */
export const FASE_DO_TREMOR: Record<PropriedadeAnimavel, number> = { x: 0, y: 7.3, escala: 13.1, rotacao: 19.7, opacidade: 29.3 };
/** A menor escala que a expressão deixa sair (o tremido não vira o clipe do avesso). */
export const ESCALA_MINIMA = 0.01;
/** Pontos por propriedade, no máximo (o render monta uma expressão com todos). */
export const KEYFRAMES_POR_PROPRIEDADE = 100;

/**
 * Quanto do caminho até o ponto seguinte já foi andado em `p` (0 a 1) do tempo. Suave é a curva em S (começa e
 * termina devagar); acelerando começa devagar; freando termina devagar; parado fica no valor até o próximo
 * ponto e salta nele. A mesma conta em core/utils/keyframes.py e nas expressões do FFmpeg.
 */
export function andadoNaCurva(curva: Curva, p: number): number {
  if (curva === "suave") return p * p * (3 - 2 * p);
  if (curva === "acelerar") return p * p;
  if (curva === "frear") return p * (2 - p);
  if (curva === "parado") return 0;
  return p;
}

/** O valor da propriedade no instante `t` (desde o começo do clipe). A lista vem em ordem. */
export function valorNoTempo(pontos: Keyframe[], t: Tick): number {
  if (t <= pontos[0].t) return pontos[0].valor;
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = pontos[i];
    const b = pontos[i + 1];
    if (t < b.t) {
      const p = (t - a.t) / (b.t - a.t);
      return a.valor + (b.valor - a.valor) * andadoNaCurva(a.curva, p);
    }
  }
  return pontos[pontos.length - 1].valor;
}

/** Ruído suave entre -1 e 1: `s` é quantos ciclos já passaram. */
export function ruido(s: number): number {
  const w = 2 * Math.PI * s;
  return (Math.sin(w + 1.3) + 0.6 * Math.sin(1.73 * w + 4.1) + 0.35 * Math.sin(2.91 * w + 2.2)) / 1.95;
}

/** O instante dentro dos pontos que vale em `local`: depois do último, volta do primeiro (ciclo) ou para trás (vaivém). */
export function tempoRepetido(pontos: Keyframe[], local: number, modo: Repeticao): number {
  const primeiro = pontos[0].t;
  const periodo = pontos[pontos.length - 1].t - primeiro;
  if (pontos.length < 2 || periodo <= 0 || local <= primeiro + periodo) return local;
  const passado = local - primeiro;
  if (modo === "ciclo") return primeiro + (passado % periodo);
  const q = passado % (2 * periodo);
  return primeiro + (q < periodo ? q : 2 * periodo - q);
}

/** O valor de uma propriedade em `local` (desde o começo do clipe), com os pontos e a expressão. */
export function valorComExpressao(
  pontos: Keyframe[] | undefined,
  fixo: number,
  expressao: Expressao | undefined,
  propriedade: PropriedadeAnimavel,
  local: number,
): number {
  let valor = fixo;
  if (pontos?.length) valor = valorNoTempo(pontos, expressao?.repetir ? tempoRepetido(pontos, local, expressao.repetir) : local);
  const tremor = expressao?.tremer;
  if (tremor && tremor.periodo > 0 && tremor.amplitude !== 0) {
    valor += tremor.amplitude * ruido((local + tremor.deslocamento) / tremor.periodo + FASE_DO_TREMOR[propriedade]);
    if (propriedade === "opacidade") valor = Math.min(1, Math.max(0, valor));
    if (propriedade === "escala") valor = Math.max(ESCALA_MINIMA, valor);
  }
  return valor;
}

/** As propriedades que mudam com o tempo: as que têm pontos ou tremido. */
export function propriedadesAnimadas(clipe: Pick<Clipe, "keyframes" | "expressoes">): PropriedadeAnimavel[] {
  return PROPRIEDADES_ANIMAVEIS.filter((p) => !!clipe.keyframes?.[p]?.length || !!clipe.expressoes?.[p]?.tremer);
}

/** A transformação do clipe no instante `t` da linha do tempo, com os keyframes (sem as animações). */
export function transformacaoNoTempo(clipe: Pick<Clipe, "inicio" | "transformacao" | "keyframes" | "expressoes">, t: Tick): Transformacao {
  if (!clipe.keyframes && !clipe.expressoes) return clipe.transformacao;
  const resultado = { ...clipe.transformacao };
  for (const propriedade of PROPRIEDADES_ANIMAVEIS) {
    const pontos = clipe.keyframes?.[propriedade];
    const expressao = clipe.expressoes?.[propriedade];
    if (pontos?.length || expressao?.tremer) {
      resultado[propriedade] = valorComExpressao(pontos, clipe.transformacao[propriedade], expressao, propriedade, t - clipe.inicio);
    }
  }
  return resultado;
}

/**
 * A transformação no instante sem o tremido: o que o painel mostra e o que vira ponto ao editar (com o
 * tremido, cada ponto novo levaria o ruído daquele instante). A repetição continua valendo.
 */
export function transformacaoParaEditar(clipe: Pick<Clipe, "inicio" | "transformacao" | "keyframes" | "expressoes">, t: Tick): Transformacao {
  if (!clipe.expressoes) return transformacaoNoTempo(clipe, t);
  const semTremor: Expressoes = {};
  for (const propriedade of PROPRIEDADES_ANIMAVEIS) {
    const expressao = clipe.expressoes[propriedade];
    if (expressao) semTremor[propriedade] = { ...expressao, tremer: null };
  }
  return transformacaoNoTempo({ ...clipe, expressoes: semTremor }, t);
}

/** As expressões do clipe que passou a começar `delta` depois no mesmo trecho: o tremido continua de onde estava. */
export function deslocarExpressoes(expressoes: Expressoes | null | undefined, delta: Tick): Expressoes | null | undefined {
  if (!expressoes || delta === 0) return expressoes;
  const resultado: Expressoes = {};
  for (const propriedade of PROPRIEDADES_ANIMAVEIS) {
    const expressao = expressoes[propriedade];
    if (!expressao) continue;
    resultado[propriedade] = expressao.tremer ? { ...expressao, tremer: { ...expressao.tremer, deslocamento: expressao.tremer.deslocamento + delta } } : expressao;
  }
  return resultado;
}

/** O ponto da propriedade que está em `t` (com folga de meio quadro), ou undefined. */
export function keyframeEm(pontos: Keyframe[] | undefined, t: Tick, meioQuadro: Tick): Keyframe | undefined {
  return pontos?.find((ponto) => Math.abs(ponto.t - t) <= meioQuadro);
}

/** Os pontos deslocados: o clipe passou a começar `delta` depois no mesmo trecho da mídia. */
export function deslocarKeyframes(keyframes: Keyframes | null | undefined, delta: Tick): Keyframes | null | undefined {
  if (!keyframes || delta === 0) return keyframes;
  const resultado: Keyframes = {};
  for (const propriedade of PROPRIEDADES_ANIMAVEIS) {
    const pontos = keyframes[propriedade];
    if (pontos) resultado[propriedade] = pontos.map((ponto) => ({ ...ponto, t: ponto.t - delta }));
  }
  return resultado;
}
