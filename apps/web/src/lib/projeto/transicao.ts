// Transições entre clipes vizinhos da faixa principal. A transição fica no clipe que sai e cobre o
// corte pela metade: `duracao / 2` antes e `duracao / 2` depois. Nessa janela os dois clipes
// aparecem: o que sai continua (com o que a mídia tem depois do fim dele) e o que entra começa antes
// (com o que a mídia tem antes do começo dele). Sem sobra na mídia, fica o último ou o primeiro quadro.
//
// A conta é a mesma em core/utils/transicao.py, conferida por tests/casos/transicao.json. Como nas
// animações, a opacidade muda em linha reta (o render usa o fade com alfa) e o movimento segue a
// curva que desacelera no fim.
import type { Tick } from "../tempo.ts";
import { suavizar } from "./animacao.ts";
import type { Clipe, Transformacao } from "./modelo.ts";

export type TipoTransicao =
  | "fusao"
  | "escurecer"
  | "deslizar"
  | "empurrar"
  | "zoom"
  | "cortina_direita"
  | "cortina_esquerda"
  | "cortina_baixo"
  | "cortina_cima";
export type Transicao = { tipo: TipoTransicao; duracao: Tick };

export const TIPOS_TRANSICAO: { id: TipoTransicao; nome: string; descricao: string }[] = [
  { id: "fusao", nome: "Fusão", descricao: "Um clipe se mistura no outro" },
  { id: "escurecer", nome: "Escurecer", descricao: "Apaga para a cor de fundo e acende no próximo" },
  { id: "deslizar", nome: "Deslizar", descricao: "O próximo entra pela direita, por cima" },
  { id: "empurrar", nome: "Empurrar", descricao: "O próximo entra empurrando o atual para a esquerda" },
  { id: "zoom", nome: "Zoom", descricao: "O próximo cresce e aparece" },
  { id: "cortina_direita", nome: "Cortina para a direita", descricao: "O próximo é revelado da esquerda para a direita" },
  { id: "cortina_esquerda", nome: "Cortina para a esquerda", descricao: "O próximo é revelado da direita para a esquerda" },
  { id: "cortina_baixo", nome: "Cortina para baixo", descricao: "O próximo é revelado de cima para baixo" },
  { id: "cortina_cima", nome: "Cortina para cima", descricao: "O próximo é revelado de baixo para cima" },
];

/**
 * A parte do clipe que aparece, em frações dele (0 a 1, com y para baixo), antes de girar.
 * Fora dela o clipe fica transparente. Sem cortina, o clipe inteiro.
 */
export type Revelado = { x0: number; y0: number; x1: number; y1: number };
export const REVELADO_INTEIRO: Revelado = { x0: 0, y0: 0, x1: 1, y1: 1 };

/** Zoom de onde o clipe que entra parte. */
export const ZOOM_TRANSICAO = 0.6;

/** Uma transição vista de um dos dois clipes. */
export type EfeitoDeTransicao = { tipo: TipoTransicao; papel: "sai" | "entra"; inicio: Tick; duracao: Tick };

/** Quanto de cada clipe da principal aparece, contando as transições, e os efeitos sobre ele. */
export type JanelaDoClipe = { inicio: Tick; fim: Tick; efeitos: EfeitoDeTransicao[] };

/** As janelas dos clipes da faixa principal (em ordem, encostados). */
export function janelasDaPrincipal(clipes: Clipe[]): Map<string, JanelaDoClipe> {
  const janelas = new Map<string, JanelaDoClipe>();
  for (const clipe of clipes) janelas.set(clipe.id, { inicio: clipe.inicio, fim: clipe.inicio + clipe.duracao, efeitos: [] });
  clipes.forEach((clipe, i) => {
    const proximo = clipes[i + 1];
    const transicao = clipe.transicao;
    if (!proximo || !transicao || transicao.duracao <= 0) return;
    const corte = clipe.inicio + clipe.duracao;
    const inicio = corte - transicao.duracao / 2;
    const fim = inicio + transicao.duracao;
    const sai = janelas.get(clipe.id)!;
    const entra = janelas.get(proximo.id)!;
    sai.fim = fim;
    sai.efeitos.push({ tipo: transicao.tipo, papel: "sai", inicio, duracao: transicao.duracao });
    entra.inicio = inicio;
    entra.efeitos.push({ tipo: transicao.tipo, papel: "entra", inicio, duracao: transicao.duracao });
  });
  return janelas;
}

/** A transformação com os efeitos das transições no instante `t`. */
export function transformacaoNaTransicao(base: Transformacao, efeitos: EfeitoDeTransicao[], t: Tick): Transformacao {
  let { x, escala, opacidade } = base;
  for (const efeito of efeitos) {
    const p = Math.min(1, Math.max(0, (t - efeito.inicio) / efeito.duracao));
    const e = suavizar(p);
    const entra = efeito.papel === "entra";
    if (efeito.tipo === "fusao") {
      if (entra) opacidade *= p;
    } else if (efeito.tipo === "escurecer") {
      // O que sai apaga na primeira metade; o que entra acende na segunda
      opacidade *= entra ? Math.min(1, Math.max(0, 2 * p - 1)) : Math.min(1, Math.max(0, 1 - 2 * p));
    } else if (efeito.tipo === "deslizar") {
      if (entra) x += 1 - e;
    } else if (efeito.tipo === "empurrar") {
      x += entra ? 1 - e : -e;
    } else if (efeito.tipo === "zoom" && entra) {
      escala *= ZOOM_TRANSICAO + (1 - ZOOM_TRANSICAO) * e;
      opacidade *= p;
    }
  }
  return { ...base, x, escala, opacidade };
}

/** A parte do clipe que aparece no instante `t`: as cortinas revelam quem entra, com a curva do movimento. */
export function reveladoNaTransicao(efeitos: EfeitoDeTransicao[], t: Tick): Revelado {
  const revelado = { ...REVELADO_INTEIRO };
  for (const efeito of efeitos) {
    if (efeito.papel !== "entra") continue;
    const e = suavizar(Math.min(1, Math.max(0, (t - efeito.inicio) / efeito.duracao)));
    if (efeito.tipo === "cortina_direita") revelado.x1 = Math.min(revelado.x1, e);
    else if (efeito.tipo === "cortina_esquerda") revelado.x0 = Math.max(revelado.x0, 1 - e);
    else if (efeito.tipo === "cortina_baixo") revelado.y1 = Math.min(revelado.y1, e);
    else if (efeito.tipo === "cortina_cima") revelado.y0 = Math.max(revelado.y0, 1 - e);
  }
  return revelado;
}

/** A maior duração que a transição pode ter entre os dois clipes. */
export function duracaoMaximaDaTransicao(sai: Clipe, entra: Clipe): Tick {
  return Math.min(sai.duracao, entra.duracao);
}
