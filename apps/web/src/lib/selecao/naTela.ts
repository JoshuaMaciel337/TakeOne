"use client";

// A seleção do documento no navegador: em canvas (para desenhar e levar à mídia de uma camada), de volta de um
// canvas, e as formigas (a borda numa imagem do tamanho da prévia, que a máscara do CSS anima).
import { type Afim, inverter as inverterMatriz } from "../projeto/mascaraDePixels.ts";
import { bordaNaTela, type Selecao } from "./mascara.ts";
import type { ImagemRgba } from "./varinha.ts";

/** A seleção como imagem: branco com o alfa da cobertura. */
export function selecaoParaCanvas(selecao: Selecao): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = selecao.largura;
  canvas.height = selecao.altura;
  const ctx = canvas.getContext("2d")!;
  const dados = ctx.createImageData(selecao.largura, selecao.altura);
  for (let i = 0; i < selecao.dados.length; i++) {
    dados.data[i * 4] = 255;
    dados.data[i * 4 + 1] = 255;
    dados.data[i * 4 + 2] = 255;
    dados.data[i * 4 + 3] = selecao.dados[i];
  }
  ctx.putImageData(dados, 0, 0);
  return canvas;
}

/** A seleção de uma imagem do tamanho do documento: pelo alfa, ou pelo cinza (o vermelho) de uma máscara opaca. */
export function selecaoDoCanvas(canvas: HTMLCanvasElement | OffscreenCanvas, canal: "alfa" | "cinza" = "alfa"): Selecao {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const dados = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < dados.length; i++) dados[i] = canal === "alfa" ? data[i * 4 + 3] : Math.round((data[i * 4] * data[i * 4 + 3]) / 255);
  return { largura: canvas.width, altura: canvas.height, dados };
}

/** Uma imagem desenhada no documento por uma afim (pixel da imagem → pixel do documento), como seleção. */
export function imagemNoDocumento(imagem: CanvasImageSource, matriz: Afim, documento: { largura: number; altura: number }, canal: "alfa" | "cinza" = "cinza"): Selecao {
  const canvas = document.createElement("canvas");
  canvas.width = documento.largura;
  canvas.height = documento.altura;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.setTransform(...matriz);
  ctx.drawImage(imagem, 0, 0);
  return selecaoDoCanvas(canvas, canal);
}

/**
 * A seleção do documento levada à mídia de uma camada (o pixel da mídia → o do documento pela `matriz`): branco
 * com o alfa da cobertura, no tamanho da mídia.
 */
export function selecaoNaMidia(selecao: Selecao, matriz: Afim, midia: { largura: number; altura: number }): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(midia.largura));
  canvas.height = Math.max(1, Math.round(midia.altura));
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(...inverterMatriz(matriz));
  ctx.drawImage(selecaoParaCanvas(selecao), 0, 0);
  return canvas;
}

/** A borda da seleção como imagem do tamanho da prévia (branco na borda), para a máscara do CSS das formigas. */
export function bordaComoImagem(selecao: Selecao, largura: number, altura: number): string {
  const l = Math.max(1, Math.round(largura));
  const a = Math.max(1, Math.round(altura));
  const borda = bordaNaTela(selecao, l, a);
  const canvas = document.createElement("canvas");
  canvas.width = l;
  canvas.height = a;
  const ctx = canvas.getContext("2d")!;
  const dados = ctx.createImageData(l, a);
  for (let i = 0; i < borda.length; i++) {
    if (!borda[i]) continue;
    dados.data[i * 4] = 255;
    dados.data[i * 4 + 1] = 255;
    dados.data[i * 4 + 2] = 255;
    dados.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(dados, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Os pixels de uma imagem (o PNG da exportação), em RGBA sem pré-multiplicar, para a varinha e o laço magnético. */
export async function imagemDoBlob(blob: Blob): Promise<ImagemRgba> {
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { largura: canvas.width, altura: canvas.height, dados: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}
