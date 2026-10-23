"use client";

// O motor da pintura (ADR 0003, onda 13.2): cada camada de pixels tem um canvas com o que já foi pintado (`camada`);
// o traço da vez acumula o alfa das marcas noutro canvas (`traco`), e a `tela` mostra os dois juntos, pelo modo e
// pela opacidade do traço, só no retângulo que mudou. Ao soltar, a tela vira a camada. A opacidade é o teto do
// traço (passar de novo no mesmo traço não escurece além dela) e o fluxo é quanto cada marca deposita.
import { juntarTraco } from "./mesclar.ts";
import type { FerramentaDePintura, OpcoesDoPincel, PontoDoTraco } from "./traco.ts";

export type Retangulo = { x0: number; y0: number; x1: number; y1: number };
type Rgb = [number, number, number];

function corParaRgb(cor: string): Rgb {
  const valor = Number.parseInt(cor.replace("#", "").slice(0, 6).padEnd(6, "0"), 16);
  return [((valor >> 16) & 255) / 255, ((valor >> 8) & 255) / 255, (valor & 255) / 255];
}

function canvasNovo(largura: number, altura: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  return canvas;
}

function contexto(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  // Lida a cada quadro do traço: na memória do processador, a leitura é rápida
  return canvas.getContext("2d", { willReadFrequently: true })!;
}

function unir(a: Retangulo | null, b: Retangulo): Retangulo {
  return a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : b;
}

const suave = (t: number) => t * t * (3 - 2 * t);

/** As pontas já desenhadas (branco com o alfa da ponta), por diâmetro, dureza e borda dura. */
const PONTAS = new Map<string, HTMLCanvasElement>();
const MAXIMO_DE_PONTAS = 64;

/**
 * A ponta redonda do pincel: alfa 1 até `dureza` do raio e uma queda suave até a borda. A dura (lápis) acende cada
 * pixel cujo centro cai no círculo, sem meio-termo.
 */
function ponta(diametro: number, dureza: number, dura: boolean): HTMLCanvasElement {
  const d = dura ? Math.max(1, Math.round(diametro)) : Math.max(1, Math.round(diametro * 4) / 4);
  const chave = `${d}|${dura ? "d" : dureza.toFixed(2)}`;
  const guardada = PONTAS.get(chave);
  if (guardada) return guardada;
  const lado = Math.ceil(d) + 2;
  const canvas = canvasNovo(lado, lado);
  const ctx = canvas.getContext("2d")!;
  const centro = lado / 2;
  if (dura) {
    const dados = ctx.createImageData(lado, lado);
    const raio = d / 2;
    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) {
        const dentro = d <= 1 ? x === Math.floor(centro) && y === Math.floor(centro) : Math.hypot(x + 0.5 - centro, y + 0.5 - centro) <= raio;
        if (!dentro) continue;
        const i = (y * lado + x) * 4;
        dados.data[i] = 255;
        dados.data[i + 1] = 255;
        dados.data[i + 2] = 255;
        dados.data[i + 3] = 255;
      }
    }
    ctx.putImageData(dados, 0, 0);
  } else {
    const raio = d / 2;
    const gradiente = ctx.createRadialGradient(centro, centro, 0, centro, centro, raio);
    const dentro = Math.min(0.999, Math.max(0, dureza));
    gradiente.addColorStop(0, "rgba(255,255,255,1)");
    gradiente.addColorStop(dentro, "rgba(255,255,255,1)");
    // A queda em S até a borda, em dez degraus (o gradiente do canvas é linear entre eles)
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      gradiente.addColorStop(dentro + (1 - dentro) * t, `rgba(255,255,255,${(1 - suave(t)).toFixed(4)})`);
    }
    ctx.fillStyle = gradiente;
    ctx.fillRect(0, 0, lado, lado);
  }
  if (PONTAS.size >= MAXIMO_DE_PONTAS) PONTAS.delete(PONTAS.keys().next().value!);
  PONTAS.set(chave, canvas);
  return canvas;
}

export type InicioDoTraco = {
  ferramenta: FerramentaDePintura;
  opcoes: OpcoesDoPincel;
  /** O diâmetro em pixels desta camada (o tamanho do pincel é da imagem; a camada pode estar ampliada). */
  diametro: number;
  primeiroPlano: string;
  fundo: string;
  /** Trava de pixels transparentes: o alfa da camada não muda. */
  travarTransparencia: boolean;
};

export class Pintura {
  readonly largura: number;
  readonly altura: number;
  readonly camada: HTMLCanvasElement;
  readonly tela: HTMLCanvasElement;
  private readonly traco: HTMLCanvasElement;
  private readonly ctxCamada: CanvasRenderingContext2D;
  private readonly ctxTela: CanvasRenderingContext2D;
  private readonly ctxTraco: CanvasRenderingContext2D;
  private atual: (InicioDoTraco & { tinta: Rgb; apagar: boolean; dura: boolean }) | null = null;
  /** O que o traço já tocou (para gravar na camada ao soltar) e o que mudou desde a última tela. */
  private area: Retangulo | null = null;
  private sujo: Retangulo | null = null;

  constructor(largura: number, altura: number) {
    this.largura = largura;
    this.altura = altura;
    this.camada = canvasNovo(largura, altura);
    this.tela = canvasNovo(largura, altura);
    this.traco = canvasNovo(largura, altura);
    this.ctxCamada = contexto(this.camada);
    this.ctxTela = contexto(this.tela);
    this.ctxTraco = contexto(this.traco);
  }

  get pintando(): boolean {
    return this.atual !== null;
  }

  /** O que a prévia mostra: a tela durante o traço, a camada fora dele. */
  get fonte(): HTMLCanvasElement {
    return this.atual ? this.tela : this.camada;
  }

  /** A camada passa a ser esta imagem (a versão do servidor), ou fica vazia. */
  carregar(imagem: CanvasImageSource | null) {
    this.ctxCamada.clearRect(0, 0, this.largura, this.altura);
    if (imagem) this.ctxCamada.drawImage(imagem, 0, 0, this.largura, this.altura);
  }

  iniciar(inicio: InicioDoTraco, ponto: PontoDoTraco) {
    const { ferramenta, opcoes } = inicio;
    const borracha = ferramenta === "borracha";
    const dura = ferramenta === "lapis" || (borracha && opcoes.borracha !== "pincel");
    let cor = inicio.primeiroPlano;
    // Lápis com "apagar automaticamente": começar sobre a cor do primeiro plano pinta a de fundo
    if (ferramenta === "lapis" && opcoes.apagarAutomaticamente) {
      const [r, g, b, a] = this.ctxCamada.getImageData(Math.floor(ponto.x), Math.floor(ponto.y), 1, 1).data;
      const [pr, pg, pb] = corParaRgb(inicio.primeiroPlano).map((v) => Math.round(v * 255));
      if (a === 255 && r === pr && g === pg && b === pb) cor = inicio.fundo;
    }
    // A borracha numa camada de transparência travada pinta a cor de fundo, como no fundo dos editores de imagem
    const apagar = borracha && !inicio.travarTransparencia;
    if (borracha && inicio.travarTransparencia) cor = inicio.fundo;
    this.atual = { ...inicio, tinta: corParaRgb(cor), apagar, dura };
    this.area = null;
    this.sujo = null;
    this.ctxTraco.clearRect(0, 0, this.largura, this.altura);
    this.ctxTela.globalCompositeOperation = "copy";
    this.ctxTela.drawImage(this.camada, 0, 0);
    this.ctxTela.globalCompositeOperation = "source-over";
    this.marcar(ponto);
  }

  /** O diâmetro da marca neste ponto (com a pressão, se ela muda o tamanho). */
  diametroEm(pressao: number): number {
    const atual = this.atual;
    if (!atual) return 1;
    return Math.max(1, atual.diametro * (atual.opcoes.pressaoNoTamanho ? Math.max(0.05, pressao) : 1));
  }

  /** Uma marca da ponta no ponto (pixels da camada). */
  marcar(ponto: PontoDoTraco) {
    const atual = this.atual;
    if (!atual) return;
    const { opcoes } = atual;
    const bloco = atual.ferramenta === "borracha" && opcoes.borracha === "bloco";
    const diametro = bloco ? atual.diametro : this.diametroEm(ponto.pressao);
    const alfa = Math.min(1, opcoes.fluxo * (opcoes.pressaoNaOpacidade ? Math.max(0, ponto.pressao) : 1));
    if (alfa <= 0) return;
    this.ctxTraco.globalAlpha = alfa;
    let retangulo: Retangulo;
    if (bloco) {
      const x = Math.round(ponto.x - diametro / 2);
      const y = Math.round(ponto.y - diametro / 2);
      this.ctxTraco.fillStyle = "#ffffff";
      this.ctxTraco.fillRect(x, y, Math.round(diametro), Math.round(diametro));
      retangulo = { x0: x, y0: y, x1: x + Math.round(diametro), y1: y + Math.round(diametro) };
    } else {
      const imagem = ponta(diametro, opcoes.dureza, atual.dura);
      // A dura vai para o pixel inteiro (sem borda misturada); a macia fica no ponto exato
      const x = atual.dura ? Math.round(ponto.x - imagem.width / 2) : ponto.x - imagem.width / 2;
      const y = atual.dura ? Math.round(ponto.y - imagem.height / 2) : ponto.y - imagem.height / 2;
      this.ctxTraco.drawImage(imagem, x, y);
      retangulo = { x0: Math.floor(x), y0: Math.floor(y), x1: Math.ceil(x + imagem.width), y1: Math.ceil(y + imagem.height) };
    }
    this.ctxTraco.globalAlpha = 1;
    this.area = unir(this.area, retangulo);
    this.sujo = unir(this.sujo, retangulo);
  }

  /** Junta o traço à camada na tela, só onde mudou desde a última vez. Devolve o retângulo, ou null. */
  atualizarTela(): Retangulo | null {
    const atual = this.atual;
    const sujo = this.sujo;
    this.sujo = null;
    if (!atual || !sujo) return null;
    const x0 = Math.max(0, sujo.x0);
    const y0 = Math.max(0, sujo.y0);
    const x1 = Math.min(this.largura, sujo.x1);
    const y1 = Math.min(this.altura, sujo.y1);
    if (x1 <= x0 || y1 <= y0) return null;
    const largura = x1 - x0;
    const altura = y1 - y0;
    const fundo = this.ctxCamada.getImageData(x0, y0, largura, altura).data;
    const traco = this.ctxTraco.getImageData(x0, y0, largura, altura).data;
    // A cor da tinta no lugar do branco das pontas
    const [r, g, b] = atual.tinta.map((v) => Math.round(v * 255));
    for (let i = 0; i < traco.length; i += 4) {
      traco[i] = r;
      traco[i + 1] = g;
      traco[i + 2] = b;
    }
    const saida = this.ctxTela.createImageData(largura, altura);
    juntarTraco(fundo, traco, saida.data, {
      modo: atual.ferramenta === "borracha" ? "normal" : atual.opcoes.modo,
      opacidade: atual.opcoes.opacidade,
      travarTransparencia: atual.travarTransparencia,
      apagar: atual.apagar,
      largura,
      x0,
      y0,
    });
    this.ctxTela.putImageData(saida, x0, y0);
    return { x0, y0, x1, y1 };
  }

  /** Solta o traço: a tela vira a camada. Devolve o que mudou (null se o traço não tocou a camada). */
  terminar(): Retangulo | null {
    if (!this.atual) return null;
    this.atualizarTela();
    const area = this.area;
    this.atual = null;
    this.area = null;
    if (!area) return null;
    const x0 = Math.max(0, area.x0);
    const y0 = Math.max(0, area.y0);
    const x1 = Math.min(this.largura, area.x1);
    const y1 = Math.min(this.altura, area.y1);
    if (x1 <= x0 || y1 <= y0) return null;
    this.ctxCamada.putImageData(this.ctxTela.getImageData(x0, y0, x1 - x0, y1 - y0), x0, y0);
    this.ctxTraco.clearRect(x0, y0, x1 - x0, y1 - y0);
    return { x0, y0, x1, y1 };
  }

  /** O PNG da camada (para subir como versão nova). */
  png(): Promise<Blob> {
    return new Promise((pronto, falhou) => this.camada.toBlob((blob) => (blob ? pronto(blob) : falhou(new Error("O navegador não conseguiu gravar a camada."))), "image/png"));
  }
}
