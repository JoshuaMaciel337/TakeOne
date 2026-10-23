// O projeto de imagem (editor de imagem): o mesmo documento do vídeo, em que cada camada é uma faixa com um
// clipe só, no começo. Assim os comandos do clipe (posição, cor, efeito, cantos, texto...) valem sem mudar nada,
// e o desfazer, o salvamento e o conflito são os do editor de vídeo. A faixa principal fica vazia, embaixo de
// tudo (a API exige uma). As camadas ficam em qualquer ordem: um texto pode ficar embaixo de uma foto.
import { segundosParaTicks } from "../tempo.ts";
import { type Contexto, ErroEdicao } from "./edicao.ts";
import { COR_PADRAO } from "./cor.ts";
import { caixaDoClipe, type Tamanho } from "./geometria.ts";
import { type Clipe, type Faixa, type Projeto, RECORTE_PADRAO, TRANSFORMACAO_PADRAO } from "./modelo.ts";
import { type CamadaPronta, encaixarNaCaixa } from "./modelosDeImagem.ts";
import type { Texto } from "./texto.ts";

/** Quanto dura o clipe de cada camada: a imagem não tem tempo, mas a linha do tempo pede uma duração. */
export const DURACAO_DA_CAMADA = segundosParaTicks(5);

/** A escala com que entra uma imagem com transparência (logo, forma). */
export const ESCALA_DO_RECORTADO = 0.5;

export type TamanhoDaImagem = { largura: number; altura: number };

/** Os mesmos limites de core/modelos/projeto.py. */
export const LADO_MINIMO = 16;
export const LADO_MAXIMO = 8192;
export const AREA_MAXIMA = 36_000_000;

export const TAMANHOS_PRONTOS: {
  id: string;
  nome: string;
  largura: number;
  altura: number;
}[] = [
  { id: "post-quadrado", nome: "Post quadrado", largura: 1080, altura: 1080 },
  { id: "post-retrato", nome: "Post retrato", largura: 1080, altura: 1350 },
  { id: "story", nome: "Story e status", largura: 1080, altura: 1920 },
  { id: "capa-video", nome: "Capa de vídeo", largura: 1280, altura: 720 },
  { id: "banner", nome: "Banner largo", largura: 1500, altura: 500 },
  { id: "apresentacao", nome: "Slide", largura: 1920, altura: 1080 },
  { id: "a4", nome: "Folha A4 (impressão)", largura: 2480, altura: 3508 },
];

export function ehImagem(projeto: Pick<Projeto, "tipo">): boolean {
  return projeto.tipo === "imagem";
}

/** O tamanho do quadro do projeto de imagem (o de vídeo não tem: vale a proporção). */
export function tamanhoDaImagem(projeto: Projeto): TamanhoDaImagem {
  return projeto.tamanho ?? { largura: 1080, altura: 1080 };
}

/** As camadas de cima para baixo: a faixa (que guarda esconder e travar) e o clipe dela. */
export function camadasDaImagem(projeto: Projeto): { faixa: Faixa; clipe: Clipe }[] {
  return projeto.faixas.filter((faixa) => faixa.tipo !== "principal" && faixa.clipes.length).map((faixa) => ({ faixa, clipe: faixa.clipes[0] }));
}

function clipeDaCamada(id: string, extra: Partial<Clipe>): Clipe {
  return {
    id,
    midia_id: null,
    inicio: 0,
    duracao: DURACAO_DA_CAMADA,
    entrada: 0,
    velocidade: 1,
    volume: 1,
    fade_entrada: 0,
    fade_saida: 0,
    transformacao: { ...TRANSFORMACAO_PADRAO },
    recorte: { ...RECORTE_PADRAO },
    ...extra,
  };
}

/** Uma faixa nova por cima de todas (a camada nova aparece na frente). */
function porNoTopo(projeto: Projeto, faixa: Faixa): Projeto {
  return { ...projeto, faixas: [faixa, ...projeto.faixas] };
}

function faixaNova(ctx: Contexto, tipo: "video" | "texto", clipe: Clipe): Faixa {
  return {
    id: ctx.novoId(),
    tipo,
    oculta: false,
    muda: false,
    travada: false,
    clipes: [clipe],
  };
}

export function adicionarCamadaDeMidia(projeto: Projeto, ctx: Contexto, midiaId: string): { projeto: Projeto; clipeId: string } {
  const info = ctx.midia(midiaId);
  if (!info) throw new ErroEdicao("A mídia ainda não está pronta.");
  if (!info.imagem) throw new ErroEdicao("No editor de imagem entram imagens (JPG, PNG ou WebP).");
  const clipe = clipeDaCamada(ctx.novoId(), { midia_id: midiaId });
  // A foto cabe no quadro; o logo e a forma (com transparência) entram com metade do tamanho, por cima dela
  if (info.transparente)
    clipe.transformacao = {
      ...clipe.transformacao,
      escala: ESCALA_DO_RECORTADO,
    };
  return {
    projeto: porNoTopo(projeto, faixaNova(ctx, "video", clipe)),
    clipeId: clipe.id,
  };
}

/** Uma camada de ajuste por cima de todas: muda a cor do que está embaixo dela. */
export function adicionarCamadaDeAjuste(projeto: Projeto, ctx: Contexto): { projeto: Projeto; clipeId: string } {
  const clipe = clipeDaCamada(ctx.novoId(), { ajuste: true });
  return { projeto: porNoTopo(projeto, faixaNova(ctx, "video", clipe)), clipeId: clipe.id };
}

export function adicionarCamadaDeTexto(projeto: Projeto, ctx: Contexto, texto: Texto): { projeto: Projeto; clipeId: string } {
  const clipe = clipeDaCamada(ctx.novoId(), { texto });
  return {
    projeto: porNoTopo(projeto, faixaNova(ctx, "texto", clipe)),
    clipeId: clipe.id,
  };
}

function indiceDaCamada(projeto: Projeto, faixaId: string): number {
  const indice = projeto.faixas.findIndex((faixa) => faixa.id === faixaId && faixa.tipo !== "principal");
  if (indice < 0) throw new ErroEdicao("Esta camada não existe mais.");
  return indice;
}

/** Sobe (para a frente) ou desce (para trás) uma posição, ou vai direto para o topo ou o fundo. */
export function moverCamada(projeto: Projeto, faixaId: string, para: "cima" | "baixo" | "topo" | "fundo"): Projeto {
  const indice = indiceDaCamada(projeto, faixaId);
  const camadas = projeto.faixas.filter((faixa) => faixa.tipo !== "principal");
  const principal = projeto.faixas.filter((faixa) => faixa.tipo === "principal");
  const [faixa] = camadas.splice(indice, 1);
  const destino = para === "topo" ? 0 : para === "fundo" ? camadas.length : para === "cima" ? Math.max(0, indice - 1) : Math.min(camadas.length, indice + 1);
  camadas.splice(destino, 0, faixa);
  return { ...projeto, faixas: [...camadas, ...principal] };
}

export function apagarCamada(projeto: Projeto, faixaId: string): Projeto {
  const indice = indiceDaCamada(projeto, faixaId);
  if (projeto.faixas[indice].travada) throw new ErroEdicao("A camada está travada. Destrave o cadeado para apagar.");
  return { ...projeto, faixas: projeto.faixas.filter((_, i) => i !== indice) };
}

/** A cópia entra logo acima da original, com ids novos e um pouco deslocada (para dar para ver que são duas). */
export function duplicarCamada(projeto: Projeto, ctx: Contexto, faixaId: string): { projeto: Projeto; clipeId: string } {
  const indice = indiceDaCamada(projeto, faixaId);
  const original = projeto.faixas[indice];
  const clipe = structuredClone(original.clipes[0]);
  const t = clipe.transformacao;
  const copia: Clipe = {
    ...clipe,
    id: ctx.novoId(),
    transformacao: {
      ...t,
      x: Math.min(t.x + 0.03, 10),
      y: Math.min(t.y + 0.03, 10),
    },
  };
  const faixas = [...projeto.faixas];
  faixas.splice(indice, 0, {
    ...original,
    id: ctx.novoId(),
    travada: false,
    clipes: [copia],
  });
  return { projeto: { ...projeto, faixas }, clipeId: copia.id };
}

/** A força do desfoque da cópia de baixo no "Desfocar o fundo". */
export const DESFOQUE_DO_FUNDO = 0.4;

/**
 * Desfocar o fundo de uma foto: a camada fica com o fundo removido (só a pessoa) e ganha embaixo uma cópia
 * inteira com o efeito de desfoque. São duas camadas comuns: a pessoa ajusta, move ou apaga cada uma.
 */
export function desfocarFundo(projeto: Projeto, ctx: Contexto, faixaId: string): { projeto: Projeto; clipeId: string } {
  const indice = indiceDaCamada(projeto, faixaId);
  const original = projeto.faixas[indice];
  const clipe = original.clipes[0];
  const info = clipe.midia_id ? ctx.midia(clipe.midia_id) : null;
  if (!info?.imagem || info.transparente) throw new ErroEdicao("O fundo desfocado vale em fotos.");
  if (original.travada) throw new ErroEdicao("A camada está travada.");
  const recortada: Clipe = { ...clipe, remover_fundo: true };
  const desfocada: Clipe = { ...structuredClone(clipe), id: ctx.novoId(), remover_fundo: false, efeito: { tipo: "desfoque", intensidade: DESFOQUE_DO_FUNDO } };
  const faixas = [...projeto.faixas];
  faixas.splice(indice, 1, { ...original, clipes: [recortada] }, { ...original, id: ctx.novoId(), clipes: [desfocada] });
  return { projeto: { ...projeto, faixas }, clipeId: recortada.id };
}

/**
 * Põe as camadas de um modelo de imagem por cima do que já existe, num passo, e muda o tamanho e o fundo para os
 * do modelo (as camadas que já estavam ficam no mesmo lugar em frações do quadro).
 */
export function aplicarModeloDeImagem(projeto: Projeto, ctx: Contexto, modelo: { camadas: CamadaPronta[]; tamanho: TamanhoDaImagem; fundo: string }): Projeto {
  let novo = mudarFundoDaImagem(mudarTamanhoDaImagem(projeto, modelo.tamanho), { cor: modelo.fundo, transparente: false });
  for (const camada of modelo.camadas) {
    if (camada.tipo === "texto") {
      novo = porNoTopo(novo, faixaNova(ctx, "texto", clipeDaCamada(ctx.novoId(), { texto: camada.texto, transformacao: camada.transformacao })));
      continue;
    }
    if (!ctx.midia(camada.midiaId)) throw new ErroEdicao("Uma imagem do modelo ainda não está pronta.");
    const clipe = clipeDaCamada(ctx.novoId(), {
      midia_id: camada.midiaId,
      transformacao: camada.transformacao,
      recorte: camada.recorte,
      ...(camada.cantos ? { cantos: camada.cantos } : {}),
      ...(camada.filtro ? { cor: { ...COR_PADRAO, filtro: camada.filtro } } : {}),
    });
    novo = porNoTopo(novo, faixaNova(ctx, "video", clipe));
  }
  return novo;
}

/**
 * Troca a imagem de uma camada mantendo o lugar dela: a nova cobre a mesma caixa (cortada no meio). Os tamanhos
 * em pixels das duas vêm de quem chama, porque o contexto da edição não sabe o tamanho das mídias.
 */
export function trocarImagemDaCamada(projeto: Projeto, ctx: Contexto, clipeId: string, midiaId: string, tamanhoAtual: Tamanho, tamanhoNovo: Tamanho): Projeto {
  const info = ctx.midia(midiaId);
  if (!info?.imagem) throw new ErroEdicao("Escolha uma imagem pronta da biblioteca.");
  const quadro = tamanhoDaImagem(projeto);
  const faixas = projeto.faixas.map((faixa) => {
    const clipe = faixa.clipes[0];
    if (faixa.tipo === "principal" || !clipe || clipe.id !== clipeId) return faixa;
    if (faixa.travada) throw new ErroEdicao("A camada está travada.");
    if (!clipe.midia_id) throw new ErroEdicao("Só camadas de imagem trocam de imagem.");
    const caixa = caixaDoClipe({ ...clipe.transformacao, rotacao: 0 }, clipe.recorte, tamanhoAtual, quadro);
    const noQuadro = { cx: caixa.cx / quadro.largura, cy: caixa.cy / quadro.altura, largura: caixa.largura / quadro.largura, altura: caixa.altura / quadro.altura };
    const { transformacao, recorte } = encaixarNaCaixa(tamanhoNovo, noQuadro, quadro, "cobrir");
    const t = clipe.transformacao;
    return {
      ...faixa,
      clipes: [{ ...clipe, midia_id: midiaId, recorte, remover_fundo: false, transformacao: { ...t, escala: transformacao.escala } }],
    };
  });
  return { ...projeto, faixas };
}

export function mudarFundoDaImagem(projeto: Projeto, fundo: { cor?: string; transparente?: boolean }): Projeto {
  if (fundo.cor !== undefined && !/^#[0-9a-f]{6}$/i.test(fundo.cor)) throw new ErroEdicao("Cor inválida.");
  return { ...projeto, fundo: { ...projeto.fundo, ...fundo } };
}

/** Confere o tamanho: os lados entre 16 e 8192 e no máximo 36 milhões de pixels. Devolve a mensagem ou null. */
export function problemaNoTamanho({ largura, altura }: TamanhoDaImagem): string | null {
  if (![largura, altura].every((lado) => Number.isInteger(lado) && lado >= LADO_MINIMO && lado <= LADO_MAXIMO)) {
    return `Os lados vão de ${LADO_MINIMO} a ${LADO_MAXIMO} pixels.`;
  }
  if (largura * altura > AREA_MAXIMA) return "A imagem pode ter no máximo 36 milhões de pixels (6000 × 6000).";
  return null;
}

/** Muda o tamanho do quadro. As camadas ficam no mesmo lugar em frações (o meio continua no meio). */
export function mudarTamanhoDaImagem(projeto: Projeto, tamanho: TamanhoDaImagem): Projeto {
  const problema = problemaNoTamanho(tamanho);
  if (problema) throw new ErroEdicao(problema);
  return {
    ...projeto,
    tamanho: { largura: tamanho.largura, altura: tamanho.altura },
  };
}
