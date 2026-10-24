// As camadas de um instante da linha do tempo, de baixo para cima: o que a prévia desenha e o que a
// exportação no navegador desenha, pela mesma conta. Sai daqui também a camada no formato do
// compositor (lib/previa/compositor.ts), com os efeitos do clipe.
import { arvoreDaImagem, camadaVisivel, faixasEmOrdem, mesclagemDaPasta, type NoDaCamada } from "@/lib/projeto/arvore";
import type { EfeitoDeTransicao } from "@/lib/projeto/transicao";
import { transformacaoAnimada } from "@/lib/projeto/animacao";
import { type AjustesCor, ajustesEfetivos, corNeutra, curvasNeutras, hslNeutro, type LutDaCor, lutDaCor, somarAjustes } from "@/lib/projeto/cor";
import {
  ajustesDoEfeito,
  brilhoDoEfeito,
  borraoDoEfeito,
  celulasDoPixelizar,
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
import { temSilhueta } from "@/lib/projeto/silhueta";
import { efeitosLigados, LUZ_GLOBAL_PADRAO, type LuzGlobal } from "@/lib/imagem/estiloDeCamada";

import { matrizEmUso } from "@/lib/projeto/mascaraDePixels";
import { lutGuardada } from "@/lib/projeto/lutImportada";
import { type AjusteDaImagem, compilarAjuste, lutDaFuncao, type TabelaDoAjuste } from "@/lib/imagem/ajustes";
import { filtrosQueValem } from "@/lib/imagem/filtros/pilha";
import { transformacaoNoTempo, transformacaoParaEditar } from "@/lib/projeto/keyframes";
import { type Cortes, cortesDoTrecho, temLetraALetra, textoDoDestaque, trechoVisivel } from "@/lib/projeto/letras";
import { type Clipe, type Faixa, faixaDeTexto, fimDoClipe, type Projeto, type Recorte, tempoNaMidia } from "@/lib/projeto/modelo";
import type { Texto } from "@/lib/projeto/texto";
import { clipeNaFonte } from "./arquivos";
import { desfoqueNaTransicao, janelasDaPrincipal, janelasDoSom, type MascaraDeTransicao, mascaraNaTransicao, type Revelado, reveladoNaTransicao, transformacaoNaTransicao, zoomNaTransicao } from "@/lib/projeto/transicao";
import { duracaoDoQuadro, type Taxa, type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

import { type Camada, FUNDO } from "./compositor";
import type { ImagemDeTexto } from "./imagensDeTexto";

/** O que a camada do compositor precisa do documento (editor de imagem): a luz global e o fundo. */
export const documentoDaCamada = (projeto: Pick<Projeto, "luz_global" | "fundo" | "tamanho">) => ({
  luz: projeto.luz_global ?? null,
  fundo: projeto.fundo.transparente ? null : projeto.fundo.cor,
  // O tamanho do documento: as medidas dos filtros inteligentes são dadas nele
  tamanho: projeto.tamanho ? { largura: projeto.tamanho.largura, altura: projeto.tamanho.altura } : { largura: 1080, altura: 1080 },
});

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
  /** A tabela de 256 tons de um ajuste do editor de imagem (níveis, curvas, limiar...), depois da LUT. */
  tabela?: TabelaDoAjuste | null;
  /** A vinheta, que fica fora da LUT (depende do lugar no clipe). */
  vinheta: number;
  /** A parte do clipe que aparece numa cortina; sem ela, o clipe inteiro. */
  revelado?: Revelado;
  mascaraDaTransicao?: { tipo: MascaraDeTransicao; limiar: number } | null;
  /** Clipes de texto já trazem a imagem; os de vídeo pegam o quadro da fonte deles. */
  imagem?: ImageBitmap;
  /** As letras do texto que aparecem; sem ela, todas. */
  mascara?: Cortes;
  /** Sigma do desfoque, em frações da altura do clipe. */
  desfoque?: number;
  /** O peso das cópias ampliadas da transição zoom com desfoque (zoomNaTransicao). */
  zoomDaTransicao?: number;
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
 * sai e o que entra). Se os dois são da mesma mídia, o que entra ganha uma chave própria. Com `som`, valem
 * só as janelas das transições que misturam o som (janelasDoSom): nas outras, cada clipe soa só entre o
 * começo e o fim dele.
 */
export function itensNoTempo(faixas: Faixa[], midias: ReadonlyMap<string, Midia>, tempo: Tick, quadroDasTransicoes?: Tick, som = false): ItemDaPrevia[] {
  const itens: ItemDaPrevia[] = [];
  for (const faixa of faixas) {
    const chaves = new Set<string>();
    const janelas =
      quadroDasTransicoes && faixa.tipo === "principal" ? (som ? janelasDoSom : janelasDaPrincipal)(faixa.clipes, quadroDasTransicoes) : null;
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
      // O clipe ao contrário lê o vídeo invertido, com a entrada espelhada (lib/previa/arquivos.ts)
      itens.push({ chave, clipe: clipeNaFonte(clipe, midia, som), faixa, midia, ativo, efeitos: efeitos?.length ? efeitos : undefined });
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
  // A LUT importada só entra quando a tabela já chegou da API (lib/projeto/lutImportada.ts); até lá, a prévia
  // mostra sem ela, e a exportação no navegador espera (pendencias.ts)
  const doClipe = clipe.cor?.lut && clipe.cor.lut.intensidade > 0 ? clipe.cor.lut : null;
  const tabela = doClipe ? lutGuardada(doClipe.id) : null;
  const importada = doClipe && tabela ? { lut: tabela, intensidade: doClipe.intensidade } : null;
  if (corNeutra(semVinheta) && !curvas && !hsl && !importada) return { lut: null, vinheta };
  const chave = JSON.stringify([semVinheta, curvas, hsl, importada ? [doClipe!.id, doClipe!.intensidade] : null]);
  let lut = luts.get(chave);
  if (!lut) {
    lut = { chave, dados: lutDaCor(semVinheta, curvas, hsl, importada) };
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
/**
 * O ajuste do editor de imagem pronto para o compositor: a tabela de 256 tons ou a LUT 3D da função, guardadas pela
 * chave (a mesma camada redesenha sem refazer a conta). A Pesquisa de cores espera a tabela do .cube chegar.
 */
const ajustesProntos = new Map<string, Pick<CamadaNaTela, "lut" | "tabela" | "vinheta">>();
function corDoAjuste(ajuste: AjusteDaImagem): Pick<CamadaNaTela, "lut" | "tabela" | "vinheta"> {
  const daPesquisa = ajuste.tipo === "pesquisa" && ajuste.lut ? lutGuardada(ajuste.lut.id) : null;
  const chave = JSON.stringify([ajuste, Boolean(daPesquisa)]);
  const guardado = ajustesProntos.get(chave);
  if (guardado) return guardado;
  const compilado = compilarAjuste(ajuste, daPesquisa);
  const pronto =
    compilado.tipo === "tabela"
      ? { lut: null, tabela: compilado.tabela, vinheta: 0 }
      : compilado.tipo === "funcao"
        ? { lut: { chave, dados: lutDaFuncao(compilado.funcao) }, tabela: null, vinheta: 0 }
        : { lut: null, tabela: null, vinheta: 0 };
  if (ajustesProntos.size > 40) ajustesProntos.clear();
  ajustesProntos.set(chave, pronto);
  return pronto;
}

function camadaDeAjuste(clipe: Clipe, faixa: Faixa, tempo: Tick, quadro: Tamanho): CamadaNaTela {
  const opacidade = transformacaoAnimada(clipe, tempo).opacidade;
  const caixa = { cx: quadro.largura / 2, cy: quadro.altura / 2, largura: quadro.largura, altura: quadro.altura, rotacao: 0, opacidade };
  const cor = clipe.ajuste_imagem ? corDoAjuste(clipe.ajuste_imagem) : corDoClipe(clipe);
  return { chave: `ajuste:${clipe.id}`, clipe, faixa, recorte: RECORTE_INTEIRO, caixa, caixaBase: caixa, ...cor, segundos: 0 };
}

const RECORTE_INTEIRO: Recorte = { x: 0, y: 0, largura: 1, altura: 1 };

/** Os textos que precisam de imagem: por id do clipe, e o destaque da fala com ":destaque". */
/**
 * Os textos que a prévia precisa desenhar. Com `janela`, só os que tocam nela: com centenas de legendas, pedir a
 * imagem de todas de uma vez fazia centenas de pedidos e segurava centenas de MB de bitmaps.
 */
export function textosParaImagens(projeto: Projeto, janela?: { de: Tick; ate: Tick }): { id: string; texto: Texto }[] {
  return projeto.faixas
    .filter((faixa) => faixaDeTexto(faixa.tipo) && !faixa.oculta)
    .flatMap((faixa) =>
      faixa.clipes.flatMap((clipe) =>
        !clipe.texto || (janela && (fimDoClipe(clipe) <= janela.de || clipe.inicio >= janela.ate))
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
      mascaraDaTransicao: item.efeitos?.length ? mascaraNaTransicao(item.efeitos, tempo) : null,
      desfoque: item.efeitos?.length ? desfoqueNaTransicao(item.efeitos, tempo) : 0,
      zoomDaTransicao: item.efeitos?.length ? zoomNaTransicao(item.efeitos, tempo) : 0,
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
  // De baixo para cima, na ordem da árvore (a lista do projeto pode ter as de dentro de uma pasta em outro lugar)
  for (const faixa of [...faixasEmOrdem(projeto)].reverse()) {
    if (faixa.tipo === "principal" || !camadaVisivel(projeto, faixa)) continue;
    const clipe = faixa.clipes[0];
    // A pasta não desenha nada sozinha: ela entra pela árvore (camadasEmArvore)
    if (!clipe || clipe.pasta) continue;
    if (clipe.ajuste) {
      camadas.push(camadaDeAjuste(clipe, faixa, 0, quadro));
      continue;
    }
    if (clipe.camada_de_preenchimento) {
      // Cobre o quadro como a de ajuste; quem desenha pede o preenchimento no tamanho da tela
      camadas.push({ ...camadaDeAjuste(clipe, faixa, 0, quadro), chave: `preenchimento:${clipe.id}` });
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
    if (clipe.texto_rico) {
      // O texto desenhado no navegador: como a forma, a caixa dele faz o papel do tamanho da mídia
      const caixa = caixaDoClipe(clipe.transformacao, clipe.recorte, clipe.texto_rico.caixa, quadro);
      camadas.push({ ...comum, chave: `textoRico:${clipe.id}`, caixa, caixaBase: caixa });
      continue;
    }
    if (clipe.vetor) {
      // A forma: a caixa dela faz o papel do tamanho da mídia, e quem desenha pede o desenho no tamanho da tela
      const caixa = caixaDoClipe(clipe.transformacao, clipe.recorte, clipe.vetor.caixa, quadro);
      camadas.push({ ...comum, chave: `vetor:${clipe.id}`, caixa, caixaBase: caixa });
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

const CORES_SOLIDAS = new Map<string, HTMLCanvasElement>();
/** Um quadradinho de uma cor só (o fundo de uma prancheta), guardado por cor. */
function corSolida(cor: string): HTMLCanvasElement {
  let canvas = CORES_SOLIDAS.get(cor);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = canvas.height = 4;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = cor;
    ctx.fillRect(0, 0, 4, 4);
    CORES_SOLIDAS.set(cor, canvas);
  }
  return canvas;
}

/**
 * As camadas prontas para o compositor (por faixa) na ordem da árvore do projeto de imagem, de baixo para cima: as
 * pastas viram camadas com as de dentro (`pasta`) e as recortadas ficam presas à base delas (`recortadas`). As que
 * não estão em `prontas` (ainda carregando, escondidas) ficam de fora.
 */
export function camadasEmArvore(projeto: Projeto, prontas: ReadonlyMap<string, Camada>, quadro: Tamanho): Camada[] {
  const caixaDoQuadro = (opacidade: number) => ({ cx: quadro.largura / 2, cy: quadro.altura / 2, largura: quadro.largura, altura: quadro.altura, rotacao: 0, opacidade });
  const montar = (nos: NoDaCamada[]): Camada[] =>
    [...nos].reverse().flatMap((no): Camada[] => {
      if (no.faixa.oculta) return [];
      let camada: Camada | undefined;
      if (no.clipe.pasta && no.clipe.prancheta) {
        // A prancheta: o fundo dela embaixo das de dentro, e tudo recortado no retângulo dela
        const prancheta = no.clipe.prancheta;
        const documento = projeto.tamanho ?? quadro;
        const largura = (prancheta.largura / documento.largura) * quadro.largura;
        const altura = (prancheta.altura / documento.altura) * quadro.altura;
        const cx = (0.5 + no.clipe.transformacao.x) * quadro.largura;
        const cy = (0.5 + no.clipe.transformacao.y) * quadro.altura;
        const fundo: Camada[] = prancheta.fundo.transparente ? [] : [{ fonte: corSolida(prancheta.fundo.cor), recorte: { x: 0, y: 0, largura: 1, altura: 1 }, caixa: { cx, cy, largura, altura, rotacao: 0, opacidade: 1 } }];
        camada = {
          fonte: FUNDO,
          recorte: { x: 0, y: 0, largura: 1, altura: 1 },
          caixa: caixaDoQuadro(no.clipe.transformacao.opacidade),
          mesclagem: no.clipe.mesclagem ?? "normal",
          mascaraDeForma: { forma: "retangulo", x: cx / quadro.largura, y: cy / quadro.altura, largura: largura / quadro.largura, altura: altura / quadro.altura, suavidade: 0, inverter: false },
          pasta: { filhos: [...fundo, ...montar(no.filhos)], passagem: false },
        };
      } else if (no.clipe.pasta) {
        const mesclagem = mesclagemDaPasta(no.clipe);
        camada = {
          fonte: FUNDO,
          recorte: { x: 0, y: 0, largura: 1, altura: 1 },
          caixa: caixaDoQuadro(no.clipe.transformacao.opacidade),
          mesclagem: mesclagem === "passagem" ? "normal" : mesclagem,
          mascaraDeForma: no.clipe.mascara,
          pasta: { filhos: montar(no.filhos), passagem: mesclagem === "passagem" },
        };
      } else camada = prontas.get(no.faixa.id);
      // Sem a base (escondida ou carregando), as presas a ela também não aparecem, como nos editores de imagem
      if (!camada) return [];
      const recortadas = montar(no.recortadas);
      return [recortadas.length ? { ...camada, recortadas } : camada];
    });
  return montar(arvoreDaImagem(projeto));
}

/** A camada no formato do compositor, com o quadro da fonte e a máscara do fundo deste instante. */
export function camadaDoCompositor(
  camada: CamadaNaTela,
  fonte: TexImageSource | typeof FUNDO,
  mascaraDoFundo: TexImageSource | null,
  /**
   * A máscara de camada (editor de imagem): a imagem dela e o quadro em que a caixa da camada foi medida. Sem `matriz`,
   * ela é a de pixels do clipe (a matriz, a densidade e a difusão vêm dela); com, é a vetorial ou as duas juntas
   * (lib/previa/mascaraCombinada.ts).
   */
  mascaraDaCamada?: { fonte: TexImageSource; quadro: Tamanho; matriz?: [number, number, number, number, number, number]; densidade?: number; difusao?: number } | null,
  /** O documento (editor de imagem): a luz global dos efeitos e o fundo (null: transparente), para o vazamento. */
  documento?: { luz?: LuzGlobal | null; fundo?: string | null; tamanho?: { largura: number; altura: number } } | null,
  /** A máscara dos filtros inteligentes (a imagem dela e o quadro em que a caixa foi medida), como a da camada. */
  mascaraDosFiltros?: { fonte: TexImageSource; quadro: Tamanho } | null,
  /** Os canais alfa que os filtros leem (o desfoque de lente), pelo id, com a versão. */
  canaisDosFiltros?: Record<string, { fonte: TexImageSource; versao: string }>,
): Camada {
  const mascara = camada.clipe.mascara_pixels;
  // O estilo de camada do editor de imagem fica no lugar do contorno e da sombra de antes
  const efeitos = camada.clipe.ajuste ? [] : efeitosLigados(camada.clipe.estilo_camada);
  const opcoes = camada.clipe.ajuste ? null : camada.clipe.estilo_camada;
  const vazamento = Boolean(opcoes?.vazamento && opcoes.vazamento !== "nenhum");
  const comEstilos = !efeitos.length && temSilhueta(camada.clipe) && !camada.clipe.ajuste;
  const preenchimento = Math.min(1, Math.max(0, camada.clipe.preenchimento ?? 1));
  return {
    fonte,
    recorte: camada.recorte,
    // A cópia do canvas da camada de ajuste vem com as linhas de baixo para cima
    virar: fonte === FUNDO ? { horizontal: false, vertical: true } : camada.clipe.virar,
    cantos: camada.clipe.cantos,
    mascaraDeForma: camada.clipe.mascara,
    mascaraDaCamada: mascaraDaCamada?.matriz
      ? { fonte: mascaraDaCamada.fonte, matriz: mascaraDaCamada.matriz, densidade: mascaraDaCamada.densidade ?? 1, difusao: mascaraDaCamada.difusao ?? 0 }
      : mascara && mascara.ligada && mascaraDaCamada
        ? { fonte: mascaraDaCamada.fonte, matriz: matrizEmUso(mascara, camada.caixa, mascaraDaCamada.quadro), densidade: mascara.densidade, difusao: mascara.difusao }
        : null,
    // O preenchimento (só na imagem) esconde a camada sem os estilos; sem estilos, é mais uma opacidade
    silhueta: comEstilos ? { contorno: camada.clipe.contorno, sombra: camada.clipe.sombra, preenchimento } : undefined,
    estiloDeCamada:
      efeitos.length || vazamento
        ? {
            efeitos,
            escala: opcoes?.escala ?? 1,
            luz: documento?.luz ?? LUZ_GLOBAL_PADRAO,
            preenchimento,
            internosComoGrupo: opcoes?.internos_como_grupo,
            mascaraEscondeEfeitos: opcoes?.mascara_esconde_efeitos,
            vazamento,
            fundo: documento?.fundo ?? null,
          }
        : undefined,
    mesclarSe: opcoes?.mesclar_se ? { canal: ["cinza", "vermelho", "verde", "azul"].indexOf(opcoes.mesclar_se.canal), esta: opcoes.mesclar_se.esta.map((v) => v / 255) as [number, number, number, number], abaixo: opcoes.mesclar_se.abaixo.map((v) => v / 255) as [number, number, number, number] } : null,
    canais: opcoes?.canais ? [opcoes.canais.vermelho, opcoes.canais.verde, opcoes.canais.azul] : null,
    caixa: comEstilos || efeitos.length || vazamento || preenchimento >= 1 ? camada.caixa : { ...camada.caixa, opacidade: camada.caixa.opacidade * preenchimento },
    lut: camada.lut,
    tabela: camada.tabela,
    vinheta: camada.vinheta,
    revelado: camada.revelado,
    mascaraDaTransicao: camada.mascaraDaTransicao,
    mascara: camada.mascara,
    desfoque: (camada.desfoque ?? 0) + desfoqueDoEfeito(camada.clipe.efeito),
    mesclagem: camada.clipe.mesclagem,
    brilho: brilhoDoEfeito(camada.clipe.efeito),
    contrasteLocal: contrasteLocalDoEfeito(camada.clipe.efeito),
    lente: distorcaoDoEfeito(camada.clipe.efeito),
    borrao: borraoDoEfeito(camada.clipe.efeito),
    zoomDaTransicao: camada.zoomDaTransicao,
    celulas: celulasDoPixelizar(camada.clipe.efeito, camada.caixa.largura, camada.caixa.altura),
    desvio: camada.desvio,
    linhas: linhasDoEfeito(camada.clipe.efeito),
    luz: camada.luz,
    grao: camada.grao,
    chroma: camada.clipe.texto ? null : camada.clipe.chroma,
    chaveLuma: camada.clipe.texto ? null : camada.clipe.chave_luma,
    mascaraDoFundo,
    filtros: filtrosDaCamada(camada, documento?.tamanho, mascaraDosFiltros, canaisDosFiltros),
  };
}

/** A chave da profundidade da foto no registro dos mapas dos filtros (os outros são os ids dos canais). */
export const CHAVE_DA_PROFUNDIDADE = "#profundidade";

/** Os filtros inteligentes que valem, com a máscara deles levada à caixa da camada (como a máscara da camada). */
function filtrosDaCamada(
  camada: CamadaNaTela,
  documento: { largura: number; altura: number } | undefined,
  mascara: { fonte: TexImageSource; quadro: Tamanho } | null | undefined,
  canais: Record<string, { fonte: TexImageSource; versao: string }> | undefined,
): Camada["filtros"] {
  const pilha = camada.clipe.filtros_inteligentes;
  const lista = filtrosQueValem(pilha);
  if (!lista.length || !documento) return null;
  const daMascara = pilha?.mascara?.ligada && mascara ? pilha.mascara : null;
  return {
    lista,
    documento,
    mascara: daMascara && mascara ? { fonte: mascara.fonte, matriz: matrizEmUso(daMascara, camada.caixa, mascara.quadro), densidade: daMascara.densidade, difusao: daMascara.difusao } : null,
    // A profundidade da foto vem no mesmo registro dos canais, pela chave "#profundidade"
    canais: canais ? Object.fromEntries(Object.entries(canais).filter(([id]) => id !== CHAVE_DA_PROFUNDIDADE)) : undefined,
    profundidade: canais?.[CHAVE_DA_PROFUNDIDADE]?.fonte ?? null,
  };
}
