"use client";

// Exportar como, Salvar para web e a Exportação rápida do editor de imagem (ADR 0003, onda 13.13). A imagem sai do
// mesmo compositor da exportação (`exportarImagem`) e vira o formato pedido: PNG, JPG e WebP pelo navegador (o WebP com
// qualidade 1 sai sem perda no Chrome), GIF, PNG-8, TIFF, BMP, ICO e PDF pelos codificadores daqui, e AVIF pela API
// (o navegador lê, mas não grava).
import type { Clipe, Projeto } from "@/lib/projeto/modelo";
import { tamanhoDaImagem } from "@/lib/projeto/imagem";
import type { Midia } from "@/lib/tipos";

import { codificarBmp } from "./formatos/bmp";
import { temTransparencia, zlib } from "./formatos/comum";
import { codificarGif } from "./formatos/gif";
import { codificarIco, TAMANHOS_DO_ICONE } from "./formatos/ico";
import { codificarPdf } from "./formatos/pdf";
import { codificarPng8 } from "./formatos/png8";
import { indexar, type OpcoesDaPaleta, OPCOES_PADRAO_DA_PALETA } from "./formatos/quantizar";
import { type CompressaoDoTiff, codificarTiff } from "./formatos/tiff";
import { exportarImagem } from "./imagem";
import { comResolucao } from "./resolucao";

export type FormatoDeExportacao = "png" | "png8" | "jpeg" | "webp" | "webp_sem_perda" | "gif" | "avif" | "tiff" | "bmp" | "ico" | "pdf";

export const FORMATOS_DE_EXPORTACAO: { id: FormatoDeExportacao; nome: string; extensao: string; tipo: string; qualidade: boolean; paleta: boolean; transparencia: boolean; biblioteca: boolean; mostra: boolean }[] = [
  { id: "png", nome: "PNG", extensao: "png", tipo: "image/png", qualidade: false, paleta: false, transparencia: true, biblioteca: true, mostra: true },
  { id: "png8", nome: "PNG-8 (paleta)", extensao: "png", tipo: "image/png", qualidade: false, paleta: true, transparencia: true, biblioteca: true, mostra: true },
  { id: "jpeg", nome: "JPG", extensao: "jpg", tipo: "image/jpeg", qualidade: true, paleta: false, transparencia: false, biblioteca: true, mostra: true },
  { id: "webp", nome: "WebP", extensao: "webp", tipo: "image/webp", qualidade: true, paleta: false, transparencia: true, biblioteca: true, mostra: true },
  { id: "webp_sem_perda", nome: "WebP sem perda", extensao: "webp", tipo: "image/webp", qualidade: false, paleta: false, transparencia: true, biblioteca: true, mostra: true },
  { id: "gif", nome: "GIF", extensao: "gif", tipo: "image/gif", qualidade: false, paleta: true, transparencia: true, biblioteca: true, mostra: true },
  { id: "avif", nome: "AVIF", extensao: "avif", tipo: "image/avif", qualidade: true, paleta: false, transparencia: true, biblioteca: true, mostra: true },
  { id: "tiff", nome: "TIFF", extensao: "tif", tipo: "image/tiff", qualidade: false, paleta: false, transparencia: true, biblioteca: true, mostra: false },
  { id: "bmp", nome: "BMP", extensao: "bmp", tipo: "image/bmp", qualidade: false, paleta: false, transparencia: true, biblioteca: true, mostra: true },
  { id: "ico", nome: "ICO (ícone)", extensao: "ico", tipo: "image/x-icon", qualidade: false, paleta: false, transparencia: true, biblioteca: false, mostra: true },
  { id: "pdf", nome: "PDF", extensao: "pdf", tipo: "application/pdf", qualidade: true, paleta: false, transparencia: true, biblioteca: false, mostra: false },
];

export const formatoDe = (id: FormatoDeExportacao) => FORMATOS_DE_EXPORTACAO.find((item) => item.id === id)!;

export type OpcoesDeExportacao = {
  formato: FormatoDeExportacao;
  /** Multiplica o tamanho do documento. */
  escala: number;
  /** 0 a 1 (JPG, WebP, AVIF e o PDF em JPEG). */
  qualidade: number;
  paleta: OpcoesDaPaleta;
  tiff: CompressaoDoTiff;
  /** Os lados do ícone. */
  icone: number[];
  /** O PDF com a imagem em JPEG (menor) ou sem perda. */
  pdf: "jpeg" | "sem_perda";
};

export const OPCOES_PADRAO_DE_EXPORTACAO: OpcoesDeExportacao = {
  formato: "png",
  escala: 1,
  qualidade: 0.92,
  paleta: OPCOES_PADRAO_DA_PALETA,
  tiff: "deflate",
  icone: [16, 32, 48, 256],
  pdf: "jpeg",
};

export { TAMANHOS_DO_ICONE };

export type FontesDaExportacao = {
  fonteDosPixels?: (clipe: Clipe) => HTMLCanvasElement | null;
  fonteDaMascara?: (clipe: Clipe) => HTMLCanvasElement | null;
  fonteDaMascaraDosFiltros?: (clipe: Clipe) => HTMLCanvasElement | null;
};

/** Nome de arquivo sem os caracteres que os sistemas recusam. */
export function nomeDoArquivo(nome: string, formato: FormatoDeExportacao): string {
  return `${nome.replace(/[\\/:*?"<>|]+/g, " ").trim() || "imagem"}.${formatoDe(formato).extensao}`;
}

/** O maior lado que a exportação aceita (como o documento). */
export const LADO_MAXIMO_DA_EXPORTACAO = 8192;

const blobDoCanvas = (canvas: HTMLCanvasElement, tipo: string, qualidade?: number) =>
  new Promise<Blob>((pronto, falhou) => canvas.toBlob((blob) => (blob ? pronto(blob) : falhou(new Error("O navegador não conseguiu gravar a imagem."))), tipo, qualidade));

export async function pixelsDoBlob(blob: Blob): Promise<{ canvas: HTMLCanvasElement; dados: Uint8ClampedArray }> {
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const contexto = canvas.getContext("2d", { willReadFrequently: true })!;
  contexto.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { canvas, dados: contexto.getImageData(0, 0, canvas.width, canvas.height).data };
}

const blobDeBytes = (bytes: Uint8Array, tipo: string) => new Blob([bytes as Uint8Array<ArrayBuffer>], { type: tipo });

/** O AVIF pela API: o PNG sobe em partes de 8 MB (o proxy corta em 10) e a última resposta é o arquivo. */
async function avifPelaApi(png: Blob, qualidade: number): Promise<Blob> {
  const parte = 8 * 1024 * 1024;
  const total = Math.max(1, Math.ceil(png.size / parte));
  const envio = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  for (let i = 0; i < total; i++) {
    const resposta = await fetch(`/api/conversoes/imagem?formato=avif&qualidade=${Math.round(qualidade * 100)}&envio=${envio}&parte=${i}&total=${total}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: png.slice(i * parte, (i + 1) * parte),
      credentials: "same-origin",
    });
    if (!resposta.ok) {
      const dados = await resposta.json().catch(() => null);
      throw new Error(typeof dados?.detail === "string" ? dados.detail : "Não foi possível converter para AVIF.");
    }
    if (i === total - 1) return resposta.blob();
  }
  throw new Error("A conversão não terminou.");
}

/** O ícone: a imagem cabendo no quadrado de cada lado, com o resto transparente. */
async function icone(origem: HTMLCanvasElement, lados: number[]): Promise<Uint8Array> {
  const escolhidos = [...new Set(lados.filter((lado) => TAMANHOS_DO_ICONE.includes(lado)))].sort((a, b) => a - b);
  if (!escolhidos.length) throw new Error("Escolha pelo menos um tamanho para o ícone.");
  const imagens = await Promise.all(
    escolhidos.map(async (lado) => {
      const canvas = document.createElement("canvas");
      canvas.width = lado;
      canvas.height = lado;
      const contexto = canvas.getContext("2d")!;
      contexto.imageSmoothingQuality = "high";
      const escala = lado / Math.max(origem.width, origem.height);
      const l = origem.width * escala;
      const a = origem.height * escala;
      contexto.drawImage(origem, (lado - l) / 2, (lado - a) / 2, l, a);
      return { lado, png: new Uint8Array(await (await blobDoCanvas(canvas, "image/png")).arrayBuffer()) };
    }),
  );
  return codificarIco(imagens);
}

/** O PDF de uma imagem: a cor em JPEG (sem o alfa, para a borda não escurecer) ou sem perda, e o alfa à parte. */
export async function paginaDoPdf(canvas: HTMLCanvasElement, dados: Uint8ClampedArray, ppi: number, modo: "jpeg" | "sem_perda", qualidade: number) {
  const { width: largura, height: altura } = canvas;
  const alfa = temTransparencia(dados);
  let imagem: { tipo: "jpeg"; bytes: Uint8Array } | { tipo: "flate"; bytes: Uint8Array };
  if (modo === "jpeg") {
    const opaco = document.createElement("canvas");
    opaco.width = largura;
    opaco.height = altura;
    const contexto = opaco.getContext("2d")!;
    const copia = new ImageData(new Uint8ClampedArray(dados), largura, altura);
    for (let i = 3; i < copia.data.length; i += 4) copia.data[i] = 255;
    contexto.putImageData(copia, 0, 0);
    imagem = { tipo: "jpeg", bytes: new Uint8Array(await (await blobDoCanvas(opaco, "image/jpeg", qualidade)).arrayBuffer()) };
  } else {
    const rgb = new Uint8Array(largura * altura * 3);
    for (let p = 0; p < largura * altura; p++) rgb.set(dados.subarray(p * 4, p * 4 + 3), p * 3);
    imagem = { tipo: "flate", bytes: await zlib(rgb) };
  }
  let mascara: Uint8Array | null = null;
  if (alfa) {
    const cinza = new Uint8Array(largura * altura);
    for (let p = 0; p < cinza.length; p++) cinza[p] = dados[p * 4 + 3];
    mascara = await zlib(cinza);
  }
  return { largura, altura, ppi, imagem, alfa: mascara };
}

/**
 * O arquivo no formato pedido. A resolução do documento vai no arquivo quando o formato tem onde (PNG, JPG, PNG-8,
 * TIFF, BMP e o tamanho da página do PDF), multiplicada pela escala para a medida em centímetros ficar a mesma.
 */
export async function gerarArquivo(projeto: Projeto, midias: ReadonlyMap<string, Midia>, opcoes: OpcoesDeExportacao, fontes: FontesDaExportacao): Promise<Blob> {
  const { formato, escala, qualidade } = opcoes;
  const base = tamanhoDaImagem(projeto);
  if (Math.max(base.largura, base.altura) * escala > LADO_MAXIMO_DA_EXPORTACAO + 0.5) throw new Error(`O lado maior passa de ${LADO_MAXIMO_DA_EXPORTACAO} pixels.`);
  const ppi = (projeto.tamanho?.resolucao ?? 72) * escala;
  const comPpi = projeto.tamanho?.resolucao ? ppi : null;
  if (formato === "png" || formato === "jpeg" || formato === "webp" || formato === "webp_sem_perda") {
    let blob = await exportarImagem(projeto, midias, { formato: formato === "webp_sem_perda" ? "webp" : formato, qualidade: formato === "webp_sem_perda" ? 1 : qualidade, escala, ...fontes });
    if (comPpi && (formato === "png" || formato === "jpeg")) blob = blobDeBytes(comResolucao(new Uint8Array(await blob.arrayBuffer()), formato, comPpi), blob.type);
    return blob;
  }
  const png = await exportarImagem(projeto, midias, { formato: "png", escala, ...fontes });
  if (formato === "avif") return avifPelaApi(png, qualidade);
  const { canvas } = await pixelsDoBlob(png);
  return codificarCanvas(canvas, opcoes, ppi, comPpi);
}

/**
 * Um canvas (a imagem, uma camada, uma prancheta) no formato pedido. `ppi` é a resolução que o arquivo leva quando
 * tem onde; `comPpi`, a mesma só quando o documento tem uma (o PNG e o JPG sem ela ficam sem o bloco).
 */
export async function codificarCanvas(canvas: HTMLCanvasElement, opcoes: OpcoesDeExportacao, ppi = 72, comPpi: number | null = null): Promise<Blob> {
  const { formato, qualidade } = opcoes;
  const { width: largura, height: altura } = canvas;
  if (formato === "png" || formato === "webp" || formato === "webp_sem_perda" || formato === "avif") {
    const blob = await blobDoCanvas(canvas, formato === "png" || formato === "avif" ? "image/png" : "image/webp", formato === "webp_sem_perda" ? 1 : qualidade);
    if (formato === "avif") return avifPelaApi(blob, qualidade);
    return formato === "png" && comPpi ? blobDeBytes(comResolucao(new Uint8Array(await blob.arrayBuffer()), "png", comPpi), "image/png") : blob;
  }
  if (formato === "jpeg") {
    // O JPG não tem transparência: o que for transparente sai branco
    const branco = document.createElement("canvas");
    branco.width = largura;
    branco.height = altura;
    const contexto = branco.getContext("2d")!;
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(0, 0, largura, altura);
    contexto.drawImage(canvas, 0, 0);
    const blob = await blobDoCanvas(branco, "image/jpeg", qualidade);
    return comPpi ? blobDeBytes(comResolucao(new Uint8Array(await blob.arrayBuffer()), "jpeg", comPpi), "image/jpeg") : blob;
  }
  const dados = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, largura, altura).data;
  switch (formato) {
    case "png8":
      return blobDeBytes(await codificarPng8(indexar(dados, largura, altura, opcoes.paleta), comPpi), "image/png");
    case "gif":
      return blobDeBytes(codificarGif(indexar(dados, largura, altura, opcoes.paleta)), "image/gif");
    case "tiff":
      return blobDeBytes(await codificarTiff(dados, largura, altura, { compressao: opcoes.tiff, ppi }), "image/tiff");
    case "bmp":
      return blobDeBytes(codificarBmp(dados, largura, altura, ppi), "image/bmp");
    case "ico":
      return blobDeBytes(await icone(canvas, opcoes.icone), "image/x-icon");
    case "pdf":
      return blobDeBytes(codificarPdf([await paginaDoPdf(canvas, dados, ppi, opcoes.pdf, qualidade)], ""), "application/pdf");
  }
}

/** O retângulo do que não é transparente (null quando é tudo transparente). */
export function caixaDoConteudo(canvas: HTMLCanvasElement): { x: number; y: number; largura: number; altura: number } | null {
  const { width, height } = canvas;
  const dados = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, width, height).data;
  let esquerda = width;
  let topo = height;
  let direita = -1;
  let baixo = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (dados[(y * width + x) * 4 + 3]) {
        if (x < esquerda) esquerda = x;
        if (x > direita) direita = x;
        if (y < topo) topo = y;
        baixo = y;
      }
  return direita < 0 ? null : { x: esquerda, y: topo, largura: direita - esquerda + 1, altura: baixo - topo + 1 };
}

/** O pedaço do canvas num canvas novo. */
export function recortarCanvas(canvas: HTMLCanvasElement, { x, y, largura, altura }: { x: number; y: number; largura: number; altura: number }): HTMLCanvasElement {
  const novo = document.createElement("canvas");
  novo.width = Math.max(1, Math.round(largura));
  novo.height = Math.max(1, Math.round(altura));
  novo.getContext("2d")!.drawImage(canvas, -Math.round(x), -Math.round(y));
  return novo;
}

/** Nomes de arquivo sem repetir (o segundo "Logo" vira "Logo 2") e sem os caracteres que os sistemas recusam. */
export function nomesSemRepetir() {
  const usados = new Set<string>();
  return (nome: string, extensao: string) => {
    const limpo = nome.replace(/[\\/:*?"<>|]+/g, "-").trim() || "imagem";
    let base = limpo;
    for (let n = 2; usados.has(`${base}.${extensao}`.toLowerCase()); n++) base = `${limpo} ${n}`;
    usados.add(`${base}.${extensao}`.toLowerCase());
    return `${base}.${extensao}`;
  };
}

// ——— Preferências da exportação rápida (por navegador: é uma conveniência de quem exporta) ———
export type PreferenciasDeExportacao = { formato: FormatoDeExportacao; qualidade: number };
const CHAVE_DAS_PREFERENCIAS = "takeone-exportacao-rapida";
export const PREFERENCIAS_PADRAO: PreferenciasDeExportacao = { formato: "png", qualidade: 0.92 };

export function lerPreferencias(): PreferenciasDeExportacao {
  try {
    const lidas = JSON.parse(localStorage.getItem(CHAVE_DAS_PREFERENCIAS) ?? "null") as Partial<PreferenciasDeExportacao> | null;
    const formato = FORMATOS_DE_EXPORTACAO.some((item) => item.id === lidas?.formato) ? lidas!.formato! : PREFERENCIAS_PADRAO.formato;
    const qualidade = typeof lidas?.qualidade === "number" && lidas.qualidade >= 0.1 && lidas.qualidade <= 1 ? lidas.qualidade : PREFERENCIAS_PADRAO.qualidade;
    return { formato, qualidade };
  } catch {
    return PREFERENCIAS_PADRAO;
  }
}

export function guardarPreferencias(preferencias: PreferenciasDeExportacao) {
  try {
    localStorage.setItem(CHAVE_DAS_PREFERENCIAS, JSON.stringify(preferencias));
  } catch {
    // Sem armazenamento, a exportação rápida usa o PNG
  }
}

export function baixarBlob(blob: Blob, arquivo: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = arquivo;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
