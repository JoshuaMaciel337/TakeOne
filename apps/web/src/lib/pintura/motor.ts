"use client";

// O motor da pintura (ADR 0003, onda 13.2): cada camada de pixels tem um canvas com o que já foi pintado (`camada`);
// o traço da vez acumula o alfa das marcas noutro canvas (`traco`), e a `tela` mostra os dois juntos, pelo modo e
// pela opacidade do traço, só no retângulo que mudou. Ao soltar, a tela vira a camada. A opacidade é o teto do
// traço (passar de novo no mesmo traço não escurece além dela) e o fluxo é quanto cada marca deposita.
import { juntarTraco } from "./mesclar.ts";
import { amostraDaPonta, type IdDaTextura, ladrilhoDaTextura } from "./pontas.ts";
import { type FerramentaDePintura, type Marca, marcasDoPonto, type OpcoesDoPincel, type PontoDoTraco, tracosArtisticos } from "./traco.ts";

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
    // Mesmo a dureza 100% guarda um pixel de queda na borda: sem ele, a borda saía serrilhada e as marcas em fila
    // formavam um tracejado
    const dentro = Math.min(Math.max(0, dureza), Math.max(0, 1 - 1.2 / Math.max(raio, 1e-6)), 0.999);
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

/** A ponta de amostra com a borda molhada (a tinta junta na beira) e o ruído, quando pedidos, guardada. */
const AMOSTRAS_MUDADAS = new Map<string, HTMLCanvasElement>();
function pontaMudada(base: HTMLCanvasElement, chave: string, molhada: boolean, ruido: boolean): HTMLCanvasElement {
  if (!molhada && !ruido) return base;
  const guardada = AMOSTRAS_MUDADAS.get(chave);
  if (guardada) return guardada;
  const canvas = canvasNovo(base.width, base.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(base, 0, 0);
  const dados = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let semente = 12345;
  const aleatorio = () => ((semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 3; i < dados.data.length; i += 4) {
    let a = dados.data[i] / 255;
    // Molhada: o miolo cai pela metade e a beira (onde o alfa passa de 0 a 1) fica forte
    if (molhada) a = Math.min(1, 0.5 * a + 2 * a * (1 - a));
    // Ruído: grão só na parte macia da borda
    if (ruido) a = Math.min(1, Math.max(0, a + (aleatorio() - 0.5) * 2.4 * a * (1 - a)));
    dados.data[i] = Math.round(a * 255);
  }
  ctx.putImageData(dados, 0, 0);
  if (AMOSTRAS_MUDADAS.size >= MAXIMO_DE_PONTAS) AMOSTRAS_MUDADAS.delete(AMOSTRAS_MUDADAS.keys().next().value!);
  AMOSTRAS_MUDADAS.set(chave, canvas);
  return canvas;
}

/** A textura como alfa: o claro deixa passar; a profundidade é quanto o escuro tira. */
const TEXTURAS_EM_ALFA = new Map<string, HTMLCanvasElement>();
function texturaEmAlfa(id: IdDaTextura, profundidade: number, inverter: boolean): HTMLCanvasElement {
  const chave = `${id}|${profundidade.toFixed(2)}|${inverter}`;
  const guardada = TEXTURAS_EM_ALFA.get(chave);
  if (guardada) return guardada;
  const ladrilho = ladrilhoDaTextura(id);
  const canvas = canvasNovo(ladrilho.width, ladrilho.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(ladrilho, 0, 0);
  const dados = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < dados.data.length; i += 4) {
    const v = dados.data[i] / 255;
    dados.data[i + 3] = Math.round((1 - profundidade * (1 - (inverter ? 1 - v : v))) * 255);
  }
  ctx.putImageData(dados, 0, 0);
  TEXTURAS_EM_ALFA.set(chave, canvas);
  return canvas;
}

function rgbParaHsv([r, g, b]: Rgb): Rgb {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, max === 0 ? 0 : d / max, max];
}
function hsvParaRgb([h, s, v]: Rgb): Rgb {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}

/** A cor de uma marca com a dinâmica de cor: entre o primeiro plano e o fundo, e o matiz, a saturação e o brilho. */
function corDaMarca(primeiro: Rgb, fundo: Rgb, variacao: NonNullable<Marca["cor"]>): string {
  const base: Rgb = [0, 1, 2].map((c) => primeiro[c] + (fundo[c] - primeiro[c]) * variacao.fundo) as Rgb;
  const [h, s, v] = rgbParaHsv(base);
  const [r, g, b] = hsvParaRgb([(((h + variacao.matiz) % 1) + 1) % 1, Math.min(1, Math.max(0, s + variacao.saturacao)), Math.min(1, Math.max(0, v + variacao.brilho))]);
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
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
  /** Os pincéis do histórico: a camada como estava no estado escolhido (do tamanho da camada). */
  fonteDaTinta?: HTMLCanvasElement | null;
  /** A seleção do documento levada a esta camada (o alfa, do tamanho dela): o traço só vale dentro dela. */
  limite?: HTMLCanvasElement | null;
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
  private atual: (InicioDoTraco & { tinta: Rgb; corDoFundo: Rgb; apagar: boolean; dura: boolean; colorido: boolean; fonte: Uint8ClampedArray | null; dentro: Uint8ClampedArray | null }) | null = null;
  /** Quantas marcas o traço já tem (o desvanecer) e a variação de cor do começo (sem "por ponta"). */
  private indice = 0;
  private corDoTraco: Marca["cor"] = null;
  /** Rascunhos de uma marca com textura, pincel duplo ou cor. */
  private readonly rascunho = canvasNovo(1, 1);
  private readonly rascunhoDuplo = canvasNovo(1, 1);
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
    const artistico = ferramenta === "historicoArtistico";
    const colorido = (inicio.opcoes.dinamicaDeCor.ligado && !borracha) || artistico;
    // A fonte dos pincéis do histórico, lida uma vez por traço
    let fonte: Uint8ClampedArray | null = null;
    if (inicio.fonteDaTinta && (ferramenta === "historico" || artistico)) {
      const ctxFonte = inicio.fonteDaTinta.getContext("2d", { willReadFrequently: true })!;
      fonte = ctxFonte.getImageData(0, 0, this.largura, this.altura).data;
    }
    // A seleção, lida uma vez por traço (o alfa de cada pixel)
    const dentro = inicio.limite ? inicio.limite.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, this.largura, this.altura).data : null;
    this.atual = { ...inicio, tinta: corParaRgb(cor), corDoFundo: corParaRgb(inicio.fundo), apagar, dura, colorido, fonte, dentro };
    this.indice = 0;
    this.corDoTraco = null;
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
    } else if (atual.ferramenta === "historicoArtistico") {
      this.marcarArtistico(ponto);
      return;
    } else {
      this.ctxTraco.globalAlpha = 1;
      for (const marca of marcasDoPonto(opcoes, { ...ponto, pressao: ponto.pressao }, atual.diametro, this.indice++, Math.random)) {
        if (atual.colorido && marca.cor && !opcoes.dinamicaDeCor.porPonta) marca.cor = this.corDoTraco ??= marca.cor;
        this.desenharMarca(marca);
      }
      return;
    }
    this.ctxTraco.globalAlpha = 1;
    this.area = unir(this.area, retangulo);
    this.sujo = unir(this.sujo, retangulo);
  }

  /** A cor da fonte no pixel (null onde ela é transparente). */
  private corDaFonte(x: number, y: number): string | null {
    const fonte = this.atual?.fonte;
    if (!fonte) return null;
    const xi = Math.min(this.largura - 1, Math.max(0, Math.round(x)));
    const yi = Math.min(this.altura - 1, Math.max(0, Math.round(y)));
    const i = (yi * this.largura + xi) * 4;
    if (fonte[i + 3] < 8) return null;
    return `rgb(${fonte[i]},${fonte[i + 1]},${fonte[i + 2]})`;
  }

  /** Histórico artístico: traços pequenos em volta do ponto, cada um na cor da fonte onde começa. */
  private marcarArtistico(ponto: PontoDoTraco) {
    const atual = this.atual!;
    const { opcoes } = atual;
    const escala = atual.diametro / Math.max(1, opcoes.tamanho);
    const tracos = tracosArtisticos(ponto, opcoes.artistico.area * escala, atual.diametro, opcoes.artistico.estilo, opcoes.artistico.quantos, Math.random);
    for (const traco of tracos) {
      const cor = this.corDaFonte(traco[0].x, traco[0].y);
      if (!cor) continue;
      for (const passo of traco) {
        this.desenharMarca({ x: passo.x, y: passo.y, diametro: atual.diametro, angulo: 0, arredondamento: 1, virarX: false, virarY: false, alfa: opcoes.fluxo, cor: null, corDireta: cor });
      }
    }
  }

  /** A ponta da marca: a redonda (com a dureza, ou dura no lápis) ou a amostra, com borda molhada e ruído. */
  private pontaDa(marca: Marca): HTMLCanvasElement {
    const { opcoes, dura } = this.atual!;
    if (opcoes.ponta === "redonda") {
      const base = ponta(marca.diametro, opcoes.dureza, dura);
      return pontaMudada(base, `r|${base.width}|${opcoes.dureza.toFixed(2)}|${dura}|${opcoes.bordasMolhadas}|${opcoes.ruido}`, opcoes.bordasMolhadas, opcoes.ruido);
    }
    const amostra = amostraDaPonta(opcoes.ponta);
    // A ponta de um pincel do espaço que ainda não chegou: a redonda no lugar
    if (!amostra) return ponta(marca.diametro, opcoes.dureza, dura);
    return pontaMudada(amostra, `a|${opcoes.ponta}|${opcoes.bordasMolhadas}|${opcoes.ruido}`, opcoes.bordasMolhadas, opcoes.ruido);
  }

  /** Uma marca no canvas do traço, com o giro, o achatamento, as viradas, a textura, o pincel duplo e a cor. */
  private desenharMarca(marca: Marca) {
    const atual = this.atual!;
    const { opcoes } = atual;
    if (marca.alfa <= 0) return;
    const imagem = this.pontaDa(marca);
    const d = marca.diametro;
    const simples = opcoes.ponta === "redonda" && marca.arredondamento >= 0.999 && !marca.virarX && !marca.virarY;
    const comRascunho = opcoes.textura.ligado || opcoes.duplo.ligado || (atual.colorido && (marca.cor || marca.corDireta));
    // A caixa da marca: o diâmetro, que cobre a ponta girada e achatada
    const lado = Math.ceil(d) + 2;
    const x0 = atual.dura && simples ? Math.round(marca.x - imagem.width / 2) : marca.x - lado / 2;
    const y0 = atual.dura && simples ? Math.round(marca.y - imagem.height / 2) : marca.y - lado / 2;
    const desenharPonta = (ctx: CanvasRenderingContext2D, cx: number, cy: number) => {
      if (simples && !comRascunho && atual.dura) {
        ctx.drawImage(imagem, x0, y0);
        return;
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(marca.angulo);
      ctx.scale(marca.virarX ? -1 : 1, (marca.virarY ? -1 : 1) * marca.arredondamento);
      // A redonda já vem desenhada no diâmetro (com a margem); a amostra é esticada até ele
      if (opcoes.ponta === "redonda") ctx.drawImage(imagem, -imagem.width / 2, -imagem.height / 2);
      else ctx.drawImage(imagem, -d / 2, -d / 2, d, d);
      ctx.restore();
    };
    if (!comRascunho) {
      this.ctxTraco.globalAlpha = marca.alfa;
      desenharPonta(this.ctxTraco, marca.x, marca.y);
      this.ctxTraco.globalAlpha = 1;
    } else {
      const rascunho = this.rascunho;
      if (rascunho.width < lado || rascunho.height < lado) {
        rascunho.width = Math.max(rascunho.width, lado);
        rascunho.height = Math.max(rascunho.height, lado);
      }
      const ctx = rascunho.getContext("2d")!;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, lado, lado);
      desenharPonta(ctx, lado / 2, lado / 2);
      if (opcoes.textura.ligado) {
        // A textura presa à camada (não à marca): o desenho do papel não anda com o pincel
        const padrao = ctx.createPattern(texturaEmAlfa(opcoes.textura.id, opcoes.textura.profundidade, opcoes.textura.inverter), "repeat")!;
        padrao.setTransform(new DOMMatrix().translate(-x0, -y0).scale(Math.max(0.05, opcoes.textura.escala)));
        ctx.globalCompositeOperation = "destination-in";
        ctx.fillStyle = padrao;
        ctx.fillRect(0, 0, lado, lado);
      }
      if (opcoes.duplo.ligado) {
        // O pincel duplo: só fica onde a segunda ponta também marcou
        const duplo = this.rascunhoDuplo;
        if (duplo.width < lado || duplo.height < lado) {
          duplo.width = Math.max(duplo.width, lado);
          duplo.height = Math.max(duplo.height, lado);
        }
        const ctxDuplo = duplo.getContext("2d")!;
        ctxDuplo.clearRect(0, 0, lado, lado);
        const pontaDupla = (opcoes.duplo.ponta === "redonda" ? null : amostraDaPonta(opcoes.duplo.ponta)) ?? ponta(d * opcoes.duplo.tamanho, 1, false);
        const dd = Math.max(1, d * opcoes.duplo.tamanho);
        for (let i = 0; i < Math.max(1, opcoes.duplo.contagem); i++) {
          const espalhar = opcoes.duplo.dispersao * d;
          ctxDuplo.drawImage(pontaDupla, lado / 2 - dd / 2 + (Math.random() - 0.5) * 2 * espalhar, lado / 2 - dd / 2 + (Math.random() - 0.5) * 2 * espalhar, dd, dd);
        }
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(duplo, 0, 0, lado, lado, 0, 0, lado, lado);
      }
      if (atual.colorido && (marca.cor || marca.corDireta)) {
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = marca.corDireta ?? corDaMarca(atual.tinta, atual.corDoFundo, marca.cor!);
        ctx.fillRect(0, 0, lado, lado);
      }
      ctx.globalCompositeOperation = "source-over";
      this.ctxTraco.globalAlpha = marca.alfa;
      this.ctxTraco.drawImage(rascunho, 0, 0, lado, lado, x0, y0, lado, lado);
      this.ctxTraco.globalAlpha = 1;
    }
    const retangulo = { x0: Math.floor(x0) - 1, y0: Math.floor(y0) - 1, x1: Math.ceil(x0 + Math.max(lado, imagem.width)) + 1, y1: Math.ceil(y0 + Math.max(lado, imagem.height)) + 1 };
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
    // A cor da tinta no lugar do branco das pontas (com a dinâmica de cor, cada marca já veio com a dela)
    if (!atual.colorido) {
      const [r, g, b] = atual.tinta.map((v) => Math.round(v * 255));
      for (let i = 0; i < traco.length; i += 4) {
        traco[i] = r;
        traco[i + 1] = g;
        traco[i + 2] = b;
      }
    }
    // Fora da seleção o traço não vale; na borda difusa, vale em parte
    if (atual.dentro) {
      for (let y = 0; y < altura; y++) {
        for (let x = 0; x < largura; x++) {
          const i = (y * largura + x) * 4 + 3;
          traco[i] = Math.round((traco[i] * atual.dentro[((y0 + y) * this.largura + x0 + x) * 4 + 3]) / 255);
        }
      }
    }
    const saida = this.ctxTela.createImageData(largura, altura);
    // O pincel do histórico vai em direção à fonte (o retângulo dela)
    let substituirPor: Uint8ClampedArray | undefined;
    if (atual.ferramenta === "historico" && atual.fonte) {
      substituirPor = new Uint8ClampedArray(largura * altura * 4);
      for (let y = 0; y < altura; y++) {
        const inicio = ((y0 + y) * this.largura + x0) * 4;
        substituirPor.set(atual.fonte.subarray(inicio, inicio + largura * 4), y * largura * 4);
      }
    }
    juntarTraco(fundo, traco, saida.data, {
      substituirPor,
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
