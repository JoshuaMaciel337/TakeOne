// O projeto de edição, no mesmo formato que a API salva (core/modelos/projeto.py).
// Tempos em ticks (lib/tempo.ts). As faixas vão de cima para baixo, como aparecem na linha do tempo.
import type { Taxa, Tick } from "../tempo.ts";
import type { Abaixamento } from "./abaixar.ts";
import type { Animacoes } from "./animacao.ts";
import type { Cor } from "./cor.ts";
import type { Keyframes } from "./keyframes.ts";
import { type CurvaDoFade, ganhoDoFade } from "./som.ts";
import type { Transicao } from "./transicao.ts";
import { type Texto, TEXTO_PADRAO } from "./texto.ts";

export const PROPORCOES = ["9:16", "16:9", "1:1", "4:5", "3:4", "21:9"] as const;
export type Proporcao = (typeof PROPORCOES)[number];

/**
 * "principal" é a faixa magnética, sem espaço vazio; "video" fica por cima dela; "audio", embaixo;
 * "texto" guarda os clipes de texto, por cima dos vídeos; "legenda", as legendas, por cima de tudo.
 */
export type TipoFaixa = "principal" | "video" | "audio" | "texto" | "legenda";

/** Faixas cujos clipes são textos (sem mídia). */
export function faixaDeTexto(tipo: TipoFaixa): boolean {
  return tipo === "texto" || tipo === "legenda";
}

/**
 * Onde a imagem do clipe fica no quadro (lib/projeto/geometria.ts). Sem mudança, a mídia aparece
 * inteira e centralizada, do maior tamanho que cabe.
 */
export type Transformacao = {
  /** Deslocamento do centro, em frações da largura e da altura do quadro (0 é o meio). */
  x: number;
  y: number;
  /** 1 é o tamanho em que a mídia cabe inteira no quadro. */
  escala: number;
  /** Em graus, no sentido horário. */
  rotacao: number;
  /** De 0 (invisível) a 1. */
  opacidade: number;
};

/** Parte da mídia que aparece, em frações da largura e da altura dela. */
export type Recorte = { x: number; y: number; largura: number; altura: number };

export const TRANSFORMACAO_PADRAO: Transformacao = { x: 0, y: 0, escala: 1, rotacao: 0, opacidade: 1 };
export const RECORTE_PADRAO: Recorte = { x: 0, y: 0, largura: 1, altura: 1 };

export type Clipe = {
  id: string;
  /** null nos clipes de texto, que não têm mídia. */
  midia_id: string | null;
  texto?: Texto | null;
  /** Posição na linha do tempo. */
  inicio: Tick;
  duracao: Tick;
  /** De onde o clipe começa dentro da mídia. */
  entrada: Tick;
  velocidade: number;
  /** De 0 a 4 (400%). */
  volume: number;
  /** Quanto o som leva para subir do zero no começo e descer a zero no fim. */
  fade_entrada: Tick;
  fade_saida: Tick;
  /** Formato dos dois fades (lib/projeto/som.ts); sem ele, linear. */
  curva_fade?: CurvaDoFade;
  /** Toca a voz sem ruído da mídia (gerada pelo worker) no lugar do som original. */
  voz_limpa?: boolean;
  /** Curva que abaixa o som durante a fala das outras faixas (lib/projeto/abaixar.ts). */
  abaixamento?: Abaixamento | null;
  transformacao: Transformacao;
  /** Posição, escala, rotação e opacidade mudando ao longo do clipe (lib/projeto/keyframes.ts). */
  keyframes?: Keyframes | null;
  recorte: Recorte;
  /** Entrada e saída animadas; sem ela, o clipe só aparece e some. */
  animacao?: Animacoes | null;
  /** Ajustes de cor e filtro pronto; sem ela, a imagem como veio. */
  cor?: Cor | null;
  /** Só na faixa principal: a transição para o clipe seguinte. */
  transicao?: Transicao | null;
};

export type Faixa = {
  id: string;
  tipo: TipoFaixa;
  oculta: boolean;
  muda: boolean;
  travada: boolean;
  clipes: Clipe[];
};

export type Projeto = {
  id: string;
  nome: string;
  proporcao: Proporcao;
  taxa: Taxa;
  fundo: { cor: string };
  faixas: Faixa[];
  versao: number;
  duracao: Tick;
  criado_em: string;
  atualizado_em: string;
};

/** O que a edição precisa saber de uma mídia. */
export type InfoMidia = { duracao: Tick; video: boolean; audio: boolean };

export function fimDoClipe(clipe: Clipe): Tick {
  return clipe.inicio + clipe.duracao;
}

export function duracaoDoProjeto(projeto: Pick<Projeto, "faixas">): Tick {
  let fim = 0;
  for (const faixa of projeto.faixas) for (const clipe of faixa.clipes) fim = Math.max(fim, fimDoClipe(clipe));
  return fim;
}

/** Quanto do volume do clipe vale no instante `t`, pelos fades (de 0 a 1), como os dois afade do render. */
export function fatorDosFades(clipe: Clipe, t: Tick): number {
  let fator = 1;
  if (clipe.fade_entrada > 0) fator *= ganhoDoFade(clipe.curva_fade, (t - clipe.inicio) / clipe.fade_entrada);
  if (clipe.fade_saida > 0) fator *= ganhoDoFade(clipe.curva_fade, (fimDoClipe(clipe) - t) / clipe.fade_saida);
  return fator;
}

/** Instante da mídia que aparece no instante `t` da linha do tempo. */
export function tempoNaMidia(clipe: Clipe, t: Tick): Tick {
  return clipe.entrada + Math.round((t - clipe.inicio) * clipe.velocidade);
}

export function clipeEm(faixa: Faixa, t: Tick): Clipe | undefined {
  return faixa.clipes.find((clipe) => clipe.inicio <= t && t < fimDoClipe(clipe));
}

export function acharClipe(projeto: Projeto, clipeId: string): { faixa: Faixa; clipe: Clipe } | null {
  for (const faixa of projeto.faixas) {
    const clipe = faixa.clipes.find((item) => item.id === clipeId);
    if (clipe) return { faixa, clipe };
  }
  return null;
}

export function faixaPrincipal(projeto: Projeto): Faixa {
  return projeto.faixas.find((faixa) => faixa.tipo === "principal") ?? projeto.faixas[0];
}

/**
 * Completa o que falta num projeto salvo antes da transformação e do recorte existirem. A API já
 * devolve tudo completo; isto cobre o rascunho guardado no navegador por uma versão antiga do editor.
 */
export function completarProjeto(projeto: Projeto): Projeto {
  return {
    ...projeto,
    faixas: projeto.faixas.map((faixa) => ({
      ...faixa,
      clipes: faixa.clipes.map((clipe) => ({
        ...clipe,
        ...(clipe.texto ? { texto: { ...TEXTO_PADRAO, ...clipe.texto } } : {}),
        fade_entrada: clipe.fade_entrada ?? 0,
        fade_saida: clipe.fade_saida ?? 0,
        transformacao: { ...TRANSFORMACAO_PADRAO, ...clipe.transformacao },
        recorte: { ...RECORTE_PADRAO, ...clipe.recorte },
      })),
    })),
  };
}

/** Faixas que mostram imagem, da que fica por cima para a de baixo. */
export function faixasDeVideo(projeto: Projeto): Faixa[] {
  return projeto.faixas.filter((faixa) => faixa.tipo !== "audio");
}
