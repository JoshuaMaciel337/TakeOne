// A retenção do corte (ADR 0004, 14.8): a barra de progresso, o quadro do original numa caixa e o vídeo de
// distração. São clipes comuns (duas formas da biblioteca, a foto de um quadro e um vídeo da pessoa), então a prévia,
// a exportação no navegador e o render não mudam; aqui ficam as contas, puras. retencaoDoCorte.ts pede as formas e o
// quadro, espera e chama estas funções.
//
// A barra é um retângulo esticado (a forma de proporção 20, recortada até a espessura pedida) que cobre a largura do
// quadro e entra pela esquerda com dois keyframes de posição, de x = -1 (fora do quadro) a x = 0 no fim do vídeo; por
// baixo, a mesma forma em preto e meio transparente. Como ela tem de acabar no fim do vídeo, toda edição do corte que
// muda a duração refaz a barra (comABarraAtualizada).
import { duracaoDoQuadro, TICKS_POR_SEGUNDO, type Tick } from "../tempo.ts";
import { type Comando, executarComando } from "../projeto/comandos.ts";
import { type Contexto, ErroEdicao } from "../projeto/edicao.ts";
import type { Clipe, Projeto, Recorte } from "../projeto/modelo.ts";

const S = TICKS_POR_SEGUNDO;

// -----------------------------------------------
// A barra de progresso
// -----------------------------------------------
export type PosicaoDaBarra = "baixo" | "alto";
/** A espessura da barra, em frações do lado menor do quadro (15 px num vídeo de 1080). */
export const ESPESSURA_DA_BARRA = 0.014;
/** A proporção da forma pedida (o máximo que o servidor desenha); o recorte a afina até a espessura. */
export const PROPORCAO_DA_BARRA = 20;
export const OPACIDADE_DO_TRILHO = 0.35;
export const COR_DO_TRILHO = "#000000";
export const COR_DA_BARRA = "#ffffff";

export type BarraDeProgresso = { trilhoId: string; barraId: string; posicao: PosicaoDaBarra };

const medidas = (proporcao: string) => {
  const [largura, altura] = proporcao.split(":").map(Number);
  return { largura, altura };
};

/** O recorte da forma que deixa a barra com a espessura pedida quando ela cobre a largura do quadro. */
export function recorteDaBarra(proporcao: string): Recorte {
  const { largura, altura } = medidas(proporcao);
  const parte = Math.min(1, (PROPORCAO_DA_BARRA * ESPESSURA_DA_BARRA * Math.min(largura, altura)) / largura);
  return { x: 0, y: (1 - parte) / 2, largura: 1, altura: parte };
}

/** O centro vertical da barra (em frações da altura do quadro), encostada embaixo ou no alto. */
export function alturaDaBarra(proporcao: string, posicao: PosicaoDaBarra): number {
  const { largura, altura } = medidas(proporcao);
  const metade = (ESPESSURA_DA_BARRA * Math.min(largura, altura)) / altura / 2;
  return posicao === "baixo" ? 0.5 - metade : -0.5 + metade;
}

/** A forma que a barra (ou o trilho) pede ao servidor: um retângulo comprido na cor. */
export function pedidoDaBarra(cor: string) {
  return { tipo: "retangulo" as const, cor, contorno_cor: "#000000", contorno: 0, proporcao: PROPORCAO_DA_BARRA };
}

/** Se a mídia é uma das formas da barra (o retângulo de proporção 20 que só ela pede). */
export function ehFormaDaBarra(elemento: { tipo: string; proporcao?: number | null } | null | undefined): boolean {
  return elemento?.tipo === "retangulo" && elemento.proporcao === PROPORCAO_DA_BARRA;
}

const fimDe = (projeto: Projeto): Tick => Math.max(0, ...projeto.faixas.flatMap((faixa) => faixa.clipes.map((clipe) => clipe.inicio + clipe.duracao)));

/** Muda um clipe pelo id, direto (o que não tem comando: os keyframes de uma vez, os pedaços repetidos). */
function mudarClipe(projeto: Projeto, clipeId: string, mudar: (clipe: Clipe) => Clipe): Projeto {
  return { ...projeto, faixas: projeto.faixas.map((faixa) => ({ ...faixa, clipes: faixa.clipes.map((clipe) => (clipe.id === clipeId ? mudar(clipe) : clipe)) })) };
}

const aplicar = (projeto: Projeto, ctx: Contexto, comando: Comando) => executarComando(projeto, comando, ctx);

/**
 * Leva a faixa do clipe para o alto das faixas de vídeo (logo abaixo dos textos e das legendas): a faixa nova de
 * vídeo nasce logo acima da principal, e a retenção fica por cima do que já há. As faixas vão de cima para baixo.
 */
export function faixaParaOAlto(projeto: Projeto, clipeId: string): Projeto {
  const faixa = projeto.faixas.find((item) => item.clipes.some((clipe) => clipe.id === clipeId));
  if (!faixa) return projeto;
  const outras = projeto.faixas.filter((item) => item !== faixa);
  const primeiraDeVideo = outras.findIndex((item) => item.tipo === "video" || item.tipo === "principal");
  outras.splice(primeiraDeVideo < 0 ? outras.length : primeiraDeVideo, 0, faixa);
  return { ...projeto, faixas: outras };
}

/** Tira os clipes que `tirar` escolhe e as faixas de sobreposição que ficam vazias por isso. */
export function semOsClipes(projeto: Projeto, tirar: (clipe: Clipe) => boolean): Projeto {
  return {
    ...projeto,
    faixas: projeto.faixas
      .map((faixa) => ({ faixa, clipes: faixa.clipes.filter((clipe) => !tirar(clipe)) }))
      .filter(({ faixa, clipes }) => clipes.length || faixa.tipo === "principal" || !faixa.clipes.some(tirar))
      .map(({ faixa, clipes }) => (clipes.length === faixa.clipes.length ? faixa : { ...faixa, clipes })),
  };
}

/** A barra que o projeto tem (pelas formas dela), ou null. `daBarra` diz se a mídia é uma forma da barra. */
export function barraDoProjeto(projeto: Projeto, daBarra: (midiaId: string) => boolean): BarraDeProgresso | null {
  const clipes = projeto.faixas.flatMap((faixa) => faixa.clipes).filter((clipe) => clipe.midia_id && daBarra(clipe.midia_id));
  const barra = clipes.find((clipe) => clipe.keyframes?.x?.length);
  const trilho = clipes.find((clipe) => !clipe.keyframes?.x?.length);
  if (!barra?.midia_id || !trilho?.midia_id) return null;
  return { trilhoId: trilho.midia_id, barraId: barra.midia_id, posicao: barra.transformacao.y > 0 ? "baixo" : "alto" };
}

/** O projeto sem a barra de progresso. */
export function semABarra(projeto: Projeto, daBarra: (midiaId: string) => boolean): Projeto {
  return semOsClipes(projeto, (clipe) => Boolean(clipe.midia_id && daBarra(clipe.midia_id)));
}

/**
 * Põe a barra de progresso (no lugar da que houver): o trilho escuro e a barra, cada um numa faixa por cima de tudo,
 * do começo ao fim do vídeo. As formas precisam estar prontas no contexto.
 */
export function comBarraDeProgresso(projetoInicial: Projeto, ctx: Contexto, barra: BarraDeProgresso): Projeto {
  let projeto = semABarra(projetoInicial, (id) => id === barra.trilhoId || id === barra.barraId);
  const fim = fimDe(projeto);
  if (fim < S) throw new ErroEdicao("O vídeo é curto demais para a barra de progresso.");
  const recorte = recorteDaBarra(projeto.proporcao);
  const y = alturaDaBarra(projeto.proporcao, barra.posicao);
  for (const [midiaId, opacidade] of [
    [barra.trilhoId, OPACIDADE_DO_TRILHO],
    [barra.barraId, 1],
  ] as const) {
    const posto = aplicar(projeto, ctx, { comando: "clipe.adicionar", parametros: { midiaId, inicio: 0, novaFaixa: true } });
    const clipeId = posto.selecao![0];
    projeto = aplicar(faixaParaOAlto(posto.projeto, clipeId), ctx, { comando: "clipe.aparar", parametros: { clipeId, borda: "fim", tempo: fim } }).projeto;
    projeto = aplicar(projeto, ctx, { comando: "clipe.recortar", parametros: { clipeIds: [clipeId], recorte } }).projeto;
    projeto = aplicar(projeto, ctx, { comando: "clipe.transformar", parametros: { clipeIds: [clipeId], transformacao: { x: 0, y, escala: 1, opacidade } } }).projeto;
    if (midiaId === barra.barraId) {
      projeto = mudarClipe(projeto, clipeId, (clipe) => ({
        ...clipe,
        keyframes: {
          x: [
            { t: 0, valor: -1, curva: "linear" },
            { t: clipe.duracao, valor: 0, curva: "linear" },
          ],
        },
      }));
    }
  }
  return projeto;
}

/**
 * Depois de uma edição que muda a duração (estender, pôr ou tirar trechos), a barra volta a ir do começo ao fim. Sem
 * barra, ou com ela já no fim, devolve o mesmo projeto.
 */
export function comABarraAtualizada(projeto: Projeto, ctx: Contexto, daBarra: (midiaId: string) => boolean): Projeto {
  const barra = barraDoProjeto(projeto, daBarra);
  if (!barra) return projeto;
  const clipes = projeto.faixas.flatMap((faixa) => faixa.clipes).filter((clipe) => clipe.midia_id === barra.barraId);
  const semEla = semABarra(projeto, daBarra);
  const fim = fimDe(semEla);
  const certa = clipes.length === 1 && clipes[0].inicio === 0 && clipes[0].duracao === fim && clipes[0].keyframes?.x?.at(-1)?.t === fim;
  if (certa) return projeto;
  try {
    return comBarraDeProgresso(projeto, ctx, barra);
  } catch {
    // O vídeo ficou curto demais: sem a barra
    return semEla;
  }
}

// -----------------------------------------------
// O quadro do original numa caixa
// -----------------------------------------------
export type QuandoDoQuadro = "inicio" | "meio" | "fim" | "sorteado";
export const QUANDO_DO_QUADRO: { id: QuandoDoQuadro; nome: string }[] = [
  { id: "inicio", nome: "Do começo do corte" },
  { id: "meio", nome: "Do meio do corte" },
  { id: "fim", nome: "Do fim do corte" },
  { id: "sorteado", nome: "Sorteado" },
];
/** Quando a caixa aparece (logo depois do título) e por quanto tempo. */
export const INICIO_DO_QUADRO_S = 3;
export const DURACAO_DO_QUADRO_S = 3;

/** Um número de 0 a 1 que só depende do texto (o id do corte), para o sorteio sair igual ao montar de novo. */
export function sorteio(texto: string): number {
  let h = 2166136261;
  for (const letra of texto) h = Math.imul(h ^ letra.charCodeAt(0), 16777619) >>> 0;
  return (h % 100000) / 100000;
}

/** O instante do original (em segundos) do quadro: no começo, no meio, no fim ou sorteado no trecho do corte. */
export function instanteDoQuadro(trechos: { de: number; ate: number }[], quando: QuandoDoQuadro, semente: string): number {
  const de = trechos[0].de;
  const ate = trechos.at(-1)!.ate;
  const folga = Math.min(0.5, (ate - de) / 4);
  if (quando === "inicio") return de + folga;
  if (quando === "fim") return ate - folga;
  if (quando === "meio") return (de + ate) / 2;
  return de + folga + sorteio(semente) * Math.max(0, ate - de - 2 * folga);
}

const deitado = (proporcao: string) => {
  const { largura, altura } = medidas(proporcao);
  return largura > altura;
};

/** A escala que deixa a imagem com `fracao` da largura do quadro (1 é a imagem cabendo inteira). */
function escalaNaLargura(imagem: { largura: number; altura: number }, proporcao: string, fracao: number): number {
  const { largura, altura } = medidas(proporcao);
  const q = largura / altura;
  const m = imagem.largura / imagem.altura;
  return m >= q ? fracao : (fracao * q) / m;
}

/**
 * Põe a foto do quadro numa caixa com os cantos arredondados e a borda branca, no alto do vídeo (no em pé) ou no
 * canto de cima (no deitado), logo depois do título, entrando com zoom.
 */
export function comQuadroNaCaixa(projetoInicial: Projeto, ctx: Contexto, foto: { midiaId: string; largura: number; altura: number }): { projeto: Projeto; clipeId: string } {
  const fim = fimDe(projetoInicial);
  const duracao = Math.min(DURACAO_DO_QUADRO_S * S, fim);
  if (duracao < S) throw new ErroEdicao("O vídeo é curto demais para o quadro na caixa.");
  const inicio = Math.max(0, Math.min(INICIO_DO_QUADRO_S * S, fim - duracao));
  const posto = aplicar(projetoInicial, ctx, { comando: "clipe.adicionar", parametros: { midiaId: foto.midiaId, inicio, novaFaixa: true } });
  const clipeId = posto.selecao![0];
  let projeto = aplicar(faixaParaOAlto(posto.projeto, clipeId), ctx, { comando: "clipe.aparar", parametros: { clipeId, borda: "fim", tempo: inicio + duracao } }).projeto;
  const emPe = !deitado(projeto.proporcao);
  const escala = escalaNaLargura(foto, projeto.proporcao, emPe ? 0.8 : 0.4);
  const transformacao = emPe ? { x: 0, y: -0.24, escala } : { x: 0.25, y: -0.2, escala };
  projeto = aplicar(projeto, ctx, { comando: "clipe.transformar", parametros: { clipeIds: [clipeId], transformacao } }).projeto;
  projeto = aplicar(projeto, ctx, { comando: "clipe.cantos", parametros: { clipeIds: [clipeId], cantos: { raio: 0.07, borda: 0.025, cor: "#ffffff" } } }).projeto;
  projeto = aplicar(projeto, ctx, {
    comando: "clipe.animar",
    parametros: { clipeIds: [clipeId], animacao: { entrada: { tipo: "zoom", duracao: 0.3 * S }, saida: { tipo: "aparecer", duracao: 0.25 * S } } },
  }).projeto;
  return { projeto, clipeId };
}

/** Se o clipe é um quadro do original numa caixa (a foto de um quadro, com cantos, por cima da principal). */
export function ehQuadroNaCaixa(clipe: Clipe, midia: { quadro_de?: unknown } | undefined): boolean {
  return Boolean(midia?.quadro_de && clipe.cantos);
}

// -----------------------------------------------
// O vídeo de distração
// -----------------------------------------------
/** A faixa de baixo que o vídeo de distração ocupa no vídeo em pé (fração da altura). */
export const ALTURA_DA_DISTRACAO = 0.38;
/** A largura da caixa no vídeo deitado (fração da largura). */
export const LARGURA_DA_DISTRACAO_DEITADO = 0.32;

/** Se o clipe é um vídeo de distração: um vídeo comum da pessoa, mudo, na parte de baixo do quadro. */
export function ehDistracao(
  clipe: Clipe,
  midia: { video?: unknown; imagem?: boolean; animacao?: unknown; legenda_animada?: unknown } | undefined,
): boolean {
  return Boolean(midia?.video && !midia.imagem && !midia.animacao && !midia.legenda_animada && clipe.volume === 0 && clipe.transformacao.y > 0.2);
}

/** Qual vídeo da lista e a partir de onde, pelo sorteio do corte: cortes diferentes pegam vídeos e trechos diferentes. */
export function escolhaDaDistracao(ids: string[], semente: string): { midiaId: string; fracao: number } | null {
  if (!ids.length) return null;
  const n = sorteio(semente);
  return { midiaId: ids[Math.floor(n * ids.length) % ids.length], fracao: sorteio(`${semente}:trecho`) };
}

/**
 * Põe o vídeo de distração, mudo, do começo ao fim: na faixa de baixo do vídeo em pé (cortado na proporção dela) ou
 * numa caixa no canto de baixo do deitado. O vídeo começa em `fracao` da duração dele e recomeça do início quando
 * acaba.
 */
export function comDistracao(
  projetoInicial: Projeto,
  ctx: Contexto,
  video: { midiaId: string; largura: number; altura: number; fracao: number },
): { projeto: Projeto; clipeIds: string[] } {
  const fim = fimDe(projetoInicial);
  if (fim < S) throw new ErroEdicao("O vídeo é curto demais para o vídeo de distração.");
  const info = ctx.midia(video.midiaId);
  if (!info?.video || info.imagem || !Number.isFinite(info.duracao)) throw new ErroEdicao("Escolha um vídeo da biblioteca para a distração.");
  const posto = aplicar(projetoInicial, ctx, { comando: "clipe.adicionar", parametros: { midiaId: video.midiaId, inicio: 0, novaFaixa: true } });
  const primeiroId = posto.selecao![0];
  let projeto = faixaParaOAlto(posto.projeto, primeiroId);
  // Os pedaços: o primeiro a partir do ponto sorteado, os outros do começo, até o fim do vídeo do corte
  const total = info.duracao;
  const faixa = projeto.faixas.find((item) => item.clipes.some((clipe) => clipe.id === primeiroId))!;
  const molde = faixa.clipes.find((clipe) => clipe.id === primeiroId)!;
  const quadro = duracaoDoQuadro(projeto.taxa);
  const pedacos: Clipe[] = [];
  let tempo = 0;
  let entrada = Math.floor((video.fracao * Math.max(0, total - 2 * S)) / quadro) * quadro;
  while (tempo < fim && pedacos.length < 200) {
    const duracao = Math.min(fim - tempo, total - entrada);
    if (duracao < quadro) {
      entrada = 0;
      continue;
    }
    pedacos.push({ ...molde, id: pedacos.length ? ctx.novoId() : primeiroId, inicio: tempo, entrada, duracao });
    tempo += duracao;
    entrada = 0;
  }
  projeto = { ...projeto, faixas: projeto.faixas.map((item) => (item.id === faixa.id ? { ...item, clipes: pedacos } : item)) };
  const clipeIds = pedacos.map((clipe) => clipe.id);
  const { largura, altura } = medidas(projeto.proporcao);
  const m = video.largura / video.altura;
  if (!deitado(projeto.proporcao)) {
    // A faixa de baixo: o vídeo cortado na proporção dela, cobrindo a largura
    const alvo = largura / altura / ALTURA_DA_DISTRACAO;
    const recorte = m > alvo ? { x: (1 - alvo / m) / 2, y: 0, largura: alvo / m, altura: 1 } : { x: 0, y: (1 - m / alvo) / 2, largura: 1, altura: m / alvo };
    projeto = aplicar(projeto, ctx, { comando: "clipe.recortar", parametros: { clipeIds, recorte } }).projeto;
    projeto = aplicar(projeto, ctx, { comando: "clipe.transformar", parametros: { clipeIds, transformacao: { x: 0, y: 0.5 - ALTURA_DA_DISTRACAO / 2, escala: 1 } } }).projeto;
  } else {
    const escala = escalaNaLargura(video, projeto.proporcao, LARGURA_DA_DISTRACAO_DEITADO);
    const alturaDaCaixa = (LARGURA_DA_DISTRACAO_DEITADO * (largura / altura)) / m;
    const transformacao = { x: 0.5 - LARGURA_DA_DISTRACAO_DEITADO / 2 - 0.03, y: 0.5 - alturaDaCaixa / 2 - 0.05, escala };
    projeto = aplicar(projeto, ctx, { comando: "clipe.transformar", parametros: { clipeIds, transformacao } }).projeto;
    projeto = aplicar(projeto, ctx, { comando: "clipe.cantos", parametros: { clipeIds, cantos: { raio: 0.06, borda: 0, cor: "#ffffff" } } }).projeto;
  }
  if (info.audio) projeto = aplicar(projeto, ctx, { comando: "clipe.audio", parametros: { clipeIds, volume: 0 } }).projeto;
  return { projeto, clipeIds };
}
