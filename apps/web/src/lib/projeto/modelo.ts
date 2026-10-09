// O projeto de edição, no mesmo formato que a API salva (core/modelos/projeto.py).
// Tempos em ticks (lib/tempo.ts). As faixas vão de cima para baixo, como aparecem na linha do tempo.
import type { Taxa, Tick } from "../tempo.ts";

export const PROPORCOES = ["9:16", "16:9", "1:1", "4:5", "3:4", "21:9"] as const;
export type Proporcao = (typeof PROPORCOES)[number];

/** "principal" é a faixa magnética, sem espaço vazio; "video" fica por cima dela; "audio", embaixo. */
export type TipoFaixa = "principal" | "video" | "audio";

export type Clipe = {
  id: string;
  midia_id: string;
  /** Posição na linha do tempo. */
  inicio: Tick;
  duracao: Tick;
  /** De onde o clipe começa dentro da mídia. */
  entrada: Tick;
  velocidade: number;
  volume: number;
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

/** Faixas que mostram imagem, da que fica por cima para a de baixo. */
export function faixasDeVideo(projeto: Projeto): Faixa[] {
  return projeto.faixas.filter((faixa) => faixa.tipo !== "audio");
}
