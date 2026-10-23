// Objetos de uma foto no editor de imagem: os cliques e o pincel são feitos na camada como ela aparece (recortada e
// talvez virada); o worker trabalha na foto inteira. Estas contas levam de uma para a outra.
import { pontoVirado, type Ponto } from "./geometria.ts";
import type { Recorte, Virar } from "./modelo.ts";

/** Um ponto da camada na tela (frações da caixa dela) em frações da foto inteira. */
export function pontoDaCamadaNaFoto(u: number, v: number, recorte: Recorte, virar: Virar | null | undefined): Ponto {
  return pontoVirado({ x: recorte.x + u * recorte.largura, y: recorte.y + v * recorte.altura }, virar);
}

/**
 * Onde a caixa da camada cai na foto, em pixels dela, e se precisa espelhar: o pincel desenhado na caixa vai para
 * esse retângulo do desenho na foto inteira.
 */
export function caixaDaCamadaNaFoto(recorte: Recorte, virar: Virar | null | undefined, largura: number, altura: number) {
  const x = virar?.horizontal ? 1 - recorte.x - recorte.largura : recorte.x;
  const y = virar?.vertical ? 1 - recorte.y - recorte.altura : recorte.y;
  return {
    x: x * largura,
    y: y * altura,
    largura: recorte.largura * largura,
    altura: recorte.altura * altura,
    espelharX: Boolean(virar?.horizontal),
    espelharY: Boolean(virar?.vertical),
  };
}
