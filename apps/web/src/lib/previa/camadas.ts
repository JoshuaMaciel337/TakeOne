// As camadas de um instante da linha do tempo, de baixo para cima: o que a prévia desenha e o que a
// exportação no navegador desenha, pela mesma conta. Sai daqui também a camada no formato do
// compositor (lib/previa/compositor.ts), com os efeitos do clipe.
import type { EfeitoDeTransicao } from "@/lib/projeto/transicao";
import { transformacaoAnimada } from "@/lib/projeto/animacao";
import { type AjustesCor, ajustesEfetivos, corNeutra, curvasNeutras, hslNeutro, type LutDaCor, lutDaCor, somarAjustes } from "@/lib/projeto/cor";
import {
  ajustesDoEfeito,
  brilhoDoEfeito,
  colunasDoGrao,
  desfoqueDoEfeito,
  deslocamentoDoGrao,
  desvioDeCor,
  distorcaoDoEfeito,
  graoDoEfeito,
  contrasteLocalDoEfeito,
  linhasDoEfeito,
  luzDoEfeito,
  posicaoDaLuz,
} from "@/lib/projeto/efeitos";
import { type Caixa, caixaDoClipe, caixaDoTexto, type Tamanho } from "@/lib/projeto/geometria";
import { transformacaoNoTempo, transformacaoParaEditar } from "@/lib/projeto/keyframes";
import { type Cortes, cortesDoTrecho, temLetraALetra, textoDoDestaque, trechoVisivel } from "@/lib/projeto/letras";
import { type Clipe, type Faixa, faixaDeTexto, fimDoClipe, type Projeto, type Recorte, tempoNaMidia } from "@/lib/projeto/modelo";
import type { Texto } from "@/lib/projeto/texto";
import { desfoqueNaTransicao, janelasDaPrincipal, type Revelado, reveladoNaTransicao, transformacaoNaTransicao } from "@/lib/projeto/transicao";
import { duracaoDoQuadro, type Taxa, type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

import { type Camada, FUNDO } from "./compositor";
import type { ImagemDeTexto } from "./imagensDeTexto";

/** Um clipe de mídia que precisa de uma fonte de quadros agora (o atual ou o próximo da faixa). */
export type ItemDaPrevia = {
  chave: string;
  clipe: Clipe;
  faixa: Faixa;
  midia: Midia;
  ativo: boolean;
  /** Efeitos das transições sobre este clipe (só na principal, durante a janela delas). */
  efeitos?: EfeitoDeTransicao[];
};

/** Uma camada do quadro atual, de baixo para cima. `segundos` é o instante da mídia que aparece agora. */
export type CamadaNaTela = {
  chave: string;
  clipe: Clipe;
  faixa: Faixa;
  recorte: Recorte;
  /** Onde a camada aparece agora, com a animação. */
  caixa: Caixa;
  /** Sem a animação: é nela que as alças da prévia mexem. */
  caixaBase: Caixa;
  segundos: number;
  /** A LUT 3D dos ajustes e das curvas (a mesma do render); null quando a cor é a original. */
  lut: LutDaCor | null;
  /** A vinheta, que fica fora da LUT (depende do lugar no clipe). */
  vinheta: number;
  /** A parte do clipe que aparece numa cortina; sem ela, o clipe inteiro. */
  revelado?: Revelado;
  /** Clipes de texto já trazem a imagem; os de vídeo pegam o quadro da fonte deles. */
  imagem?: ImageBitmap;
  /** As letras do texto que aparecem; sem ela, todas. */
  mascara?: Cortes;
  /** Sigma do desfoque, em frações da altura do clipe. */
  desfoque?: number;
  /** VHS e glitch: o desvio do vermelho e do azul neste quadro, em frações da largura. */
  desvio?: number;
  luz?: { forca: number; posicao: number };
  grao?: { forca: number; colunas: number; deslocamento: [number, number] };
};

/** O próximo clipe da faixa começa a carregar quando falta isto para ele entrar. */
export const ANTECEDENCIA = 2 * TICKS_POR_SEGUNDO;

/**
 * Clipes que precisam de um elemento agora: os que estão sob o cursor e o próximo da mesma faixa,
 * para ele já estar carregado quando entrar. A chave é faixa + mídia: depois de dividir um clipe, as
 * duas metades usam o mesmo elemento e o vídeo segue sem engasgar.
 *
 * Na principal, com `quadroDasTransicoes` (a duração de um quadro do projeto), uma transição deixa dois clipes na tela ao mesmo tempo (o que
 * sai e o que entra). Se os dois são da mesma mídia, o que entra ganha uma chave própria. O som não
 * usa as janelas das transições: cada clipe soa só entre o começo e o fim dele.
 */
export function itensNoTempo(faixas: Faixa[], midias: ReadonlyMap<string, Midia>, tempo: Tick, quadroDasTransicoes?: Tick): ItemDaPrevia[] {
  const itens: ItemDaPrevia[] = [];
  for (const faixa of faixas) {
    const chaves = new Set<string>();
    const janelas = quadroDasTransicoes && faixa.tipo === "principal" ? janelasDaPrincipal(faixa.clipes, quadroDasTransicoes) : null;
    const dentro = (clipe: Clipe) => {
      const janela = janelas?.get(clipe.id);
      return janela ? janela.inicio <= tempo && tempo < janela.fim : clipe.inicio <= tempo && tempo < fimDoClipe(clipe);
    };
    const comecaEm = (clipe: Clipe) => janelas?.get(clipe.id)?.inicio ?? clipe.inicio;
    const atuais = faixa.clipes.filter(dentro);
    const proximo = faixa.clipes.find(
      (clipe) => comecaEm(clipe) > tempo && comecaEm(clipe) - tempo <= ANTECEDENCIA && !atuais.some((atual) => atual.midia_id === clipe.midia_id),
    );
    const candidatos: [Clipe | undefined, boolean][] = [...atuais.map((clipe): [Clipe, boolean] => [clipe, true]), [proximo, false]];
    for (const [clipe, ativo] of candidatos) {
      const midia = clipe?.midia_id ? midias.get(clipe.midia_id) : undefined;
      if (!clipe || midia?.status !== "pronta") continue;
      let chave = `${faixa.id}:${clipe.midia_id}`;
      if (chaves.has(chave)) {
        if (!ativo) continue;
        chave = `${chave}:entra`;
      }
      chaves.add(chave);
      const efeitos = janelas?.get(clipe.id)?.efeitos;
      itens.push({ chave, clipe, faixa, midia, ativo, efeitos: efeitos?.length ? efeitos : undefined });
    }
  }
  return itens;
}

/** Os clipes de imagem na tela, de baixo para cima (a primeira faixa da lista é a de cima). */
export function visuaisNoTempo(projeto: Projeto, midias: ReadonlyMap<string, Midia>, tempo: Tick): ItemDaPrevia[] {
  return itensNoTempo(
    projeto.faixas.filter((faixa) => faixa.tipo !== "audio" && !faixa.oculta).reverse(),
    midias,
    tempo,
    duracaoDoQuadro(projeto.taxa),
  );
}

/** Tamanho da imagem da mídia, já com a rotação do celular aplicada (a ingestão guarda assim). */
function tamanhoDaMidia(midia: Midia): Tamanho | null {
  return midia.video && midia.video.largura > 0 && midia.video.altura > 0 ? { largura: midia.video.largura, altura: midia.video.altura } : null;
}

/** As LUTs já montadas, pelos ajustes e curvas (a mesma para todo quadro do clipe e para clipes com a mesma cor). */
const luts = new Map<string, LutDaCor>();

/**
 * A cor do clipe para o compositor: a LUT dos ajustes e das curvas, como o render (o efeito VHS soma aos ajustes),
 * e a vinheta à parte.
 */
function corDoClipe(clipe: Clipe): Pick<CamadaNaTela, "lut" | "vinheta"> {
  const ajustes: AjustesCor = somarAjustes(ajustesEfetivos(clipe.cor), ajustesDoEfeito(clipe.efeito));
  const vinheta = ajustes.vinheta;
  const semVinheta = { ...ajustes, vinheta: 0 };
  const curvas = curvasNeutras(clipe.cor?.curvas) ? null : clipe.cor!.curvas!;
  const hsl = hslNeutro(clipe.cor?.hsl) ? null : clipe.cor!.hsl!;
  if (corNeutra(semVinheta) && !curvas && !hsl) return { lut: null, vinheta };
  const chave = JSON.stringify([semVinheta, curvas, hsl]);
  let lut = luts.get(chave);
  if (!lut) {
    lut = { chave, dados: lutDaCor(semVinheta, curvas, hsl) };
    if (luts.size > 40) luts.clear();
    luts.set(chave, lut);
  }
  return { lut, vinheta };
}

/** O quadro desde o começo do clipe, na taxa do projeto (o glitch muda de quadro em quadro). */
function quadroDoClipe(clipe: Clipe, tempo: Tick, taxa: Taxa): number {
  return Math.floor(((tempo - clipe.inicio) * taxa.num) / (taxa.den * TICKS_POR_SEGUNDO) + 1e-6);
}

/** Luz e granulação do clipe de mídia neste instante (os textos não têm). */
function luzEGrao(clipe: Clipe, caixa: Caixa, tempo: Tick, taxa: Taxa): Pick<CamadaNaTela, "luz" | "grao"> {
  const forcaDaLuz = luzDoEfeito(clipe.efeito);
  const forcaDoGrao = graoDoEfeito(clipe.efeito);
  const colunas = colunasDoGrao(caixa.largura, caixa.altura);
  return {
    luz: forcaDaLuz ? { forca: forcaDaLuz, posicao: posicaoDaLuz((tempo - clipe.inicio) / TICKS_POR_SEGUNDO) } : undefined,
    grao: forcaDoGrao ? { forca: forcaDoGrao, colunas, deslocamento: deslocamentoDoGrao(quadroDoClipe(clipe, tempo, taxa), colunas) } : undefined,
  };
}

/**
 * A camada de ajuste: cobre o quadro inteiro, sem mídia, com a opacidade do instante (fades e keyframes como os
 * outros clipes). O compositor desenha nela o que já está embaixo, com a cor dela.
 */
function camadaDeAjuste(clipe: Clipe, faixa: Faixa, tempo: Tick, quadro: Tamanho): CamadaNaTela {
  const opacidade = transformacaoAnimada(clipe, tempo).opacidade;
  const caixa = { cx: quadro.largura / 2, cy: quadro.altura / 2, largura: quadro.largura, altura: quadro.altura, rotacao: 0, opacidade };
  return { chave: `ajuste:${clipe.id}`, clipe, faixa, recorte: RECORTE_INTEIRO, caixa, caixaBase: caixa, ...corDoClipe(clipe), segundos: 0 };
}

const RECORTE_INTEIRO: Recorte = { x: 0, y: 0, largura: 1, altura: 1 };

/** Os textos que precisam de imagem: por id do clipe, e o destaque da fala com ":destaque". */
export function textosParaImagens(projeto: Projeto): { id: string; texto: Texto }[] {
  return projeto.faixas
    .filter((faixa) => faixaDeTexto(faixa.tipo) && !faixa.oculta)
    .flatMap((faixa) =>
      faixa.clipes.flatMap((clipe) =>
        !clipe.texto
          ? []
          : [{ id: clipe.id, texto: clipe.texto }, ...(clipe.texto.destaque ? [{ id: `${clipe.id}:destaque`, texto: textoDoDestaque(clipe.texto) }] : [])],
      ),
    );
}

/**
 * As camadas do instante, de baixo para cima, num quadro do tamanho dado: os clipes de mídia (da lista
 * `visuais`) e, por cima de todos, os textos com a imagem que já chegou.
 */
export function camadasNoTempo(
  projeto: Projeto,
  visuais: ItemDaPrevia[],
  tempo: Tick,
  quadro: Tamanho,
  imagensDeTexto: ReadonlyMap<string, ImagemDeTexto>,
): CamadaNaTela[] {
  const camadas: CamadaNaTela[] = [];
  if (quadro.largura <= 0) return camadas;
  for (const item of visuais) {
    const tamanhoMidia = tamanhoDaMidia(item.midia);
    if (!item.ativo || !tamanhoMidia) continue;
    const { clipe, faixa, chave } = item;
    camadas.push({
      chave,
      clipe,
      faixa,
      recorte: clipe.recorte,
      caixa: caixaDoClipe(transformacaoNaTransicao(transformacaoAnimada(clipe, tempo), item.efeitos ?? [], tempo), clipe.recorte, tamanhoMidia, quadro),
      // As alças mexem no valor do instante (com keyframes, gravam um ponto ali), sem as animações
      caixaBase: caixaDoClipe(transformacaoParaEditar(clipe, tempo), clipe.recorte, tamanhoMidia, quadro),
      ...corDoClipe(clipe),
      desvio: desvioDeCor(clipe.efeito, quadroDoClipe(clipe, tempo, projeto.taxa)),
      ...luzEGrao(clipe, caixaDoClipe(transformacaoNoTempo(clipe, tempo), clipe.recorte, tamanhoMidia, quadro), tempo, projeto.taxa),
      revelado: item.efeitos?.length ? reveladoNaTransicao(item.efeitos, tempo) : undefined,
      desfoque: item.efeitos?.length ? desfoqueNaTransicao(item.efeitos, tempo) : 0,
      segundos: tempoNaMidia(clipe, tempo) / TICKS_POR_SEGUNDO,
    });
  }
  // As camadas de ajuste entram na ordem das faixas (as de baixo primeiro), entre os vídeos
  const deBaixo = projeto.faixas.filter((faixa) => faixa.tipo !== "audio" && !faixaDeTexto(faixa.tipo) && !faixa.oculta).reverse();
  const ordem = new Map(deBaixo.map((faixa, i) => [faixa.id, i]));
  for (const faixa of deBaixo) {
    const ajuste = faixa.clipes.find((clipe) => clipe.ajuste && clipe.inicio <= tempo && tempo < fimDoClipe(clipe));
    if (ajuste) camadas.push(camadaDeAjuste(ajuste, faixa, tempo, quadro));
  }
  camadas.sort((a, b) => (ordem.get(a.faixa.id) ?? 0) - (ordem.get(b.faixa.id) ?? 0));
  // Os textos ficam por cima de todas as faixas de vídeo (a faixa de texto é sempre a de cima)
  const faixasDeTexto = projeto.faixas.filter((faixa) => faixaDeTexto(faixa.tipo) && !faixa.oculta);
  for (const faixa of [...faixasDeTexto].reverse()) {
    const clipe = faixa.clipes.find((item) => item.inicio <= tempo && tempo < fimDoClipe(item));
    const imagem = clipe ? imagensDeTexto.get(clipe.id) : undefined;
    if (!clipe || !imagem) continue;
    const caixa = caixaDoTexto(transformacaoAnimada(clipe, tempo), imagem, quadro);
    const caixaBase = caixaDoTexto(transformacaoParaEditar(clipe, tempo), imagem, quadro);
    // Letra a letra: só o trecho que já apareceu
    const trecho = imagem.layout && temLetraALetra(clipe.animacao) ? trechoVisivel(clipe, imagem.layout, tempo) : null;
    const comum = {
      clipe,
      faixa,
      recorte: clipe.recorte,
      caixa,
      caixaBase,
      ...corDoClipe(clipe),
      desvio: desvioDeCor(clipe.efeito, quadroDoClipe(clipe, tempo, projeto.taxa)),
      segundos: 0,
    };
    camadas.push({ ...comum, chave: `texto:${clipe.id}`, imagem: imagem.bitmap, mascara: trecho ? cortesDoTrecho(imagem.layout!, trecho) : undefined });
    // O destaque: a mesma caixa, com a imagem na outra cor, só no trecho da palavra falada
    const destaque = clipe.texto?.destaque ? imagensDeTexto.get(`${clipe.id}:destaque`) : undefined;
    if (destaque?.layout) {
      const mascara = cortesDoTrecho(destaque.layout, trechoVisivel(clipe, destaque.layout, tempo, true)!);
      camadas.push({ ...comum, chave: `destaque:${clipe.id}`, imagem: destaque.bitmap, mascara });
    }
  }
  return camadas;
}

/**
 * As camadas do projeto de imagem (lib/projeto/imagem.ts), de baixo para cima e na ordem das faixas: aqui um
 * texto pode ficar embaixo de uma foto. Não há tempo (as animações ficam de fora); a mídia de cada camada é
 * uma imagem, que quem desenha pega pela chave ("imagem:<id do clipe>").
 */
export function camadasDaImagem(projeto: Projeto, midias: ReadonlyMap<string, Midia>, quadro: Tamanho, imagensDeTexto: ReadonlyMap<string, ImagemDeTexto>): CamadaNaTela[] {
  const camadas: CamadaNaTela[] = [];
  if (quadro.largura <= 0) return camadas;
  for (const faixa of [...projeto.faixas].reverse()) {
    if (faixa.tipo === "principal" || faixa.oculta) continue;
    const clipe = faixa.clipes[0];
    if (!clipe) continue;
    if (clipe.ajuste) {
      camadas.push(camadaDeAjuste(clipe, faixa, 0, quadro));
      continue;
    }
    const comum = { clipe, faixa, recorte: clipe.recorte, ...corDoClipe(clipe), desvio: desvioDeCor(clipe.efeito, 0), segundos: 0 };
    if (clipe.texto) {
      const imagem = imagensDeTexto.get(clipe.id);
      if (!imagem) continue;
      const caixa = caixaDoTexto(clipe.transformacao, imagem, quadro);
      camadas.push({ ...comum, chave: `texto:${clipe.id}`, caixa, caixaBase: caixa, imagem: imagem.bitmap });
      continue;
    }
    const midia = clipe.midia_id ? midias.get(clipe.midia_id) : undefined;
    const tamanhoMidia = midia?.status === "pronta" ? tamanhoDaMidia(midia) : null;
    if (!tamanhoMidia) continue;
    const caixa = caixaDoClipe(clipe.transformacao, clipe.recorte, tamanhoMidia, quadro);
    camadas.push({ ...comum, chave: `imagem:${clipe.id}`, caixa, caixaBase: caixa, ...luzEGrao(clipe, caixa, 0, projeto.taxa) });
  }
  return camadas;
}

/** A camada no formato do compositor, com o quadro da fonte e a máscara do fundo deste instante. */
export function camadaDoCompositor(camada: CamadaNaTela, fonte: TexImageSource | typeof FUNDO, mascaraDoFundo: TexImageSource | null): Camada {
  return {
    fonte,
    recorte: camada.recorte,
    // A cópia do canvas da camada de ajuste vem com as linhas de baixo para cima
    virar: fonte === FUNDO ? { horizontal: false, vertical: true } : camada.clipe.virar,
    cantos: camada.clipe.cantos,
    mascaraDeForma: camada.clipe.mascara,
    caixa: camada.caixa,
    lut: camada.lut,
    vinheta: camada.vinheta,
    revelado: camada.revelado,
    mascara: camada.mascara,
    desfoque: (camada.desfoque ?? 0) + desfoqueDoEfeito(camada.clipe.efeito),
    mesclagem: camada.clipe.mesclagem,
    brilho: brilhoDoEfeito(camada.clipe.efeito),
    contrasteLocal: contrasteLocalDoEfeito(camada.clipe.efeito),
    lente: distorcaoDoEfeito(camada.clipe.efeito),
    desvio: camada.desvio,
    linhas: linhasDoEfeito(camada.clipe.efeito),
    luz: camada.luz,
    grao: camada.grao,
    chroma: camada.clipe.texto ? null : camada.clipe.chroma,
    chaveLuma: camada.clipe.texto ? null : camada.clipe.chave_luma,
    mascaraDoFundo,
  };
}
