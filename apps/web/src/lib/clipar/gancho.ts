// O gancho narrado do corte (ADR 0004, 14.8): uma frase curta, escrita pelo LLM local (ou pela pessoa) e falada pelo
// Kokoro, no começo do vídeo, com o som da principal abaixando por baixo dela (a mesma curva da música que abaixa na
// fala). A fala é uma mídia de áudio comum (o texto em fala de sempre, marcada como gancho), então a prévia e o render
// não mudam. Funções puras; ganchoNarrado.ts pede a frase e a fala e espera.
import { abaixamentoNaFala } from "../projeto/abaixar.ts";
import { type Comando, executarComando } from "../projeto/comandos.ts";
import type { Contexto } from "../projeto/edicao.ts";
import { legendasParaEmojis } from "../projeto/emojis.ts";
import type { Projeto } from "../projeto/modelo.ts";
import type { Tick } from "../tempo.ts";
import type { Midia } from "../tipos.ts";
import { semOsClipes } from "./retencao.ts";

/** Quanto o som da principal desce sob o gancho, em dB. */
export const ABAIXAR_SOB_O_GANCHO_DB = -16;
export const VOZES_DO_GANCHO: { id: "pf_dora" | "pm_alex" | "pm_santa"; nome: string }[] = [
  { id: "pf_dora", nome: "Dora" },
  { id: "pm_alex", nome: "Alex" },
  { id: "pm_santa", nome: "Santa" },
];
/** Um pouco mais rápido que a fala normal: o gancho é uma chamada. */
export const VELOCIDADE_DO_GANCHO = 1.05;

export const ehMidiaDeGancho = (midia: Midia | undefined) => Boolean(midia?.fala?.gancho);

const aplicar = (projeto: Projeto, ctx: Contexto, comando: Comando) => executarComando(projeto, comando, ctx).projeto;
const principalDe = (projeto: Projeto) => projeto.faixas.find((faixa) => faixa.tipo === "principal")?.clipes ?? [];

/** O gancho que o projeto tem (o clipe da fala marcada), ou null. */
export function ganchoDoProjeto(projeto: Projeto, ehGancho: (midiaId: string) => boolean): { inicio: Tick; duracao: Tick } | null {
  const clipe = projeto.faixas.flatMap((faixa) => faixa.clipes).find((item) => item.midia_id && ehGancho(item.midia_id));
  return clipe ? { inicio: clipe.inicio, duracao: clipe.duracao } : null;
}

/** O projeto sem o gancho: a fala sai e o som da principal volta a não abaixar onde ela estava. */
export function semGancho(projeto: Projeto, ctx: Contexto, ehGancho: (midiaId: string) => boolean): Projeto {
  const gancho = ganchoDoProjeto(projeto, ehGancho);
  if (!gancho) return projeto;
  let sem = semOsClipes(projeto, (clipe) => Boolean(clipe.midia_id && ehGancho(clipe.midia_id)));
  for (const clipe of principalDe(sem)) {
    if (clipe.abaixamento && clipe.inicio < gancho.inicio + gancho.duracao) sem = aplicar(sem, ctx, { comando: "clipe.abaixar", parametros: { clipeId: clipe.id, abaixamento: null } });
  }
  return sem;
}

/**
 * Põe a fala do gancho no começo (no lugar do gancho de antes), numa faixa de áudio, e faz o som da principal abaixar
 * enquanto ela fala. A fala precisa estar pronta no contexto.
 */
export function comGancho(projetoInicial: Projeto, ctx: Contexto, midiaId: string, ehGancho: (midiaId: string) => boolean): Projeto {
  let projeto = semGancho(projetoInicial, ctx, ehGancho);
  const posto = executarComando(projeto, { comando: "clipe.adicionar", parametros: { midiaId, inicio: 0 } }, ctx);
  projeto = posto.projeto;
  // A fala do Kokoro sai mais baixa que a do vídeo: o "Igualar o volume" a leva a -14 LUFS, como o vídeo exportado
  projeto = aplicar(projeto, ctx, { comando: "clipe.audio", parametros: { clipeIds: [posto.selecao![0]], igualar_volume: true } });
  const fala = projeto.faixas.flatMap((faixa) => faixa.clipes).find((clipe) => clipe.id === posto.selecao![0])!;
  const trecho = [{ inicio: fala.inicio, fim: fala.inicio + fala.duracao }];
  for (const clipe of principalDe(projeto)) {
    if (clipe.inicio >= trecho[0].fim || !ctx.midia(clipe.midia_id ?? "")?.audio) continue;
    const curva = abaixamentoNaFala(clipe, trecho, ABAIXAR_SOB_O_GANCHO_DB);
    if (curva) projeto = aplicar(projeto, ctx, { comando: "clipe.abaixar", parametros: { clipeId: clipe.id, abaixamento: curva } });
  }
  return projeto;
}

/** O texto que o modelo lê: as legendas do vídeo, na ordem. */
export const textoDoProjeto = (projeto: Projeto) => legendasParaEmojis(projeto).map((legenda) => legenda.texto.replace(/\s+/g, " ")).join(" ");
