// As contas do traço do pincel (ADR 0003, onda 13.2), sem canvas: o espaçamento das marcas ao longo do caminho, a
// suavização (a "corda puxada": o pincel só anda quando o mouse se afasta mais que o comprimento da corda) e a ida do
// ponto da prévia para o pixel da camada. O desenho em si fica em motor.ts.
import type { Caixa } from "../projeto/geometria.ts";
import type { Recorte, Virar } from "../projeto/modelo.ts";

export type PontoDoTraco = { x: number; y: number; pressao: number };

/** As ferramentas que pintam numa camada de pixels. */
export type FerramentaDePintura = "pincel" | "lapis" | "borracha";

/** O modo da pintura: os da camada (lib/projeto/modelo.ts) e Limpar, que apaga com o pincel. */
export type ModoDaPintura =
  | "normal"
  | "dissolver"
  | "escurecer"
  | "multiplicar"
  | "superexposicao_cores"
  | "superexposicao_linear"
  | "cor_mais_escura"
  | "clarear"
  | "tela"
  | "subexposicao_cores"
  | "somar"
  | "cor_mais_clara"
  | "sobrepor"
  | "luz_suave"
  | "luz_forte"
  | "luz_brilhante"
  | "luz_linear"
  | "luz_do_pino"
  | "mistura_solida"
  | "diferenca"
  | "exclusao"
  | "subtrair"
  | "dividir"
  | "matiz"
  | "saturacao"
  | "cor"
  | "luminosidade"
  | "limpar";

export type OpcoesDoPincel = {
  /** O diâmetro, em pixels da imagem. */
  tamanho: number;
  /** 0 é a borda toda esfumada, 1 a borda dura. */
  dureza: number;
  /** O máximo que o traço cobre (0 a 1), por mais que passe no mesmo lugar. */
  opacidade: number;
  /** Quanto cada marca deposita (0 a 1): com fluxo baixo, passar de novo escurece. */
  fluxo: number;
  /** A distância entre as marcas, em frações do diâmetro. */
  espacamento: number;
  /** A corda puxada (0 a 1): quanto o pincel atrasa do mouse para o traço sair liso. */
  suavizacao: number;
  /** Segurar parado continua depositando tinta. */
  aerografo: boolean;
  pressaoNoTamanho: boolean;
  pressaoNaOpacidade: boolean;
  modo: ModoDaPintura;
  /** Lápis: começar sobre a cor do primeiro plano pinta a cor de fundo. */
  apagarAutomaticamente: boolean;
  /** Borracha: pincel, lápis (borda dura, sem suavizar) ou bloco (quadrado fixo). */
  borracha: "pincel" | "lapis" | "bloco";
};

export const PINCEL_PADRAO: OpcoesDoPincel = {
  tamanho: 30,
  dureza: 0.8,
  opacidade: 1,
  fluxo: 1,
  espacamento: 0.25,
  suavizacao: 0.1,
  aerografo: false,
  pressaoNoTamanho: true,
  pressaoNaOpacidade: false,
  modo: "normal",
  apagarAutomaticamente: false,
  borracha: "pincel",
};

/** Os limites dos controles (o tamanho segue os editores de imagem: de 1 a 5000 pixels). */
export const LIMITES_DO_PINCEL = { tamanho: [1, 5000], espacamento: [0.01, 10] } as const;

/** O comprimento da corda em pixels da tela, para uma suavização de 0 a 1. */
export function comprimentoDaCorda(suavizacao: number): number {
  return Math.max(0, Math.min(1, suavizacao)) * 60;
}

/**
 * A corda puxada: o pincel fica parado enquanto o mouse anda dentro da corda e, quando ela estica, vem atrás na
 * direção do mouse. No fim, `soltar` traz o pincel até onde o mouse parou ("recuperar o traço").
 */
export class Corda {
  private pincel: PontoDoTraco | null = null;
  private readonly comprimento: number;

  constructor(comprimento: number) {
    this.comprimento = comprimento;
  }

  /** O ponto do pincel depois que o mouse foi para `mouse`, ou null se ele não andou. */
  puxar(mouse: PontoDoTraco): PontoDoTraco | null {
    if (!this.pincel || this.comprimento <= 0) {
      this.pincel = mouse;
      return mouse;
    }
    const dx = mouse.x - this.pincel.x;
    const dy = mouse.y - this.pincel.y;
    const distancia = Math.hypot(dx, dy);
    if (distancia <= this.comprimento) return null;
    const passo = (distancia - this.comprimento) / distancia;
    this.pincel = { x: this.pincel.x + dx * passo, y: this.pincel.y + dy * passo, pressao: mouse.pressao };
    return this.pincel;
  }

  /** O pincel vai até o mouse (o fim do traço não fica para trás). */
  soltar(mouse: PontoDoTraco): PontoDoTraco | null {
    if (!this.pincel || (this.pincel.x === mouse.x && this.pincel.y === mouse.y)) return null;
    this.pincel = mouse;
    return mouse;
  }
}

/**
 * As marcas ao longo do caminho, a cada `passo` pixels, com a pressão interpolada. Guarda a sobra entre um trecho e
 * outro, para o espaçamento não mudar com a velocidade do mouse.
 */
export class Espacador {
  private ultimo: PontoDoTraco | null = null;
  /** Quanto falta andar até a próxima marca. */
  private falta = 0;

  /** As marcas de `ultimo` até `ponto` (a primeira chamada devolve o próprio ponto). */
  ate(ponto: PontoDoTraco, passo: (pressao: number) => number): PontoDoTraco[] {
    if (!this.ultimo) {
      this.ultimo = ponto;
      this.falta = Math.max(0.5, passo(ponto.pressao));
      return [ponto];
    }
    const de = this.ultimo;
    const distancia = Math.hypot(ponto.x - de.x, ponto.y - de.y);
    const marcas: PontoDoTraco[] = [];
    let andado = 0;
    while (andado + this.falta <= distancia) {
      andado += this.falta;
      const t = andado / distancia;
      const pressao = de.pressao + (ponto.pressao - de.pressao) * t;
      marcas.push({ x: de.x + (ponto.x - de.x) * t, y: de.y + (ponto.y - de.y) * t, pressao });
      // O passo segue a pressão onde a marca caiu (com pressão no tamanho, a marca menor fica mais junta)
      this.falta = Math.max(0.5, passo(pressao));
    }
    this.falta -= distancia - andado;
    this.ultimo = ponto;
    return marcas;
  }
}

/**
 * O ponto da prévia (pixels do quadro, a partir do canto) no pixel da mídia da camada: pela caixa (centro, tamanho
 * e giro), o recorte e a virada. Devolve também quantos pixels da mídia cabem num pixel da prévia.
 */
export function pontoNaCamada(
  ponto: { x: number; y: number },
  caixa: Caixa,
  recorte: Recorte,
  virar: Virar | null | undefined,
  midia: { largura: number; altura: number },
): { x: number; y: number; escala: number } {
  const angulo = (-caixa.rotacao * Math.PI) / 180;
  const dx = ponto.x - caixa.cx;
  const dy = ponto.y - caixa.cy;
  const u = dx * Math.cos(angulo) - dy * Math.sin(angulo);
  const v = dx * Math.sin(angulo) + dy * Math.cos(angulo);
  // Frações do pedaço que aparece; o recorte é da imagem já virada, e a virada leva de volta à mídia
  let fx = recorte.x + (u / caixa.largura + 0.5) * recorte.largura;
  let fy = recorte.y + (v / caixa.altura + 0.5) * recorte.altura;
  if (virar?.horizontal) fx = 1 - fx;
  if (virar?.vertical) fy = 1 - fy;
  return { x: fx * midia.largura, y: fy * midia.altura, escala: (midia.largura * recorte.largura) / Math.max(1e-9, caixa.largura) };
}
