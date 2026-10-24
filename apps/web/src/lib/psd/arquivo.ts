"use client";

// Abrir e salvar PSD no editor de imagem (ADR 0003, onda 13.13), no navegador, pelo ag-psd (MIT). Abrir sobe cada
// camada como uma camada de pixels do tamanho do documento (com a máscara, também do tamanho dele), monta as pastas, os
// ajustes e as camadas de cor e salva o projeto de uma vez. Salvar desenha cada camada sozinha pelo mesmo compositor da
// exportação, guarda as pastas, os modos, as opacidades, as máscaras, os ajustes e os efeitos que têm par, e a imagem
// inteira (que os visualizadores sem camadas mostram).
import { type Layer, type Psd, readPsd, writePsd } from "ag-psd";

import { novoId } from "@/componentes/editor/contexto";
import { arquivoDaMidia, chamarApi } from "@/lib/api";
import { exportarImagem } from "@/lib/exportacao/imagem";
import { carregarBitmap } from "@/lib/previa/bitmaps";
import { camadasDaImagem as camadasNaTela } from "@/lib/previa/camadas";
import { paiDaCamada } from "@/lib/projeto/arvore";
import { DURACAO_DA_CAMADA, problemaNoTamanho, tamanhoDaImagem } from "@/lib/projeto/imagem";
import { matrizDaMascaraNoDocumento } from "@/lib/projeto/mascaraDePixels";
import type { Clipe, Faixa, Projeto } from "@/lib/projeto/modelo";
import { projetoSoCom } from "@/lib/projeto/rasterizar";
import { arquivoDaVersao, criarCamadaDePixels, enviarVersao } from "@/lib/pixels";
import { temInformacoes, xmpDasInformacoes } from "@/lib/exportacao/metadados";
import type { Midia } from "@/lib/tipos";

import {
  type AjusteDoPsd,
  ajusteDoPsd,
  ajusteParaPsd,
  contarItens,
  corDoPsd,
  type EfeitosDoPsd,
  estiloDoPsd,
  estiloParaPsd,
  faixasDoPsd,
  type ItemDoPsd,
  mesclagemDoPsd,
  mesclagemParaPsd,
  type ModoDoPsd,
  rotuloDoPsd,
  rotuloParaPsd,
  travasDoPsd,
  travasParaPsd,
} from "./mapear";

/** As camadas que o projeto de imagem aceita (a API confere o mesmo). */
const LIMITE_DE_CAMADAS = 100;

const pngDoCanvas = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((pronto, falhou) => canvas.toBlob((blob) => (blob ? pronto(blob) : falhou(new Error("O navegador não conseguiu gravar a camada."))), "image/png"));

function canvasDoDocumento(largura: number, altura: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  return canvas;
}

function ehVazio(canvas: HTMLCanvasElement): boolean {
  const dados = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < dados.length; i += 4) if (dados[i]) return false;
  return true;
}

export type ResultadoDoPsd = { projetoId: string; avisos: string[] };

/** A cor sólida de uma camada de preenchimento sem forma (as com forma vêm como pixels). */
function corDaCamadaDePreenchimento(camada: Layer): string | null {
  const tinta = camada.vectorFill;
  if (!tinta || tinta.type !== "color" || camada.vectorMask?.paths?.length) return null;
  return corDoPsd(tinta.color as never);
}

/**
 * Abre o PSD num documento novo: o id do projeto e o que não veio como era (ajustes e efeitos sem par, textos que
 * viraram pixels). Com mais camadas que o limite, abre a imagem inteira numa camada só.
 */
export async function abrirPsd(arquivo: File, aoProgresso: (texto: string) => void): Promise<ResultadoDoPsd> {
  let psd: Psd;
  try {
    psd = readPsd(await arquivo.arrayBuffer(), { skipThumbnail: true, skipLinkedFilesData: true });
  } catch (e) {
    const motivo = e instanceof Error && /color mode|bitsPerChannel|not supported/i.test(e.message) ? " O modo de cor dele (CMYK de 16 bits, Lab ou multicanal) não é lido aqui; converta para RGB e salve de novo." : "";
    throw new Error(`Não foi possível ler "${arquivo.name}" como PSD.${motivo}`);
  }
  const { width: largura, height: altura } = psd;
  const problema = problemaNoTamanho({ largura, altura });
  if (problema) throw new Error(problema);

  const avisos: string[] = [];
  let textos = 0;
  let ajustesFora = 0;
  let efeitosFora = 0;

  const nome = arquivo.name.replace(/\.(psd|psb)$/i, "").slice(0, 120) || "Imagem";
  const resolucaoInfo = psd.imageResources?.resolutionInfo;
  const resolucao = resolucaoInfo ? Math.round(resolucaoInfo.horizontalResolution * (resolucaoInfo.horizontalResolutionUnit === "PPCM" ? 2.54 : 1)) : null;
  const projeto = await chamarApi<Projeto & { versao: number }>("/projetos", { metodo: "POST", corpo: { nome, tamanho: { largura, altura } } });

  // A camada (ou máscara) desenhada no documento sobe como uma camada de pixels; vazia, fica na versão 0 sem envio
  let feitas = 0;
  const subir = async (desenhar: (contexto: CanvasRenderingContext2D) => void, nomeDaMidia: string, vaziaPode = true) => {
    const canvas = canvasDoDocumento(largura, altura);
    desenhar(canvas.getContext("2d")!);
    const midia = await criarCamadaDePixels(largura, altura, nomeDaMidia);
    const versao = vaziaPode && ehVazio(canvas) ? 0 : await enviarVersao(midia.id, await pngDoCanvas(canvas));
    return { midiaId: midia.id, versao };
  };
  const mascaraDe = async (camada: Layer, nomeDaCamada: string): Promise<Extract<ItemDoPsd, { tipo: "pixels" }>["mascara"]> => {
    const m = camada.mask;
    if (!m || (!m.canvas && m.defaultColor === undefined)) return null;
    const enviada = await subir(
      (contexto) => {
        const fundo = m.defaultColor ?? 255;
        contexto.fillStyle = `rgb(${fundo},${fundo},${fundo})`;
        contexto.fillRect(0, 0, largura, altura);
        if (m.canvas) contexto.drawImage(m.canvas, m.left ?? 0, m.top ?? 0);
      },
      `Máscara de ${nomeDaCamada}`,
      false,
    );
    return { midia_id: enviada.midiaId, versao: enviada.versao, ligada: !m.disabled, densidade: m.userMaskDensity ?? 1, difusao: Math.min(1000, m.userMaskFeather ?? 0) };
  };

  const converter = async (camadas: Layer[] | undefined, total: number): Promise<ItemDoPsd[]> => {
    const itens: ItemDoPsd[] = [];
    // O arquivo guarda de baixo para cima; as faixas vão de cima para baixo
    for (const camada of [...(camadas ?? [])].reverse()) {
      const pasta = camada.children !== undefined;
      const nomeDaCamada = (camada.name || (pasta ? "Grupo" : "Camada")).slice(0, 120);
      const { estilo, faltaram } = estiloDoPsd(camada.effects as EfeitosDoPsd | undefined, novoId);
      efeitosFora += faltaram;
      const comum = {
        nome: nomeDaCamada,
        oculta: Boolean(camada.hidden),
        opacidade: camada.opacity ?? 1,
        mesclagem: mesclagemDoPsd(camada.blendMode as ModoDoPsd | undefined, pasta),
        recortada: Boolean(camada.clipping),
        travas: travasDoPsd(camada.protected),
        rotulo: rotuloDoPsd(camada.layerColor),
        estilo,
        preenchimento: camada.fillOpacity ?? 1,
      };
      if (pasta) {
        itens.push({ ...comum, tipo: "pasta", aberta: camada.opened !== false, filhos: await converter(camada.children, total) });
        continue;
      }
      aoProgresso(`Abrindo a camada ${++feitas} de ${total}…`);
      if (camada.adjustment) {
        const ajuste = ajusteDoPsd(camada.adjustment as AjusteDoPsd);
        if (!ajuste) {
          ajustesFora++;
          continue;
        }
        itens.push({ ...comum, tipo: "ajuste", ajuste, mascara: await mascaraDe(camada, nomeDaCamada) });
        continue;
      }
      const cor = corDaCamadaDePreenchimento(camada);
      if (cor) {
        itens.push({ ...comum, tipo: "preenchimento", preenchimento_camada: { tinta: { tipo: "cor", cor } }, mascara: await mascaraDe(camada, nomeDaCamada) });
        continue;
      }
      if (camada.text) textos++;
      const pixels = await subir((contexto) => {
        if (camada.canvas) contexto.drawImage(camada.canvas, camada.left ?? 0, camada.top ?? 0);
      }, nomeDaCamada);
      itens.push({ ...comum, tipo: "pixels", midiaId: pixels.midiaId, versao: pixels.versao, mascara: await mascaraDe(camada, nomeDaCamada) });
    }
    return itens;
  };

  const contar = (camadas: Layer[] | undefined): number => (camadas ?? []).reduce((soma, camada) => soma + 1 + contar(camada.children), 0);
  const quantas = contar(psd.children);
  let itens: ItemDoPsd[];
  if (quantas > LIMITE_DE_CAMADAS || !psd.children?.length) {
    // Sem camadas (o arquivo achatado) ou com mais que o limite: a imagem inteira numa camada só
    if (quantas > LIMITE_DE_CAMADAS) avisos.push(`O arquivo tem ${quantas} camadas e o limite é ${LIMITE_DE_CAMADAS}: ele abriu achatado, numa camada só.`);
    if (!psd.canvas) throw new Error("O arquivo não traz a imagem inteira, e as camadas passam do limite.");
    aoProgresso("Abrindo a imagem…");
    const pixels = await subir((contexto) => contexto.drawImage(psd.canvas!, 0, 0), nome);
    itens = [{ tipo: "pixels", nome, oculta: false, opacidade: 1, mesclagem: "normal", recortada: false, travas: null, rotulo: null, estilo: null, preenchimento: 1, midiaId: pixels.midiaId, versao: pixels.versao, mascara: null }];
  } else {
    itens = await converter(psd.children, quantas);
  }
  if (contarItens(itens) > LIMITE_DE_CAMADAS) throw new Error(`O arquivo passa de ${LIMITE_DE_CAMADAS} camadas.`);
  if (textos) avisos.push(textos === 1 ? "O texto veio como pixels (a camada não é editável como texto)." : `Os ${textos} textos vieram como pixels (as camadas não são editáveis como texto).`);
  if (ajustesFora) avisos.push(ajustesFora === 1 ? "Um ajuste sem par aqui ficou de fora." : `${ajustesFora} ajustes sem par aqui ficaram de fora.`);
  if (efeitosFora) avisos.push(efeitosFora === 1 ? "Um efeito de camada sem par aqui ficou de fora." : `${efeitosFora} efeitos de camada sem par aqui ficaram de fora.`);

  aoProgresso("Salvando o documento…");
  const faixas = [...faixasDoPsd(itens, novoId, DURACAO_DA_CAMADA), ...projeto.faixas.filter((faixa) => faixa.tipo === "principal")];
  await chamarApi(`/projetos/${projeto.id}`, {
    metodo: "PUT",
    corpo: {
      versao: projeto.versao,
      nome,
      proporcao: projeto.proporcao,
      taxa: projeto.taxa,
      fundo: { ...projeto.fundo, transparente: true },
      faixas,
      marcadores: [],
      canais: [],
      tamanho: { largura, altura, ...(resolucao && resolucao > 0 ? { resolucao } : {}) },
    },
  });
  return { projetoId: projeto.id, avisos };
}

type Fontes = {
  fonteDosPixels?: (clipe: Clipe) => HTMLCanvasElement | null;
  fonteDaMascara?: (clipe: Clipe) => HTMLCanvasElement | null;
  fonteDaMascaraDosFiltros?: (clipe: Clipe) => HTMLCanvasElement | null;
};

async function canvasDoBlob(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const canvas = canvasDoDocumento(bitmap.width, bitmap.height);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

/** O retângulo do que não é transparente (null quando é tudo transparente). */
function caixaDoConteudo(canvas: HTMLCanvasElement): { left: number; top: number; right: number; bottom: number } | null {
  const { width, height } = canvas;
  const dados = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, width, height).data;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (dados[(y * width + x) * 4 + 3]) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        bottom = y;
      }
  return right < 0 ? null : { left, top, right: right + 1, bottom: bottom + 1 };
}

/**
 * O PSD do projeto: cada camada desenhada sozinha (com a cor, os filtros, os efeitos sem par e a máscara vetorial nos
 * pixels), as pastas, as máscaras de pixels, os ajustes e os efeitos com par editáveis, e a imagem inteira.
 * `avisos` recebe o que não foi como era.
 */
export async function salvarPsd(projeto: Projeto, midias: ReadonlyMap<string, Midia>, fontes: Fontes, aoProgresso: (texto: string) => void, avisos: string[] = []): Promise<Blob> {
  const tamanho = tamanhoDaImagem(projeto);
  const { largura, altura } = tamanho;
  const camadas = projeto.faixas.filter((faixa) => faixa.tipo !== "principal" && faixa.clipes[0]);
  const total = camadas.filter((faixa) => !faixa.clipes[0].pasta).length;
  let feitas = 0;
  let ajustesFora = 0;

  const comum = (faixa: Faixa): Layer => {
    const clipe = faixa.clipes[0];
    const travas = travasParaPsd(faixa);
    return {
      name: faixa.nome || (clipe.pasta ? "Grupo" : "Camada"),
      hidden: faixa.oculta,
      opacity: clipe.transformacao.opacidade,
      blendMode: mesclagemParaPsd(clipe.mesclagem, Boolean(clipe.pasta)),
      ...(faixa.recortada ? { clipping: true } : {}),
      ...(travas ? { protected: travas } : {}),
      layerColor: rotuloParaPsd(faixa.rotulo),
    };
  };

  // A máscara de pixels levada ao documento (a camada pode ter andado, girado ou crescido desde que ela foi feita)
  const mascaraNoArquivo = async (faixa: Faixa, sozinha: Projeto): Promise<Layer["mask"] | undefined> => {
    const clipe = faixa.clipes[0];
    const mascara = clipe.mascara_pixels;
    if (!mascara) return undefined;
    const fonte = fontes.fonteDaMascara?.(clipe) ?? (await carregarBitmap(arquivoDaMidia(mascara.midia_id, arquivoDaVersao(mascara.versao))));
    const caixa = camadasNaTela(sozinha, midias, tamanho, new Map()).find((item) => item.clipe.id === clipe.id)?.caixa ?? { cx: largura / 2, cy: altura / 2, largura, altura, rotacao: 0, opacidade: 1 };
    const canvas = canvasDoDocumento(largura, altura);
    const contexto = canvas.getContext("2d", { willReadFrequently: true })!;
    // Fora da imagem da máscara vale a cor da borda dela (o canto)
    const amostra = canvasDoDocumento(1, 1);
    const ctxAmostra = amostra.getContext("2d", { willReadFrequently: true })!;
    ctxAmostra.drawImage(fonte, 0, 0, 1, 1, 0, 0, 1, 1);
    const canto = ctxAmostra.getImageData(0, 0, 1, 1).data[0];
    contexto.fillStyle = `rgb(${canto},${canto},${canto})`;
    contexto.fillRect(0, 0, largura, altura);
    const [a, b, c, d, e, f] = matrizDaMascaraNoDocumento(mascara, caixa, tamanho, tamanho);
    contexto.setTransform(a, b, c, d, e, f);
    contexto.drawImage(fonte, 0, 0, largura, altura);
    contexto.setTransform(1, 0, 0, 1, 0, 0);
    return { top: 0, left: 0, right: largura, bottom: altura, defaultColor: canto, disabled: !mascara.ligada, canvas, ...(mascara.densidade < 1 ? { userMaskDensity: mascara.densidade } : {}), ...(mascara.difusao > 0 ? { userMaskFeather: mascara.difusao } : {}) };
  };

  const camada = async (faixa: Faixa): Promise<Layer | null> => {
    const clipe = faixa.clipes[0];
    if (clipe.pasta) return { ...comum(faixa), opened: faixa.aberta !== false, children: await filhos(faixa.id) };
    aoProgresso(`Salvando a camada ${++feitas} de ${total}…`);
    // Sozinha, a camada não guarda o que o arquivo guarda à parte: a máscara de pixels, o modo, a opacidade e o estilo com par
    const editavel = clipe.estilo_camada && !clipe.contorno && !clipe.sombra ? estiloParaPsd(clipe.estilo_camada) : null;
    const semMascara = { ...clipe };
    delete semMascara.mascara_pixels;
    const base: Projeto = { ...projeto, faixas: projeto.faixas.map((item) => (item.id === faixa.id ? { ...item, clipes: [semMascara] } : item)) };
    const sozinha = projetoSoCom(base, [faixa.id], { neutras: new Set([faixa.id]), semEstilo: Boolean(editavel) });
    const mask = await mascaraNoArquivo(faixa, sozinha);
    if (clipe.ajuste) {
      const ajuste = clipe.ajuste_imagem ? ajusteParaPsd(clipe.ajuste_imagem) : null;
      // O ajuste sem par não se desenha sozinho (ele muda o que está embaixo): fica de fora
      if (!ajuste) {
        ajustesFora++;
        return null;
      }
      return { ...comum(faixa), adjustment: ajuste as Layer["adjustment"], ...(mask ? { mask } : {}) };
    }
    const canvas = await canvasDoBlob(await exportarImagem(sozinha, midias, { formato: "png", ...fontes }));
    const caixa = caixaDoConteudo(canvas);
    let recortado: HTMLCanvasElement | undefined;
    if (caixa) {
      recortado = canvasDoDocumento(caixa.right - caixa.left, caixa.bottom - caixa.top);
      recortado.getContext("2d")!.drawImage(canvas, -caixa.left, -caixa.top);
    }
    return {
      ...comum(faixa),
      ...(caixa ? { ...caixa, canvas: recortado } : { left: 0, top: 0, right: 0, bottom: 0 }),
      ...(editavel ? { effects: editavel as Layer["effects"], ...(clipe.preenchimento !== undefined && clipe.preenchimento < 1 ? { fillOpacity: clipe.preenchimento } : {}) } : {}),
      ...(mask ? { mask } : {}),
    };
  };
  // As do mesmo pai, de baixo para cima (a ordem do arquivo)
  const filhos = async (pai: string | null): Promise<Layer[]> => {
    const irmas = camadas.filter((faixa) => paiDaCamada(projeto, faixa) === pai);
    const feitasAqui: Layer[] = [];
    for (const faixa of irmas) {
      const item = await camada(faixa);
      if (item) feitasAqui.push(item);
    }
    return feitasAqui.reverse();
  };

  const filhosDaRaiz = await filhos(null);
  // A cor do fundo do documento vira a camada de baixo (o arquivo não tem cor de fundo)
  if (!projeto.fundo.transparente) {
    const fundo = canvasDoDocumento(largura, altura);
    const contexto = fundo.getContext("2d")!;
    contexto.fillStyle = projeto.fundo.cor;
    contexto.fillRect(0, 0, largura, altura);
    filhosDaRaiz.unshift({ name: "Fundo", left: 0, top: 0, right: largura, bottom: altura, canvas: fundo, blendMode: "normal", opacity: 1 });
  }
  if (ajustesFora) avisos.push(ajustesFora === 1 ? "Um ajuste sem par no arquivo ficou de fora." : `${ajustesFora} ajustes sem par no arquivo ficaram de fora.`);

  aoProgresso("Salvando a imagem inteira…");
  const inteira = await canvasDoBlob(await exportarImagem(projeto, midias, { formato: "png", ...fontes }));
  const resolucao = projeto.tamanho?.resolucao;
  const psd: Psd = {
    width: largura,
    height: altura,
    children: filhosDaRaiz,
    canvas: inteira,
    imageResources: {
      ...(resolucao ? { resolutionInfo: { horizontalResolution: resolucao, horizontalResolutionUnit: "PPI", widthUnit: "Inches", verticalResolution: resolucao, verticalResolutionUnit: "PPI", heightUnit: "Inches" } } : {}),
      // As informações do arquivo, no XMP que os editores leem
      ...(temInformacoes(projeto.informacoes) ? { xmpMetadata: xmpDasInformacoes(projeto.informacoes) } : {}),
    },
  };
  const bytes = writePsd(psd, { generateThumbnail: true });
  return new Blob([bytes], { type: "image/vnd.adobe.photoshop" });
}


/** O que o Arquivo › Abrir aceita além das imagens. */
export const ACEITAR_PSD = ".psd,.psb";

export const ehPsd = (arquivo: File) => /\.(psd|psb)$/i.test(arquivo.name);

/** Os avisos da abertura atravessam a navegação até o editor do documento novo. */
export function guardarAvisos(projetoId: string, avisos: string[]) {
  try {
    if (avisos.length) sessionStorage.setItem(`takeone-avisos-${projetoId}`, JSON.stringify(avisos));
  } catch {
    // Sem armazenamento, os avisos se perdem: o documento abre igual
  }
}

export function avisosGuardados(projetoId: string): string[] {
  try {
    const chave = `takeone-avisos-${projetoId}`;
    const lidos = JSON.parse(sessionStorage.getItem(chave) ?? "[]") as string[];
    sessionStorage.removeItem(chave);
    return Array.isArray(lidos) ? lidos : [];
  } catch {
    return [];
  }
}
