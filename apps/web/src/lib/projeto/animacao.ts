// Animações de entrada, saída e loop dos clipes.
// A prévia aplica `transformacaoAnimada` a cada quadro; o render (core/utils/animacao.py) faz a
// mesma conta com expressões do FFmpeg. Os dois conferem os casos de tests/casos/animacao.json.
//
// A opacidade muda em linha reta, porque o render usa o filtro `fade` com alfa, que é linear.
// Movimento e zoom seguem uma curva que desacelera no fim (cúbica).
import type { Tick } from "../tempo.ts";
import { transformacaoNoTempo } from "./keyframes.ts";
import type { Clipe, Transformacao } from "./modelo.ts";

export type TipoAnimacao = "nenhuma" | "aparecer" | "subir" | "descer" | "deslizar" | "zoom";

export type Animacao = { tipo: TipoAnimacao; duracao: Tick };

/** Movimento que se repete durante o clipe inteiro, somado à entrada e à saída. */
export type TipoLoop = "nenhum" | "pulsar" | "balancar" | "flutuar" | "tremer";
/** periodo: quanto dura um ciclo; intensidade: 1 é o movimento normal. */
export type Loop = { tipo: TipoLoop; periodo: Tick; intensidade: number };

export type Animacoes = { entrada: Animacao; saida: Animacao; loop?: Loop | null };

export const TIPOS_ANIMACAO: { id: TipoAnimacao; nome: string }[] = [
  { id: "nenhuma", nome: "Nenhuma" },
  { id: "aparecer", nome: "Aparecer" },
  { id: "subir", nome: "Subir" },
  { id: "descer", nome: "Descer" },
  { id: "deslizar", nome: "Deslizar" },
  { id: "zoom", nome: "Zoom" },
];

export const TIPOS_LOOP: { id: TipoLoop; nome: string; periodo: number }[] = [
  { id: "nenhum", nome: "Nenhum", periodo: 1 },
  { id: "pulsar", nome: "Pulsar", periodo: 1 },
  { id: "balancar", nome: "Balançar", periodo: 2 },
  { id: "flutuar", nome: "Flutuar", periodo: 2 },
  { id: "tremer", nome: "Tremer", periodo: 1 },
];

/** O quanto cada loop mexe com intensidade 1: escala a mais, graus, frações da altura e do quadro. */
export const LOOP_PULSAR = 0.06;
export const LOOP_BALANCAR = 6;
export const LOOP_FLUTUAR = 0.02;
export const LOOP_TREMER = 0.008;
export const INTENSIDADE_MAXIMA_LOOP = 3;

export const SEM_ANIMACAO: Animacoes = { entrada: { tipo: "nenhuma", duracao: 0 }, saida: { tipo: "nenhuma", duracao: 0 } };

/** Quanto o clipe anda ao subir ou descer, em frações da altura do quadro. */
export const DISTANCIA_VERTICAL = 0.08;
/** Quanto o clipe anda ao deslizar, em frações da largura do quadro. */
export const DISTANCIA_HORIZONTAL = 0.15;
/** Tamanho de onde o zoom parte (ou para onde vai, na saída). */
export const ZOOM_INICIAL = 0.6;

function limitar(valor: number): number {
  return Math.min(1, Math.max(0, valor));
}

/** Curva que desacelera no fim. */
export function suavizar(p: number): number {
  return 1 - (1 - p) ** 3;
}

/** De 0 (começo da animação) a 1 (fim): quanto da entrada e da saída já aconteceu em `t`. */
export function progressoDasAnimacoes(clipe: Pick<Clipe, "inicio" | "duracao" | "animacao">, t: Tick): { entrada: number; saida: number } {
  const animacao = clipe.animacao ?? SEM_ANIMACAO;
  const ativa = (a: Animacao) => a.tipo !== "nenhuma" && a.duracao > 0;
  return {
    entrada: ativa(animacao.entrada) ? limitar((t - clipe.inicio) / animacao.entrada.duracao) : 1,
    saida: ativa(animacao.saida) ? limitar((clipe.inicio + clipe.duracao - t) / animacao.saida.duracao) : 1,
  };
}

/**
 * O que o loop soma no instante: s é quantos ciclos já passaram desde o começo do clipe. O tremor
 * mistura senos de frequências diferentes, para não parecer um vaivém.
 */
export function efeitoDoLoop(loop: Loop, s: number): { dx: number; dy: number; escala: number; rotacao: number } {
  const efeito = { dx: 0, dy: 0, escala: 1, rotacao: 0 };
  const i = loop.intensidade;
  const onda = (ciclos: number, fase = 0) => Math.sin(2 * Math.PI * ciclos * s + fase);
  if (loop.tipo === "pulsar") efeito.escala = 1 + (LOOP_PULSAR * i * (1 - Math.cos(2 * Math.PI * s))) / 2;
  else if (loop.tipo === "balancar") efeito.rotacao = LOOP_BALANCAR * i * onda(1);
  else if (loop.tipo === "flutuar") efeito.dy = -LOOP_FLUTUAR * i * onda(1);
  else if (loop.tipo === "tremer") {
    efeito.dx = LOOP_TREMER * i * (0.6 * onda(3) + 0.4 * onda(5, 1));
    efeito.dy = LOOP_TREMER * i * (0.6 * onda(4, 2) + 0.4 * onda(7));
  }
  return efeito;
}

export function loopAtivo(loop: Loop | null | undefined): loop is Loop {
  return !!loop && loop.tipo !== "nenhum" && loop.periodo > 0 && loop.intensidade > 0;
}

/** A transformação do clipe no instante `t`, com os keyframes e as animações aplicados. */
export function transformacaoAnimada(
  clipe: Pick<Clipe, "inicio" | "duracao" | "animacao" | "transformacao" | "keyframes">,
  t: Tick,
): Transformacao {
  const animacao = clipe.animacao ?? SEM_ANIMACAO;
  const progresso = progressoDasAnimacoes(clipe, t);
  // As animações partem do valor que os keyframes dão no instante
  const base = transformacaoNoTempo(clipe, t);
  let { x, y, escala, rotacao, opacidade } = base;
  // Na saída o sentido se inverte: quem entrou subindo sai subindo
  const aplicar = (tipo: TipoAnimacao, p: number, sentido: 1 | -1) => {
    if (tipo === "nenhuma") return;
    opacidade *= p;
    const falta = 1 - suavizar(p);
    if (tipo === "subir") y += sentido * falta * DISTANCIA_VERTICAL;
    else if (tipo === "descer") y -= sentido * falta * DISTANCIA_VERTICAL;
    else if (tipo === "deslizar") x -= sentido * falta * DISTANCIA_HORIZONTAL;
    else if (tipo === "zoom") escala *= ZOOM_INICIAL + (1 - ZOOM_INICIAL) * suavizar(p);
  };
  aplicar(animacao.entrada.tipo, progresso.entrada, 1);
  aplicar(animacao.saida.tipo, progresso.saida, -1);
  if (loopAtivo(animacao.loop)) {
    const efeito = efeitoDoLoop(animacao.loop, (t - clipe.inicio) / animacao.loop.periodo);
    x += efeito.dx;
    y += efeito.dy;
    escala *= efeito.escala;
    rotacao += efeito.rotacao;
  }
  return { ...base, x, y, escala, rotacao, opacidade };
}

/** As durações nunca passam do clipe: a de entrada primeiro, a de saída no que sobra. */
export function limitarAnimacoes(animacoes: Animacoes, duracaoDoClipe: Tick): Animacoes {
  const entrada = Math.min(Math.max(0, Math.round(animacoes.entrada.duracao)), duracaoDoClipe);
  const saida = Math.min(Math.max(0, Math.round(animacoes.saida.duracao)), duracaoDoClipe - entrada);
  return { ...animacoes, entrada: { ...animacoes.entrada, duracao: entrada }, saida: { ...animacoes.saida, duracao: saida } };
}
