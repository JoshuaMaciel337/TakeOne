"use client";

// A tinta dos efeitos do estilo de camada (ADR 0003, onda 13.9) em pixels do campo da camada: uma cor, um degradê (no
// ângulo da imagem, levado ao campo pelo giro da camada, de um lado ao outro do conteúdo) ou um padrão repetido na
// escala. E a camada pronta de um efeito: a tinta vezes a cobertura, pré-multiplicada, para o compositor.
import { pixelsDoDegrade, tabelaDoDegrade } from "../pintura/degrade";
import { ladrilhoDoPadrao } from "../pintura/padroes";
import type { TintaDaForma } from "../vetor/modelo";
import type { Campo } from "./efeitos";
import { noCampo } from "./efeitos";

export type Retangulo = { x0: number; y0: number; x1: number; y1: number };

const corEmNumeros = (cor: string): [number, number, number] => {
  const valor = Number.parseInt(cor.replace("#", "").slice(0, 6).padEnd(6, "0"), 16);
  return [(valor >> 16) & 255, (valor >> 8) & 255, valor & 255];
};

/** O retângulo do que a camada ocupa (alfa acima de zero), em pixels do campo; o campo todo quando está vazio. */
export function retanguloDoConteudo(alfa: Campo): Retangulo {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < alfa.altura; y++) {
    for (let x = 0; x < alfa.largura; x++) {
      if (alfa.dados[y * alfa.largura + x] <= 0.002) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < x0 ? { x0: 0, y0: 0, x1: alfa.largura, y1: alfa.altura } : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * A tinta em pixels (RGBA sem pré-multiplicar) no campo `largura` × `altura`. O degradê vai de um lado ao outro de
 * `retangulo` no ângulo (da imagem); `escala` é a do campo (pixels do campo por pixel da imagem), para o padrão.
 */
export function pixelsDaTinta(tinta: TintaDaForma, largura: number, altura: number, retangulo: Retangulo, escala: number, giro: number): Uint8ClampedArray {
  const saida = new Uint8ClampedArray(largura * altura * 4);
  if (tinta.tipo === "cor") {
    const [r, g, b] = corEmNumeros(tinta.cor);
    for (let i = 0; i < saida.length; i += 4) saida.set([r, g, b, 255], i);
    return saida;
  }
  if (tinta.tipo === "degrade") {
    const a = (tinta.angulo * Math.PI) / 180;
    const [dx, dy] = noCampo(Math.cos(a), -Math.sin(a), giro);
    const w = retangulo.x1 - retangulo.x0;
    const h = retangulo.y1 - retangulo.y0;
    const meio = ((Math.abs(w * dx) + Math.abs(h * dy)) / 2) * tinta.escala;
    const cx = (retangulo.x0 + retangulo.x1) / 2;
    const cy = (retangulo.y0 + retangulo.y1) / 2;
    const linear = tinta.forma === "linear";
    const de = linear ? { x: cx - dx * meio, y: cy - dy * meio } : { x: cx, y: cy };
    const ate = { x: cx + dx * meio, y: cy + dy * meio };
    return pixelsDoDegrade(largura, altura, de, ate, tinta.forma, tabelaDoDegrade(tinta.degrade, "#000000", "#ffffff"), { inverter: tinta.inverter });
  }
  if (tinta.tipo === "padrao") {
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const padrao = ctx.createPattern(ladrilhoDoPadrao(tinta.padrao, "#000000", "#ffffff"), "repeat");
    if (padrao) {
      padrao.setTransform(new DOMMatrix().scaleSelf(tinta.escala * escala, tinta.escala * escala));
      ctx.fillStyle = padrao;
      ctx.fillRect(0, 0, largura, altura);
    }
    return ctx.getImageData(0, 0, largura, altura).data;
  }
  return saida;
}

/** A tabela de cores (RGBA, 256) de um degradê, para os brilhos que tingem pela distância. */
export const tabelaDaTinta = (tinta: TintaDaForma): Uint8ClampedArray | null => (tinta.tipo === "degrade" ? tabelaDoDegrade(tinta.degrade, "#000000", "#ffffff") : null);

/**
 * A camada de um efeito (RGBA pré-multiplicado, linhas de cima para baixo): a cobertura vezes a tinta (uma cor, os
 * pixels de uma tinta ou a tabela de um degradê lida pelo campo `t`).
 */
export function camadaDoEfeito(cobertura: Campo, tinta: { cor: string } | { pixels: Uint8ClampedArray } | { tabela: Uint8ClampedArray; t: Campo }): Uint8Array {
  const n = cobertura.largura * cobertura.altura;
  const saida = new Uint8Array(n * 4);
  const constante = "cor" in tinta ? corEmNumeros(tinta.cor) : null;
  for (let i = 0; i < n; i++) {
    let r: number;
    let g: number;
    let b: number;
    let a = cobertura.dados[i];
    if (a <= 0) continue;
    if ("cor" in tinta) [r, g, b] = constante!;
    else if ("pixels" in tinta) {
      r = tinta.pixels[i * 4];
      g = tinta.pixels[i * 4 + 1];
      b = tinta.pixels[i * 4 + 2];
      a *= tinta.pixels[i * 4 + 3] / 255;
    } else {
      const k = Math.min(255, Math.max(0, Math.round(tinta.t.dados[i] * 255))) * 4;
      r = tinta.tabela[k];
      g = tinta.tabela[k + 1];
      b = tinta.tabela[k + 2];
      a *= tinta.tabela[k + 3] / 255;
    }
    const alfa = Math.min(1, a);
    saida[i * 4] = Math.round(r * alfa);
    saida[i * 4 + 1] = Math.round(g * alfa);
    saida[i * 4 + 2] = Math.round(b * alfa);
    saida[i * 4 + 3] = Math.round(alfa * 255);
  }
  return saida;
}
