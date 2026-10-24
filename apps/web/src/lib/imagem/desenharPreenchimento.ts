"use client";

// O desenho da camada de preenchimento (camadaDePreenchimento.ts) num canvas, para a prévia e a exportação.
import { pixelsDoDegrade, tabelaDoDegrade } from "../pintura/degrade";
import { ladrilhoDoPadrao } from "../pintura/padroes";
import { type CamadaDePreenchimento, pontasDoDegrade } from "./camadaDePreenchimento";

/**
 * O preenchimento desenhado num canvas `largura` × `altura`; `escala` é quantos pixels do canvas há em cada pixel do
 * documento (o padrão tem o tamanho dele no documento, em qualquer zoom).
 */
export function desenharPreenchimento(preenchimento: CamadaDePreenchimento, largura: number, altura: number, escala: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d")!;
  const tinta = preenchimento.tinta;
  if (tinta.tipo === "cor") {
    ctx.fillStyle = tinta.cor;
    ctx.fillRect(0, 0, largura, altura);
  } else if (tinta.tipo === "padrao") {
    const padrao = ctx.createPattern(ladrilhoDoPadrao(tinta.padrao, "#000000", "#ffffff"), "repeat");
    if (padrao) {
      padrao.setTransform(new DOMMatrix().scaleSelf(tinta.escala * escala, tinta.escala * escala));
      ctx.fillStyle = padrao;
      ctx.fillRect(0, 0, largura, altura);
    }
  } else {
    const { de, ate } = pontasDoDegrade(preenchimento, largura, altura);
    const dados = pixelsDoDegrade(largura, altura, de, ate, tinta.forma, tabelaDoDegrade(tinta.degrade, "#000000", "#ffffff"), { inverter: tinta.inverter });
    ctx.putImageData(new ImageData(new Uint8ClampedArray(dados), largura, altura), 0, 0);
  }
  return canvas;
}

const DESENHADOS = new Map<string, { chave: string; canvas: HTMLCanvasElement }>();

/** O preenchimento no tamanho pedido, guardado por camada enquanto nada muda (a prévia desenha a cada quadro). */
export function preenchimentoNoTamanho(id: string, preenchimento: CamadaDePreenchimento, largura: number, altura: number, escala: number): HTMLCanvasElement {
  const pl = Math.max(1, Math.round(largura));
  const pa = Math.max(1, Math.round(altura));
  const chave = `${pl}x${pa}:${escala}:${JSON.stringify(preenchimento)}`;
  const guardado = DESENHADOS.get(id);
  if (guardado?.chave === chave) return guardado.canvas;
  const canvas = desenharPreenchimento(preenchimento, pl, pa, escala);
  DESENHADOS.delete(id);
  DESENHADOS.set(id, { chave, canvas });
  while (DESENHADOS.size > 32) DESENHADOS.delete(DESENHADOS.keys().next().value!);
  return canvas;
}
