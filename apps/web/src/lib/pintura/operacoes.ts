// As operações de pixels com a seleção (ADR 0003, onda 13.4): Preencher, Limpar e Traçado, sobre os pixels RGBA de uma
// camada (sem pré-multiplicar) e uma cobertura de 0 a 255 por pixel (a seleção levada à camada; sem ela, a camada
// inteira). Preencher usa a mesma mistura do pincel (juntarTraco), então os 27 modos, a opacidade e o preservar
// transparência são os do pincel.
import { combinar, contrair, expandir, type Selecao } from "../selecao/mascara.ts";
import { juntarTraco } from "./mesclar.ts";
import type { ModoDaPintura } from "./traco.ts";

export type Rgb = [number, number, number];

/** A cor de "#rrggbb" em 0 a 255. */
export function rgbDaCor(cor: string): Rgb {
  const valor = Number.parseInt(cor.replace("#", "").slice(0, 6).padEnd(6, "0"), 16);
  return [(valor >> 16) & 255, (valor >> 8) & 255, valor & 255];
}

/**
 * Preenche os pixels pela cobertura: com uma cor, ou com outra imagem do mesmo tamanho (um padrão já ladrilhado, o
 * estado do histórico). `dados` muda no lugar.
 */
export function preencherPixels(
  dados: Uint8ClampedArray,
  largura: number,
  cobertura: Uint8Array | Uint8ClampedArray | null,
  tinta: Rgb | Uint8ClampedArray,
  { modo = "normal", opacidade = 1, preservar = false }: { modo?: ModoDaPintura; opacidade?: number; preservar?: boolean } = {},
): void {
  const traco = new Uint8ClampedArray(dados.length);
  const n = dados.length / 4;
  for (let i = 0; i < n; i++) {
    const cobre = cobertura ? cobertura[i] : 255;
    if (Array.isArray(tinta)) {
      traco[i * 4] = tinta[0];
      traco[i * 4 + 1] = tinta[1];
      traco[i * 4 + 2] = tinta[2];
      traco[i * 4 + 3] = cobre;
    } else {
      traco[i * 4] = tinta[i * 4];
      traco[i * 4 + 1] = tinta[i * 4 + 1];
      traco[i * 4 + 2] = tinta[i * 4 + 2];
      traco[i * 4 + 3] = Math.round((tinta[i * 4 + 3] * cobre) / 255);
    }
  }
  const fundo = Uint8ClampedArray.from(dados);
  juntarTraco(fundo, traco, dados, { modo, opacidade, travarTransparencia: preservar, apagar: false, largura, x0: 0, y0: 0 });
}

/**
 * Limpar (Delete): o que está coberto fica transparente; com a transparência travada (ou na camada de fundo), pinta a
 * cor de fundo no lugar, como lá.
 */
export function limparPixels(dados: Uint8ClampedArray, cobertura: Uint8Array | Uint8ClampedArray | null, corDeFundo: Rgb | null): void {
  const n = dados.length / 4;
  for (let i = 0; i < n; i++) {
    const cobre = (cobertura ? cobertura[i] : 255) / 255;
    if (!cobre) continue;
    if (corDeFundo) {
      for (let c = 0; c < 3; c++) dados[i * 4 + c] = Math.round(dados[i * 4 + c] * (1 - cobre) + corDeFundo[c] * cobre);
    } else dados[i * 4 + 3] = Math.round(dados[i * 4 + 3] * (1 - cobre));
  }
}

/** Editar › Traçado: a faixa de `largura` pixels na borda da seleção, por dentro, centralizada ou por fora. */
export function faixaDoTracado(selecao: Selecao, largura: number, onde: "dentro" | "centro" | "fora"): Selecao {
  if (onde === "fora") return combinar(expandir(selecao, largura), selecao, "subtrair")!;
  if (onde === "dentro") return combinar(selecao, contrair(selecao, largura), "subtrair")!;
  return combinar(expandir(selecao, largura / 2), contrair(selecao, largura / 2), "subtrair")!;
}

/** O retângulo do que não é transparente (Aparar por transparência), ou do que difere da cor de um canto. */
export function caixaParaAparar(dados: Uint8ClampedArray, largura: number, altura: number, por: "transparencia" | "cantoDeCima" | "cantoDeBaixo"): { x0: number; y0: number; x1: number; y1: number } | null {
  const canto = por === "cantoDeBaixo" ? ((altura - 1) * largura + largura - 1) * 4 : 0;
  const diferente = (i: number) => {
    if (por === "transparencia") return dados[i * 4 + 3] > 0;
    for (let c = 0; c < 4; c++) if (Math.abs(dados[i * 4 + c] - dados[canto + c]) > 1) return true;
    return false;
  };
  let x0 = largura;
  let y0 = altura;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (!diferente(y * largura + x)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}
