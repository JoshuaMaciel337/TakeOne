// Animações de entrada e saída dos clipes (por enquanto oferecidas nos textos e nas legendas).
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
export type Animacoes = { entrada: Animacao; saida: Animacao };

export const TIPOS_ANIMACAO: { id: TipoAnimacao; nome: string }[] = [
  { id: "nenhuma", nome: "Nenhuma" },
  { id: "aparecer", nome: "Aparecer" },
  { id: "subir", nome: "Subir" },
  { id: "descer", nome: "Descer" },
  { id: "deslizar", nome: "Deslizar" },
  { id: "zoom", nome: "Zoom" },
];

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

/** A transformação do clipe no instante `t`, com os keyframes e as animações aplicados. */
export function transformacaoAnimada(
  clipe: Pick<Clipe, "inicio" | "duracao" | "animacao" | "transformacao" | "keyframes">,
  t: Tick,
): Transformacao {
  const animacao = clipe.animacao ?? SEM_ANIMACAO;
  const progresso = progressoDasAnimacoes(clipe, t);
  // As animações partem do valor que os keyframes dão no instante
  const base = transformacaoNoTempo(clipe, t);
  let { x, y, escala, opacidade } = base;
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
  return { ...base, x, y, escala, opacidade };
}

/** As durações nunca passam do clipe: a de entrada primeiro, a de saída no que sobra. */
export function limitarAnimacoes(animacoes: Animacoes, duracaoDoClipe: Tick): Animacoes {
  const entrada = Math.min(Math.max(0, Math.round(animacoes.entrada.duracao)), duracaoDoClipe);
  const saida = Math.min(Math.max(0, Math.round(animacoes.saida.duracao)), duracaoDoClipe - entrada);
  return { entrada: { ...animacoes.entrada, duracao: entrada }, saida: { ...animacoes.saida, duracao: saida } };
}
