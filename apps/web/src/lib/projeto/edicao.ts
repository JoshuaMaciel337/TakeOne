// Operações de edição da linha do tempo. Cada uma recebe o projeto e devolve um projeto novo, sem
// mexer no original (é o que permite desfazer guardando as versões), ou lança ErroEdicao com a
// mensagem para a pessoa, sem mudar nada.
//
// As primitivas (dividir no instante, abrir e fechar espaço, nunca deixar dois clipes da mesma
// faixa um por cima do outro) seguem o crate `edit` do FilmCraft (https://github.com/storytold/filmcraft,
// crates/edit/src/lib.rs, commit 5231852), licença MIT OR Apache-2.0, Copyright (c) 2026 ArtCraft Team
// and the FilmCraft contributors; textos em licencas/filmcraft. Modificado pelo TakeOne (2026): escrito
// em TypeScript e com as regras do CapCut no lugar das do Premiere. A faixa principal é magnética (os
// clipes ficam sempre encostados, a partir do zero); nas outras, um clipe que cairia por cima de outro
// ganha uma faixa nova.
import { ajustarAoQuadro, duracaoDoQuadro, quadroMaisProximo, TICK_MAXIMO, type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import { type Animacao, type Animacoes, limitarAnimacoes, SEM_ANIMACAO } from "./animacao.ts";
import {
  type AjustesCor,
  type Cor,
  COR_PADRAO,
  CURVA_NEUTRA,
  curvasNeutras,
  FAIXAS_DE_MATIZ,
  FILTROS,
  type Hsl,
  hslNeutro,
  LIMITES_COR,
  PONTOS_MAXIMOS_DA_CURVA,
  type PontoDaCurva,
} from "./cor.ts";
import {
  type Curva,
  deslocarExpressoes,
  type Expressao,
  type Expressoes,
  CHAVES_DE_KEYFRAME,
  type ChaveDeKeyframe,
  deslocarKeyframes,
  type Keyframe,
  type Keyframes,
  KEYFRAMES_POR_PROPRIEDADE,
  keyframeEm,
  type PropriedadeAnimavel,
  PROPRIEDADES_ANIMAVEIS,
  transformacaoNoTempo,
  transformacaoParaEditar,
  volumeNoTempo,
} from "./keyframes.ts";
import { type Legenda, POSICAO_LEGENDA } from "./legendas.ts";
import type { Reenquadramento } from "./reenquadrar.ts";
import type { PlanoDoModelo } from "./modelos.ts";
import type { CaminhoDoSeguidor } from "./seguirObjeto.ts";
import { duracaoMaximaDaTransicao, type Transicao } from "./transicao.ts";
import {
  acharClipe,
  type Clipe,
  type Faixa,
  faixaDeTexto,
  fimDoClipe,
  type InfoMidia,
  tempoNaMidia,
  BORDA_MAXIMA,
  type Cantos,
  type ChaveLuma,
  type Chroma,
  LIMITES_DA_MASCARA,
  type MascaraDeForma,
  MESCLAGENS,
  type Mesclagem,
  type Projeto,
  RECORTE_PADRAO,
  type Recorte,
  type TipoFaixa,
  type Transformacao,
  RAIO_MAXIMO,
  TRANSFORMACAO_PADRAO,
  type Virar,
} from "./modelo.ts";
import type { Abaixamento } from "./abaixar.ts";
import type { Nivelamento } from "./nivelar.ts";
import { planoDaMusica } from "./ajustarMusica.ts";
import { LIMITES_DA_CURVA, pedacoComCurva, type PontoDeVelocidade, velocidadeNaCurva } from "./velocidade.ts";
import { type Efeito, EFEITOS, SO_EM_MIDIA } from "./efeitos.ts";
import { type CurvaDoFade, type EfeitosVoz, efeitosAtivos, limitarEfeitos, TOM_LIMITE } from "./som.ts";
import { ajustarTexto, type FonteTexto, LIMITES_TEXTO, palavrasDoTexto, type Texto } from "./texto.ts";

export class ErroEdicao extends Error {}

/** A velocidade que a API aceita num clipe: um pedaço de um clipe com curva pode passar do controle. */
const VELOCIDADE_NA_API = { minimo: 0.1, maximo: 100 } as const;
/** Os limites da API (core/modelos/projeto.py): passar deles faria o salvamento parar. */
const LIMITE_FAIXAS = 30;
const LIMITE_CLIPES = 1500;

export type Contexto = {
  novoId: () => string;
  /** null quando a mídia não está na biblioteca (excluída ou ainda sendo preparada). */
  midia: (midiaId: string) => InfoMidia | null;
};

type TipoLivre = Exclude<TipoFaixa, "principal">;

// -----------------------------------------------
// Auxiliares
// -----------------------------------------------
function compactar(faixa: Faixa): Faixa {
  let t = 0;
  return {
    ...faixa,
    clipes: faixa.clipes.map((clipe) => {
      const encostado = { ...clipe, inicio: t };
      t += clipe.duracao;
      return encostado;
    }),
  };
}

function ordenar(clipes: Clipe[]): Clipe[] {
  return [...clipes].sort((a, b) => a.inicio - b.inicio);
}

function cabe(faixa: Faixa, inicio: Tick, duracao: Tick): boolean {
  const fim = inicio + duracao;
  return faixa.clipes.every((clipe) => fim <= clipe.inicio || inicio >= fimDoClipe(clipe));
}

function trocarFaixa(projeto: Projeto, faixa: Faixa): Projeto {
  return { ...projeto, faixas: projeto.faixas.map((item) => (item.id === faixa.id ? faixa : item)) };
}

function exigirDestravada(faixa: Faixa) {
  if (faixa.travada) throw new ErroEdicao("A faixa está travada. Destrave o cadeado para editar.");
}

function acharOuErro(projeto: Projeto, clipeId: string): { faixa: Faixa; clipe: Clipe; indice: number } {
  for (const faixa of projeto.faixas) {
    const indice = faixa.clipes.findIndex((clipe) => clipe.id === clipeId);
    if (indice >= 0) return { faixa, clipe: faixa.clipes[indice], indice };
  }
  throw new ErroEdicao("Este clipe não existe mais.");
}

/** Faixa de áudio só recebe mídia sem imagem; as de vídeo, só mídia com imagem. */
function combina(tipo: TipoFaixa, info: InfoMidia): boolean {
  if (faixaDeTexto(tipo)) return false;
  return tipo === "audio" ? !info.video && info.audio : info.video;
}

function mensagemDeTipo(info: InfoMidia): string {
  return info.video ? "Vídeos ficam nas faixas de vídeo." : "Áudios ficam nas faixas de áudio.";
}

function infoDoClipe(ctx: Contexto, clipe: Clipe, faixa: Faixa): InfoMidia {
  // A camada de ajuste é imagem sem mídia: fica nas faixas de vídeo e dura o quanto a pessoa quiser
  if (clipe.ajuste) return { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, imagem: true };
  // Texto não tem mídia: dura o quanto a pessoa quiser
  if (clipe.texto || !clipe.midia_id) return { duracao: Number.POSITIVE_INFINITY, video: false, audio: false };
  return ctx.midia(clipe.midia_id) ?? { duracao: Number.POSITIVE_INFINITY, video: faixa.tipo !== "audio", audio: faixa.tipo === "audio" };
}

/** A faixa livre onde o clipe pode ficar: texto na de texto, imagem na de vídeo, som na de áudio. */
function tipoLivreDoClipe(clipe: Clipe, info: InfoMidia, origem: TipoFaixa): TipoLivre {
  // Texto e legenda continuam no tipo de faixa de onde vieram
  if (clipe.texto) return origem === "legenda" ? "legenda" : "texto";
  return info.video ? "video" : "audio";
}

function aceitaNaFaixa(tipo: TipoFaixa, clipe: Clipe, info: InfoMidia): boolean {
  if (clipe.texto) return faixaDeTexto(tipo);
  // A camada de ajuste muda o que está embaixo: nunca na principal, que fica embaixo de tudo
  if (clipe.ajuste) return tipo === "video";
  return combina(tipo, info);
}

/** Tira as faixas livres que ficaram vazias e confere o tamanho máximo. */
/** Os fades nunca passam do clipe: depois de aparar ou dividir, encolhem junto. */
function limitarFades(clipe: Clipe): Clipe {
  const entrada = Math.min(clipe.fade_entrada, clipe.duracao);
  const saida = Math.min(clipe.fade_saida, clipe.duracao - entrada);
  let resultado = entrada === clipe.fade_entrada && saida === clipe.fade_saida ? clipe : { ...clipe, fade_entrada: entrada, fade_saida: saida };
  // As animações também encolhem junto com o clipe
  const animacao = clipe.animacao;
  if (animacao && animacao.entrada.duracao + animacao.saida.duracao > clipe.duracao) {
    resultado = { ...resultado, animacao: limitarAnimacoes(animacao, clipe.duracao) };
  }
  return resultado;
}

/**
 * Transições só entre vizinhos da principal e cabendo nos dois: depois de mover, apagar ou aparar,
 * a do último clipe some e as longas demais encolhem.
 */
function arrumarTransicoes(faixa: Faixa): Faixa {
  if (!faixa.clipes.some((clipe) => clipe.transicao)) return faixa;
  if (faixa.tipo !== "principal") return { ...faixa, clipes: faixa.clipes.map((clipe) => (clipe.transicao ? { ...clipe, transicao: null } : clipe)) };
  const clipes = faixa.clipes.map((clipe, i) => {
    if (!clipe.transicao) return clipe;
    const proximo = faixa.clipes[i + 1];
    // A curva de velocidade não combina com transição: a transição sai
    if (!proximo || clipe.curva_velocidade || proximo.curva_velocidade) return { ...clipe, transicao: null };
    const maximo = duracaoMaximaDaTransicao(clipe, proximo);
    return clipe.transicao.duracao > maximo ? { ...clipe, transicao: { ...clipe.transicao, duracao: maximo } } : clipe;
  });
  return clipes.every((clipe, i) => clipe === faixa.clipes[i]) ? faixa : { ...faixa, clipes };
}

function finalizar(projeto: Projeto): Projeto {
  const faixas = projeto.faixas
    .filter((faixa) => faixa.tipo === "principal" || faixa.clipes.length > 0)
    .map((faixa) => (faixa.clipes.every((clipe) => limitarFades(clipe) === clipe) ? faixa : { ...faixa, clipes: faixa.clipes.map(limitarFades) }))
    .map(arrumarTransicoes);
  let duracao = 0;
  for (const faixa of faixas) for (const clipe of faixa.clipes) duracao = Math.max(duracao, fimDoClipe(clipe));
  if (duracao > TICK_MAXIMO) throw new ErroEdicao("O projeto pode ter no máximo 6 horas.");
  if (faixas.length > LIMITE_FAIXAS) throw new ErroEdicao(`O projeto pode ter no máximo ${LIMITE_FAIXAS} faixas.`);
  const clipes = faixas.reduce((soma, faixa) => soma + faixa.clipes.length, 0);
  if (clipes > LIMITE_CLIPES) throw new ErroEdicao(`O projeto pode ter no máximo ${LIMITE_CLIPES} clipes. Apague alguns (ou uma faixa de legendas repetida) antes.`);
  return { ...projeto, faixas, duracao };
}

/** Lugar do clipe na faixa principal: antes do primeiro clipe cujo meio fica depois de `t`. */
function indiceNaPrincipal(faixa: Faixa, t: Tick | undefined): number {
  if (t === undefined) return faixa.clipes.length;
  const indice = faixa.clipes.findIndex((clipe) => clipe.inicio + clipe.duracao / 2 > t);
  return indice < 0 ? faixa.clipes.length : indice;
}

function inserirNaPrincipal(projeto: Projeto, clipe: Clipe, t: Tick | undefined): Projeto {
  const principal = projeto.faixas.find((faixa) => faixa.tipo === "principal");
  if (!principal) throw new ErroEdicao("O projeto está sem a faixa principal.");
  exigirDestravada(principal);
  const clipes = [...principal.clipes];
  clipes.splice(indiceNaPrincipal(principal, t), 0, clipe);
  return trocarFaixa(projeto, compactar({ ...principal, clipes }));
}

function criarFaixa(projeto: Projeto, ctx: Contexto, tipo: TipoLivre, perto?: string): { projeto: Projeto; faixa: Faixa } {
  const faixa: Faixa = { id: ctx.novoId(), tipo, oculta: false, muda: false, travada: false, clipes: [] };
  const faixas = [...projeto.faixas];
  const referencia = faixas.findIndex((item) => item.id === perto && item.tipo === tipo);
  if (tipo === "legenda") {
    // Legendas por cima de tudo
    faixas.splice(referencia >= 0 ? referencia : 0, 0, faixa);
  } else if (tipo === "texto") {
    // Textos por cima dos vídeos, abaixo das legendas
    const legendas = faixas.filter((item) => item.tipo === "legenda").length;
    faixas.splice(referencia >= 0 ? referencia : legendas, 0, faixa);
  } else if (tipo === "video") {
    // Logo acima da faixa de referência, ou logo acima da principal
    const principal = faixas.findIndex((item) => item.tipo === "principal");
    faixas.splice(referencia >= 0 ? referencia : Math.max(principal, 0), 0, faixa);
  } else {
    faixas.splice(referencia >= 0 ? referencia + 1 : faixas.length, 0, faixa);
  }
  return { projeto: { ...projeto, faixas }, faixa };
}

/**
 * Coloca um clipe numa faixa livre: na preferida se couber; senão numa faixa nova logo ao lado dela.
 * Sem preferida, usa a primeira faixa do tipo onde couber, e só então cria uma.
 */
function colocarLivre(projeto: Projeto, ctx: Contexto, tipo: TipoLivre, clipe: Clipe, preferida?: string, forcarNova = false): Projeto {
  let destino: Faixa | undefined;
  if (!forcarNova) {
    const candidatas = preferida
      ? projeto.faixas.filter((faixa) => faixa.id === preferida)
      : projeto.faixas.filter((faixa) => faixa.tipo === tipo);
    destino = candidatas.find((faixa) => !faixa.travada && cabe(faixa, clipe.inicio, clipe.duracao));
  }
  if (!destino) {
    const criada = criarFaixa(projeto, ctx, tipo, preferida);
    projeto = criada.projeto;
    destino = criada.faixa;
  }
  return trocarFaixa(projeto, { ...destino, clipes: ordenar([...destino.clipes, clipe]) });
}

// -----------------------------------------------
// Operações
// -----------------------------------------------
export type DestinoClipe = {
  /** Instante onde o clipe deve começar (na principal, onde ele entra entre os outros). */
  inicio?: Tick;
  faixaId?: string;
  /** Cria uma faixa nova em vez de usar uma que já existe. */
  novaFaixa?: boolean;
};

/** Quanto uma imagem parada dura ao entrar na linha do tempo. */
export const DURACAO_IMAGEM_S = 5;

export function adicionarClipe(projeto: Projeto, ctx: Contexto, midiaId: string, destino: DestinoClipe = {}): { projeto: Projeto; clipeId: string } {
  const info = ctx.midia(midiaId);
  if (!info) throw new ErroEdicao("Esta mídia ainda não está pronta.");
  // Imagem parada não tem fim: entra com DURACAO_IMAGEM_S e a pessoa estica o quanto quiser
  const duracao = ajustarAoQuadro(projeto.taxa, Number.isFinite(info.duracao) ? info.duracao : DURACAO_IMAGEM_S * TICKS_POR_SEGUNDO);
  if (duracao < duracaoDoQuadro(projeto.taxa)) throw new ErroEdicao("A mídia é curta demais para a linha do tempo.");

  const clipe: Clipe = {
    id: ctx.novoId(),
    midia_id: midiaId,
    inicio: 0,
    duracao,
    entrada: 0,
    velocidade: 1,
    volume: 1,
    fade_entrada: 0,
    fade_saida: 0,
    transformacao: TRANSFORMACAO_PADRAO,
    recorte: RECORTE_PADRAO,
    // A animação já vem com a transparência: o clipe usa a máscara dela, como no recorte do fundo (a imagem
    // transparente traz o alfa no próprio arquivo e não precisa)
    ...(info.transparente && !info.imagem ? { remover_fundo: true } : {}),
  };
  const faixa = destino.faixaId ? projeto.faixas.find((item) => item.id === destino.faixaId) : undefined;
  if (faixa && !combina(faixa.tipo, info)) throw new ErroEdicao(faixaDeTexto(faixa.tipo) ? "A faixa de texto só recebe textos." : mensagemDeTipo(info));

  let resultado: Projeto;
  if (faixa?.tipo === "principal" || (!faixa && !destino.novaFaixa && info.video && !info.transparente)) {
    resultado = inserirNaPrincipal(projeto, clipe, destino.inicio);
  } else {
    clipe.inicio = Math.max(0, quadroMaisProximo(projeto.taxa, destino.inicio ?? 0));
    resultado = colocarLivre(projeto, ctx, info.video ? "video" : "audio", clipe, faixa?.id, destino.novaFaixa);
  }
  return { projeto: finalizar(resultado), clipeId: clipe.id };
}

/** Um trecho da montagem automática (lib/projeto/montagem.ts), em ticks. */
export type TrechoNaLinha = { midiaId: string; entrada: Tick; duracao: Tick };

/**
 * Põe a montagem no fim da faixa principal, um clipe por trecho. Os cortes são somados antes de ir
 * para o quadro, para não acumular o arredondamento e caírem nas batidas. Com música, ela entra numa
 * faixa de áudio nova, do começo da montagem até o fim, a partir da primeira batida usada, saindo em
 * fade; o som dos clipes fica mudo, como numa montagem com trilha.
 */
export function montarNaLinha(projeto: Projeto, ctx: Contexto, trechos: TrechoNaLinha[], musica: { midiaId: string; entrada: Tick } | null): { projeto: Projeto; selecao: string[] } {
  const principal = projeto.faixas.find((faixa) => faixa.tipo === "principal");
  if (!principal) throw new ErroEdicao("O projeto está sem a faixa principal.");
  exigirDestravada(principal);
  const quadro = duracaoDoQuadro(projeto.taxa);
  const inicio = principal.clipes.reduce((fim, clipe) => Math.max(fim, fimDoClipe(clipe)), 0);
  let resultado = projeto;
  let somado = 0;
  let cursor = inicio;
  const selecao: string[] = [];
  for (const trecho of trechos) {
    const info = ctx.midia(trecho.midiaId);
    if (!info?.video) throw new ErroEdicao("Uma das mídias da montagem não está pronta.");
    somado += trecho.duracao;
    const fim = quadroMaisProximo(projeto.taxa, inicio + somado);
    const duracao = fim - cursor;
    if (duracao < quadro) continue;
    const entrada = info.imagem ? 0 : Math.max(0, Math.min(trecho.entrada, info.duracao - duracao));
    const clipe: Clipe = {
      id: ctx.novoId(),
      midia_id: trecho.midiaId,
      inicio: cursor,
      duracao,
      entrada,
      velocidade: 1,
      volume: musica ? 0 : 1,
      fade_entrada: 0,
      fade_saida: 0,
      transformacao: TRANSFORMACAO_PADRAO,
      recorte: RECORTE_PADRAO,
    };
    resultado = inserirNaPrincipal(resultado, clipe, Number.MAX_SAFE_INTEGER);
    selecao.push(clipe.id);
    cursor = fim;
  }
  if (!selecao.length) throw new ErroEdicao("Nenhum trecho bom o bastante para a montagem.");
  if (musica) {
    const info = ctx.midia(musica.midiaId);
    if (!info?.audio) throw new ErroEdicao("A música da montagem não está pronta.");
    const duracao = Math.min(cursor - inicio, ajustarAoQuadro(projeto.taxa, info.duracao - musica.entrada));
    if (duracao >= quadro) {
      const trilha: Clipe = {
        id: ctx.novoId(),
        midia_id: musica.midiaId,
        inicio,
        duracao,
        entrada: musica.entrada,
        velocidade: 1,
        volume: 1,
        fade_entrada: 0,
        fade_saida: Math.min(TICKS_POR_SEGUNDO, Math.floor(duracao / 4)),
        transformacao: TRANSFORMACAO_PADRAO,
        recorte: RECORTE_PADRAO,
      };
      resultado = colocarLivre(resultado, ctx, "audio", trilha, undefined, true);
    }
  }
  return { projeto: finalizar(resultado), selecao };
}

/**
 * Põe o logo da marca por cima de tudo (logo abaixo dos textos), do começo ao fim do projeto, com a
 * transformação dada (lib/projeto/marca.ts). Numa faixa de sobreposição só dele.
 */
export function colocarLogo(projeto: Projeto, ctx: Contexto, midiaId: string, transformacao: Transformacao): { projeto: Projeto; clipeId: string } {
  const info = ctx.midia(midiaId);
  if (!info?.imagem) throw new ErroEdicao("O logo precisa ser uma imagem pronta da biblioteca.");
  const clipe: Clipe = {
    id: ctx.novoId(),
    midia_id: midiaId,
    inicio: 0,
    duracao: ajustarAoQuadro(projeto.taxa, Math.max(projeto.duracao, DURACAO_IMAGEM_S * TICKS_POR_SEGUNDO)),
    entrada: 0,
    velocidade: 1,
    volume: 1,
    fade_entrada: 0,
    fade_saida: 0,
    transformacao: limitarTransformacao(transformacao),
    recorte: RECORTE_PADRAO,
  };
  const colocado = colocarLivre(projeto, ctx, "video", clipe, undefined, true);
  // A faixa nova nasce logo acima da principal: sobe para a primeira das de vídeo, abaixo dos textos
  const faixa = colocado.faixas.find((item) => item.clipes.some((c) => c.id === clipe.id))!;
  const outras = colocado.faixas.filter((item) => item.id !== faixa.id);
  const topo = outras.filter((item) => faixaDeTexto(item.tipo)).length;
  return { projeto: finalizar({ ...colocado, faixas: [...outras.slice(0, topo), faixa, ...outras.slice(topo)] }), clipeId: clipe.id };
}

/**
 * A fonte e a cor da marca nos textos do projeto: os títulos (faixas de texto) ganham a fonte de título e a
 * primeira cor; as legendas, a fonte de texto e a primeira cor nas palavras-chave e no destaque da fala.
 */
export function aplicarMarcaAosTextos(projeto: Projeto, fonteTitulo: FonteTexto, fonteTexto: FonteTexto, cor: string | null): Projeto {
  let mudou = false;
  const faixas = projeto.faixas.map((faixa) => {
    if (!faixaDeTexto(faixa.tipo) || faixa.travada) return faixa;
    const legenda = faixa.tipo === "legenda";
    return {
      ...faixa,
      clipes: faixa.clipes.map((clipe) => {
        if (!clipe.texto) return clipe;
        mudou = true;
        const texto = legenda
          ? { ...clipe.texto, fonte: fonteTexto, ...(cor ? { cor_chave: cor, destaque: clipe.texto.destaque ? { ...clipe.texto.destaque, cor } : clipe.texto.destaque } : {}) }
          : { ...clipe.texto, fonte: fonteTitulo, ...(cor ? { cor } : {}) };
        return { ...clipe, texto };
      }),
    };
  });
  if (!mudou) throw new ErroEdicao("O projeto não tem textos nem legendas (ou as faixas deles estão travadas).");
  return { ...projeto, faixas };
}

/**
 * Troca a imagem dos clipes por outra (a mesma forma em outra cor, por exemplo), mantendo o resto do clipe:
 * posição, tempo, keyframes, animações e efeitos. Só de imagem para imagem, que não têm trecho nem fim.
 */
export function trocarMidiaDosClipes(projeto: Projeto, ctx: Contexto, clipeIds: string[], midiaId: string): Projeto {
  const nova = ctx.midia(midiaId);
  if (!nova?.imagem) throw new ErroEdicao("A nova mídia precisa ser uma imagem pronta.");
  return mudarClipes(projeto, clipeIds, (clipe) => {
    const atual = clipe.midia_id ? ctx.midia(clipe.midia_id) : null;
    if (!atual?.imagem) throw new ErroEdicao("Só clipes de imagem trocam de imagem.");
    return { ...clipe, midia_id: midiaId, entrada: 0 };
  });
}

/**
 * Preenche uma vaga de mídia de um modelo do espaço: o clipe passa a mostrar a mídia escolhida, do começo dela,
 * e encurta se ela for mais curta (a principal anda junto). O que era gerado para a mídia antiga (voz limpa,
 * imagem sem ruído, estável, recorte do fundo, tom) sai; o resto do clipe (posição, cor, efeitos, animações) fica.
 */
export function preencherVaga(projeto: Projeto, ctx: Contexto, clipeId: string, midiaId: string): Projeto {
  const { faixa, clipe, indice } = acharOuErro(projeto, clipeId);
  exigirDestravada(faixa);
  if (clipe.texto) throw new ErroEdicao("Esta vaga é de texto.");
  const info = ctx.midia(midiaId);
  if (!info) throw new ErroEdicao("A mídia ainda não está pronta.");
  if (!combina(faixa.tipo, info)) throw new ErroEdicao(faixa.tipo === "audio" ? "Escolha um áudio para esta vaga." : "Escolha um vídeo ou uma imagem para esta vaga.");
  const velocidade = info.imagem ? 1 : clipe.velocidade;
  const cabe = Number.isFinite(info.duracao) ? Math.max(duracaoDoQuadro(projeto.taxa), ajustarAoQuadro(projeto.taxa, info.duracao / velocidade)) : Number.POSITIVE_INFINITY;
  const duracao = Math.min(clipe.duracao, cabe);
  const novo: Clipe = {
    ...clipe,
    midia_id: midiaId,
    entrada: 0,
    duracao,
    velocidade,
    // A curva era do ritmo do vídeo antigo; com outro tamanho, ela sai
    curva_velocidade: duracao === clipe.duracao && !info.imagem ? clipe.curva_velocidade : null,
    voz_limpa: false,
    imagem_limpa: false,
    estabilizar: false,
    remover_fundo: false,
    tom: 0,
  };
  const clipes = [...faixa.clipes];
  clipes[indice] = novo;
  const alterada = { ...faixa, clipes };
  return finalizar(trocarFaixa(projeto, faixa.tipo === "principal" ? compactar(alterada) : alterada));
}

/** Zoom lento das imagens nas cenas de um modelo, para a foto não ficar parada. */
const ZOOM_LENTO = 1.12;

/**
 * Põe um modelo de projeto (lib/projeto/modelos.ts) no fim da faixa principal: as cenas com as mídias
 * escolhidas (o vídeo mais curto que a cena encurta a cena), o filtro, a transição e o zoom lento das
 * imagens; os textos e as formas no tempo da cena deles, cortados no fim dela. Tudo num passo do desfazer.
 */
export function aplicarModelo(projeto: Projeto, ctx: Contexto, plano: PlanoDoModelo): { projeto: Projeto; selecao: string[] } {
  const principal = projeto.faixas.find((faixa) => faixa.tipo === "principal");
  if (!principal) throw new ErroEdicao("O projeto está sem a faixa principal.");
  exigirDestravada(principal);
  const quadro = duracaoDoQuadro(projeto.taxa);
  let cursor = principal.clipes.reduce((fim, clipe) => Math.max(fim, fimDoClipe(clipe)), 0);
  let resultado = projeto;
  const cenas: { inicio: Tick; fim: Tick; id: string }[] = [];
  for (const cena of plano.cenas) {
    const info = ctx.midia(cena.midiaId);
    if (!info?.video) throw new ErroEdicao("Uma das mídias do modelo não está pronta.");
    const duracao = ajustarAoQuadro(projeto.taxa, Math.min(cena.duracao, info.duracao));
    if (duracao < quadro) throw new ErroEdicao("Uma das mídias do modelo é curta demais.");
    const clipe: Clipe = {
      id: ctx.novoId(),
      midia_id: cena.midiaId,
      inicio: cursor,
      duracao,
      entrada: 0,
      velocidade: 1,
      volume: 1,
      fade_entrada: 0,
      fade_saida: 0,
      transformacao: limitarTransformacao({ ...TRANSFORMACAO_PADRAO, escala: cena.escala }),
      recorte: RECORTE_PADRAO,
      ...(cena.filtro ? { cor: { ...COR_PADRAO, filtro: cena.filtro } } : {}),
      ...(cena.transicao ? { transicao: cena.transicao } : {}),
      ...(cena.zoomLento ? { keyframes: { escala: [{ t: 0, valor: cena.escala, curva: "linear" as const }, { t: duracao, valor: cena.escala * ZOOM_LENTO, curva: "linear" as const }] } } : {}),
    };
    resultado = inserirNaPrincipal(resultado, clipe, Number.MAX_SAFE_INTEGER);
    cenas.push({ inicio: cursor, fim: cursor + duracao, id: clipe.id });
    cursor += duracao;
  }
  // Textos e formas: no tempo da cena, até o fim dela (ou antes, se o modelo pede)
  const trecho = (cena: number, de: Tick, ate: Tick | null) => {
    const alvo = cenas[cena];
    const inicio = quadroMaisProximo(projeto.taxa, alvo.inicio + de);
    const fim = Math.min(alvo.fim, ate === null ? alvo.fim : quadroMaisProximo(projeto.taxa, alvo.inicio + ate));
    return fim - inicio >= quadro ? { inicio, duracao: fim - inicio } : null;
  };
  for (const forma of plano.formas) {
    const tempo = trecho(forma.cena, forma.de, forma.ate);
    if (!tempo) continue;
    if (!ctx.midia(forma.midiaId)?.imagem) throw new ErroEdicao("Uma das formas do modelo não está pronta.");
    const clipe: Clipe = {
      id: ctx.novoId(),
      midia_id: forma.midiaId,
      ...tempo,
      entrada: 0,
      velocidade: 1,
      volume: 1,
      fade_entrada: 0,
      fade_saida: 0,
      transformacao: limitarTransformacao(forma.transformacao),
      recorte: RECORTE_PADRAO,
      animacao: forma.animacao ? limitarAnimacoes(forma.animacao, tempo.duracao) : null,
    };
    resultado = colocarLivre(resultado, ctx, "video", clipe);
  }
  for (const texto of plano.textos) {
    const tempo = trecho(texto.cena, texto.de, texto.ate);
    if (!tempo) continue;
    const clipe = { ...clipeDeTexto(ctx, tempo.inicio, tempo.duracao, texto.texto), transformacao: limitarTransformacao(texto.transformacao), animacao: texto.animacao ? limitarAnimacoes(texto.animacao, tempo.duracao) : null };
    resultado = colocarLivre(resultado, ctx, "texto", clipe);
  }
  return { projeto: finalizar(resultado), selecao: cenas.map((cena) => cena.id) };
}

export function moverClipe(projeto: Projeto, ctx: Contexto, clipeId: string, destino: DestinoClipe & { inicio: Tick }): Projeto {
  const { faixa: origem, clipe } = acharOuErro(projeto, clipeId);
  exigirDestravada(origem);
  const info = infoDoClipe(ctx, clipe, origem);

  const restantes = origem.clipes.filter((item) => item.id !== clipeId);
  const semOClipe = { ...origem, clipes: restantes };
  let resultado = trocarFaixa(projeto, origem.tipo === "principal" ? compactar(semOClipe) : semOClipe);

  const faixa = destino.faixaId ? resultado.faixas.find((item) => item.id === destino.faixaId) : undefined;
  if (faixa && !aceitaNaFaixa(faixa.tipo, clipe, info)) {
    throw new ErroEdicao(clipe.texto ? "Textos ficam na faixa de texto." : faixaDeTexto(faixa.tipo) ? "A faixa de texto só recebe textos." : mensagemDeTipo(info));
  }
  if (faixa) exigirDestravada(faixa);

  if (faixa?.tipo === "principal") {
    resultado = inserirNaPrincipal(resultado, clipe, destino.inicio);
  } else {
    const movido = { ...clipe, inicio: Math.max(0, quadroMaisProximo(projeto.taxa, destino.inicio)) };
    // Solto por cima de outro clipe, ganha uma faixa nova ao lado, como no CapCut
    const ocupado = faixa ? !cabe(faixa, movido.inicio, movido.duracao) : false;
    resultado = colocarLivre(resultado, ctx, tipoLivreDoClipe(clipe, info, origem.tipo), movido, faixa?.id, destino.novaFaixa || ocupado);
  }
  return finalizar(resultado);
}

export const LIMITES_VELOCIDADE = { minimo: 0.1, maximo: 10 } as const;

/**
 * Onde o pedaço [de, ate) do clipe começa na mídia, e a velocidade dele. Com curva de velocidade, o
 * pedaço leva a curva recortada (lib/projeto/velocidade.ts); sem ela, a conta é a reta de sempre.
 */
function pedacoDoClipe(clipe: Clipe, de: Tick, ate: Tick): Pick<Clipe, "entrada" | "velocidade" | "curva_velocidade"> {
  if (clipe.curva_velocidade && clipe.midia_id) {
    const pedaco = pedacoComCurva({ ...clipe, curva_velocidade: clipe.curva_velocidade }, de, ate);
    // A velocidade do pedaço é a média da curva nele: num clipe lento, o trecho mais lento sai abaixo do mínimo
    if (pedaco.velocidade < VELOCIDADE_NA_API.minimo - 1e-9 || pedaco.velocidade > VELOCIDADE_NA_API.maximo + 1e-9) {
      throw new ErroEdicao("Aqui o pedaço ficaria mais lento que 10% (ou rápido demais). Corte em outro ponto ou suavize a curva de velocidade.");
    }
    return pedaco;
  }
  return { entrada: Math.max(0, clipe.entrada + Math.round((de - clipe.inicio) * clipe.velocidade)), velocidade: clipe.velocidade, curva_velocidade: clipe.curva_velocidade };
}

/**
 * A curva de velocidade do clipe de mídia (null tira). A duração e o trecho da mídia não mudam. Não
 * combina com transição: o clipe com curva não pode ter transição de nenhum lado.
 */
export function curvarVelocidade(projeto: Projeto, clipeId: string, pontos: PontoDeVelocidade[] | null): Projeto {
  const { faixa, clipe, indice } = acharOuErro(projeto, clipeId);
  exigirDestravada(faixa);
  if (!clipe.midia_id) throw new ErroEdicao("Textos não têm velocidade.");
  if (pontos) {
    const anterior = faixa.clipes[indice - 1];
    if (clipe.transicao || anterior?.transicao) throw new ErroEdicao("Tire a transição deste clipe antes de usar a curva de velocidade.");
    if (pontos.length < 2 || pontos[0][0] !== 0 || pontos[pontos.length - 1][0] !== 1) throw new ErroEdicao("A curva precisa ir do começo ao fim do clipe.");
  }
  const curva = pontos?.map(([u, s]) => [u, limitar(s, LIMITES_DA_CURVA.minimo, LIMITES_DA_CURVA.maximo)] as PontoDeVelocidade) ?? null;
  const clipes = [...faixa.clipes];
  clipes[indice] = { ...clipe, curva_velocidade: curva, ...(curva ? { inverter: false } : {}) };
  return finalizar(trocarFaixa(projeto, { ...faixa, clipes }));
}

/**
 * Muda a velocidade do clipe de mídia. O trecho da mídia fica o mesmo: a duração muda (na principal,
 * os clipes seguintes andam junto). Keyframes, curva do abaixar na fala e fades acompanham a nova duração.
 */
export function mudarVelocidade(projeto: Projeto, clipeId: string, velocidade: number): Projeto {
  const { faixa, clipe, indice } = acharOuErro(projeto, clipeId);
  exigirDestravada(faixa);
  if (!clipe.midia_id) throw new ErroEdicao("Textos não têm velocidade.");
  const nova = limitar(velocidade, LIMITES_VELOCIDADE.minimo, LIMITES_VELOCIDADE.maximo);
  const quadro = duracaoDoQuadro(projeto.taxa);
  const duracao = Math.max(quadro, ajustarAoQuadro(projeto.taxa, (clipe.duracao * clipe.velocidade) / nova));
  if (faixa.tipo !== "principal") {
    const proximo = faixa.clipes.find((item) => item.inicio >= fimDoClipe(clipe) && item.id !== clipe.id);
    if (proximo && clipe.inicio + duracao > proximo.inicio) throw new ErroEdicao("Mais devagar, o clipe passaria por cima do próximo da faixa.");
  }
  const fator = duracao / clipe.duracao;
  const escalar = (pontos: Keyframe[] | undefined) => pontos?.map((ponto) => ({ ...ponto, t: Math.round(ponto.t * fator) }));
  const keyframes = clipe.keyframes
    ? (Object.fromEntries(Object.entries(clipe.keyframes).map(([nome, pontos]) => [nome, escalar(pontos as Keyframe[] | undefined)])) as Keyframes)
    : clipe.keyframes;
  const novo: Clipe = {
    ...clipe,
    velocidade: nova,
    duracao,
    keyframes,
    // O nivelamento segue o som do próprio clipe: estica junto
    nivelamento: clipe.nivelamento ? { ...clipe.nivelamento, pontos: escalar(clipe.nivelamento.pontos)! } : clipe.nivelamento,
    // O abaixar na fala segue a fala das outras faixas, no tempo da linha do tempo: fica onde está
  };
  const clipes = [...faixa.clipes];
  clipes[indice] = novo;
  const alterada = { ...faixa, clipes };
  return finalizar(trocarFaixa(projeto, faixa.tipo === "principal" ? compactar(alterada) : alterada));
}

/** Puxa a borda do começo ou do fim do clipe até `tempo`, sem passar do que a mídia tem nem do vizinho. */
export function apararClipe(projeto: Projeto, ctx: Contexto, clipeId: string, borda: "inicio" | "fim", tempo: Tick): Projeto {
  const { faixa, clipe, indice } = acharOuErro(projeto, clipeId);
  exigirDestravada(faixa);
  const quadro = duracaoDoQuadro(projeto.taxa);
  const info = infoDoClipe(ctx, clipe, faixa);
  const alvo = quadroMaisProximo(projeto.taxa, tempo);
  const livre = faixa.tipo !== "principal";
  let novo: Clipe;

  if (borda === "fim") {
    // Sem mídia limitando (texto, ou mídia que sumiu da biblioteca), o limite é o tamanho máximo do projeto
    let maximo = Number.isFinite(info.duracao)
      ? clipe.curva_velocidade
        ? ajustarAoQuadro(projeto.taxa, clipe.duracao + (info.duracao - tempoNaMidia(clipe, fimDoClipe(clipe))) / velocidadeNaCurva(clipe.curva_velocidade, clipe.velocidade, 1))
        : ajustarAoQuadro(projeto.taxa, (info.duracao - clipe.entrada) / clipe.velocidade)
      : TICK_MAXIMO - clipe.inicio;
    const proximo = livre ? faixa.clipes.find((item) => item.inicio >= fimDoClipe(clipe) && item.id !== clipe.id) : undefined;
    if (proximo) maximo = Math.min(maximo, proximo.inicio - clipe.inicio);
    const duracao = Math.min(Math.max(alvo - clipe.inicio, quadro), maximo);
    novo = { ...clipe, duracao, ...pedacoDoClipe(clipe, clipe.inicio, clipe.inicio + duracao) };
  } else {
    // delta > 0 encurta pelo começo; delta < 0 mostra o que vinha antes na mídia (o texto não tem limite)
    const velocidadeNaPonta = clipe.curva_velocidade ? velocidadeNaCurva(clipe.curva_velocidade, clipe.velocidade, 0) : clipe.velocidade;
    let minimo = clipe.texto || info.imagem ? Number.NEGATIVE_INFINITY : -ajustarAoQuadro(projeto.taxa, clipe.entrada / velocidadeNaPonta);
    if (livre) {
      const anterior = [...faixa.clipes].reverse().find((item) => fimDoClipe(item) <= clipe.inicio && item.id !== clipe.id);
      minimo = Math.max(minimo, (anterior ? fimDoClipe(anterior) : 0) - clipe.inicio);
    }
    const maximo = clipe.duracao - quadro;
    const delta = Math.min(Math.max(alvo - clipe.inicio, minimo), maximo);
    novo = {
      ...clipe,
      inicio: clipe.inicio + delta,
      duracao: clipe.duracao - delta,
      ...pedacoDoClipe(clipe, clipe.inicio + delta, fimDoClipe(clipe)),
      // Os keyframes e as palavras da legenda ficam no mesmo instante da linha do tempo
      keyframes: deslocarKeyframes(clipe.keyframes, delta),
      expressoes: deslocarExpressoes(clipe.expressoes, delta),
      texto: deslocarTempos(clipe.texto, delta),
      abaixamento: deslocarCurva(clipe.abaixamento, delta),
      nivelamento: deslocarCurva(clipe.nivelamento, delta),
    };
    // A imagem não usa o ponto de entrada (é a mesma em todo instante): fica em zero, que a API aceita
    if (info.imagem) novo.entrada = 0;
  }

  const clipes = [...faixa.clipes];
  clipes[indice] = novo;
  const alterada = { ...faixa, clipes };
  return finalizar(trocarFaixa(projeto, livre ? alterada : compactar(alterada)));
}

/**
 * Desliza o conteúdo (slip): o clipe fica no mesmo lugar e com a mesma duração, e o trecho da mídia anda.
 * `deslocamento` é quanto o conteúdo anda para a direita na linha do tempo (positivo mostra o que vinha antes na
 * mídia). Para no que a mídia tem dos dois lados; keyframes, fades e animações ficam onde estão.
 */
export function deslizarConteudo(projeto: Projeto, ctx: Contexto, clipeId: string, deslocamento: Tick): Projeto {
  const { faixa, clipe, indice } = acharOuErro(projeto, clipeId);
  exigirDestravada(faixa);
  const info = infoDoClipe(ctx, clipe, faixa);
  if (clipe.texto || !clipe.midia_id || info.imagem) throw new ErroEdicao("Só vídeos e áudios têm um trecho da mídia para deslizar.");
  // O trecho da mídia que o clipe usa, em ticks da mídia (a curva de velocidade usa o mesmo trecho)
  const trecho = Math.round(clipe.duracao * clipe.velocidade);
  const ultimaEntrada = Number.isFinite(info.duracao) ? Math.max(0, info.duracao - trecho) : Number.POSITIVE_INFINITY;
  const entrada = Math.min(Math.max(0, clipe.entrada - Math.round(deslocamento * clipe.velocidade)), ultimaEntrada);
  if (entrada === clipe.entrada) throw new ErroEdicao(deslocamento > 0 ? "A mídia não tem mais nada antes deste trecho." : "A mídia não tem mais nada depois deste trecho.");
  const clipes = [...faixa.clipes];
  clipes[indice] = { ...clipe, entrada };
  return finalizar(trocarFaixa(projeto, { ...faixa, clipes }));
}

/**
 * Move o corte entre o clipe e o seguinte da mesma faixa (roll): um cresce o que o outro encolhe, e nada mais
 * na linha do tempo anda. Cada lado para no que a mídia tem e no mínimo de um quadro.
 */
export function moverCorte(projeto: Projeto, ctx: Contexto, clipeId: string, tempo: Tick): Projeto {
  const { faixa, clipe: esquerda, indice } = acharOuErro(projeto, clipeId);
  exigirDestravada(faixa);
  const direita = faixa.clipes[indice + 1];
  if (!direita || direita.inicio !== fimDoClipe(esquerda)) throw new ErroEdicao("O corte só anda entre dois clipes encostados na mesma faixa.");
  if (esquerda.curva_velocidade || direita.curva_velocidade) throw new ErroEdicao("O corte não anda num clipe com curva de velocidade: apare cada lado.");
  const quadro = duracaoDoQuadro(projeto.taxa);
  const corte = fimDoClipe(esquerda);
  const infoEsquerda = infoDoClipe(ctx, esquerda, faixa);
  const infoDireita = infoDoClipe(ctx, direita, faixa);
  // A esquerda cresce até o fim da mídia dela; a direita volta até o começo da dela
  const maisNaEsquerda = Number.isFinite(infoEsquerda.duracao) ? ajustarAoQuadro(projeto.taxa, (infoEsquerda.duracao - esquerda.entrada) / esquerda.velocidade) - esquerda.duracao : Number.POSITIVE_INFINITY;
  const maisNaDireita = direita.texto || infoDireita.imagem ? Number.POSITIVE_INFINITY : ajustarAoQuadro(projeto.taxa, direita.entrada / direita.velocidade);
  const minimo = Math.max(-(esquerda.duracao - quadro), -maisNaDireita);
  const maximo = Math.min(direita.duracao - quadro, maisNaEsquerda);
  const delta = Math.min(Math.max(quadroMaisProximo(projeto.taxa, tempo) - corte, minimo), maximo);
  if (delta === 0) return projeto;
  const duracaoEsquerda = esquerda.duracao + delta;
  const novaEsquerda: Clipe = { ...esquerda, duracao: duracaoEsquerda, ...pedacoDoClipe(esquerda, esquerda.inicio, esquerda.inicio + duracaoEsquerda) };
  const novaDireita: Clipe = {
    ...direita,
    inicio: direita.inicio + delta,
    duracao: direita.duracao - delta,
    ...pedacoDoClipe(direita, direita.inicio + delta, fimDoClipe(direita)),
    // Como no aparar do começo: keyframes, palavras e o abaixar ficam no mesmo instante da linha do tempo
    keyframes: deslocarKeyframes(direita.keyframes, delta),
    expressoes: deslocarExpressoes(direita.expressoes, delta),
    texto: deslocarTempos(direita.texto, delta),
    abaixamento: deslocarCurva(direita.abaixamento, delta),
    nivelamento: deslocarCurva(direita.nivelamento, delta),
  };
  if (infoDireita.imagem) novaDireita.entrada = 0;
  const clipes = [...faixa.clipes];
  clipes[indice] = novaEsquerda;
  clipes[indice + 1] = novaDireita;
  return finalizar(trocarFaixa(projeto, { ...faixa, clipes }));
}

/**
 * Divide no instante `tempo` os clipes escolhidos que passam por ele.
 * Sem nenhum escolhido, divide o clipe da faixa principal que está sob o cursor.
 */
export function dividirClipes(projeto: Projeto, ctx: Contexto, tempo: Tick, clipeIds: string[]): { projeto: Projeto; novos: string[] } {
  const t = quadroMaisProximo(projeto.taxa, tempo);
  const quadro = duracaoDoQuadro(projeto.taxa);
  const escolhidos = new Set(clipeIds);
  const novos: string[] = [];

  const faixas = projeto.faixas.map((faixa) => {
    const clipes: Clipe[] = [];
    for (const clipe of faixa.clipes) {
      const alvo = escolhidos.size ? escolhidos.has(clipe.id) : faixa.tipo === "principal";
      const fim = fimDoClipe(clipe);
      if (!alvo || t < clipe.inicio + quadro || t > fim - quadro) {
        clipes.push(clipe);
        continue;
      }
      exigirDestravada(faixa);
      const direita: Clipe = {
        ...clipe,
        id: ctx.novoId(),
        inicio: t,
        duracao: fim - t,
        ...pedacoDoClipe(clipe, t, fim),
        // O fade e a animação de entrada ficam com a metade da esquerda; os de saída, com a da direita
        fade_entrada: 0,
        keyframes: deslocarKeyframes(clipe.keyframes, t - clipe.inicio),
        expressoes: deslocarExpressoes(clipe.expressoes, t - clipe.inicio),
        texto: deslocarTempos(clipe.texto, t - clipe.inicio),
        abaixamento: deslocarCurva(clipe.abaixamento, t - clipe.inicio),
        nivelamento: deslocarCurva(clipe.nivelamento, t - clipe.inicio),
        animacao: clipe.animacao ? { ...clipe.animacao, entrada: SEM_ANIMACAO.entrada } : clipe.animacao,
      };
      // A transição é de saída: fica só com a metade da direita (na esquerda, ela apareceria no meio da tomada)
      const esquerda = { ...clipe, ...pedacoDoClipe(clipe, clipe.inicio, t), duracao: t - clipe.inicio, fade_saida: 0, transicao: null, animacao: clipe.animacao ? { ...clipe.animacao, saida: SEM_ANIMACAO.saida } : clipe.animacao };
      // Numa legenda, as palavras se repartem pelo cursor: cada metade fica com as que caem nela
      const repartidas = faixa.tipo === "legenda" && clipe.texto ? repartirLegenda(clipe.texto, t - clipe.inicio, clipe.duracao) : null;
      if (repartidas) {
        esquerda.texto = repartidas[0];
        direita.texto = repartidas[1];
      }
      clipes.push(esquerda, direita);
      novos.push(direita.id);
    }
    return { ...faixa, clipes };
  });

  if (!novos.length) throw new ErroEdicao("Coloque o cursor sobre o clipe que quer dividir.");
  return { projeto: finalizar({ ...projeto, faixas }), novos };
}

/**
 * Apaga os clipes. Na faixa principal o espaço sempre fecha; nas outras, só com `fecharEspaco`
 * (os clipes seguintes da mesma faixa andam para a esquerda).
 */
export function apagarClipes(projeto: Projeto, clipeIds: string[], fecharEspaco = false): Projeto {
  const apagar = new Set(clipeIds);
  if (!apagar.size) throw new ErroEdicao("Escolha um clipe para apagar.");

  const faixas = projeto.faixas.map((faixa) => {
    if (!faixa.clipes.some((clipe) => apagar.has(clipe.id))) return faixa;
    exigirDestravada(faixa);
    if (faixa.tipo === "principal") return compactar({ ...faixa, clipes: faixa.clipes.filter((clipe) => !apagar.has(clipe.id)) });
    let recuo = 0;
    const clipes: Clipe[] = [];
    for (const clipe of ordenar(faixa.clipes)) {
      if (apagar.has(clipe.id)) {
        if (fecharEspaco) recuo += clipe.duracao;
        continue;
      }
      clipes.push(recuo ? { ...clipe, inicio: clipe.inicio - recuo } : clipe);
    }
    return { ...faixa, clipes };
  });
  return finalizar({ ...projeto, faixas });
}

export type Intervalo = { inicio: Tick; fim: Tick };

/**
 * Os intervalos no quadro, em ordem e sem sobreposição; os menores que um quadro somem. As duas pontas
 * vão para o começo do quadro: os cortes da fala começam e terminam no começo de uma palavra (ou numa
 * pausa), e arredondar para a frente deixaria um pedaço da palavra cortada ou comeria o da seguinte.
 */
function juntarIntervalos(projeto: Projeto, intervalos: Intervalo[]): Intervalo[] {
  const quadro = duracaoDoQuadro(projeto.taxa);
  const alinhados = intervalos
    .map((item) => ({ inicio: Math.max(0, ajustarAoQuadro(projeto.taxa, item.inicio)), fim: ajustarAoQuadro(projeto.taxa, item.fim) }))
    .filter((item) => item.fim - item.inicio >= quadro)
    .sort((a, b) => a.inicio - b.inicio);
  const juntos: Intervalo[] = [];
  for (const item of alinhados) {
    const ultimo = juntos.at(-1);
    if (ultimo && item.inicio <= ultimo.fim) ultimo.fim = Math.max(ultimo.fim, item.fim);
    else juntos.push({ ...item });
  }
  return juntos;
}

/**
 * Tira os intervalos da linha do tempo inteira e fecha o espaço, em todas as faixas, para a fala,
 * as legendas, as sobreposições e a música continuarem juntas. Um clipe que atravessa um intervalo
 * vira pedaços: o primeiro guarda o id, o fade e a animação de entrada; o último, os de saída e a
 * transição. É a base da limpeza de fala e da edição pelo texto.
 */
export function removerIntervalos(projeto: Projeto, ctx: Contexto, intervalos: Intervalo[]): Projeto {
  const cortes = juntarIntervalos(projeto, intervalos);
  if (!cortes.length) throw new ErroEdicao("Não há trechos para remover.");
  const quadro = duracaoDoQuadro(projeto.taxa);
  /** Quanto foi removido antes do instante `t`. */
  const removidoAntes = (t: Tick) => cortes.reduce((soma, corte) => soma + Math.max(0, Math.min(t, corte.fim) - corte.inicio), 0);

  const faixas = projeto.faixas.map((faixa) => {
    const atingida = faixa.clipes.some((clipe) => cortes.some((corte) => corte.inicio < fimDoClipe(clipe)));
    if (!atingida) return faixa;
    exigirDestravada(faixa);
    const clipes: Clipe[] = [];
    for (const clipe of ordenar(faixa.clipes)) {
      const fim = fimDoClipe(clipe);
      // Os pedaços do clipe que ficam fora dos intervalos
      const pedacos: Intervalo[] = [];
      let t = clipe.inicio;
      for (const corte of cortes) {
        if (corte.fim <= t || corte.inicio >= fim) continue;
        if (corte.inicio > t) pedacos.push({ inicio: t, fim: corte.inicio });
        t = Math.max(t, corte.fim);
      }
      if (t < fim) pedacos.push({ inicio: t, fim });
      const validos = pedacos.filter((p) => p.fim - p.inicio >= quadro);
      validos.forEach((pedaco, i) => {
        const primeiro = i === 0;
        const ultimo = i === validos.length - 1;
        const inteiro = pedaco.inicio === clipe.inicio && pedaco.fim === fim;
        clipes.push(
          inteiro
            ? { ...clipe, inicio: clipe.inicio - removidoAntes(clipe.inicio) }
            : {
                ...clipe,
                id: primeiro ? clipe.id : ctx.novoId(),
                inicio: pedaco.inicio - removidoAntes(pedaco.inicio),
                duracao: pedaco.fim - pedaco.inicio,
                ...pedacoDoClipe(clipe, pedaco.inicio, pedaco.fim),
                fade_entrada: primeiro ? clipe.fade_entrada : 0,
                fade_saida: ultimo ? clipe.fade_saida : 0,
                keyframes: deslocarKeyframes(clipe.keyframes, pedaco.inicio - clipe.inicio),
                expressoes: deslocarExpressoes(clipe.expressoes, pedaco.inicio - clipe.inicio),
                texto: deslocarTempos(clipe.texto, pedaco.inicio - clipe.inicio),
                abaixamento: deslocarCurva(clipe.abaixamento, pedaco.inicio - clipe.inicio),
                nivelamento: deslocarCurva(clipe.nivelamento, pedaco.inicio - clipe.inicio),
                transicao: ultimo ? clipe.transicao : null,
                animacao: clipe.animacao
                  ? { ...clipe.animacao, entrada: primeiro ? clipe.animacao.entrada : SEM_ANIMACAO.entrada, saida: ultimo ? clipe.animacao.saida : SEM_ANIMACAO.saida }
                  : clipe.animacao,
              },
        );
      });
    }
    const alterada = { ...faixa, clipes };
    return faixa.tipo === "principal" ? compactar(alterada) : alterada;
  });
  return finalizar({ ...projeto, faixas });
}

/** Cada clipe ganha uma cópia logo depois dele. Devolve os ids das cópias. */
export function duplicarClipes(projeto: Projeto, ctx: Contexto, clipeIds: string[]): { projeto: Projeto; novos: string[] } {
  if (!clipeIds.length) throw new ErroEdicao("Escolha um clipe para duplicar.");
  const novos: string[] = [];
  let resultado = projeto;
  for (const clipeId of clipeIds) {
    const { faixa, clipe, indice } = acharOuErro(resultado, clipeId);
    exigirDestravada(faixa);
    const copia: Clipe = { ...clipe, id: ctx.novoId() };
    if (faixa.tipo === "principal") {
      const clipes = [...faixa.clipes];
      clipes.splice(indice + 1, 0, copia);
      resultado = trocarFaixa(resultado, compactar({ ...faixa, clipes }));
    } else {
      copia.inicio = fimDoClipe(clipe);
      resultado = colocarLivre(resultado, ctx, faixa.tipo, copia, faixa.id);
    }
    novos.push(copia.id);
  }
  return { projeto: finalizar(resultado), novos };
}

/**
 * Separa o som dos vídeos escolhidos: cada um ganha um clipe de áudio com o mesmo trecho da mídia, a mesma
 * velocidade e os mesmos ajustes de som, no mesmo instante, numa faixa de áudio onde caiba; o vídeo fica
 * mudo (`som_separado`). Daí em diante os dois andam soltos: aparar o som além do corte do vídeo faz os
 * cortes em J e em L. Devolve os clipes de áudio novos.
 */
export function separarSom(projeto: Projeto, ctx: Contexto, clipeIds: string[]): { projeto: Projeto; novos: string[] } {
  if (!clipeIds.length) throw new ErroEdicao("Escolha um vídeo para separar o som.");
  const novos: string[] = [];
  let resultado = projeto;
  for (const clipeId of clipeIds) {
    const { faixa, clipe } = acharOuErro(resultado, clipeId);
    const midia = clipe.midia_id ? ctx.midia(clipe.midia_id) : null;
    if (faixa.tipo === "audio" || clipe.texto || clipe.som_separado || !midia?.audio || !midia.video || midia.imagem) continue;
    exigirDestravada(faixa);
    const som: Clipe = {
      id: ctx.novoId(),
      midia_id: clipe.midia_id,
      inicio: clipe.inicio,
      duracao: clipe.duracao,
      entrada: clipe.entrada,
      velocidade: clipe.velocidade,
      curva_velocidade: clipe.curva_velocidade,
      volume: clipe.volume,
      fade_entrada: clipe.fade_entrada,
      fade_saida: clipe.fade_saida,
      curva_fade: clipe.curva_fade,
      voz_limpa: clipe.voz_limpa,
      efeitos_voz: clipe.efeitos_voz,
      tom: clipe.tom,
      igualar_volume: clipe.igualar_volume,
      abaixamento: clipe.abaixamento,
      nivelamento: clipe.nivelamento,
      keyframes: clipe.keyframes?.volume?.length ? { volume: clipe.keyframes.volume } : null,
      transformacao: TRANSFORMACAO_PADRAO,
      recorte: RECORTE_PADRAO,
    };
    resultado = trocarFaixa(resultado, { ...faixa, clipes: faixa.clipes.map((item) => (item.id === clipeId ? { ...item, som_separado: true } : item)) });
    resultado = colocarLivre(resultado, ctx, "audio", som);
    novos.push(som.id);
  }
  if (!novos.length) throw new ErroEdicao("Escolha um vídeo com som que ainda não foi separado.");
  return { projeto: finalizar(resultado), novos };
}

/** Devolve o som ao vídeo (o clipe de áudio separado, se ainda existe, continua: apague-o para não dobrar o som). */
export function devolverSom(projeto: Projeto, clipeIds: string[]): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => ({ ...clipe, som_separado: false }));
}

/** Quanto o quadro congelado dura ao entrar. */
export const DURACAO_CONGELADO_S = 3;

/**
 * Congela o quadro do vídeo da principal em `tempo`: divide o clipe ali e põe entre as metades a foto daquele
 * quadro (`midiaId`, tirada no worker pela regra do render), com a posição do instante (sem os keyframes) e a
 * cor, o efeito, o recorte, os cantos, a máscara e a mesclagem do clipe. No começo ou no fim do clipe, a foto
 * entra antes ou depois dele, sem dividir.
 */
export function congelarQuadro(projeto: Projeto, ctx: Contexto, clipeId: string, tempo: Tick, midiaId: string, duracao: Tick): { projeto: Projeto; clipeId: string } {
  const { faixa, clipe } = acharOuErro(projeto, clipeId);
  if (faixa.tipo !== "principal") throw new ErroEdicao("Congelar o quadro vale nos vídeos da faixa principal.");
  exigirDestravada(faixa);
  const info = clipe.midia_id ? ctx.midia(clipe.midia_id) : null;
  if (!info?.video || info.imagem) throw new ErroEdicao("Congelar o quadro vale em vídeos.");
  const quadro = duracaoDoQuadro(projeto.taxa);
  const t = Math.min(Math.max(quadroMaisProximo(projeto.taxa, tempo), clipe.inicio), fimDoClipe(clipe));
  const congelado: Clipe = {
    id: ctx.novoId(),
    midia_id: midiaId,
    inicio: t,
    duracao: Math.max(quadro, ajustarAoQuadro(projeto.taxa, duracao)),
    entrada: 0,
    velocidade: 1,
    volume: 1,
    fade_entrada: 0,
    fade_saida: 0,
    transformacao: transformacaoNoTempo(clipe, t),
    recorte: clipe.recorte,
    virar: clipe.virar,
    cantos: clipe.cantos,
    mascara: clipe.mascara,
    mesclagem: clipe.mesclagem,
    cor: clipe.cor,
    efeito: clipe.efeito,
    chroma: clipe.chroma,
    chave_luma: clipe.chave_luma,
  };
  let resultado = projeto;
  if (t >= clipe.inicio + quadro && t <= fimDoClipe(clipe) - quadro) resultado = dividirClipes(projeto, ctx, t, [clipeId]).projeto;
  resultado = inserirNaPrincipal(resultado, congelado, t);
  return { projeto: finalizar(resultado), clipeId: congelado.id };
}

/** Um clipe copiado (Ctrl+C), com o tipo e a faixa de onde veio. */
export type ClipeCopiado = { clipe: Clipe; tipo: TipoFaixa; faixaId: string };

/**
 * Cola os clipes copiados no cursor, com ids novos e o mesmo espaçamento entre eles. Os da principal entram no
 * cursor, entre os outros (a principal continua encostada); os das outras faixas voltam para a faixa de onde
 * vieram, se ela existe e tem lugar, ou vão para uma nova do mesmo tipo.
 */
export function colarClipes(projeto: Projeto, ctx: Contexto, copiados: ClipeCopiado[], inicio: Tick): { projeto: Projeto; novos: string[] } {
  if (!copiados.length) throw new ErroEdicao("Copie um clipe antes (Ctrl+C).");
  const base = Math.min(...copiados.map(({ clipe }) => clipe.inicio));
  const cursor = quadroMaisProximo(projeto.taxa, inicio);
  const novos: string[] = [];
  let resultado = projeto;
  const daPrincipal = copiados.filter(({ tipo }) => tipo === "principal").sort((a, b) => a.clipe.inicio - b.clipe.inicio);
  if (daPrincipal.length) {
    const principal = resultado.faixas.find((faixa) => faixa.tipo === "principal")!;
    exigirDestravada(principal);
    const copias = daPrincipal.map(({ clipe }) => ({ ...clipe, id: ctx.novoId() }));
    const clipes = [...principal.clipes];
    clipes.splice(indiceNaPrincipal(principal, cursor), 0, ...copias);
    resultado = trocarFaixa(resultado, compactar({ ...principal, clipes }));
    novos.push(...copias.map((copia) => copia.id));
  }
  for (const { clipe, tipo, faixaId } of copiados.filter(({ tipo }) => tipo !== "principal")) {
    const copia: Clipe = { ...clipe, id: ctx.novoId(), inicio: cursor + clipe.inicio - base };
    const existe = resultado.faixas.some((faixa) => faixa.id === faixaId && faixa.tipo === tipo);
    resultado = colocarLivre(resultado, ctx, tipo as TipoLivre, copia, existe ? faixaId : undefined);
    novos.push(copia.id);
  }
  return { projeto: finalizar(resultado), novos };
}

/** Os grupos de ajustes que "Colar ajustes" leva de um clipe para outros. */
export const GRUPOS_DE_AJUSTES = [
  { id: "cor", nome: "Cor e filtro" },
  { id: "efeito", nome: "Efeito e tela verde" },
  { id: "animacao", nome: "Animações de entrada, saída e loop" },
  { id: "imagem", nome: "Posição, tamanho, giro, virar, recorte, cantos, keyframes e mesclagem" },
  { id: "audio", nome: "Volume, fades e efeitos de voz" },
] as const;
export type GrupoDeAjustes = (typeof GRUPOS_DE_AJUSTES)[number]["id"];

const CAMPOS_DOS_GRUPOS: Record<GrupoDeAjustes, (keyof Clipe)[]> = {
  cor: ["cor"],
  efeito: ["efeito", "chroma", "chave_luma"],
  animacao: ["animacao"],
  imagem: ["transformacao", "recorte", "virar", "cantos", "keyframes", "expressoes", "mesclagem"],
  audio: ["volume", "fade_entrada", "fade_saida", "curva_fade", "efeitos_voz", "igualar_volume"],
};

/** Os keyframes com os de volume trocados por `volume` (null quando não sobra nenhum). */
function comOVolume(keyframes: Keyframes | null | undefined, volume: Keyframe[] | undefined): Keyframes | null {
  const resultado: Keyframes = { ...keyframes };
  if (volume?.length) resultado.volume = volume;
  else delete resultado.volume;
  return CHAVES_DE_KEYFRAME.some((p) => resultado[p]?.length) ? resultado : null;
}

/**
 * Leva os ajustes dos `grupos` do clipe `origem` para os clipes marcados. Cada grupo só vale onde faz sentido:
 * o áudio só em clipe com som, a tela verde só em mídia, a luz e a granulação só em vídeo e imagem. Devolve
 * quantos clipes receberam algo e os grupos que ficaram de fora em algum deles.
 */
export function colarAjustes(
  projeto: Projeto,
  ctx: Contexto,
  origem: Clipe,
  clipeIds: string[],
  grupos: GrupoDeAjustes[],
): { projeto: Projeto; alterados: number; deFora: GrupoDeAjustes[] } {
  const alvos = clipeIds.filter((id) => id !== origem.id);
  if (!alvos.length) throw new ErroEdicao("Marque os clipes que vão receber os ajustes copiados.");
  if (!grupos.length) throw new ErroEdicao("Escolha o que colar.");
  const deFora = new Set<GrupoDeAjustes>();
  let alterados = 0;
  const resultado = mudarClipes(projeto, alvos, (clipe, faixa) => {
    const info = clipe.midia_id ? ctx.midia(clipe.midia_id) : null;
    const temImagem = Boolean(clipe.texto) || Boolean(info?.video);
    const temSom = Boolean(info?.audio) && !clipe.texto;
    const ehMidia = Boolean(clipe.midia_id) && !clipe.texto;
    const novo: Clipe = { ...clipe };
    let mudou = false;
    for (const grupo of grupos) {
      const vale =
        grupo === "audio" ? temSom :
        grupo === "efeito" ? temImagem && (ehMidia || !origem.efeito || !SO_EM_MIDIA.includes(origem.efeito.tipo)) :
        grupo === "imagem" ? temImagem && faixa.tipo !== "audio" :
        temImagem;
      if (!vale) {
        deFora.add(grupo);
        continue;
      }
      for (const campo of CAMPOS_DOS_GRUPOS[grupo]) {
        // A tela verde é só de mídia: num texto, o resto do grupo vai e ela fica
        if ((campo === "chroma" || campo === "chave_luma") && !ehMidia) continue;
        (novo as Record<string, unknown>)[campo] = structuredClone(origem[campo]);
      }
      if (grupo === "imagem") novo.keyframes = comOVolume(novo.keyframes, clipe.keyframes?.volume);
      if (grupo === "audio") novo.keyframes = comOVolume(novo.keyframes, structuredClone(origem.keyframes?.volume));
      mudou = true;
    }
    if (!mudou) return clipe;
    alterados++;
    // Os fades e as animações de entrada e saída cabem no clipe que recebe (o copiado pode ser mais longo)
    const fadeEntrada = Math.min(novo.fade_entrada, novo.duracao);
    novo.fade_entrada = fadeEntrada;
    novo.fade_saida = Math.min(novo.fade_saida, novo.duracao - fadeEntrada);
    if (novo.animacao) novo.animacao = limitarAnimacoes(novo.animacao, novo.duracao);
    return novo;
  }, { comAudio: true });
  if (!alterados) throw new ErroEdicao("Nenhum dos ajustes escolhidos vale para os clipes marcados.");
  return { projeto: finalizar(resultado), alterados, deFora: [...deFora] };
}

export function alternarFaixa(projeto: Projeto, faixaId: string, propriedade: "oculta" | "muda" | "travada"): Projeto {
  const faixa = projeto.faixas.find((item) => item.id === faixaId);
  if (!faixa) throw new ErroEdicao("Esta faixa não existe mais.");
  return trocarFaixa(projeto, { ...faixa, [propriedade]: !faixa[propriedade] });
}

// Limites da transformação e do recorte. Os mesmos de apps/api/esquemas.py.
export const LIMITES_TRANSFORMACAO = {
  x: { minimo: -10, maximo: 10 },
  y: { minimo: -10, maximo: 10 },
  escala: { minimo: 0.01, maximo: 20 },
  opacidade: { minimo: 0, maximo: 1 },
} as const;
/** O recorte nunca fica menor que isto da mídia, em cada direção. */
export const RECORTE_MINIMO = 0.02;

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/** Giro equivalente entre -180 (exclusive) e 180 graus. */
export function normalizarRotacao(graus: number): number {
  const resto = ((graus % 360) + 360) % 360;
  return resto > 180 ? resto - 360 : resto;
}

function limitarTransformacao(t: Transformacao): Transformacao {
  const { x, y, escala, opacidade } = LIMITES_TRANSFORMACAO;
  return {
    x: limitar(t.x, x.minimo, x.maximo),
    y: limitar(t.y, y.minimo, y.maximo),
    escala: limitar(t.escala, escala.minimo, escala.maximo),
    rotacao: normalizarRotacao(t.rotacao),
    opacidade: limitar(t.opacidade, opacidade.minimo, opacidade.maximo),
  };
}

function limitarRecorte(r: Recorte): Recorte {
  const x = limitar(r.x, 0, 1 - RECORTE_MINIMO);
  const y = limitar(r.y, 0, 1 - RECORTE_MINIMO);
  return { x, y, largura: limitar(r.largura, RECORTE_MINIMO, 1 - x), altura: limitar(r.altura, RECORTE_MINIMO, 1 - y) };
}

function mudarClipes(projeto: Projeto, clipeIds: string[], mudar: (clipe: Clipe, faixa: Faixa) => Clipe, { comAudio = false } = {}): Projeto {
  const alvos = new Set(clipeIds);
  if (!alvos.size) throw new ErroEdicao("Escolha um clipe.");
  let achou = false;
  const faixas = projeto.faixas.map((faixa) => {
    if (!faixa.clipes.some((clipe) => alvos.has(clipe.id))) return faixa;
    achou = true;
    exigirDestravada(faixa);
    if (faixa.tipo === "audio" && !comAudio) throw new ErroEdicao("Clipes de áudio não aparecem na imagem.");
    return { ...faixa, clipes: faixa.clipes.map((clipe) => (alvos.has(clipe.id) ? mudar(clipe, faixa) : clipe)) };
  });
  if (!achou) throw new ErroEdicao("Este clipe não existe mais.");
  return { ...projeto, faixas };
}

/**
 * Muda as propriedades informadas da transformação dos clipes; as outras ficam como estão. Com o
 * instante `tempo`, a propriedade que tem keyframes ganha (ou muda) o ponto daquele instante, como nos
 * editores conhecidos; as que não têm mudam o valor fixo.
 */
export function transformarClipes(projeto: Projeto, clipeIds: string[], mudanca: Partial<Transformacao>, tempo?: Tick): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => {
    const atual = tempo === undefined ? clipe.transformacao : transformacaoParaEditar(clipe, tempo);
    const nova = limitarTransformacao({ ...atual, ...mudanca });
    const transformacao = { ...clipe.transformacao };
    let keyframes = clipe.keyframes;
    for (const propriedade of Object.keys(mudanca) as (keyof Transformacao)[]) {
      const pontos = clipe.keyframes?.[propriedade];
      if (tempo !== undefined && pontos?.length) {
        const t = quadroDoClipe(projeto, clipe, tempo);
        keyframes = { ...keyframes, [propriedade]: comPonto(pontos, { t, valor: nova[propriedade], curva: curvaEm(pontos, t) }, projeto) };
      } else {
        transformacao[propriedade] = nova[propriedade];
      }
    }
    return { ...clipe, transformacao, keyframes };
  });
}

/** O instante do clipe (desde o começo dele) no quadro mais próximo de `tempo`, dentro do clipe. */
function quadroDoClipe(projeto: Projeto, clipe: Clipe, tempo: Tick): Tick {
  return Math.min(Math.max(quadroMaisProximo(projeto.taxa, tempo) - clipe.inicio, 0), clipe.duracao);
}

/** A curva que um ponto novo herda: a do ponto anterior, para não mudar o jeito do movimento. */
function curvaEm(pontos: Keyframe[], t: Tick): Curva {
  return [...pontos].reverse().find((ponto) => ponto.t <= t)?.curva ?? "linear";
}

/** Os pontos com `novo` no lugar do que estava no mesmo instante (ou somado, em ordem). */
function comPonto(pontos: Keyframe[], novo: Keyframe, projeto: Projeto): Keyframe[] {
  const meioQuadro = duracaoDoQuadro(projeto.taxa) / 2;
  const outros = pontos.filter((ponto) => Math.abs(ponto.t - novo.t) > meioQuadro);
  if (outros.length >= KEYFRAMES_POR_PROPRIEDADE) throw new ErroEdicao(`Cada propriedade pode ter no máximo ${KEYFRAMES_POR_PROPRIEDADE} keyframes.`);
  return [...outros, novo].sort((a, b) => a.t - b.t);
}

export type AcaoDeKeyframe = "alternar" | Curva;

/** Limites do tremido: amplitude na unidade de cada propriedade (posição em fração do quadro, giro em graus). */
export const LIMITES_TREMOR: Record<PropriedadeAnimavel, number> = { x: 0.5, y: 0.5, escala: 1, rotacao: 180, opacidade: 1 };
/** Período do tremido: de 0,1 s (10 vezes por segundo) a 10 s. */
export const PERIODO_TREMOR = { minimo: TICKS_POR_SEGUNDO / 10, maximo: 10 * TICKS_POR_SEGUNDO };

/**
 * Muda a expressão de uma propriedade (repetir os keyframes, tremer). Com `null` (ou sem repetir nem
 * tremer), a expressão sai. Repetir precisa de pelo menos dois keyframes na propriedade.
 */
export function mudarExpressao(projeto: Projeto, clipeId: string, propriedade: PropriedadeAnimavel, expressao: Expressao | null): Projeto {
  return mudarClipes(projeto, [clipeId], (clipe) => {
    let nova: Expressao | null = null;
    if (expressao && (expressao.repetir || expressao.tremer)) {
      if (expressao.repetir && (clipe.keyframes?.[propriedade]?.length ?? 0) < 2) {
        throw new ErroEdicao("Para repetir, a propriedade precisa de pelo menos dois keyframes.");
      }
      const tremor = expressao.tremer;
      nova = {
        repetir: expressao.repetir ?? null,
        tremer: tremor
          ? {
              periodo: Math.round(limitar(tremor.periodo, PERIODO_TREMOR.minimo, PERIODO_TREMOR.maximo)),
              amplitude: limitar(tremor.amplitude, -LIMITES_TREMOR[propriedade], LIMITES_TREMOR[propriedade]),
              deslocamento: Math.round(tremor.deslocamento ?? 0),
            }
          : null,
      };
    }
    const expressoes: Expressoes = { ...clipe.expressoes };
    if (nova) expressoes[propriedade] = nova;
    else delete expressoes[propriedade];
    const vazias = PROPRIEDADES_ANIMAVEIS.every((p) => !expressoes[p]);
    return { ...clipe, expressoes: vazias ? null : expressoes };
  });
}

/**
 * "alternar": põe um keyframe da propriedade no instante, com o valor que ela tem ali, ou tira o que
 * já estava. Tirar o último deixa o clipe parado no valor dele. Uma curva (lib/projeto/keyframes.ts,
 * CURVAS_DE_KEYFRAME): muda a curva do ponto do instante até o seguinte.
 */
export function mudarKeyframe(projeto: Projeto, clipeId: string, propriedade: ChaveDeKeyframe, tempo: Tick, acao: AcaoDeKeyframe): Projeto {
  return mudarClipes(projeto, [clipeId], (clipe) => {
    if (tempo < clipe.inicio || tempo > clipe.inicio + clipe.duracao) throw new ErroEdicao("Leve o cursor para dentro do clipe.");
    const t = quadroDoClipe(projeto, clipe, tempo);
    const pontos = clipe.keyframes?.[propriedade] ?? [];
    const meioQuadro = duracaoDoQuadro(projeto.taxa) / 2;
    const existente = keyframeEm(pontos, t, meioQuadro);
    if (acao !== "alternar") {
      if (!existente) throw new ErroEdicao("Não há keyframe neste instante.");
      return { ...clipe, keyframes: { ...clipe.keyframes, [propriedade]: pontos.map((p) => (p === existente ? { ...p, curva: acao } : p)) } };
    }
    if (existente) {
      const restantes = pontos.filter((p) => p !== existente);
      const keyframes: Keyframes = { ...clipe.keyframes, [propriedade]: restantes };
      if (restantes.length) return { ...clipe, keyframes };
      delete keyframes[propriedade];
      const vazios = CHAVES_DE_KEYFRAME.every((p) => !keyframes[p]?.length);
      if (propriedade === "volume") return { ...clipe, keyframes: vazios ? null : keyframes, volume: existente.valor };
      return { ...clipe, keyframes: vazios ? null : keyframes, transformacao: { ...clipe.transformacao, [propriedade]: existente.valor } };
    }
    const valor = propriedade === "volume" ? volumeNoTempo(clipe, tempo) : transformacaoParaEditar(clipe, tempo)[propriedade];
    return { ...clipe, keyframes: { ...clipe.keyframes, [propriedade]: comPonto(pontos, { t, valor, curva: curvaEm(pontos, t) }, projeto) } };
    // O volume também vale nos clipes das faixas de áudio
  }, { comAudio: propriedade === "volume" });
}

/** Quanto o zoom do "Criar automaticamente" aproxima, e quanto tempo leva para entrar e sair. */
export const ZOOM_DO_DESTAQUE = { escala: 1.12, entrada: 0.25, saida: 0.35 } as const;

/**
 * Um zoom suave em cada trecho, nos clipes da faixa principal: a escala sobe um pouco antes do trecho,
 * fica durante ele e volta depois, com keyframes de curva suave. Clipe que já tem keyframes de escala
 * fica como está, para não desmanchar o que a pessoa fez.
 */
export function zoomNosTrechos(projeto: Projeto, trechos: Intervalo[], escala: number = ZOOM_DO_DESTAQUE.escala): Projeto {
  const principal = projeto.faixas.find((faixa) => faixa.tipo === "principal");
  if (!principal) throw new ErroEdicao("O projeto está sem a faixa principal.");
  exigirDestravada(principal);
  const entrada = Math.round(ZOOM_DO_DESTAQUE.entrada * TICKS_POR_SEGUNDO);
  const saida = Math.round(ZOOM_DO_DESTAQUE.saida * TICKS_POR_SEGUNDO);
  const ordenados = [...trechos].sort((a, b) => a.inicio - b.inicio);
  const clipes = principal.clipes.map((clipe) => {
    if (clipe.texto || clipe.keyframes?.escala?.length) return clipe;
    const base = clipe.transformacao.escala;
    const pontos: Keyframe[] = [];
    for (const trecho of ordenados) {
      const de = quadroDoClipe(projeto, clipe, trecho.inicio - entrada);
      const ate = quadroDoClipe(projeto, clipe, trecho.fim + saida);
      if (ate - de < 2 * entrada || (pontos.length && de <= pontos[pontos.length - 1].t)) continue;
      const cheio = Math.min(de + entrada * 2, ate - saida);
      // Num destaque curto (ou cortado pela borda do clipe) o zoom cheio não dura: sem o ponto repetido,
      // que a API recusa (dois keyframes no mesmo instante)
      const grupo: Keyframe[] = [
        { t: de, valor: base, curva: "suave" },
        { t: cheio, valor: base * escala, curva: "suave" },
        ...(ate - saida > cheio ? [{ t: ate - saida, valor: base * escala, curva: "suave" as const }] : []),
        { t: ate, valor: base, curva: "suave" },
      ];
      // Só grupos inteiros cabem no limite de keyframes
      if (pontos.length + grupo.length > KEYFRAMES_POR_PROPRIEDADE) break;
      pontos.push(...grupo);
    }
    if (!pontos.length) return clipe;
    return { ...clipe, keyframes: { ...clipe.keyframes, escala: pontos } };
  });
  return finalizar(trocarFaixa(projeto, { ...principal, clipes }));
}

/** O pulso de cada batida: quanto a imagem cresce e em quanto tempo volta. */
export const PULSO_NO_RITMO = { escala: 1.06, volta: 0.22 } as const;
/** Clipe mais curto que isso não é cortado na batida (fica do tamanho que estava). */
export const CORTE_MINIMO_NO_RITMO_S = 0.4;

/**
 * Cortes da faixa principal nas batidas: cada clipe termina na última batida que cabe nele (sem crescer
 * além da mídia nem ficar mais curto que CORTE_MINIMO_NO_RITMO_S). Como a principal é magnética, o clipe
 * seguinte começa na mesma batida. `batidas`: instantes da linha do tempo, já na cadência escolhida.
 */
export function cortarNoRitmo(projeto: Projeto, ctx: Contexto, batidas: Tick[]): Projeto {
  const principal = projeto.faixas.find((faixa) => faixa.tipo === "principal");
  if (!principal?.clipes.length) throw new ErroEdicao("Coloque os vídeos na faixa principal antes de cortar no ritmo.");
  exigirDestravada(principal);
  const ordenadas = [...batidas].sort((a, b) => a - b);
  if (ordenadas.length < 2) throw new ErroEdicao("A música tem poucas batidas para cortar no ritmo.");
  const minimo = Math.round(CORTE_MINIMO_NO_RITMO_S * TICKS_POR_SEGUNDO);
  const meioQuadro = duracaoDoQuadro(projeto.taxa) / 2;
  let resultado = projeto;
  let cortados = 0;
  for (const id of principal.clipes.map((clipe) => clipe.id)) {
    const clipe = resultado.faixas.find((faixa) => faixa.tipo === "principal")!.clipes.find((item) => item.id === id)!;
    const fim = clipe.inicio + clipe.duracao;
    const alvo = [...ordenadas].reverse().find((b) => b <= fim + meioQuadro && b - clipe.inicio >= minimo);
    if (alvo === undefined || Math.abs(alvo - fim) <= meioQuadro) continue;
    resultado = apararClipe(resultado, ctx, id, "fim", alvo);
    cortados++;
  }
  if (!cortados) throw new ErroEdicao("Os cortes já estão nas batidas.");
  return resultado;
}

/**
 * Um pulso de zoom em cada batida, nos clipes da faixa principal: a imagem cresce de uma vez na batida e
 * volta em PULSO_NO_RITMO.volta, com keyframes de escala. Clipe que já tem keyframes de escala fica como
 * está, e cada clipe leva no máximo um terço do limite de keyframes (três pontos por batida).
 */
export function pulsarNoRitmo(projeto: Projeto, batidas: Tick[], escala: number = PULSO_NO_RITMO.escala): Projeto {
  const principal = projeto.faixas.find((faixa) => faixa.tipo === "principal");
  if (!principal?.clipes.length) throw new ErroEdicao("Coloque os vídeos na faixa principal antes de pulsar no ritmo.");
  exigirDestravada(principal);
  const quadro = duracaoDoQuadro(projeto.taxa);
  const volta = Math.round(PULSO_NO_RITMO.volta * TICKS_POR_SEGUNDO);
  const ordenadas = [...batidas].sort((a, b) => a - b);
  let mudou = false;
  const clipes = principal.clipes.map((clipe) => {
    if (clipe.texto || clipe.keyframes?.escala?.length) return clipe;
    const base = clipe.transformacao.escala;
    const pontos: Keyframe[] = [];
    for (const batida of ordenadas) {
      const t = quadroMaisProximo(projeto.taxa, batida) - clipe.inicio;
      if (t < quadro || t + volta > clipe.duracao || (pontos.length && t - quadro <= pontos[pontos.length - 1].t)) continue;
      if (pontos.length + 3 > KEYFRAMES_POR_PROPRIEDADE) break;
      pontos.push(
        { t: t - quadro, valor: base, curva: "linear" },
        { t, valor: base * escala, curva: "suave" },
        { t: t + volta, valor: base, curva: "linear" },
      );
    }
    if (!pontos.length) return clipe;
    mudou = true;
    return { ...clipe, keyframes: { ...clipe.keyframes, escala: pontos } };
  });
  if (!mudou) throw new ErroEdicao("Nenhum clipe da principal recebeu pulsos (sem batidas por cima, ou já com zoom).");
  return finalizar(trocarFaixa(projeto, { ...principal, clipes }));
}

/** Volta posição, escala, giro, opacidade e recorte ao padrão, sem keyframes. */
export function restaurarClipes(projeto: Projeto, clipeIds: string[]): Projeto {
  // Os keyframes de volume são do som: ficam
  return mudarClipes(projeto, clipeIds, (clipe) => ({ ...clipe, transformacao: TRANSFORMACAO_PADRAO, recorte: RECORTE_PADRAO, keyframes: comOVolume(null, clipe.keyframes?.volume), expressoes: null }));
}

export function recortarClipes(projeto: Projeto, clipeIds: string[], recorte: Recorte): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => ({ ...clipe, recorte: limitarRecorte(recorte) }));
}

export const VOLUME_MAXIMO = 4;

export type MudancaDeAudio = {
  volume?: number;
  fade_entrada?: Tick;
  fade_saida?: Tick;
  curva_fade?: CurvaDoFade;
  voz_limpa?: boolean;
  igualar_volume?: boolean;
  /** null tira os efeitos. */
  efeitos_voz?: EfeitosVoz | null;
  /** Semitons, de -12 a 12. */
  tom?: number;
  /** O instante do cursor: com keyframes de volume, o volume novo vira (ou muda) o ponto dali. */
  tempo?: Tick;
};

/** Volume, fades e voz limpa. Vale para os clipes com som: os de áudio e os vídeos que têm áudio. */
export function ajustarAudio(projeto: Projeto, clipeIds: string[], mudanca: MudancaDeAudio): Projeto {
  const alvos = new Set(clipeIds);
  if (!alvos.size) throw new ErroEdicao("Escolha um clipe.");
  let achou = false;
  const faixas = projeto.faixas.map((faixa) => {
    if (!faixa.clipes.some((clipe) => alvos.has(clipe.id))) return faixa;
    achou = true;
    exigirDestravada(faixa);
    const clipes = faixa.clipes.map((clipe) => {
      if (!alvos.has(clipe.id)) return clipe;
      let volume = clipe.volume;
      let keyframes = clipe.keyframes;
      if (mudanca.volume !== undefined) {
        const novo = limitar(mudanca.volume, 0, VOLUME_MAXIMO);
        const pontos = clipe.keyframes?.volume;
        if (mudanca.tempo !== undefined && pontos?.length) {
          const t = quadroDoClipe(projeto, clipe, mudanca.tempo);
          keyframes = { ...keyframes, volume: comPonto(pontos, { t, valor: novo, curva: curvaEm(pontos, t) }, projeto) };
        } else {
          volume = novo;
        }
      }
      const fadeEntrada = Math.round(limitar(mudanca.fade_entrada ?? clipe.fade_entrada, 0, clipe.duracao));
      const fadeSaida = Math.round(limitar(mudanca.fade_saida ?? clipe.fade_saida, 0, clipe.duracao - fadeEntrada));
      const vozLimpa = mudanca.voz_limpa ?? clipe.voz_limpa ?? false;
      const curva = mudanca.curva_fade ?? clipe.curva_fade ?? "linear";
      const igualar = mudanca.igualar_volume ?? clipe.igualar_volume ?? false;
      const efeitos = mudanca.efeitos_voz === undefined ? clipe.efeitos_voz : mudanca.efeitos_voz && efeitosAtivos(mudanca.efeitos_voz) ? limitarEfeitos(mudanca.efeitos_voz) : null;
      return {
        ...clipe,
        volume,
        keyframes,
        fade_entrada: fadeEntrada,
        fade_saida: fadeSaida,
        curva_fade: curva,
        voz_limpa: vozLimpa,
        igualar_volume: igualar,
        efeitos_voz: efeitos ?? null,
        tom: Math.round(limitar(mudanca.tom ?? clipe.tom ?? 0, -TOM_LIMITE, TOM_LIMITE)),
        // A voz limpa e o tom são gerados do original: não valem no clipe ao contrário
        ...(mudanca.voz_limpa || mudanca.tom ? { inverter: false } : {}),
      };
    });
    return { ...faixa, clipes };
  });
  if (!achou) throw new ErroEdicao("Este clipe não existe mais.");
  return { ...projeto, faixas };
}

/** Duração de um texto novo, como no CapCut. */
export const DURACAO_TEXTO_S = 3;

/** Texto novo no instante `inicio`, numa faixa de texto onde caiba (ou numa nova, por cima de tudo). */
export function adicionarTexto(projeto: Projeto, ctx: Contexto, inicio: Tick, texto: Texto): { projeto: Projeto; clipeId: string } {
  const clipe: Clipe = {
    id: ctx.novoId(),
    midia_id: null,
    texto: ajustarTexto(texto, {}),
    inicio: Math.max(0, quadroMaisProximo(projeto.taxa, inicio)),
    duracao: ajustarAoQuadro(projeto.taxa, DURACAO_TEXTO_S * TICKS_POR_SEGUNDO),
    entrada: 0,
    velocidade: 1,
    volume: 1,
    fade_entrada: 0,
    fade_saida: 0,
    transformacao: TRANSFORMACAO_PADRAO,
    recorte: RECORTE_PADRAO,
  };
  return { projeto: finalizar(colocarLivre(projeto, ctx, "texto", clipe)), clipeId: clipe.id };
}

/** Uma camada de ajuste nova, numa faixa por cima das outras de vídeo, no instante dado. */
export function adicionarAjuste(projeto: Projeto, ctx: Contexto, inicio: Tick): { projeto: Projeto; clipeId: string } {
  const clipe: Clipe = {
    id: ctx.novoId(),
    midia_id: null,
    ajuste: true,
    inicio: Math.max(0, quadroMaisProximo(projeto.taxa, inicio)),
    duracao: ajustarAoQuadro(projeto.taxa, DURACAO_IMAGEM_S * TICKS_POR_SEGUNDO),
    entrada: 0,
    velocidade: 1,
    volume: 1,
    fade_entrada: 0,
    fade_saida: 0,
    transformacao: TRANSFORMACAO_PADRAO,
    recorte: RECORTE_PADRAO,
  };
  return { projeto: finalizar(colocarLivre(projeto, ctx, "video", clipe, undefined, true)), clipeId: clipe.id };
}

/** Duração de uma legenda nova, e a menor que uma legenda importada pode ter. */
export const DURACAO_LEGENDA_S = 2;

function clipeDeTexto(ctx: Contexto, inicio: Tick, duracao: Tick, texto: Texto, y = 0): Clipe {
  return {
    id: ctx.novoId(),
    midia_id: null,
    texto: ajustarTexto(texto, {}),
    inicio,
    duracao,
    entrada: 0,
    velocidade: 1,
    volume: 1,
    fade_entrada: 0,
    fade_saida: 0,
    transformacao: { ...TRANSFORMACAO_PADRAO, y },
    recorte: RECORTE_PADRAO,
  };
}

/** Legenda nova no instante `inicio`, perto da borda de baixo, numa faixa de legenda onde caiba. */
export function adicionarLegenda(projeto: Projeto, ctx: Contexto, inicio: Tick, estilo: Texto): { projeto: Projeto; clipeId: string } {
  const duracao = ajustarAoQuadro(projeto.taxa, DURACAO_LEGENDA_S * TICKS_POR_SEGUNDO);
  const clipe = clipeDeTexto(ctx, Math.max(0, quadroMaisProximo(projeto.taxa, inicio)), duracao, { ...estilo, conteudo: estilo.conteudo || "Legenda" }, POSICAO_LEGENDA);
  return { projeto: finalizar(colocarLivre(projeto, ctx, "legenda", clipe)), clipeId: clipe.id };
}

/**
 * Legendas de um arquivo SRT ou VTT numa faixa nova, com o estilo dado. Os tempos encostam nos
 * quadros do projeto; a que ficaria com menos de um quadro é deixada de fora.
 */
export function importarLegendas(projeto: Projeto, ctx: Contexto, legendas: Legenda[], estilo: Texto): { projeto: Projeto; clipeIds: string[] } {
  const quadro = duracaoDoQuadro(projeto.taxa);
  const clipes: Clipe[] = [];
  let fimAnterior = 0;
  for (const legenda of legendas) {
    const inicio = Math.max(quadroMaisProximo(projeto.taxa, legenda.inicio), fimAnterior);
    const fim = quadroMaisProximo(projeto.taxa, legenda.fim);
    if (fim - inicio < quadro) continue;
    // Os tempos das palavras passam a contar do começo do clipe
    const tempos = legenda.tempos?.map((t) => t - inicio) ?? null;
    const texto = ajustarTexto(estilo, { conteudo: legenda.conteudo, tempos, palavras_chave: legenda.palavras_chave ?? null });
    clipes.push(clipeDeTexto(ctx, inicio, fim - inicio, texto, POSICAO_LEGENDA));
    fimAnterior = fim;
  }
  if (!clipes.length) throw new ErroEdicao("O arquivo não tem legendas que deem para usar.");
  const criada = criarFaixa(projeto, ctx, "legenda");
  const resultado = trocarFaixa(criada.projeto, { ...criada.faixa, clipes });
  return { projeto: finalizar(resultado), clipeIds: clipes.map((clipe) => clipe.id) };
}

/**
 * Os textos das duas metades de uma legenda dividida em `local` (desde o começo dela): as palavras que começam
 * antes do corte ficam na primeira, com os tempos e as palavras-chave delas. Sem os tempos da fala, as palavras
 * dividem a duração pelas letras, como o letra a letra. null quando a legenda tem uma palavra só.
 */
function repartirLegenda(texto: Texto, local: Tick, duracao: Tick): [Texto, Texto] | null {
  const palavras = palavrasDoTexto(texto.conteudo);
  if (palavras.length < 2) return null;
  const temTempos = texto.tempos?.length === palavras.length;
  let tempos = texto.tempos ?? [];
  if (!temTempos) {
    const letras = palavras.reduce((soma, palavra) => soma + palavra.length, 0);
    let antes = 0;
    tempos = palavras.map((palavra) => {
      const inicio = Math.round((duracao * antes) / letras);
      antes += palavra.length;
      return inicio;
    });
  }
  const primeiraDepois = tempos.findIndex((inicio) => inicio >= local);
  const corte = Math.min(palavras.length - 1, Math.max(1, primeiraDepois < 0 ? palavras.length - 1 : primeiraDepois));
  const chaves = texto.palavras_chave ?? [];
  const metade = (de: number, ate: number, desloca: Tick): Texto => ({
    ...texto,
    conteudo: palavras.slice(de, ate).join(" "),
    tempos: temTempos ? tempos.slice(de, ate).map((t) => t - desloca) : null,
    palavras_chave: chaves.filter((k) => k >= de && k < ate).map((k) => k - de),
  });
  return [metade(0, corte, 0), metade(corte, palavras.length, local)];
}

/**
 * Junta legendas seguidas da mesma faixa numa só, do começo da primeira ao fim da última: os textos um depois
 * do outro, com os tempos das palavras e as palavras-chave levados para o começo da primeira. O estilo é o dela.
 */
export function juntarLegendas(projeto: Projeto, clipeIds: string[]): { projeto: Projeto; clipeId: string } {
  if (clipeIds.length < 2) throw new ErroEdicao("Escolha duas ou mais legendas seguidas para juntar.");
  const achados = clipeIds.map((id) => acharClipe(projeto, id));
  const faixa = achados[0]?.faixa;
  if (!faixa || faixa.tipo !== "legenda" || achados.some((achado) => !achado?.clipe.texto || achado.faixa.id !== faixa.id)) {
    throw new ErroEdicao("Só legendas da mesma faixa se juntam.");
  }
  exigirDestravada(faixa);
  const escolhidos = new Set(clipeIds);
  const ordem = ordenar(faixa.clipes);
  const posicoes = ordem.flatMap((clipe, i) => (escolhidos.has(clipe.id) ? [i] : []));
  if (posicoes.at(-1)! - posicoes[0] !== posicoes.length - 1) throw new ErroEdicao("As legendas precisam estar seguidas, sem outra no meio.");
  const juntas = posicoes.map((i) => ordem[i]);
  const primeira = juntas[0];
  const conteudo = juntas.map((clipe) => clipe.texto!.conteudo.trim()).join(" ");
  if (conteudo.length > LIMITES_TEXTO.conteudo) throw new ErroEdicao(`Juntas, as legendas passariam de ${LIMITES_TEXTO.conteudo} letras.`);
  let contadas = 0;
  let comTempos = true;
  const tempos: number[] = [];
  const chaves: number[] = [];
  for (const clipe of juntas) {
    const texto = clipe.texto!;
    const quantas = palavrasDoTexto(texto.conteudo).length;
    if (texto.tempos?.length === quantas) tempos.push(...texto.tempos.map((t) => t + clipe.inicio - primeira.inicio));
    else comTempos = false;
    chaves.push(...(texto.palavras_chave ?? []).map((k) => k + contadas));
    contadas += quantas;
  }
  const junta: Clipe = {
    ...primeira,
    duracao: fimDoClipe(juntas.at(-1)!) - primeira.inicio,
    texto: ajustarTexto(primeira.texto!, { conteudo, tempos: comTempos ? tempos : null, palavras_chave: chaves.length ? chaves : null }),
  };
  const clipes = faixa.clipes.filter((clipe) => !escolhidos.has(clipe.id) || clipe.id === primeira.id).map((clipe) => (clipe.id === primeira.id ? junta : clipe));
  return { projeto: finalizar(trocarFaixa(projeto, { ...faixa, clipes })), clipeId: primeira.id };
}

/**
 * Troca `busca` por `troca` em todas as legendas da faixa, sem diferenciar maiúsculas. Onde o número de
 * palavras muda, os tempos da fala e as palavras-chave daquela legenda saem (não correspondem mais).
 */
export function substituirNasLegendas(projeto: Projeto, faixaId: string, busca: string, troca: string): { projeto: Projeto; trocas: number } {
  const faixa = projeto.faixas.find((item) => item.id === faixaId);
  if (!faixa || faixa.tipo !== "legenda") throw new ErroEdicao("Esta faixa de legendas não existe mais.");
  if (!busca.trim()) throw new ErroEdicao("Escreva o que procurar.");
  exigirDestravada(faixa);
  const expressao = new RegExp(busca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  let trocas = 0;
  const clipes = faixa.clipes.map((clipe) => {
    if (!clipe.texto) return clipe;
    const conteudo = clipe.texto.conteudo.replace(expressao, () => {
      trocas++;
      return troca;
    });
    if (conteudo === clipe.texto.conteudo) return clipe;
    const mesmas = palavrasDoTexto(conteudo).length === palavrasDoTexto(clipe.texto.conteudo).length;
    return { ...clipe, texto: ajustarTexto(clipe.texto, mesmas ? { conteudo } : { conteudo, tempos: null, palavras_chave: null }) };
  });
  if (!trocas) throw new ErroEdicao(`Nenhuma legenda desta faixa tem "${busca}".`);
  return { projeto: trocarFaixa(projeto, { ...faixa, clipes }), trocas };
}

/** As palavras da legenda continuam no mesmo instante quando o começo do clipe anda `delta`. */
function deslocarTempos(texto: Texto | null | undefined, delta: Tick): Texto | null | undefined {
  if (!texto?.tempos || delta === 0) return texto;
  return { ...texto, tempos: texto.tempos.map((t) => t - delta) };
}

/** A curva do abaixar na fala continua no mesmo instante da linha do tempo. */
/** Uma curva de volume gravada no clipe (abaixar na fala, nivelamento) continua no mesmo instante da linha do tempo. */
function deslocarCurva<T extends { pontos: Keyframe[] }>(curva: T | null | undefined, delta: Tick): T | null | undefined {
  if (!curva || delta === 0) return curva;
  return { ...curva, pontos: curva.pontos.map((ponto) => ({ ...ponto, t: ponto.t - delta })) };
}

/** Grava (ou tira, com null) o nivelamento da voz de um clipe com som (lib/projeto/nivelar.ts). */
export function nivelarClipe(projeto: Projeto, clipeId: string, nivelamento: Nivelamento | null): Projeto {
  return mudarClipes(projeto, [clipeId], (clipe) => ({ ...clipe, nivelamento }), { comAudio: true });
}

/** As junções da música ajustada: um fade curtinho dos dois lados, para o corte não estalar. */
export const JUNCAO_DA_MUSICA = Math.round(0.005 * TICKS_POR_SEGUNDO);
/** O fade do fim quando a música é cortada antes do final dela. */
export const FADE_DO_CORTE_DA_MUSICA = 2 * TICKS_POR_SEGUNDO;

/**
 * Ajusta a música (um clipe de faixa de áudio) para acabar junto com o vídeo (o fim da principal): tira ou
 * repete compassos do meio, cortando nos tempos fortes (`fortes`, segundos da mídia), e a música vai do
 * trecho em que começa até o fim dela (lib/projeto/ajustarMusica.ts). Os pedaços ficam encostados, na mesma
 * faixa se couberem; o volume, os efeitos e o abaixar na fala seguem no mesmo instante da linha do tempo.
 */
export function ajustarMusicaAoVideo(projeto: Projeto, ctx: Contexto, clipeId: string, fortes: number[]): { projeto: Projeto; novos: string[] } {
  const { faixa, clipe } = acharOuErro(projeto, clipeId);
  if (faixa.tipo !== "audio" || !clipe.midia_id) throw new ErroEdicao("Escolha uma música numa faixa de áudio.");
  exigirDestravada(faixa);
  if (clipe.velocidade !== 1 || clipe.curva_velocidade) throw new ErroEdicao("Volte a velocidade da música a 1× para ajustar.");
  const midia = ctx.midia(clipe.midia_id);
  if (!midia) throw new ErroEdicao("A mídia desta música não está pronta.");
  const principal = projeto.faixas.find((item) => item.tipo === "principal");
  const fimDoVideo = Math.max(0, ...(principal?.clipes.map(fimDoClipe) ?? []));
  const alvo = fimDoVideo - clipe.inicio;
  if (alvo <= 0) throw new ErroEdicao("A música começa depois do fim do vídeo.");
  if (clipe.duracao === alvo && clipe.entrada + clipe.duracao === midia.duracao) throw new ErroEdicao("A música já acaba junto com o vídeo.");
  const plano = planoDaMusica(clipe.entrada / TICKS_POR_SEGUNDO, midia.duracao / TICKS_POR_SEGUNDO, fortes, alvo / TICKS_POR_SEGUNDO);
  if (!plano.trechos.length) throw new ErroEdicao("Não foi possível ajustar esta música.");
  const novos: string[] = [];
  let andado = 0;
  const pedacos = plano.trechos.map((trecho, k): Clipe => {
    const inicio = clipe.inicio + Math.round(andado * TICKS_POR_SEGUNDO);
    andado += trecho.fim - trecho.inicio;
    const duracao = clipe.inicio + Math.round(andado * TICKS_POR_SEGUNDO) - inicio;
    const ultimo = k === plano.trechos.length - 1;
    const fadeEntrada = Math.min(k === 0 ? clipe.fade_entrada : JUNCAO_DA_MUSICA, duracao);
    const fadeSaida = ultimo ? (plano.sobra > 0 ? Math.max(clipe.fade_saida, FADE_DO_CORTE_DA_MUSICA) : clipe.fade_saida) : JUNCAO_DA_MUSICA;
    const id = k === 0 ? clipe.id : ctx.novoId();
    if (k > 0) novos.push(id);
    return {
      ...clipe,
      id,
      inicio,
      duracao,
      entrada: Math.round(trecho.inicio * TICKS_POR_SEGUNDO),
      fade_entrada: fadeEntrada,
      fade_saida: Math.min(fadeSaida, duracao - fadeEntrada),
      keyframes: deslocarKeyframes(clipe.keyframes, inicio - clipe.inicio),
      abaixamento: deslocarCurva(clipe.abaixamento, inicio - clipe.inicio),
      nivelamento: deslocarCurva(clipe.nivelamento, inicio - clipe.inicio),
    };
  });
  const total = andado * TICKS_POR_SEGUNDO;
  const semAOriginal = { ...faixa, clipes: faixa.clipes.filter((item) => item.id !== clipe.id) };
  let resultado = trocarFaixa(projeto, semAOriginal);
  // Na mesma faixa, se couber; senão, numa faixa de áudio nova logo abaixo
  let destino = semAOriginal;
  if (!cabe(semAOriginal, clipe.inicio, Math.round(total))) {
    const criada = criarFaixa(resultado, ctx, "audio", faixa.id);
    resultado = criada.projeto;
    destino = criada.faixa;
  }
  resultado = trocarFaixa(resultado, { ...destino, clipes: ordenar([...destino.clipes, ...pedacos]) });
  return { projeto: finalizar(resultado), novos: [clipe.id, ...novos] };
}

/** Grava (ou tira, com null) a curva do abaixar na fala de um clipe com som. */
export function abaixarClipe(projeto: Projeto, clipeId: string, abaixamento: Abaixamento | null): Projeto {
  const achado = acharClipe(projeto, clipeId);
  if (!achado) throw new ErroEdicao("Este clipe não existe mais.");
  exigirDestravada(achado.faixa);
  if (!achado.clipe.midia_id) throw new ErroEdicao("Este clipe não tem som.");
  const clipes = achado.faixa.clipes.map((clipe) => (clipe.id === clipeId ? { ...clipe, abaixamento } : clipe));
  return trocarFaixa(projeto, { ...achado.faixa, clipes });
}

/** Aplica o estilo (tudo menos o conteúdo) a todas as legendas da faixa. */
export function estiloDasLegendas(projeto: Projeto, faixaId: string, estilo: Partial<Texto>): Projeto {
  const faixa = projeto.faixas.find((item) => item.id === faixaId);
  if (!faixa || faixa.tipo !== "legenda") throw new ErroEdicao("Esta faixa de legendas não existe mais.");
  exigirDestravada(faixa);
  // O destaque é do estilo (sem ele no estilo, sai); o conteúdo e os tempos das palavras ficam
  const semConteudo = { ...estilo, destaque: estilo.destaque ?? null };
  delete semConteudo.conteudo;
  delete semConteudo.tempos;
  delete semConteudo.palavras_chave;
  const clipes = faixa.clipes.map((clipe) => (clipe.texto ? { ...clipe, texto: ajustarTexto(clipe.texto, semConteudo) } : clipe));
  return trocarFaixa(projeto, { ...faixa, clipes });
}

/**
 * Palavras-chave de todas as legendas: id do clipe → números das palavras (as legendas fora do mapa
 * ficam sem). `cor` muda a cor delas; null mantém a de cada legenda.
 */
export function palavrasChaveDasLegendas(projeto: Projeto, chaves: Record<string, number[]>, cor: string | null): Projeto {
  const faixas = projeto.faixas.filter((faixa) => faixa.tipo === "legenda");
  if (!faixas.length) throw new ErroEdicao("Este projeto não tem legendas.");
  let resultado = projeto;
  for (const faixa of faixas) {
    exigirDestravada(faixa);
    const clipes = faixa.clipes.map((clipe) =>
      clipe.texto
        ? { ...clipe, texto: ajustarTexto(clipe.texto, { palavras_chave: chaves[clipe.id] ?? null, ...(cor ? { cor_chave: cor } : {}) }) }
        : clipe,
    );
    resultado = trocarFaixa(resultado, { ...faixa, clipes });
  }
  return resultado;
}

export function mudarTexto(projeto: Projeto, clipeIds: string[], mudanca: Partial<Texto>): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => {
    if (!clipe.texto) throw new ErroEdicao("Este clipe não é um texto.");
    const texto = ajustarTexto(clipe.texto, mudanca);
    // O arco tira o letra a letra e o palavra a palavra (as letras não ficam em linha)
    if (texto.curvatura && clipe.animacao) {
      const sem = (animacao: Animacao) => (POR_LETRAS.includes(animacao.tipo) ? SEM_ANIMACAO.entrada : animacao);
      return { ...clipe, texto, animacao: { ...clipe.animacao, entrada: sem(clipe.animacao.entrada), saida: sem(clipe.animacao.saida) } };
    }
    return { ...clipe, texto };
  });
}

/** As animações que mostram o texto letra a letra ou palavra a palavra (lib/projeto/letras.ts). */
const POR_LETRAS: string[] = ["letras", "palavras"];

/** Muda a animação de entrada, a de saída ou as duas. As durações ficam dentro do clipe. */
export function animarClipes(projeto: Projeto, clipeIds: string[], mudanca: Partial<Animacoes>): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => {
    const animacao = limitarAnimacoes({ ...SEM_ANIMACAO, ...clipe.animacao, ...mudanca }, clipe.duracao);
    // O letra a letra endireita o texto em arco
    const porLetras = POR_LETRAS.includes(animacao.entrada.tipo) || POR_LETRAS.includes(animacao.saida.tipo);
    const texto = porLetras && clipe.texto?.curvatura ? { ...clipe.texto, curvatura: 0 } : clipe.texto;
    return { ...clipe, animacao, texto };
  });
}

/** Duração de uma transição nova. */
export const DURACAO_TRANSICAO_S = 0.5;

/**
 * A transição do clipe da principal para o seguinte. `null` tira a transição. A duração fica dentro
 * do menor dos dois clipes.
 */
export function definirTransicao(projeto: Projeto, clipeId: string, transicao: Transicao | null): Projeto {
  const { faixa, clipe, indice } = acharOuErro(projeto, clipeId);
  exigirDestravada(faixa);
  const proximo = faixa.clipes[indice + 1];
  if (faixa.tipo !== "principal" || (!proximo && transicao)) throw new ErroEdicao("A transição fica entre dois clipes vizinhos da faixa principal.");
  if (transicao && (clipe.curva_velocidade || proximo?.curva_velocidade)) throw new ErroEdicao("Clipe com curva de velocidade não tem transição. Tire a curva antes.");
  const nova = transicao && proximo ? { ...transicao, duracao: Math.max(1, Math.min(Math.round(transicao.duracao), duracaoMaximaDaTransicao(clipe, proximo))) } : null;
  return trocarFaixa(projeto, { ...faixa, clipes: faixa.clipes.map((item) => (item.id === clipeId ? { ...item, transicao: nova } : item)) });
}

/** Intensidade máxima de um filtro pronto (200%). */
export const INTENSIDADE_MAXIMA = 2;

/** Ajustes de cor e filtro dos clipes; cada valor fica dentro do limite dele. */
export function mudarCor(projeto: Projeto, clipeIds: string[], mudanca: Partial<Cor>): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => {
    const cor: Cor = { ...COR_PADRAO, ...clipe.cor, ...mudanca };
    for (const chave of Object.keys(LIMITES_COR) as (keyof AjustesCor)[]) {
      cor[chave] = limitar(cor[chave], LIMITES_COR[chave].minimo, LIMITES_COR[chave].maximo);
    }
    if (cor.filtro !== null && !FILTROS.some((filtro) => filtro.id === cor.filtro)) throw new ErroEdicao("Este filtro não existe.");
    cor.intensidade = limitar(cor.intensidade, 0, INTENSIDADE_MAXIMA);
    // Curva neutra não fica guardada; os pontos ficam de 0 a 1, em ordem
    if (curvasNeutras(cor.curvas)) cor.curvas = null;
    else {
      const ajustar = (pontos: PontoDaCurva[] | undefined) =>
        (pontos ?? CURVA_NEUTRA).slice(0, PONTOS_MAXIMOS_DA_CURVA).map(([x, y]) => [limitar(x, 0, 1), limitar(y, 0, 1)] as PontoDaCurva).sort((a, b) => a[0] - b[0]);
      cor.curvas = { rgb: ajustar(cor.curvas!.rgb), r: ajustar(cor.curvas!.r), g: ajustar(cor.curvas!.g), b: ajustar(cor.curvas!.b) };
    }
    // Cor por matiz: só as faixas mexidas, cada valor de -1 a 1; tudo neutro não fica guardado
    if (hslNeutro(cor.hsl)) cor.hsl = null;
    else {
      const hsl: Hsl = {};
      for (const { id } of FAIXAS_DE_MATIZ) {
        const faixa = cor.hsl![id];
        if (!faixa) continue;
        const ajustada = { matiz: limitar(faixa.matiz ?? 0, -1, 1), saturacao: limitar(faixa.saturacao ?? 0, -1, 1), luminancia: limitar(faixa.luminancia ?? 0, -1, 1) };
        if (Object.values(ajustada).some((v) => Math.abs(v) > 1e-9)) hsl[id] = ajustada;
      }
      cor.hsl = hsl;
    }
    return { ...clipe, cor };
  });
}

/** Liga ou desliga a imagem sem ruído dos clipes de vídeo. */
export function limparImagem(projeto: Projeto, clipeIds: string[], ligar: boolean): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => {
    if (clipe.texto) throw new ErroEdicao("Textos não têm ruído para tirar.");
    return { ...clipe, imagem_limpa: ligar, ...(ligar ? { inverter: false } : {}) };
  });
}

/**
 * Toca os clipes de vídeo ao contrário (a imagem e o som do vídeo invertido). O que é medido ou gerado no
 * original não vale nele: a curva de velocidade, o recorte do fundo, a imagem estável e a sem ruído, a voz
 * limpa, o tom e o nivelamento saem ao ligar (e a API recusa os dois juntos).
 */
export function inverterClipes(projeto: Projeto, ctx: Contexto, clipeIds: string[], ligar: boolean): Projeto {
  return mudarClipes(
    projeto,
    clipeIds,
    (clipe) => {
      const info = clipe.midia_id ? ctx.midia(clipe.midia_id) : null;
      if (ligar && (clipe.texto || !info?.video || info.imagem)) throw new ErroEdicao("Só vídeos tocam ao contrário.");
      if (!ligar) return { ...clipe, inverter: false };
      return { ...clipe, inverter: true, curva_velocidade: null, remover_fundo: false, estabilizar: false, imagem_limpa: false, voz_limpa: false, tom: 0, nivelamento: null };
    },
    { comAudio: true },
  );
}

/** Liga ou desliga o recorte do fundo dos clipes de vídeo. A máscara é do vídeo original: liga sem a estabilização. */
export function removerFundo(projeto: Projeto, clipeIds: string[], ligar: boolean): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => {
    if (clipe.texto) throw new ErroEdicao("O recorte do fundo vale só em vídeos.");
    return { ...clipe, remover_fundo: ligar, ...(ligar ? { estabilizar: false, inverter: false } : {}) };
  });
}

/** Liga ou desliga a imagem estável dos clipes de vídeo gravado. Liga sem o recorte do fundo, que é do vídeo original. */
export function estabilizarClipes(projeto: Projeto, ctx: Contexto, clipeIds: string[], ligar: boolean): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => {
    const info = clipe.midia_id ? ctx.midia(clipe.midia_id) : null;
    if (ligar && (clipe.texto || !info?.video || info.imagem || info.transparente)) throw new ErroEdicao("Só vídeos gravados podem ser estabilizados.");
    return { ...clipe, estabilizar: ligar, ...(ligar ? { remover_fundo: false, inverter: false } : {}) };
  });
}

/** A chave de luminância dos clipes de mídia; null tira. */
export function chaveLumaClipes(projeto: Projeto, clipeIds: string[], chave: ChaveLuma | null): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => {
    if (clipe.texto) throw new ErroEdicao("A chave de luminância vale só em vídeos e imagens.");
    if (!chave) return { ...clipe, chave_luma: null };
    if (chave.tirar !== "escuro" && chave.tirar !== "claro") throw new ErroEdicao("Escolha tirar o escuro ou o claro.");
    return { ...clipe, chave_luma: { tirar: chave.tirar, limiar: limitar(chave.limiar, 0, 1), suavidade: limitar(chave.suavidade, 0, 1) } };
  });
}

/** A tela verde dos clipes de mídia; null tira. */
export function chromaClipes(projeto: Projeto, clipeIds: string[], chroma: Chroma | null): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => {
    if (clipe.texto) throw new ErroEdicao("A tela verde vale só em vídeos e imagens.");
    if (!chroma) return { ...clipe, chroma: null };
    if (!/^#[0-9a-f]{6}$/i.test(chroma.cor)) throw new ErroEdicao("Cor inválida.");
    return { ...clipe, chroma: { cor: chroma.cor.toLowerCase(), semelhanca: limitar(chroma.semelhanca, 0.001, 1), suavidade: limitar(chroma.suavidade, 0, 1) } };
  });
}

/** O efeito de vídeo dos clipes; null tira. A intensidade fica de 0 a 1. */
export function aplicarEfeito(projeto: Projeto, clipeIds: string[], efeito: Efeito | null): Projeto {
  if (efeito && !EFEITOS.some((item) => item.id === efeito.tipo)) throw new ErroEdicao("Este efeito não existe.");
  const limpo = efeito ? { tipo: efeito.tipo, intensidade: limitar(efeito.intensidade, 0, 1) } : null;
  return mudarClipes(projeto, clipeIds, (clipe) => ({ ...clipe, efeito: limpo }));
}

/** Os cantos arredondados e a borda dos clipes; null (ou raio e borda zerados) tira. */
export function arredondarClipes(projeto: Projeto, clipeIds: string[], cantos: Cantos | null): Projeto {
  if (cantos && !/^#[0-9a-f]{6}$/i.test(cantos.cor)) throw new ErroEdicao("Cor inválida.");
  return mudarClipes(projeto, clipeIds, (clipe) => {
    if (!cantos) return { ...clipe, cantos: null };
    const limpos = { raio: limitar(cantos.raio, 0, RAIO_MAXIMO), borda: limitar(cantos.borda, 0, BORDA_MAXIMA), cor: cantos.cor.toLowerCase() };
    return { ...clipe, cantos: limpos.raio > 0 || limpos.borda > 0 ? limpos : null };
  });
}

/** A máscara de forma dos clipes (null tira), com os números dentro dos limites. */
export function mascararClipes(projeto: Projeto, clipeIds: string[], mascara: MascaraDeForma | null): Projeto {
  if (mascara && mascara.forma !== "retangulo" && mascara.forma !== "elipse") throw new ErroEdicao("Esta forma de máscara não existe.");
  const { centro, tamanho, suavidade } = LIMITES_DA_MASCARA;
  const limpa = mascara
    ? {
        forma: mascara.forma,
        x: limitar(mascara.x, centro.minimo, centro.maximo),
        y: limitar(mascara.y, centro.minimo, centro.maximo),
        largura: limitar(mascara.largura, tamanho.minimo, tamanho.maximo),
        altura: limitar(mascara.altura, tamanho.minimo, tamanho.maximo),
        suavidade: limitar(mascara.suavidade, suavidade.minimo, suavidade.maximo),
        inverter: Boolean(mascara.inverter),
      }
    : null;
  return mudarClipes(projeto, clipeIds, (clipe) => ({ ...clipe, mascara: limpa }));
}

/** Vira a imagem dos clipes no sentido pedido; virar de novo desvira. */
export function virarClipes(projeto: Projeto, clipeIds: string[], sentido: keyof Virar): Projeto {
  return mudarClipes(projeto, clipeIds, (clipe) => {
    const virar = { horizontal: false, vertical: false, ...clipe.virar, [sentido]: !clipe.virar?.[sentido] };
    return { ...clipe, virar: virar.horizontal || virar.vertical ? virar : null };
  });
}

/** O modo de mesclagem dos clipes (de imagem: os de áudio não aparecem). */
export function mesclarClipes(projeto: Projeto, clipeIds: string[], mesclagem: Mesclagem): Projeto {
  if (!MESCLAGENS.some((item) => item.id === mesclagem)) throw new ErroEdicao("Este modo de mesclagem não existe.");
  return mudarClipes(projeto, clipeIds, (clipe) => ({ ...clipe, mesclagem }));
}

export function mudarFundo(projeto: Projeto, cor: string): Projeto {
  if (!/^#[0-9a-f]{6}$/i.test(cor)) throw new ErroEdicao("Cor inválida.");
  return { ...projeto, fundo: { ...projeto.fundo, cor: cor.toLowerCase() } };
}

/**
 * Faz o clipe seguir um objeto (lib/projeto/seguirObjeto.ts): o caminho entra nos keyframes de x e y,
 * no lugar dos que havia; os de escala, giro e opacidade ficam. A posição de base vira o primeiro ponto.
 */
export function seguirObjetoClipe(projeto: Projeto, clipeId: string, caminho: CaminhoDoSeguidor): Projeto {
  const quadro = duracaoDoQuadro(projeto.taxa);
  return mudarClipes(projeto, [clipeId], (clipe) => {
    const noQuadro = (pontos: Keyframe[], eixo: "x" | "y") => {
      const { minimo, maximo } = LIMITES_TRANSFORMACAO[eixo];
      const alinhados: Keyframe[] = [];
      for (const ponto of pontos) {
        const t = Math.min(Math.max(quadroMaisProximo(projeto.taxa, ponto.t), 0), clipe.duracao);
        if (alinhados.length && t - alinhados[alinhados.length - 1].t < quadro) continue;
        alinhados.push({ t, valor: limitar(ponto.valor, minimo, maximo), curva: "linear" });
      }
      return alinhados.slice(0, KEYFRAMES_POR_PROPRIEDADE);
    };
    const x = noQuadro(caminho.x, "x");
    const y = noQuadro(caminho.y, "y");
    if (!x.length || !y.length) throw new ErroEdicao("O objeto não aparece enquanto este clipe aparece.");
    return {
      ...clipe,
      transformacao: limitarTransformacao({ ...clipe.transformacao, x: x[0].valor, y: y[0].valor }),
      keyframes: { ...clipe.keyframes, x: x.length > 1 ? x : undefined, y: y.length > 1 ? y : undefined },
    };
  });
}

/**
 * Aplica o reenquadramento pelo rosto (lib/projeto/reenquadrar.ts): a escala que cobre o quadro, a
 * posição e o caminho da câmera nos keyframes de x e y. O giro volta a zero (a conta supõe a imagem
 * reta); os keyframes de escala e giro saem, os de opacidade ficam.
 */
export function reenquadrarClipe(projeto: Projeto, clipeId: string, r: Reenquadramento): Projeto {
  const quadro = duracaoDoQuadro(projeto.taxa);
  return mudarClipes(projeto, [clipeId], (clipe) => {
    if (clipe.texto) throw new ErroEdicao("Textos não têm rosto para seguir.");
    // Os pontos no quadro e dentro do clipe, sem dois no mesmo quadro
    const noQuadro = (pontos: Keyframe[] | undefined) => {
      if (!pontos) return undefined;
      const alinhados: Keyframe[] = [];
      for (const ponto of pontos) {
        const t = Math.min(Math.max(quadroMaisProximo(projeto.taxa, ponto.t), 0), clipe.duracao);
        if (alinhados.length && t - alinhados[alinhados.length - 1].t < quadro) continue;
        alinhados.push({ ...ponto, t });
      }
      return alinhados.length > 1 ? alinhados : undefined;
    };
    const keyframes: Keyframes = { opacidade: clipe.keyframes?.opacidade, volume: clipe.keyframes?.volume, x: noQuadro(r.keyframes.x), y: noQuadro(r.keyframes.y) };
    const vazios = CHAVES_DE_KEYFRAME.every((p) => !keyframes[p]?.length);
    return {
      ...clipe,
      transformacao: limitarTransformacao({ ...clipe.transformacao, escala: r.escala, x: r.x, y: r.y, rotacao: 0 }),
      keyframes: vazios ? null : keyframes,
    };
  });
}
