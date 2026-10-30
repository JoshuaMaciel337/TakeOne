// O emoji automático das legendas (o Clipar, ADR 0004, 14.8): o LLM local escolhe o emoji de algumas legendas
// (core/modelos/emojis.py), a API desenha cada um com a fonte de emoji do servidor (uma imagem transparente da
// biblioteca, como as formas) e aqui ele entra acima da legenda, no tempo dela, com um pulo na entrada. São clipes de
// imagem comuns, então a prévia e o render não mudam. Funções puras.
import { type Comando, executarComando } from "./comandos.ts";
import { type Contexto, ErroEdicao } from "./edicao.ts";
import type { Clipe, Projeto } from "./modelo.ts";
import { TICKS_POR_SEGUNDO } from "../tempo.ts";
import { faixaParaOAlto, semOsClipes } from "../clipar/retencao.ts";

const S = TICKS_POR_SEGUNDO;
/** O lado maior do emoji, em frações do lado menor do quadro (140 px num vídeo de 1080). */
export const TAMANHO_DO_EMOJI = 0.13;
/** Quanto o meio do emoji fica acima do meio da legenda, em frações do lado menor do quadro. */
export const ACIMA_DA_LEGENDA = 0.2;

export type EmojiDaLegenda = { legendaId: string; midiaId: string; largura: number; altura: number };

const aplicar = (projeto: Projeto, ctx: Contexto, comando: Comando) => executarComando(projeto, comando, ctx);

/** As legendas do projeto com texto, na ordem do tempo (para o pedido ao modelo). */
export function legendasParaEmojis(projeto: Projeto): { id: string; texto: string }[] {
  return projeto.faixas
    .filter((faixa) => faixa.tipo === "legenda")
    .flatMap((faixa) => faixa.clipes)
    .filter((clipe) => clipe.texto?.conteudo.trim())
    .sort((a, b) => a.inicio - b.inicio)
    .map((clipe) => ({ id: clipe.id, texto: clipe.texto!.conteudo }));
}

/** O projeto sem os emojis das legendas. `ehEmoji` diz se a mídia é um emoji desenhado. */
export function semEmojis(projeto: Projeto, ehEmoji: (midiaId: string) => boolean): Projeto {
  return semOsClipes(projeto, (clipe) => Boolean(clipe.midia_id && ehEmoji(clipe.midia_id)));
}

/**
 * Põe cada emoji acima da legenda dele, do começo ao fim dela, numa faixa só por cima dos vídeos (as legendas não se
 * cruzam, então os emojis também não). Os emojis de antes saem. Os emojis precisam estar prontos no contexto.
 */
export function comEmojisNasLegendas(projetoInicial: Projeto, ctx: Contexto, emojis: EmojiDaLegenda[], ehEmoji: (midiaId: string) => boolean): Projeto {
  let projeto = semEmojis(projetoInicial, ehEmoji);
  const legendas = new Map(
    projeto.faixas
      .filter((faixa) => faixa.tipo === "legenda")
      .flatMap((faixa) => faixa.clipes)
      .map((clipe): [string, Clipe] => [clipe.id, clipe]),
  );
  const [l, a] = projeto.proporcao.split(":").map(Number);
  const menor = Math.min(l, a);
  let faixaId: string | undefined;
  let postos = 0;
  for (const emoji of [...emojis].sort((x, y) => (legendas.get(x.legendaId)?.inicio ?? 0) - (legendas.get(y.legendaId)?.inicio ?? 0))) {
    const legenda = legendas.get(emoji.legendaId);
    if (!legenda || legenda.duracao < S / 5) continue;
    const posto = aplicar(projeto, ctx, {
      comando: "clipe.adicionar",
      parametros: { midiaId: emoji.midiaId, inicio: legenda.inicio, ...(faixaId ? { faixaId } : { novaFaixa: true }) },
    });
    const clipeId = posto.selecao![0];
    projeto = faixaId ? posto.projeto : faixaParaOAlto(posto.projeto, clipeId);
    faixaId = projeto.faixas.find((faixa) => faixa.clipes.some((clipe) => clipe.id === clipeId))!.id;
    projeto = aplicar(projeto, ctx, { comando: "clipe.aparar", parametros: { clipeId, borda: "fim", tempo: legenda.inicio + legenda.duracao } }).projeto;
    // O emoji cabendo no quadro com escala 1; a escala leva o lado maior dele ao tamanho pedido
    const encaixe = Math.min(l / emoji.largura, a / emoji.altura);
    const escala = (TAMANHO_DO_EMOJI * menor) / (Math.max(emoji.largura, emoji.altura) * encaixe);
    const y = legenda.transformacao.y - (ACIMA_DA_LEGENDA * menor) / a;
    projeto = aplicar(projeto, ctx, { comando: "clipe.transformar", parametros: { clipeIds: [clipeId], transformacao: { x: legenda.transformacao.x, y, escala } } }).projeto;
    projeto = aplicar(projeto, ctx, {
      comando: "clipe.animar",
      parametros: { clipeIds: [clipeId], animacao: { entrada: { tipo: "zoom", duracao: 0.2 * S }, saida: { tipo: "aparecer", duracao: 0.15 * S } } },
    }).projeto;
    postos++;
  }
  if (emojis.length && !postos) throw new ErroEdicao("As legendas escolhidas para os emojis não estão mais no vídeo.");
  return projeto;
}
