// Onde a imagem de cada clipe fica no quadro. A prévia (lib/previa/compositor.ts) e o render
// (core/utils/geometria.py) fazem a mesma conta, conferida pelos mesmos casos em tests/casos/geometria.json.
//
// A mídia recortada entra inteira no quadro, do maior tamanho que cabe e centralizada. Depois a
// transformação aumenta ou diminui a partir do centro, gira e desloca. As medidas da caixa são em
// pixels do quadro, então valem em qualquer resolução (prévia pequena, 1080p ou 4K).
import type { Recorte, Transformacao, Virar } from "./modelo.ts";

export type Tamanho = { largura: number; altura: number };

export type Ponto = { x: number; y: number };

/** Retângulo girado em volta do próprio centro. */
export type Caixa = {
  cx: number;
  cy: number;
  largura: number;
  altura: number;
  /** Graus, sentido horário. */
  rotacao: number;
  opacidade: number;
};

/**
 * O recorte nas coordenadas da mídia como ela é. O recorte do clipe é do que aparece (já virado), então o
 * clipe virado na horizontal lê, da mídia, o pedaço espelhado: x vai a 1 - x - largura. O tamanho não muda.
 */
export function recorteNaFonte(recorte: Recorte, virar: Virar | null | undefined): Recorte {
  return {
    ...recorte,
    x: virar?.horizontal ? 1 - recorte.x - recorte.largura : recorte.x,
    y: virar?.vertical ? 1 - recorte.y - recorte.altura : recorte.y,
  };
}

/** Um ponto da mídia (em frações) onde ele aparece no clipe virado; a mesma conta volta da tela para a mídia. */
export function pontoVirado(ponto: Ponto, virar: Virar | null | undefined): Ponto {
  return { x: virar?.horizontal ? 1 - ponto.x : ponto.x, y: virar?.vertical ? 1 - ponto.y : ponto.y };
}

/** O PNG de um texto é medido num quadro com este lado menor; em outro tamanho, a caixa escala junto. */
export const LADO_REFERENCIA_TEXTO = 1080;

/** Caixa de um clipe de texto: `imagem` é o tamanho do PNG desenhado para LADO_REFERENCIA_TEXTO. */
export function caixaDoTexto(transformacao: Transformacao, imagem: Tamanho, quadro: Tamanho): Caixa {
  const escala = (transformacao.escala * Math.min(quadro.largura, quadro.altura)) / LADO_REFERENCIA_TEXTO;
  return {
    cx: quadro.largura / 2 + transformacao.x * quadro.largura,
    cy: quadro.altura / 2 + transformacao.y * quadro.altura,
    largura: imagem.largura * escala,
    altura: imagem.altura * escala,
    rotacao: transformacao.rotacao,
    opacidade: transformacao.opacidade,
  };
}

export function caixaDoClipe(transformacao: Transformacao, recorte: Recorte, midia: Tamanho, quadro: Tamanho): Caixa {
  const largura = midia.largura * recorte.largura;
  const altura = midia.altura * recorte.altura;
  const encaixe = Math.min(quadro.largura / largura, quadro.altura / altura) * transformacao.escala;
  return {
    cx: quadro.largura / 2 + transformacao.x * quadro.largura,
    cy: quadro.altura / 2 + transformacao.y * quadro.altura,
    largura: largura * encaixe,
    altura: altura * encaixe,
    rotacao: transformacao.rotacao,
    opacidade: transformacao.opacidade,
  };
}

/** Deslocamento da transformação que põe o centro da caixa no ponto dado. */
export function deslocamentoDoCentro(centro: Ponto, quadro: Tamanho): Ponto {
  return { x: (centro.x - quadro.largura / 2) / quadro.largura, y: (centro.y - quadro.altura / 2) / quadro.altura };
}

/** Os quatro cantos, a partir do de cima à esquerda, no sentido horário. */
export function cantosDaCaixa(caixa: Caixa): Ponto[] {
  const angulo = (caixa.rotacao * Math.PI) / 180;
  const cos = Math.cos(angulo);
  const sen = Math.sin(angulo);
  const mx = caixa.largura / 2;
  const my = caixa.altura / 2;
  return [
    [-mx, -my],
    [mx, -my],
    [mx, my],
    [-mx, my],
  ].map(([x, y]) => ({ x: caixa.cx + x * cos - y * sen, y: caixa.cy + x * sen + y * cos }));
}

/** O ponto em coordenadas da própria caixa (sem o giro, com a origem no centro). */
export function pontoNaCaixa(caixa: Caixa, ponto: Ponto): Ponto {
  const angulo = (-caixa.rotacao * Math.PI) / 180;
  const dx = ponto.x - caixa.cx;
  const dy = ponto.y - caixa.cy;
  return { x: dx * Math.cos(angulo) - dy * Math.sin(angulo), y: dx * Math.sin(angulo) + dy * Math.cos(angulo) };
}

export function contemPonto(caixa: Caixa, ponto: Ponto): boolean {
  const local = pontoNaCaixa(caixa, ponto);
  return Math.abs(local.x) <= caixa.largura / 2 && Math.abs(local.y) <= caixa.altura / 2;
}

/** Retângulo sem giro que contém a caixa girada. */
export function limitesDaCaixa(caixa: Caixa): { esquerda: number; topo: number; direita: number; base: number } {
  const cantos = cantosDaCaixa(caixa);
  const xs = cantos.map((canto) => canto.x);
  const ys = cantos.map((canto) => canto.y);
  return { esquerda: Math.min(...xs), topo: Math.min(...ys), direita: Math.max(...xs), base: Math.max(...ys) };
}

export type Guias = { verticais: number[]; horizontais: number[] };

/**
 * Ímã da prévia: se uma borda ou o centro da caixa passa perto das bordas ou do centro do quadro,
 * devolve quanto mover para encostar, e as linhas de guia para desenhar. `tolerancia` em pixels do quadro.
 */
export function ajustarAsGuias(caixa: Caixa, quadro: Tamanho, tolerancia: number, alvos?: Guias): { dx: number; dy: number; guias: Guias } {
  const limites = limitesDaCaixa(caixa);
  const melhor = (pontos: number[], alvos: number[]) => {
    let escolha: { delta: number; alvo: number } | null = null;
    for (const ponto of pontos) {
      for (const alvo of alvos) {
        const delta = alvo - ponto;
        if (Math.abs(delta) <= tolerancia && (!escolha || Math.abs(delta) < Math.abs(escolha.delta))) escolha = { delta, alvo };
      }
    }
    return escolha;
  };
  const vertical = melhor([limites.esquerda, caixa.cx, limites.direita], alvos?.verticais ?? [0, quadro.largura / 2, quadro.largura]);
  const horizontal = melhor([limites.topo, caixa.cy, limites.base], alvos?.horizontais ?? [0, quadro.altura / 2, quadro.altura]);
  return {
    dx: vertical?.delta ?? 0,
    dy: horizontal?.delta ?? 0,
    guias: { verticais: vertical ? [vertical.alvo] : [], horizontais: horizontal ? [horizontal.alvo] : [] },
  };
}
