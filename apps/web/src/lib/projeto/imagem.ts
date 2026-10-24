// O projeto de imagem (editor de imagem): o mesmo documento do vídeo, em que cada camada é uma faixa com um
// clipe só, no começo. Assim os comandos do clipe (posição, cor, efeito, cantos, texto...) valem sem mudar nada,
// e o desfazer, o salvamento e o conflito são os do editor de vídeo. A faixa principal fica vazia, embaixo de
// tudo (a API exige uma). As camadas ficam em qualquer ordem: um texto pode ficar embaixo de uma foto.
import { segundosParaTicks } from "../tempo.ts";
import { type Contexto, ErroEdicao } from "./edicao.ts";
import { COR_PADRAO } from "./cor.ts";
import { caixaDoClipe, type Tamanho } from "./geometria.ts";
import { ancestrais, comDescendentes, paiDaCamada } from "./arvore.ts";
import { acharClipe, type Clipe, type Mesclagem, type CorDoRotulo, type Faixa, type Prancheta, type Projeto, RECORTE_PADRAO, type Transformacao, TRANSFORMACAO_PADRAO, type TravasDaCamada, type Virar } from "./modelo.ts";
import type { MascaraDePixels } from "./mascaraDePixels.ts";
import { type CamadaPronta, encaixarNaCaixa } from "./modelosDeImagem.ts";
import type { Texto } from "./texto.ts";
import type { MascaraVetorial } from "../vetor/mascaraVetorial.ts";
import { nomeDoTexto, type TextoRico } from "../texto/modelo.ts";
import { type EstiloDeCamada, estiloFazAlgo, type LuzGlobal } from "../imagem/estiloDeCamada.ts";
import type { CamadaDePreenchimento } from "../imagem/camadaDePreenchimento.ts";
import type { AjusteDaImagem } from "../imagem/ajustes.ts";
import { caixaDosCaminhos, deslocar, margemDoTraco, type CamadaVetorial, type OperacaoDoCaminho, type Subcaminho } from "../vetor/modelo.ts";

/** Quanto dura o clipe de cada camada: a imagem não tem tempo, mas a linha do tempo pede uma duração. */
export const DURACAO_DA_CAMADA = segundosParaTicks(5);

/** A escala com que entra uma imagem com transparência (logo, forma). */
export const ESCALA_DO_RECORTADO = 0.5;

export type TamanhoDaImagem = { largura: number; altura: number; resolucao?: number };

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

/** O tamanho da fonte de uma camada: o da mídia (por quem chama) ou a caixa da forma vetorial. */
const tamanhoDaFonte = (clipe: Clipe, tamanhos: Record<string, Tamanho>): Tamanho | undefined => clipe.vetor?.caixa ?? clipe.texto_rico?.caixa ?? (clipe.midia_id ? tamanhos[clipe.midia_id] : undefined);

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

/**
 * Uma faixa nova logo acima de `acima` (a camada escolhida no painel), na mesma pasta dela, como nos editores
 * profissionais; sem ela, por cima de todas.
 */
function porNoTopo(projeto: Projeto, faixa: Faixa, acima?: string | null): Projeto {
  const indice = acima ? projeto.faixas.findIndex((item) => item.id === acima && item.tipo !== "principal") : -1;
  if (indice < 0) return { ...projeto, faixas: [faixa, ...projeto.faixas] };
  const referencia = projeto.faixas[indice];
  // Acima de uma pasta, a camada nova fica fora dela (ao lado), como lá
  const nova = { ...faixa, pai: paiDaCamada(projeto, referencia) };
  const faixas = [...projeto.faixas];
  faixas.splice(indice, 0, nova);
  return { ...projeto, faixas };
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

/** `transformacao`: onde a camada entra (a forma desenhada com a ferramenta Forma), no lugar do padrão. */
export function adicionarCamadaDeMidia(projeto: Projeto, ctx: Contexto, midiaId: string, transformacao?: Partial<Transformacao>, acima?: string | null): { projeto: Projeto; clipeId: string } {
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
  if (transformacao) clipe.transformacao = { ...clipe.transformacao, ...transformacao };
  return {
    projeto: porNoTopo(projeto, faixaNova(ctx, "video", clipe), acima),
    clipeId: clipe.id,
  };
}

/**
 * Uma camada de pixels nova (a mídia já criada, vazia, do tamanho da imagem) acima da escolhida, cobrindo o quadro.
 * Não depende da mídia estar na biblioteca da tela: a pessoa começa a pintar logo depois de criar.
 */
export function adicionarCamadaDePixels(projeto: Projeto, ctx: Contexto, midiaId: string, nome: string, acima?: string | null, versao = 0): { projeto: Projeto; clipeId: string } {
  const clipe = clipeDaCamada(ctx.novoId(), { midia_id: midiaId, pixels: { versao } });
  return { projeto: porNoTopo(projeto, { ...faixaNova(ctx, "video", clipe), nome }, acima), clipeId: clipe.id };
}

/**
 * Camada › Novo › Fundo a partir da camada (ligar): a camada de pixels vai para baixo de todas, na raiz, com a
 * transparência e a posição travadas. Camada a partir do fundo (desligar): vira uma camada comum, sem as travas.
 */
export function camadaDeFundo(projeto: Projeto, faixaId: string, ligar: boolean): Projeto {
  const faixa = projeto.faixas.find((item) => item.id === faixaId);
  if (!faixa) throw new ErroEdicao("Essa camada não existe mais.");
  if (!ligar) {
    const comum: Faixa = { ...faixa, fundo: false, travas: null, nome: faixa.nome === "Fundo" ? "Camada 0" : faixa.nome };
    return { ...projeto, faixas: projeto.faixas.map((item) => (item.id === faixaId ? comum : item)) };
  }
  if (!faixa.clipes[0]?.pixels) throw new ErroEdicao("Só uma camada de pixels vira o fundo.");
  if (projeto.faixas.some((item) => item.fundo && item.id !== faixaId)) throw new ErroEdicao("A imagem já tem uma camada de fundo.");
  const fundo: Faixa = { ...faixa, pai: null, recortada: false, fundo: true, travas: { transparencia: true, posicao: true }, nome: "Fundo" };
  const resto = projeto.faixas.filter((item) => item.id !== faixaId);
  const principal = resto.findIndex((item) => item.tipo === "principal");
  resto.splice(principal < 0 ? resto.length : principal, 0, fundo);
  return { ...projeto, faixas: resto };
}

/** O clipe da camada, com a mudança; travada, recusa. */
function mudarClipeDaCamada(projeto: Projeto, clipeId: string, mudar: (clipe: Clipe) => Clipe): Projeto {
  let achou = false;
  const faixas = projeto.faixas.map((faixa) => {
    if (!faixa.clipes.some((clipe) => clipe.id === clipeId)) return faixa;
    if (faixa.travada) throw new ErroEdicao("A camada está travada. Destrave o cadeado para mexer nela.");
    achou = true;
    return { ...faixa, clipes: faixa.clipes.map((clipe) => (clipe.id === clipeId ? mudar(clipe) : clipe)) };
  });
  if (!achou) throw new ErroEdicao("Essa camada não existe mais.");
  return { ...projeto, faixas };
}

/** Pixels da imagem por unidade da caixa da forma (com a escala da camada). */
function pixelsPorUnidade(caixa: Tamanho, escala: number, quadro: Tamanho): number {
  return Math.min(quadro.largura / caixa.largura, quadro.altura / caixa.altura) * escala;
}

/** Uma forma vetorial nova acima da escolhida, com 1 unidade da caixa = 1 pixel da imagem e o meio em `centro`. */
export function adicionarCamadaVetorial(projeto: Projeto, ctx: Contexto, vetor: CamadaVetorial, centro: { x: number; y: number }, nome: string, acima?: string | null): { projeto: Projeto; clipeId: string } {
  const quadro = tamanhoDaImagem(projeto);
  const escala = 1 / pixelsPorUnidade(vetor.caixa, 1, quadro);
  const transformacao = { ...TRANSFORMACAO_PADRAO, x: (centro.x - quadro.largura / 2) / quadro.largura, y: (centro.y - quadro.altura / 2) / quadro.altura, escala };
  const clipe = clipeDaCamada(ctx.novoId(), { vetor, transformacao });
  return { projeto: porNoTopo(projeto, { ...faixaNova(ctx, "video", clipe), nome }, acima), clipeId: clipe.id };
}

/**
 * Troca a forma de uma camada sem tirá-la do lugar: o ponto (x, y) da forma antiga vira (x + d.x, y + d.y) na nova, e
 * fica no mesmo pixel da imagem; a escala muda para 1 unidade continuar valendo os mesmos pixels. Sem `d`, o canto de
 * cima à esquerda dos caminhos (sem a margem do traço) fica onde estava.
 */
/**
 * A transformação da camada quando a caixa da fonte dela (a forma, o texto) troca de tamanho: o ponto (x, y) da caixa
 * antiga vira (x + d.x, y + d.y) na nova e fica no mesmo pixel da imagem; a escala muda para 1 unidade continuar
 * valendo os mesmos pixels.
 */
function transformacaoNaCaixaNova(clipe: Clipe, antiga: Tamanho, nova: Tamanho, d: { x: number; y: number }, quadro: Tamanho): Transformacao {
  const t = clipe.transformacao;
  const k = pixelsPorUnidade(antiga, t.escala, quadro);
  // O meio novo: C' = C + R·F·k·(S'/2 − d − S/2), com F a virada (o espelho vem antes do giro)
  let ux = (nova.largura / 2 - d.x - antiga.largura / 2) * k;
  let uy = (nova.altura / 2 - d.y - antiga.altura / 2) * k;
  if (clipe.virar?.horizontal) ux = -ux;
  if (clipe.virar?.vertical) uy = -uy;
  const r = (t.rotacao * Math.PI) / 180;
  const cx = quadro.largura / 2 + t.x * quadro.largura + ux * Math.cos(r) - uy * Math.sin(r);
  const cy = quadro.altura / 2 + t.y * quadro.altura + ux * Math.sin(r) + uy * Math.cos(r);
  const escala = k / pixelsPorUnidade(nova, 1, quadro);
  return { ...t, x: (cx - quadro.largura / 2) / quadro.largura, y: (cy - quadro.altura / 2) / quadro.altura, escala };
}

export function mudarVetor(projeto: Projeto, clipeId: string, vetor: CamadaVetorial, d?: { x: number; y: number }): Projeto {
  const quadro = tamanhoDaImagem(projeto);
  return mudarClipeDaCamada(projeto, clipeId, (clipe) => {
    const antigo = clipe.vetor;
    if (!antigo) throw new ErroEdicao("Esta camada não é uma forma.");
    const deslocamento = d ?? (() => {
      const a = caixaDosCaminhos(antigo.subcaminhos);
      const b = caixaDosCaminhos(vetor.subcaminhos);
      return a && b ? { x: b.x0 - a.x0, y: b.y0 - a.y0 } : { x: 0, y: 0 };
    })();
    return { ...clipe, vetor, recorte: { ...RECORTE_PADRAO }, transformacao: transformacaoNaCaixaNova(clipe, antigo.caixa, vetor.caixa, deslocamento, quadro) };
  });
}

/**
 * Um texto novo (já medido: a caixa e a origem) com a origem em `ponto` (pixels da imagem; no de parágrafo, o canto da
 * caixa), uma unidade = um pixel, acima da camada escolhida.
 */
export function adicionarTextoRico(projeto: Projeto, ctx: Contexto, texto: TextoRico, ponto: { x: number; y: number }, nome: string, acima?: string | null, id?: string): { projeto: Projeto; clipeId: string } {
  const quadro = tamanhoDaImagem(projeto);
  const centro = { x: ponto.x - texto.origem.x + texto.caixa.largura / 2, y: ponto.y - texto.origem.y + texto.caixa.altura / 2 };
  const escala = 1 / pixelsPorUnidade(texto.caixa, 1, quadro);
  const transformacao = { ...TRANSFORMACAO_PADRAO, x: (centro.x - quadro.largura / 2) / quadro.largura, y: (centro.y - quadro.altura / 2) / quadro.altura, escala };
  const clipe = clipeDaCamada(id ?? ctx.novoId(), { texto_rico: texto, transformacao });
  return { projeto: porNoTopo(projeto, { ...faixaNova(ctx, "video", clipe), nome }, acima), clipeId: clipe.id };
}

/**
 * O estilo de camada das camadas (null tira), e a luz global do documento quando um efeito com "usar a luz global"
 * mudou o ângulo ou a altitude (a luz vale para todos os efeitos que a usam).
 */
export function definirEstiloDeCamada(
  projeto: Projeto,
  clipeIds: string[],
  estilo: EstiloDeCamada | null,
  luz?: LuzGlobal,
  /** As opções de mesclagem gerais (o modo, a opacidade e o preenchimento da camada), da mesma janela. */
  camada?: { mesclagem?: Mesclagem; opacidade?: number; preenchimento?: number },
): Projeto {
  let resultado = projeto;
  for (const clipeId of clipeIds) {
    resultado = mudarClipeDaCamada(resultado, clipeId, (clipe) => {
      if (clipe.pasta || clipe.ajuste) throw new ErroEdicao("Pastas e camadas de ajuste não têm estilo de camada.");
      const novo: Clipe = { ...clipe, estilo_camada: estiloFazAlgo(estilo) ? estilo : null };
      if (camada?.mesclagem) novo.mesclagem = camada.mesclagem;
      if (camada?.opacidade !== undefined) novo.transformacao = { ...novo.transformacao, opacidade: Math.min(1, Math.max(0, camada.opacidade)) };
      if (camada?.preenchimento !== undefined) {
        if (camada.preenchimento >= 1) delete novo.preenchimento;
        else novo.preenchimento = Math.max(0, camada.preenchimento);
      }
      return novo;
    });
  }
  return luz ? { ...resultado, luz_global: luz } : resultado;
}

/** Camada › Estilo de camada › Ocultar (ou Mostrar) todos os efeitos: em todas as camadas com estilo. */
export function mostrarEfeitos(projeto: Projeto, visiveis: boolean): Projeto {
  return { ...projeto, faixas: projeto.faixas.map((faixa) => ({ ...faixa, clipes: faixa.clipes.map((clipe) => (clipe.estilo_camada ? { ...clipe, estilo_camada: { ...clipe.estilo_camada, ligado: visiveis } } : clipe)) })) };
}

/** Camada › Estilo de camada › Dimensionar efeitos: a escala dos efeitos das camadas vezes o fator (de 1% a 1000%). */
export function dimensionarEfeitos(projeto: Projeto, clipeIds: string[], fator: number): Projeto {
  let resultado = projeto;
  for (const clipeId of clipeIds) {
    resultado = mudarClipeDaCamada(resultado, clipeId, (clipe) => (clipe.estilo_camada ? { ...clipe, estilo_camada: { ...clipe.estilo_camada, escala: Math.min(10, Math.max(0.01, (clipe.estilo_camada.escala ?? 1) * fator)) } } : clipe));
  }
  return resultado;
}

/** Vários textos trocados de uma vez (Substituir tudo, Atualizar todas as camadas de texto): um passo só. */
export function mudarTextosRicos(projeto: Projeto, mudancas: { clipeId: string; texto: TextoRico }[]): Projeto {
  return mudancas.reduce((atual, { clipeId, texto }) => mudarTextoRico(atual, clipeId, texto), projeto);
}

/**
 * Texto › Converter em forma: uma camada de forma com os contornos das letras (já em pixels da imagem, na cor do texto)
 * entra no lugar do texto, com o nome, a opacidade, o preenchimento e a mesclagem dele.
 */
export function textoEmForma(projeto: Projeto, ctx: Contexto, clipeId: string, vetor: CamadaVetorial, centro: { x: number; y: number }): { projeto: Projeto; clipeId: string } {
  const achado = acharClipe(projeto, clipeId);
  if (!achado?.clipe.texto_rico) throw new ErroEdicao("Escolha uma camada de texto.");
  const { faixa, clipe } = achado;
  const resultado = adicionarCamadaVetorial(projeto, ctx, vetor, centro, faixa.nome ?? "Forma", faixa.id);
  const comOsAjustes = mudarClipeDaCamada(resultado.projeto, resultado.clipeId, (novo) => ({
    ...novo,
    transformacao: { ...novo.transformacao, opacidade: clipe.transformacao.opacidade },
    ...(clipe.mesclagem ? { mesclagem: clipe.mesclagem } : {}),
    ...(clipe.preenchimento !== undefined ? { preenchimento: clipe.preenchimento } : {}),
  }));
  return { projeto: apagarCamada(comOsAjustes, faixa.id), clipeId: resultado.clipeId };
}

/**
 * Troca o texto (já medido): a origem dele (o começo da primeira linha de base, ou o canto da caixa) fica no lugar, ou o
 * ponto que `deslocamento` diz (o ponto da caixa antiga vira ele mais o deslocamento na nova: a conversão de modo).
 */
export function mudarTextoRico(projeto: Projeto, clipeId: string, texto: TextoRico, deslocamento?: { x: number; y: number }): Projeto {
  const quadro = tamanhoDaImagem(projeto);
  const anterior = acharClipe(projeto, clipeId)?.clipe.texto_rico;
  const mudado = mudarClipeDaCamada(projeto, clipeId, (clipe) => {
    const antigo = clipe.texto_rico;
    if (!antigo) throw new ErroEdicao("Esta camada não é um texto.");
    const d = deslocamento ?? { x: texto.origem.x - antigo.origem.x, y: texto.origem.y - antigo.origem.y };
    return { ...clipe, texto_rico: texto, recorte: { ...RECORTE_PADRAO }, transformacao: transformacaoNaCaixaNova(clipe, antigo.caixa, texto.caixa, d, quadro) };
  });
  // O nome que veio do texto acompanha o texto (o que a pessoa deu fica)
  const nomeAntigo = anterior ? nomeDoTexto(anterior) : null;
  return { ...mudado, faixas: mudado.faixas.map((faixa) => (faixa.clipes[0]?.id === clipeId && faixa.nome === nomeAntigo ? { ...faixa, nome: nomeDoTexto(texto) } : faixa)) };
}

/** Um ponto da imagem nas unidades da caixa da forma da camada (a volta do caminho da camada até a imagem). */
export function pontoNaForma(clipe: Clipe, ponto: { x: number; y: number }, quadro: Tamanho): { x: number; y: number } {
  const vetor = clipe.vetor!;
  const t = clipe.transformacao;
  const k = pixelsPorUnidade(vetor.caixa, t.escala, quadro);
  const dx = ponto.x - (quadro.largura / 2 + t.x * quadro.largura);
  const dy = ponto.y - (quadro.altura / 2 + t.y * quadro.altura);
  const r = (-t.rotacao * Math.PI) / 180;
  let ux = (dx * Math.cos(r) - dy * Math.sin(r)) / k;
  let uy = (dx * Math.sin(r) + dy * Math.cos(r)) / k;
  if (clipe.virar?.horizontal) ux = -ux;
  if (clipe.virar?.vertical) uy = -uy;
  return { x: ux + vetor.caixa.largura / 2, y: uy + vetor.caixa.altura / 2 };
}

/** Um ponto das unidades da caixa da forma na imagem (o caminho da camada até a imagem). */
export function pontoDaForma(clipe: Clipe, ponto: { x: number; y: number }, quadro: Tamanho): { x: number; y: number } {
  // A caixa da forma ou a do texto do navegador (as duas valem uma unidade por pixel na escala 1)
  const caixa = clipe.vetor?.caixa ?? clipe.texto_rico!.caixa;
  const t = clipe.transformacao;
  const k = pixelsPorUnidade(caixa, t.escala, quadro);
  let ux = (ponto.x - caixa.largura / 2) * k;
  let uy = (ponto.y - caixa.altura / 2) * k;
  if (clipe.virar?.horizontal) ux = -ux;
  if (clipe.virar?.vertical) uy = -uy;
  const r = (t.rotacao * Math.PI) / 180;
  return { x: quadro.largura / 2 + t.x * quadro.largura + ux * Math.cos(r) - uy * Math.sin(r), y: quadro.altura / 2 + t.y * quadro.altura + ux * Math.sin(r) + uy * Math.cos(r) };
}

/** Os pontos (e as alças) de cada caminho levados por `f`. */
function levarCaminhos(caminhos: Subcaminho[], f: (p: { x: number; y: number }) => { x: number; y: number }): Subcaminho[] {
  return caminhos.map((sub) => ({
    ...sub,
    nos: sub.nos.map((no) => {
      const a = f(no);
      const e = no.ex !== undefined && no.ey !== undefined ? f({ x: no.ex, y: no.ey }) : null;
      const s = no.sx !== undefined && no.sy !== undefined ? f({ x: no.sx, y: no.sy }) : null;
      return { x: a.x, y: a.y, ...(e ? { ex: e.x, ey: e.y } : {}), ...(s ? { sx: s.x, sy: s.y } : {}) };
    }),
  }));
}

/** Os caminhos da forma da camada em pixels da imagem (para as ferramentas de caminho). */
export function caminhosDoVetorNaImagem(clipe: Clipe, quadro: Tamanho): Subcaminho[] {
  return clipe.vetor ? levarCaminhos(clipe.vetor.subcaminhos, (p) => pontoDaForma(clipe, p, quadro)) : [];
}

/**
 * Troca os caminhos da forma da camada pelos dados em pixels da imagem (a seleção direta, a caneta somando): a forma
 * deixa de ser viva e a caixa muda até caber tudo, sem tirar do lugar o que não mudou.
 */
export function trocarCaminhosDoVetor(projeto: Projeto, clipeId: string, caminhos: Subcaminho[]): Projeto {
  const quadro = tamanhoDaImagem(projeto);
  const clipe = projeto.faixas.flatMap((faixa) => faixa.clipes).find((item) => item.id === clipeId);
  if (!clipe?.vetor) throw new ErroEdicao("Esta camada não é uma forma.");
  if (!caminhos.some((sub) => sub.nos.length >= 2)) throw new ErroEdicao("A forma ficaria vazia. Para tirá-la, apague a camada.");
  return trocarCaminhosLocais(projeto, clipe, levarCaminhos(caminhos, (p) => pontoNaForma(clipe, p, quadro)));
}

/** A forma com os caminhos já nas unidades da caixa antiga: normaliza a caixa e acerta o lugar. */
function trocarCaminhosLocais(projeto: Projeto, clipe: Clipe, todos: Subcaminho[]): Projeto {
  if (!clipe.vetor) throw new ErroEdicao("Esta camada não é uma forma.");
  const caixa = caixaDosCaminhos(todos)!;
  const margem = margemDoTraco(clipe.vetor.traco, null);
  const d = { x: margem - caixa.x0, y: margem - caixa.y0 };
  const vetor: CamadaVetorial = {
    ...clipe.vetor,
    forma: null,
    margem,
    subcaminhos: deslocar(todos, d.x, d.y),
    caixa: { largura: Math.max(1, caixa.x1 - caixa.x0) + 2 * margem, altura: Math.max(1, caixa.y1 - caixa.y0) + 2 * margem },
  };
  return mudarVetor(projeto, clipe.id, vetor, d);
}

/**
 * Junta caminhos (em pixels da imagem) à forma da camada, com a operação (somar, subtrair, intersectar, excluir):
 * a forma deixa de ser viva (vira um caminho comum) e a caixa cresce até caber tudo, sem mexer no que já estava.
 */
export function juntarAoVetor(projeto: Projeto, clipeId: string, caminhos: Subcaminho[], operacao: OperacaoDoCaminho): Projeto {
  const quadro = tamanhoDaImagem(projeto);
  const clipe = projeto.faixas.flatMap((faixa) => faixa.clipes).find((item) => item.id === clipeId);
  if (!clipe?.vetor) throw new ErroEdicao("Escolha uma camada de forma para juntar a forma nova.");
  const novos = levarCaminhos(caminhos, (p) => pontoNaForma(clipe, p, quadro)).map((sub) => ({ ...sub, operacao }));
  return trocarCaminhosLocais(projeto, clipe, [...clipe.vetor.subcaminhos, ...novos]);
}

/** Põe, troca ou tira (null) a máscara vetorial. */
export function definirMascaraVetorial(projeto: Projeto, clipeId: string, mascara: MascaraVetorial | null): Projeto {
  return mudarClipeDaCamada(projeto, clipeId, (clipe) => {
    if (clipe.pasta && mascara) throw new ErroEdicao("A máscara vetorial vale para camadas, não para grupos.");
    if (!mascara) {
      const sem = { ...clipe };
      delete sem.mascara_vetorial;
      return sem;
    }
    return { ...clipe, mascara_vetorial: mascara };
  });
}

/** Põe, troca ou tira (null) a máscara de camada pintável. */
export function definirMascaraDePixels(projeto: Projeto, clipeId: string, mascara: MascaraDePixels | null): Projeto {
  return mudarClipeDaCamada(projeto, clipeId, (clipe) => {
    // A camada de ajuste também tem máscara: ela escolhe onde o ajuste vale
    if (clipe.pasta && mascara) throw new ErroEdicao("A máscara de pixels vale para camadas, não para grupos.");
    if (!mascara) {
      const sem = { ...clipe };
      delete sem.mascara_pixels;
      return sem;
    }
    return { ...clipe, mascara_pixels: mascara };
  });
}

/** Muda a máscara de camada (a versão pintada, ligar, vincular, densidade, difusão). */
export function mudarMascaraDePixels(projeto: Projeto, clipeId: string, mudanca: Partial<Omit<MascaraDePixels, "midia_id">>): Projeto {
  return mudarClipeDaCamada(projeto, clipeId, (clipe) => {
    if (!clipe.mascara_pixels) throw new ErroEdicao("A camada não tem máscara.");
    return {
      ...clipe,
      mascara_pixels: {
        ...clipe.mascara_pixels,
        ...mudanca,
        densidade: Math.min(1, Math.max(0, mudanca.densidade ?? clipe.mascara_pixels.densidade)),
        difusao: Math.min(1000, Math.max(0, mudanca.difusao ?? clipe.mascara_pixels.difusao)),
      },
    };
  });
}

/** A camada de pixels passa a mostrar outra versão do PNG (um traço novo, ou o desfazer). */
export function trocarVersaoDosPixels(projeto: Projeto, clipeId: string, versao: number): Projeto {
  let achou = false;
  const faixas = projeto.faixas.map((faixa) => {
    if (!faixa.clipes.some((clipe) => clipe.id === clipeId)) return faixa;
    if (faixa.travada) throw new ErroEdicao("A camada está travada. Destrave o cadeado para pintar.");
    return {
      ...faixa,
      clipes: faixa.clipes.map((clipe) => {
        if (clipe.id !== clipeId) return clipe;
        if (!clipe.pixels) throw new ErroEdicao("Esta camada não é de pixels.");
        achou = true;
        return { ...clipe, pixels: { versao } };
      }),
    };
  });
  if (!achou) throw new ErroEdicao("Essa camada não existe mais.");
  return { ...projeto, faixas };
}

/** Uma camada de ajuste acima da escolhida (ou de todas): muda a cor do que está embaixo dela. */
export function adicionarCamadaDeAjuste(projeto: Projeto, ctx: Contexto, acima?: string | null, ajuste?: AjusteDaImagem | null, recortada = false): { projeto: Projeto; clipeId: string } {
  const clipe = clipeDaCamada(ctx.novoId(), ajuste ? { ajuste: true, ajuste_imagem: ajuste } : { ajuste: true });
  // Presa à de baixo, o ajuste vale só para ela (Imagem › Ajustes numa camada que não é de pixels)
  const faixa = faixaNova(ctx, "video", clipe);
  return { projeto: porNoTopo(projeto, recortada ? { ...faixa, recortada: true } : faixa, acima), clipeId: clipe.id };
}

/** Camada › Nova camada de preenchimento: uma cor, um degradê ou um padrão cobrindo o documento, acima da escolhida. */
export function adicionarCamadaDePreenchimento(projeto: Projeto, ctx: Contexto, preenchimento: CamadaDePreenchimento, acima?: string | null): { projeto: Projeto; clipeId: string } {
  const clipe = clipeDaCamada(ctx.novoId(), { camada_de_preenchimento: preenchimento });
  return { projeto: porNoTopo(projeto, faixaNova(ctx, "video", clipe), acima), clipeId: clipe.id };
}

/** Muda o ajuste (níveis, curvas...) de uma camada de ajuste. */
export function mudarAjusteDaCamada(projeto: Projeto, clipeId: string, ajuste: AjusteDaImagem): Projeto {
  return mudarClipeDaCamada(projeto, clipeId, (clipe) => {
    if (!clipe.ajuste) throw new ErroEdicao("Essa camada não é de ajuste.");
    return { ...clipe, ajuste_imagem: ajuste };
  });
}

/** Muda a tinta (ou as alças do degradê) de uma camada de preenchimento. */
export function mudarCamadaDePreenchimento(projeto: Projeto, clipeId: string, preenchimento: CamadaDePreenchimento): Projeto {
  return mudarClipeDaCamada(projeto, clipeId, (clipe) => {
    if (!clipe.camada_de_preenchimento) throw new ErroEdicao("Essa camada não é de preenchimento.");
    return { ...clipe, camada_de_preenchimento: preenchimento };
  });
}

/** `transformacao`: onde o texto entra (o clique da ferramenta Texto), no lugar do meio. */
export function adicionarCamadaDeTexto(projeto: Projeto, ctx: Contexto, texto: Texto, transformacao?: Partial<Transformacao>, acima?: string | null): { projeto: Projeto; clipeId: string } {
  const clipe = clipeDaCamada(ctx.novoId(), { texto });
  if (transformacao) clipe.transformacao = { ...clipe.transformacao, ...transformacao };
  return {
    projeto: porNoTopo(projeto, faixaNova(ctx, "texto", clipe), acima),
    clipeId: clipe.id,
  };
}

function indiceDaCamada(projeto: Projeto, faixaId: string): number {
  const indice = projeto.faixas.findIndex((faixa) => faixa.id === faixaId && faixa.tipo !== "principal");
  if (indice < 0) throw new ErroEdicao("Esta camada não existe mais.");
  return indice;
}

/** As camadas na mesma pasta que a faixa (ela inclusive), de cima para baixo. */
function irmasDe(projeto: Projeto, faixa: Faixa): Faixa[] {
  const pai = paiDaCamada(projeto, faixa);
  return projeto.faixas.filter((item) => item.tipo !== "principal" && item.clipes.length && paiDaCamada(projeto, item) === pai);
}

/** Troca a ordem das irmãs: cada uma vai para a vaga (o índice na lista) de quem estava naquela posição. */
function comIrmasEmOrdem(projeto: Projeto, antes: Faixa[], depois: Faixa[]): Projeto {
  const vagas = antes.map((faixa) => projeto.faixas.indexOf(faixa));
  const faixas = [...projeto.faixas];
  vagas.forEach((vaga, i) => {
    faixas[vaga] = depois[i];
  });
  return { ...projeto, faixas };
}

/**
 * Sobe (para a frente) ou desce (para trás) uma posição entre as camadas da mesma pasta, vai direto para o topo ou o
 * fundo dela, ou vai para a posição dada (0 é a de cima). As camadas de dentro de uma pasta andam com ela.
 */
export function moverCamada(projeto: Projeto, faixaId: string, para: "cima" | "baixo" | "topo" | "fundo" | number): Projeto {
  const faixa = projeto.faixas[indiceDaCamada(projeto, faixaId)];
  const irmas = irmasDe(projeto, faixa);
  const indice = irmas.indexOf(faixa);
  const outras = irmas.filter((item) => item !== faixa);
  const destino =
    typeof para === "number"
      ? Math.min(outras.length, Math.max(0, Math.round(para)))
      : para === "topo"
        ? 0
        : para === "fundo"
          ? outras.length
          : para === "cima"
            ? Math.max(0, indice - 1)
            : Math.min(outras.length, indice + 1);
  outras.splice(destino, 0, faixa);
  return comIrmasEmOrdem(projeto, irmas, outras);
}

/** Organizar › Inverter: as camadas escolhidas (da mesma pasta) trocam de ordem entre si. */
export function inverterCamadas(projeto: Projeto, faixaIds: string[]): Projeto {
  const escolhidas = projeto.faixas.filter((faixa) => faixaIds.includes(faixa.id) && faixa.tipo !== "principal");
  if (escolhidas.length < 2) throw new ErroEdicao("Escolha duas camadas ou mais para inverter a ordem.");
  const pai = paiDaCamada(projeto, escolhidas[0]);
  if (escolhidas.some((faixa) => paiDaCamada(projeto, faixa) !== pai)) throw new ErroEdicao("As camadas para inverter precisam estar na mesma pasta.");
  const faixas = [...projeto.faixas];
  const vagas = escolhidas.map((faixa) => faixas.indexOf(faixa));
  [...escolhidas].reverse().forEach((faixa, i) => {
    faixas[vagas[i]] = faixa;
  });
  return { ...projeto, faixas };
}

/**
 * Leva as camadas (com o que há dentro das pastas) para a pasta `pai` (null é a raiz), logo acima de `acimaDe` (uma
 * camada dessa pasta) ou no fundo dela. É o arrastar do painel Camadas.
 */
export function moverCamadasPara(projeto: Projeto, faixaIds: string[], pai: string | null, acimaDe: string | null): Projeto {
  const pasta = pai ? projeto.faixas.find((faixa) => faixa.id === pai) : null;
  if (pai && !pasta?.clipes[0]?.pasta) throw new ErroEdicao("Essa pasta não existe mais.");
  // Só as de cima: quem está dentro de uma pasta que também vai anda junto com ela
  const escolhidas = projeto.faixas.filter(
    (faixa) => faixaIds.includes(faixa.id) && faixa.tipo !== "principal" && !ancestrais(projeto, faixa).some((ancestral) => faixaIds.includes(ancestral.id)),
  );
  if (!escolhidas.length) return projeto;
  if (pasta && escolhidas.some((faixa) => faixa.id === pasta.id || ancestrais(projeto, pasta).some((ancestral) => ancestral.id === faixa.id))) {
    throw new ErroEdicao("Uma pasta não entra dentro dela mesma.");
  }
  if (escolhidas.some((faixa) => faixa.travada)) throw new ErroEdicao("Uma das camadas está travada.");
  const blocos = escolhidas.map((faixa) => comDescendentes(projeto, faixa.id));
  const ids = new Set(blocos.flat().map((faixa) => faixa.id));
  const restantes = projeto.faixas.filter((faixa) => !ids.has(faixa.id));
  const movidas = blocos.flatMap((bloco) => bloco.map((faixa) => (faixa.id === bloco[0].id ? { ...faixa, pai } : faixa)));
  let vaga = acimaDe ? restantes.findIndex((faixa) => faixa.id === acimaDe) : -1;
  if (vaga < 0) {
    // No fundo da pasta: logo depois da última camada dela (ou da própria pasta); na raiz, logo acima da principal
    const daPasta = restantes.filter((faixa) => faixa.tipo !== "principal" && paiDaCamada({ ...projeto, faixas: restantes }, faixa) === pai);
    const ultima = daPasta[daPasta.length - 1];
    vaga = ultima ? restantes.indexOf(ultima) + 1 : pasta ? restantes.indexOf(pasta) + 1 : restantes.findIndex((faixa) => faixa.tipo === "principal");
    if (vaga < 0) vaga = restantes.length;
  }
  return { ...projeto, faixas: [...restantes.slice(0, vaga), ...movidas, ...restantes.slice(vaga)] };
}

/**
 * Camada › Agrupar camadas (Ctrl+G): uma pasta nova no lugar da de cima das escolhidas, com elas dentro (na ordem de
 * antes). A pasta começa aberta, com a mesclagem Passagem.
 */
export function agruparCamadas(projeto: Projeto, ctx: Contexto, faixaIds: string[]): { projeto: Projeto; clipeId: string } {
  const escolhidas = projeto.faixas.filter((faixa) => faixaIds.includes(faixa.id) && faixa.tipo !== "principal");
  const pasta: Faixa = {
    ...faixaNova(ctx, "video", clipeDaCamada(ctx.novoId(), { pasta: true, mesclagem: "passagem" })),
    pai: escolhidas.length ? paiDaCamada(projeto, escolhidas[0]) : null,
    aberta: true,
    nome: `Grupo ${projeto.faixas.filter((faixa) => faixa.clipes[0]?.pasta).length + 1}`,
  };
  // Sem camadas escolhidas: uma pasta vazia no topo (o botão de pasta do painel)
  if (!escolhidas.length) return { projeto: porNoTopo(projeto, pasta), clipeId: pasta.clipes[0].id };
  const faixas = [...projeto.faixas];
  faixas.splice(faixas.indexOf(escolhidas[0]), 0, pasta);
  const comPasta = { ...projeto, faixas };
  return { projeto: moverCamadasPara(comPasta, escolhidas.map((faixa) => faixa.id), pasta.id, null), clipeId: pasta.clipes[0].id };
}

/** Camada › Desagrupar (Ctrl+Shift+G): a pasta sai e as camadas de dentro ficam onde ela estava. */
export function desagruparCamadas(projeto: Projeto, faixaId: string): Projeto {
  const pasta = projeto.faixas.find((faixa) => faixa.id === faixaId);
  if (!pasta?.clipes[0]?.pasta) throw new ErroEdicao("Escolha uma pasta para desagrupar.");
  if (pasta.travada) throw new ErroEdicao("A pasta está travada.");
  const pai = paiDaCamada(projeto, pasta);
  return { ...projeto, faixas: projeto.faixas.filter((faixa) => faixa !== pasta).map((faixa) => (faixa.pai === pasta.id ? { ...faixa, pai } : faixa)) };
}

export type MudancaDaCamada = {
  nome?: string | null;
  rotulo?: CorDoRotulo | null;
  travas?: TravasDaCamada | null;
  recortada?: boolean;
  aberta?: boolean;
  oculta?: boolean;
  travada?: boolean;
  /** O preenchimento do clipe (0 a 1): a opacidade da camada sem os estilos. */
  preenchimento?: number;
};

/** O nome, a cor do rótulo, as travas, o recorte na de baixo, a pasta aberta no painel, o olho e o preenchimento. */
export function mudarCamada(projeto: Projeto, faixaIds: string[], mudanca: MudancaDaCamada): Projeto {
  if (mudanca.nome !== undefined && mudanca.nome !== null && !mudanca.nome.trim()) throw new ErroEdicao("A camada precisa de um nome.");
  const nome = mudanca.nome === undefined ? undefined : mudanca.nome?.trim().slice(0, 60) || null;
  return {
    ...projeto,
    faixas: projeto.faixas.map((faixa) => {
      if (!faixaIds.includes(faixa.id) || faixa.tipo === "principal") return faixa;
      // Mudar o recorte e o preenchimento mexe no que aparece: travada, não muda (as outras são do painel)
      if ((mudanca.recortada !== undefined || mudanca.preenchimento !== undefined) && faixa.travada) throw new ErroEdicao("A camada está travada.");
      const clipe = faixa.clipes[0];
      const preenchimento = mudanca.preenchimento === undefined || clipe?.pasta ? undefined : Math.min(1, Math.max(0, mudanca.preenchimento));
      return {
        ...faixa,
        ...(mudanca.oculta !== undefined ? { oculta: mudanca.oculta } : {}),
        ...(mudanca.travada !== undefined ? { travada: mudanca.travada } : {}),
        ...(preenchimento !== undefined && clipe ? { clipes: [preenchimentoNoClipe(clipe, preenchimento), ...faixa.clipes.slice(1)] } : {}),
        ...(nome !== undefined ? { nome } : {}),
        ...(mudanca.rotulo !== undefined ? { rotulo: mudanca.rotulo } : {}),
        ...(mudanca.travas !== undefined ? { travas: travasJuntas(faixa.travas, mudanca.travas) } : {}),
        ...(mudanca.recortada !== undefined ? { recortada: mudanca.recortada } : {}),
        ...(mudanca.aberta !== undefined ? { aberta: mudanca.aberta } : {}),
      };
    }),
  };
}

/** As travas da camada com as mudadas (null tira todas); sem nenhuma ligada, o campo sai. */
function travasJuntas(atuais: TravasDaCamada | null | undefined, mudadas: TravasDaCamada | null): TravasDaCamada | null {
  if (!mudadas) return null;
  const juntas = { ...atuais, ...mudadas };
  const ligadas = Object.fromEntries(Object.entries(juntas).filter(([, valor]) => valor)) as TravasDaCamada;
  return Object.keys(ligadas).length ? ligadas : null;
}

/** O clipe com o preenchimento; o 100% tira o campo, para o projeto ficar como antes. */
function preenchimentoNoClipe(clipe: Clipe, preenchimento: number): Clipe {
  if (preenchimento < 1) return { ...clipe, preenchimento };
  const semCampo = { ...clipe };
  delete semCampo.preenchimento;
  return semCampo;
}

/**
 * Alt + clique no olho: só esta camada aparece (com as pastas em volta e o que está dentro dela); se já era assim,
 * todas voltam a aparecer.
 */
export function soEstaVisivel(projeto: Projeto, faixaId: string): Projeto {
  const faixa = projeto.faixas.find((item) => item.id === faixaId);
  if (!faixa || faixa.tipo === "principal") throw new ErroEdicao("Essa camada não existe mais.");
  const ficam = new Set([...comDescendentes(projeto, faixaId), ...ancestrais(projeto, faixa)].map((item) => item.id));
  const outras = projeto.faixas.filter((item) => item.tipo !== "principal" && item.clipes.length && !ficam.has(item.id));
  const jaEstava = outras.every((item) => item.oculta) && [...ficam].every((id) => !projeto.faixas.find((item) => item.id === id)?.oculta);
  return {
    ...projeto,
    faixas: projeto.faixas.map((item) => {
      if (item.tipo === "principal" || !item.clipes.length) return item;
      const oculta = jaEstava ? false : !ficam.has(item.id);
      return item.oculta === oculta ? item : { ...item, oculta };
    }),
  };
}

/** Vincular camadas (todas com o mesmo vínculo) ou desvincular (`ligar` falso). */
export function vincularCamadas(projeto: Projeto, ctx: Contexto, faixaIds: string[], ligar: boolean): Projeto {
  if (ligar && faixaIds.length < 2) throw new ErroEdicao("Escolha duas camadas ou mais para vincular.");
  const vinculo = ligar ? ctx.novoId() : null;
  return { ...projeto, faixas: projeto.faixas.map((faixa) => (faixaIds.includes(faixa.id) ? { ...faixa, vinculo } : faixa)) };
}

export function apagarCamada(projeto: Projeto, faixaId: string): Projeto {
  indiceDaCamada(projeto, faixaId);
  const saem = comDescendentes(projeto, faixaId);
  if (saem.some((faixa) => faixa.travada)) throw new ErroEdicao("A camada está travada. Destrave o cadeado para apagar.");
  const ids = new Set(saem.map((faixa) => faixa.id));
  return { ...projeto, faixas: projeto.faixas.filter((faixa) => !ids.has(faixa.id)) };
}

/** Camada › Excluir › Camadas ocultas: as escondidas (com o que há dentro, nas pastas) saem. */
/** Excluir as camadas escolhidas (as de dentro de uma pasta escolhida já saem com ela). */
export function apagarCamadas(projeto: Projeto, faixaIds: string[]): Projeto {
  let resultado = projeto;
  for (const faixaId of faixaIds) if (resultado.faixas.some((faixa) => faixa.id === faixaId)) resultado = apagarCamada(resultado, faixaId);
  return resultado;
}

/** Duplicar as escolhidas, cada cópia acima da original; devolve os clipes das cópias. */
export function duplicarCamadas(projeto: Projeto, ctx: Contexto, faixaIds: string[]): { projeto: Projeto; clipeIds: string[] } {
  // As de dentro de uma pasta escolhida já vão na cópia dela
  const escolhidas = projeto.faixas.filter((faixa) => faixaIds.includes(faixa.id) && !ancestrais(projeto, faixa).some((pasta) => faixaIds.includes(pasta.id)));
  let resultado = projeto;
  const clipeIds: string[] = [];
  for (const faixa of escolhidas) {
    const copia = duplicarCamada(resultado, ctx, faixa.id);
    resultado = copia.projeto;
    clipeIds.push(copia.clipeId);
  }
  return { projeto: resultado, clipeIds };
}

export function apagarCamadasOcultas(projeto: Projeto): Projeto {
  const ocultas = projeto.faixas.filter((faixa) => faixa.tipo !== "principal" && faixa.oculta && !faixa.travada);
  if (!ocultas.length) throw new ErroEdicao("Não há camadas ocultas para excluir.");
  const ids = new Set(ocultas.flatMap((faixa) => comDescendentes(projeto, faixa.id)).map((faixa) => faixa.id));
  return { ...projeto, faixas: projeto.faixas.filter((faixa) => !ids.has(faixa.id)) };
}

/**
 * A cópia entra logo acima da original, com ids novos e um pouco deslocada (para dar para ver que são duas). Uma
 * pasta é copiada com tudo o que há dentro (as cópias ficam na pasta copiada).
 */
export function duplicarCamada(projeto: Projeto, ctx: Contexto, faixaId: string): { projeto: Projeto; clipeId: string } {
  const indice = indiceDaCamada(projeto, faixaId);
  const original = projeto.faixas[indice];
  const bloco = comDescendentes(projeto, faixaId);
  const novosIds = new Map(bloco.map((faixa) => [faixa.id, ctx.novoId()]));
  const copias = bloco.map((faixa) => {
    const clipe = structuredClone(faixa.clipes[0]);
    const t = clipe.transformacao;
    const deslocar = faixa === original && !clipe.pasta;
    return {
      ...faixa,
      id: novosIds.get(faixa.id)!,
      pai: faixa === original ? faixa.pai : (novosIds.get(faixa.pai ?? "") ?? faixa.pai),
      travada: false,
      // Copiar não leva o vínculo (a cópia anda sozinha) nem o fundo (o fundo é um só)
      vinculo: null,
      ...(faixa.fundo ? { fundo: false, travas: null, nome: "Fundo cópia" } : {}),
      nome: faixa === original && faixa.nome ? `${faixa.nome} cópia`.slice(0, 60) : faixa.nome,
      clipes: [{ ...clipe, id: ctx.novoId(), transformacao: deslocar ? { ...t, x: Math.min(t.x + 0.03, 10), y: Math.min(t.y + 0.03, 10) } : t }],
    };
  });
  const faixas = [...projeto.faixas];
  faixas.splice(indice, 0, ...copias);
  return { projeto: { ...projeto, faixas }, clipeId: copias[0].clipes[0].id };
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

/**
 * Uma camada nova logo acima da camada dada, no mesmo lugar e com tudo dela, mas com outra mídia do mesmo tamanho
 * (o objeto recortado de uma foto cai em cima da foto).
 */
export function camadaComOutraMidia(projeto: Projeto, ctx: Contexto, faixaId: string, midiaId: string): { projeto: Projeto; clipeId: string } {
  const indice = indiceDaCamada(projeto, faixaId);
  const original = projeto.faixas[indice];
  if (!ctx.midia(midiaId)?.imagem) throw new ErroEdicao("A imagem nova ainda não está pronta.");
  const clipe: Clipe = { ...structuredClone(original.clipes[0]), id: ctx.novoId(), midia_id: midiaId, remover_fundo: false };
  const faixas = [...projeto.faixas];
  faixas.splice(indice, 0, { ...original, id: ctx.novoId(), travada: false, oculta: false, clipes: [clipe] });
  return { projeto: { ...projeto, faixas }, clipeId: clipe.id };
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

/** Um retângulo do quadro, em pixels da imagem (o canto de cima à esquerda e o tamanho). */
export type RetanguloDaImagem = { x: number; y: number; largura: number; altura: number };

/**
 * Recorta o quadro no retângulo: o tamanho passa a ser o dele, e cada camada fica no mesmo lugar e do mesmo tamanho
 * em pixels (só o que fica fora some). A escala de uma mídia é relativa a caber no quadro e a de um texto, ao lado
 * menor dele, então as duas são refeitas para o quadro novo; os tamanhos das mídias vêm de quem chama.
 */
/**
 * A transformação livre que cabe na posição da camada (mover, girar, escalar por igual e virar), num passo só: a
 * camada continua editável. O giro fica entre -180 e 180.
 */
export function transformarCamada(projeto: Projeto, clipeId: string, transformacao: Partial<Transformacao>, virar?: Virar): Projeto {
  let achou = false;
  const faixas = projeto.faixas.map((faixa) => {
    if (!faixa.clipes.some((clipe) => clipe.id === clipeId)) return faixa;
    achou = true;
    if (faixa.travada || faixa.travas?.posicao) throw new ErroEdicao("A posição desta camada está travada.");
    return {
      ...faixa,
      clipes: faixa.clipes.map((clipe) => {
        if (clipe.id !== clipeId) return clipe;
        const nova = { ...clipe.transformacao, ...transformacao };
        nova.rotacao = ((((nova.rotacao + 180) % 360) + 360) % 360) - 180;
        return { ...clipe, transformacao: nova, ...(virar ? { virar } : {}) };
      }),
    };
  });
  if (!achou) throw new ErroEdicao("A camada não existe mais.");
  return { ...projeto, faixas };
}

export function recortarImagem(projeto: Projeto, retangulo: RetanguloDaImagem, tamanhos: Record<string, Tamanho>): Projeto {
  const antes = tamanhoDaImagem(projeto);
  const depois = { largura: Math.round(retangulo.largura), altura: Math.round(retangulo.altura) };
  const problema = problemaNoTamanho(depois);
  if (problema) throw new ErroEdicao(problema);
  const ladoAntes = Math.min(antes.largura, antes.altura);
  const ladoDepois = Math.min(depois.largura, depois.altura);
  const faixas = projeto.faixas.map((faixa) => {
    if (faixa.tipo === "principal") return faixa;
    const clipes = faixa.clipes.map((clipe) => {
      // A camada de ajuste cobre o quadro, qualquer que seja ele
      if (clipe.ajuste) return clipe;
      // A de preenchimento também; as alças do degradê ficam no mesmo lugar em pixels
      const preenchimento = clipe.camada_de_preenchimento;
      if (preenchimento) {
        const noNovo = (p: { x: number; y: number }) => ({ x: (p.x * antes.largura - retangulo.x) / depois.largura, y: (p.y * antes.altura - retangulo.y) / depois.altura });
        return preenchimento.de && preenchimento.ate ? { ...clipe, camada_de_preenchimento: { ...preenchimento, de: noNovo(preenchimento.de), ate: noNovo(preenchimento.ate) } } : clipe;
      }
      const t = clipe.transformacao;
      const cx = antes.largura / 2 + t.x * antes.largura - retangulo.x;
      const cy = antes.altura / 2 + t.y * antes.altura - retangulo.y;
      let escala = t.escala;
      if (clipe.texto) escala = (t.escala * ladoAntes) / ladoDepois;
      else if (tamanhoDaFonte(clipe, tamanhos)) {
        const midia = tamanhoDaFonte(clipe, tamanhos)!;
        const largura = midia.largura * clipe.recorte.largura;
        const altura = midia.altura * clipe.recorte.altura;
        const caberAntes = Math.min(antes.largura / largura, antes.altura / altura);
        const caberDepois = Math.min(depois.largura / largura, depois.altura / altura);
        escala = (t.escala * caberAntes) / caberDepois;
      }
      const transformacao = { ...t, x: (cx - depois.largura / 2) / depois.largura, y: (cy - depois.altura / 2) / depois.altura, escala };
      return { ...clipe, transformacao };
    });
    return { ...faixa, clipes };
  });
  const resolucao = projeto.tamanho?.resolucao;
  return { ...projeto, tamanho: { ...depois, ...(resolucao ? { resolucao } : {}) }, faixas };
}

/** Muda o tamanho do quadro. As camadas ficam no mesmo lugar em frações (o meio continua no meio); a resolução fica. */
export function mudarTamanhoDaImagem(projeto: Projeto, tamanho: TamanhoDaImagem): Projeto {
  const problema = problemaNoTamanho(tamanho);
  if (problema) throw new ErroEdicao(problema);
  const resolucao = tamanho.resolucao ?? projeto.tamanho?.resolucao;
  return {
    ...projeto,
    tamanho: { largura: tamanho.largura, altura: tamanho.altura, ...(resolucao ? { resolucao } : {}) },
  };
}

/** Uma camada de pixels (ou um canal) que passou para outra mídia, já no tamanho novo. */
export type TrocaDePixels = { id: string; midiaId: string; versao: number };

/**
 * Imagem › Tamanho da imagem: o quadro no tamanho novo, com a resolução, e as camadas de pixels e os canais trocados
 * pelas versões reamostradas (o editor reamostra e sobe antes), num passo só.
 */
export function tamanhoComPixels(projeto: Projeto, tamanho: TamanhoDaImagem, pixels: TrocaDePixels[], canais: TrocaDePixels[]): Projeto {
  const base = mudarTamanhoDaImagem(projeto, tamanho);
  const porClipe = new Map(pixels.map((troca) => [troca.id, troca]));
  const porCanal = new Map(canais.map((troca) => [troca.id, troca]));
  return {
    ...base,
    faixas: base.faixas.map((faixa) => ({
      ...faixa,
      clipes: faixa.clipes.map((clipe) => {
        const troca = porClipe.get(clipe.id);
        return troca && clipe.pixels ? { ...clipe, midia_id: troca.midiaId, pixels: { ...clipe.pixels, versao: troca.versao } } : clipe;
      }),
    })),
    ...(base.canais ? { canais: base.canais.map((canal) => (porCanal.has(canal.id) ? { ...canal, midia_id: porCanal.get(canal.id)!.midiaId, versao: porCanal.get(canal.id)!.versao } : canal)) } : {}),
  };
}

/** Imagem › Tamanho da tela: o retângulo novo (em pixels do quadro de agora) e, se pedida, a cor do que aumentou. */
export function tamanhoDaTela(projeto: Projeto, retangulo: RetanguloDaImagem, tamanhos: Record<string, Tamanho>, fundo: { cor: string; transparente: boolean } | null): Projeto {
  const recortado = recortarImagem(projeto, retangulo, tamanhos);
  return fundo ? { ...recortado, fundo: { ...recortado.fundo, cor: fundo.cor, transparente: fundo.transparente } } : recortado;
}

/** O retângulo da prancheta (pixels do documento). */
export function retanguloDaPrancheta(clipe: Clipe, quadro: Tamanho): RetanguloDaImagem | null {
  if (!clipe.prancheta) return null;
  const cx = (0.5 + clipe.transformacao.x) * quadro.largura;
  const cy = (0.5 + clipe.transformacao.y) * quadro.altura;
  return { x: cx - clipe.prancheta.largura / 2, y: cy - clipe.prancheta.altura / 2, largura: clipe.prancheta.largura, altura: clipe.prancheta.altura };
}

/** A tela cresce até caber o retângulo (pixels do documento de agora), sem mexer em nada; devolve o deslocamento. */
function comTelaQueCabe(projeto: Projeto, retangulo: RetanguloDaImagem, tamanhos: Record<string, Tamanho>): { projeto: Projeto; dx: number; dy: number } {
  const q = tamanhoDaImagem(projeto);
  const x0 = Math.min(0, Math.floor(retangulo.x));
  const y0 = Math.min(0, Math.floor(retangulo.y));
  const x1 = Math.max(q.largura, Math.ceil(retangulo.x + retangulo.largura));
  const y1 = Math.max(q.altura, Math.ceil(retangulo.y + retangulo.altura));
  if (x0 === 0 && y0 === 0 && x1 === q.largura && y1 === q.altura) return { projeto, dx: 0, dy: 0 };
  const problema = problemaNoTamanho({ largura: x1 - x0, altura: y1 - y0 });
  if (problema) throw new ErroEdicao(`A tela precisaria crescer para caber a prancheta. ${problema}`);
  return { projeto: recortarImagem(projeto, { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 }, tamanhos), dx: -x0, dy: -y0 };
}

/** A transformação que põe o meio da prancheta no meio do retângulo. */
const meioDoRetangulo = (retangulo: RetanguloDaImagem, quadro: Tamanho) => ({ x: (retangulo.x + retangulo.largura / 2) / quadro.largura - 0.5, y: (retangulo.y + retangulo.altura / 2) / quadro.altura - 0.5 });

/**
 * Uma prancheta nova no retângulo (pixels do documento de agora), por cima de tudo, na raiz: a tela cresce até caber, e
 * a primeira prancheta deixa o fundo do documento transparente (o que fica fora das pranchetas é a mesa).
 */
export function adicionarPrancheta(projeto: Projeto, ctx: Contexto, retangulo: RetanguloDaImagem, nome: string, fundo: Prancheta["fundo"], tamanhos: Record<string, Tamanho>): { projeto: Projeto; clipeId: string } {
  if (retangulo.largura < 1 || retangulo.altura < 1) throw new ErroEdicao("A prancheta precisa ter tamanho.");
  const { projeto: maior, dx, dy } = comTelaQueCabe(projeto, retangulo, tamanhos);
  const quadro = tamanhoDaImagem(maior);
  const lugar = { ...retangulo, x: retangulo.x + dx, y: retangulo.y + dy };
  // A prancheta isola o que está dentro (recorta no retângulo): a mesclagem é a normal, nunca a passagem
  const clipe = clipeDaCamada(ctx.novoId(), { pasta: true, mesclagem: "normal", prancheta: { largura: Math.round(retangulo.largura), altura: Math.round(retangulo.altura), fundo }, transformacao: { ...TRANSFORMACAO_PADRAO, ...meioDoRetangulo(lugar, quadro) } });
  const faixa: Faixa = { ...faixaNova(ctx, "video", clipe), nome, aberta: true };
  const primeira = !projeto.faixas.some((item) => item.clipes[0]?.prancheta);
  return { projeto: { ...maior, faixas: [faixa, ...maior.faixas], ...(primeira ? { fundo: { ...maior.fundo, transparente: true } } : {}) }, clipeId: clipe.id };
}

/** Muda o tamanho ou o fundo da prancheta: o canto de cima à esquerda fica, e a tela cresce se precisar. */
export function mudarPrancheta(projeto: Projeto, clipeId: string, mudanca: Partial<Prancheta>, tamanhos: Record<string, Tamanho>): Projeto {
  const clipe = projeto.faixas.flatMap((faixa) => faixa.clipes).find((item) => item.id === clipeId);
  if (!clipe?.prancheta) throw new ErroEdicao("Esta camada não é uma prancheta.");
  const antes = retanguloDaPrancheta(clipe, tamanhoDaImagem(projeto))!;
  const prancheta = { ...clipe.prancheta, ...mudanca };
  const novo = { x: antes.x, y: antes.y, largura: Math.max(1, Math.round(prancheta.largura)), altura: Math.max(1, Math.round(prancheta.altura)) };
  const { projeto: maior, dx, dy } = comTelaQueCabe(projeto, novo, tamanhos);
  const quadro = tamanhoDaImagem(maior);
  return mudarClipeDaCamada(maior, clipeId, (atual) => ({ ...atual, prancheta: { ...prancheta, largura: novo.largura, altura: novo.altura }, transformacao: { ...atual.transformacao, ...meioDoRetangulo({ ...novo, x: novo.x + dx, y: novo.y + dy }, quadro) } }));
}

/** Prancheta a partir de grupo: a pasta vira prancheta no retângulo (o que está dentro dela, medido na prévia). */
export function pranchetaDoGrupo(projeto: Projeto, faixaId: string, retangulo: RetanguloDaImagem, fundo: Prancheta["fundo"], tamanhos: Record<string, Tamanho>): Projeto {
  const faixa = projeto.faixas.find((item) => item.id === faixaId);
  const pasta = faixa?.clipes[0];
  if (!pasta?.pasta) throw new ErroEdicao("Escolha um grupo para virar prancheta.");
  if (pasta.prancheta) throw new ErroEdicao("O grupo já é uma prancheta.");
  const { projeto: maior, dx, dy } = comTelaQueCabe(projeto, retangulo, tamanhos);
  const quadro = tamanhoDaImagem(maior);
  const lugar = { ...retangulo, x: retangulo.x + dx, y: retangulo.y + dy };
  const primeira = !projeto.faixas.some((item) => item.clipes[0]?.prancheta);
  const comPrancheta = mudarClipeDaCamada(maior, pasta.id, (atual) => {
    // A prancheta recorta o que está dentro: a passagem (que não isola a pasta) não serve
    return { ...atual, mesclagem: atual.mesclagem && atual.mesclagem !== "passagem" ? atual.mesclagem : "normal", prancheta: { largura: Math.round(retangulo.largura), altura: Math.round(retangulo.altura), fundo }, transformacao: { ...atual.transformacao, ...meioDoRetangulo(lugar, quadro) } };
  });
  return primeira ? { ...comPrancheta, fundo: { ...comPrancheta.fundo, transparente: true } } : comPrancheta;
}

export type GiroDaImagem = "180" | "90" | "-90" | "virarH" | "virarV" | { graus: number };

/** A caixa do Corte: o centro e as medidas em pixels da imagem e o giro dela, em graus. */
export type CaixaDoCorte = { cx: number; cy: number; largura: number; altura: number; angulo: number };

/**
 * O Corte (C): com a caixa girada, a imagem gira ao contrário (o quadro crescendo até caber) e o retângulo dela fica; as
 * camadas continuam editáveis. `pixels` são as camadas de pixels já cortadas (do tamanho do quadro novo, quando se pede
 * para apagar os pixels cortados): entram no lugar delas, cobrindo o quadro.
 */
export function cortarImagem(projeto: Projeto, caixa: CaixaDoCorte, tamanhos: Record<string, Tamanho>, pixels: TrocaDePixels[] = []): Projeto {
  let base = projeto;
  let centro = { x: caixa.cx, y: caixa.cy };
  if (Math.abs(caixa.angulo) > 1e-6) {
    const antes = tamanhoDaImagem(projeto);
    base = girarImagem(projeto, { graus: -caixa.angulo }, tamanhos);
    const depois = tamanhoDaImagem(base);
    const r = (-caixa.angulo * Math.PI) / 180;
    const dx = caixa.cx - antes.largura / 2;
    const dy = caixa.cy - antes.altura / 2;
    centro = { x: depois.largura / 2 + dx * Math.cos(r) - dy * Math.sin(r), y: depois.altura / 2 + dx * Math.sin(r) + dy * Math.cos(r) };
  }
  const cortado = recortarImagem(base, { x: centro.x - caixa.largura / 2, y: centro.y - caixa.altura / 2, largura: caixa.largura, altura: caixa.altura }, tamanhos);
  if (!pixels.length) return cortado;
  const porClipe = new Map(pixels.map((troca) => [troca.id, troca]));
  return {
    ...cortado,
    faixas: cortado.faixas.map((faixa) => ({
      ...faixa,
      clipes: faixa.clipes.map((clipe) => {
        const troca = porClipe.get(clipe.id);
        if (!troca || !clipe.pixels) return clipe;
        const { virar: _virar, ...resto } = clipe;
        void _virar;
        return { ...resto, midia_id: troca.midiaId, pixels: { ...clipe.pixels, versao: troca.versao }, transformacao: { ...clipe.transformacao, x: 0, y: 0, escala: 1, rotacao: 0 }, recorte: RECORTE_PADRAO };
      }),
    })),
  };
}

/**
 * Imagem › Rotação da imagem: a imagem inteira gira (180°, 90° para um lado ou para o outro, ou um ângulo qualquer, com
 * o quadro crescendo até caber) ou vira; cada camada gira junto, em volta do meio, e continua editável.
 */
export function girarImagem(projeto: Projeto, giro: GiroDaImagem, tamanhos: Record<string, Tamanho>): Projeto {
  const antes = tamanhoDaImagem(projeto);
  const graus = typeof giro === "object" ? giro.graus : giro === "180" ? 180 : giro === "90" ? 90 : giro === "-90" ? -90 : 0;
  const r = (graus * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r)) < 1e-12 ? 0 : Math.cos(r);
  const sen = Math.abs(Math.sin(r)) < 1e-12 ? 0 : Math.sin(r);
  const depois =
    typeof giro === "string" && (giro === "virarH" || giro === "virarV")
      ? { largura: antes.largura, altura: antes.altura }
      : { largura: Math.round(Math.abs(antes.largura * cos) + Math.abs(antes.altura * sen)), altura: Math.round(Math.abs(antes.largura * sen) + Math.abs(antes.altura * cos)) };
  const problema = problemaNoTamanho(depois);
  if (problema) throw new ErroEdicao(problema);
  const ladoAntes = Math.min(antes.largura, antes.altura);
  const ladoDepois = Math.min(depois.largura, depois.altura);
  const faixas = projeto.faixas.map((faixa) => {
    if (faixa.tipo === "principal") return faixa;
    const clipes = faixa.clipes.map((clipe) => {
      if (clipe.ajuste || clipe.camada_de_preenchimento) return clipe;
      const t = clipe.transformacao;
      // O centro da camada a partir do meio do quadro, em pixels
      const dx = t.x * antes.largura;
      const dy = t.y * antes.altura;
      let nx = dx * cos - dy * sen;
      let ny = dx * sen + dy * cos;
      let rotacao = t.rotacao + graus;
      let virar = clipe.virar;
      if (giro === "virarH" || giro === "virarV") {
        nx = giro === "virarH" ? -dx : dx;
        ny = giro === "virarV" ? -dy : dy;
        rotacao = -t.rotacao;
        const atual = clipe.virar ?? { horizontal: false, vertical: false };
        virar = giro === "virarH" ? { ...atual, horizontal: !atual.horizontal } : { ...atual, vertical: !atual.vertical };
      }
      // A escala é relativa ao quadro: refeita para o tamanho em pixels continuar o mesmo
      let escala = t.escala;
      if (clipe.texto) escala = (t.escala * ladoAntes) / ladoDepois;
      else if (tamanhoDaFonte(clipe, tamanhos)) {
        const midia = tamanhoDaFonte(clipe, tamanhos)!;
        const largura = midia.largura * clipe.recorte.largura;
        const altura = midia.altura * clipe.recorte.altura;
        escala = (t.escala * Math.min(antes.largura / largura, antes.altura / altura)) / Math.min(depois.largura / largura, depois.altura / altura);
      }
      rotacao = ((((rotacao + 180) % 360) + 360) % 360) - 180;
      return { ...clipe, transformacao: { ...t, x: nx / depois.largura, y: ny / depois.altura, escala, rotacao }, ...(virar ? { virar } : {}) };
    });
    return { ...faixa, clipes };
  });
  const resolucao = projeto.tamanho?.resolucao;
  return { ...projeto, tamanho: { ...depois, ...(resolucao ? { resolucao } : {}) }, faixas };
}
