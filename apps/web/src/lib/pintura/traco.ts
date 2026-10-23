// As contas do traço do pincel (ADR 0003, onda 13.2), sem canvas: o espaçamento das marcas ao longo do caminho, a
// suavização (a "corda puxada": o pincel só anda quando o mouse se afasta mais que o comprimento da corda) e a ida do
// ponto da prévia para o pixel da camada. O desenho em si fica em motor.ts.
import type { Caixa } from "../projeto/geometria.ts";
import type { Recorte, Virar } from "../projeto/modelo.ts";
import type { IdDaPonta, IdDaPontaPersonalizada, IdDaTextura } from "./pontas.ts";

/** A ponta: a redonda (com a dureza), uma das desenhadas aqui ou a de um pincel do espaço. */
export type PontaDoPincel = "redonda" | IdDaPonta | IdDaPontaPersonalizada;

/**
 * Um ponto do traço: a posição, a pressão (1 no mouse) e, quando a caneta dá, a inclinação (-1 a 1 nos dois eixos) e
 * o giro dela (graus). `direcao` é para onde o traço anda (radianos), preenchida pelo espaçador.
 */
export type PontoDoTraco = { x: number; y: number; pressao: number; inclinacaoX?: number; inclinacaoY?: number; giro?: number; direcao?: number };

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
  // As seções do painel Configurações do pincel (F5), como nos editores de imagem
  /** A ponta: redonda (com a dureza) ou uma amostra (lib/pintura/pontas.ts). */
  ponta: PontaDoPincel;
  /** O giro da ponta (graus) e o achatamento (1 é redonda). */
  angulo: number;
  arredondamento: number;
  virarX: boolean;
  virarY: boolean;
  dinamicaDeForma: DinamicaDeForma;
  dispersao: Dispersao;
  textura: TexturaDoPincel;
  duplo: PincelDuplo;
  dinamicaDeCor: DinamicaDeCor;
  transferencia: Transferencia;
  pose: Pose;
  /** Ruído na borda da ponta. */
  ruido: boolean;
  /** A tinta junta na beira de cada marca, como aquarela. */
  bordasMolhadas: boolean;
  /** A textura do pincel vale para todas as predefinições escolhidas depois. */
  protegerTextura: boolean;
};

/** O que comanda uma variação: nada, a pressão ou a inclinação da caneta, a direção do traço ou o desvanecer. */
export type Controle = "nenhum" | "pressao" | "inclinacao" | "giro" | "direcao" | "desvanecer";
/** Uma variação por marca: o sorteio (tremor, 0 a 1), o controle e o mínimo a que o controle leva. */
export type Variacao = { tremor: number; controle: Controle; minimo: number };
const SEM_VARIACAO: Variacao = { tremor: 0, controle: "nenhum", minimo: 0 };

export type DinamicaDeForma = { ligado: boolean; tamanho: Variacao; angulo: Variacao; arredondamento: Variacao; virarX: boolean; virarY: boolean };
export type Dispersao = { ligado: boolean; quanto: number; ambosEixos: boolean; contagem: number; tremorDaContagem: number };
export type TexturaDoPincel = { ligado: boolean; id: IdDaTextura; escala: number; profundidade: number; inverter: boolean };
export type PincelDuplo = { ligado: boolean; ponta: PontaDoPincel; tamanho: number; espacamento: number; dispersao: number; contagem: number };
export type DinamicaDeCor = { ligado: boolean; primeiroFundo: Variacao; matiz: number; saturacao: number; brilho: number; pureza: number; porPonta: boolean };
export type Transferencia = { ligado: boolean; opacidade: Variacao; fluxo: Variacao };
/** Para quem pinta sem caneta: a inclinação, o giro e a pressão de mentira, no lugar dos da caneta. */
export type Pose = { ligado: boolean; inclinacaoX: number; inclinacaoY: number; giro: number; pressao: number };

/** As seções do painel, na ordem de lá. */
export const SECOES_DO_PINCEL = ["dinamicaDeForma", "dispersao", "textura", "duplo", "dinamicaDeCor", "transferencia", "pose"] as const;
export type SecaoDoPincel = (typeof SECOES_DO_PINCEL)[number];

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
  ponta: "redonda",
  angulo: 0,
  arredondamento: 1,
  virarX: false,
  virarY: false,
  dinamicaDeForma: { ligado: false, tamanho: SEM_VARIACAO, angulo: SEM_VARIACAO, arredondamento: SEM_VARIACAO, virarX: false, virarY: false },
  dispersao: { ligado: false, quanto: 0, ambosEixos: false, contagem: 1, tremorDaContagem: 0 },
  textura: { ligado: false, id: "papel", escala: 1, profundidade: 0.5, inverter: false },
  duplo: { ligado: false, ponta: "spray", tamanho: 1, espacamento: 0.25, dispersao: 0, contagem: 1 },
  dinamicaDeCor: { ligado: false, primeiroFundo: SEM_VARIACAO, matiz: 0, saturacao: 0, brilho: 0, pureza: 0, porPonta: true },
  transferencia: { ligado: false, opacidade: SEM_VARIACAO, fluxo: SEM_VARIACAO },
  pose: { ligado: false, inclinacaoX: 0, inclinacaoY: 0, giro: 0, pressao: 1 },
  ruido: false,
  bordasMolhadas: false,
  protegerTextura: false,
};

/** Quantas marcas o desvanecer leva para ir do valor cheio ao mínimo. */
export const PASSOS_DO_DESVANECER = 25;

/** Uma marca da ponta, já com as variações: lugar, diâmetro, giro (radianos), achatamento, viradas e a força. */
export type Marca = {
  x: number;
  y: number;
  diametro: number;
  angulo: number;
  arredondamento: number;
  virarX: boolean;
  virarY: boolean;
  /** O fluxo da marca (0 a 1). */
  alfa: number;
  /** A mistura com a cor de fundo (0 é a de primeiro plano) e as variações de matiz, saturação e brilho. */
  cor: { fundo: number; matiz: number; saturacao: number; brilho: number } | null;
};

/** O valor (0 a 1) que um controle dá neste ponto: a pressão, a inclinação, o giro, a direção ou o desvanecer. */
function valorDoControle(controle: Controle, ponto: PontoDoTraco, indice: number, minimo: number): number {
  switch (controle) {
    case "pressao":
      return minimo + (1 - minimo) * Math.max(0, Math.min(1, ponto.pressao));
    case "inclinacao":
      return minimo + (1 - minimo) * Math.min(1, Math.hypot(ponto.inclinacaoX ?? 0, ponto.inclinacaoY ?? 0));
    case "giro":
      return minimo + (1 - minimo) * ((((ponto.giro ?? 0) % 360) + 360) % 360) / 360;
    case "direcao":
      return 1;
    case "desvanecer":
      return minimo + (1 - minimo) * Math.max(0, 1 - indice / PASSOS_DO_DESVANECER);
    default:
      return 1;
  }
}

/**
 * As marcas de um ponto do traço (com dispersão, mais de uma), com as variações das seções ligadas. `diametro` é o
 * do pincel em pixels da camada; `indice` conta as marcas desde o começo do traço (para o desvanecer); `aleatorio`
 * dá números de 0 a 1 (o motor usa o do navegador; o teste, um com semente).
 */
export function marcasDoPonto(opcoes: OpcoesDoPincel, ponto: PontoDoTraco, diametro: number, indice: number, aleatorio: () => number): Marca[] {
  const pose = opcoes.pose.ligado ? { ...ponto, inclinacaoX: opcoes.pose.inclinacaoX, inclinacaoY: opcoes.pose.inclinacaoY, giro: opcoes.pose.giro, pressao: opcoes.pose.pressao } : ponto;
  const forma = opcoes.dinamicaDeForma;
  const dispersao = opcoes.dispersao;
  const transferencia = opcoes.transferencia;
  const cor = opcoes.dinamicaDeCor;
  const quantas = dispersao.ligado ? Math.max(1, Math.round(dispersao.contagem * (1 - dispersao.tremorDaContagem * aleatorio()))) : 1;
  const marcas: Marca[] = [];
  for (let i = 0; i < quantas; i++) {
    // O tamanho: a pressão das opções simples, o controle e o tremor da dinâmica de forma
    let tamanho = diametro * (opcoes.pressaoNoTamanho && !forma.ligado ? Math.max(0.05, pose.pressao) : 1);
    let angulo = (opcoes.angulo * Math.PI) / 180;
    let arredondamento = opcoes.arredondamento;
    let virarX = opcoes.virarX;
    let virarY = opcoes.virarY;
    if (forma.ligado) {
      tamanho *= valorDoControle(forma.tamanho.controle, pose, indice, forma.tamanho.minimo) * (1 - forma.tamanho.tremor * aleatorio());
      if (forma.angulo.controle === "direcao") angulo += pose.direcao ?? 0;
      else if (forma.angulo.controle === "giro") angulo += ((pose.giro ?? 0) * Math.PI) / 180;
      else if (forma.angulo.controle === "inclinacao") angulo += Math.atan2(pose.inclinacaoY ?? 0, pose.inclinacaoX ?? 0);
      angulo += (aleatorio() - 0.5) * 2 * Math.PI * forma.angulo.tremor;
      arredondamento *= Math.max(forma.arredondamento.minimo, valorDoControle(forma.arredondamento.controle, pose, indice, forma.arredondamento.minimo) * (1 - forma.arredondamento.tremor * aleatorio()));
      if (forma.virarX && aleatorio() < 0.5) virarX = !virarX;
      if (forma.virarY && aleatorio() < 0.5) virarY = !virarY;
    }
    // A força: a pressão das opções simples, ou o controle e o tremor da transferência
    let alfa = opcoes.fluxo * (opcoes.pressaoNaOpacidade && !transferencia.ligado ? Math.max(0, pose.pressao) : 1);
    if (transferencia.ligado) {
      alfa *= valorDoControle(transferencia.fluxo.controle, pose, indice, transferencia.fluxo.minimo) * (1 - transferencia.fluxo.tremor * aleatorio());
      alfa *= valorDoControle(transferencia.opacidade.controle, pose, indice, transferencia.opacidade.minimo) * (1 - transferencia.opacidade.tremor * aleatorio());
    }
    // A dispersão afasta a marca do traço, na perpendicular (ou nos dois eixos), até `quanto` diâmetros
    let x = ponto.x;
    let y = ponto.y;
    if (dispersao.ligado && dispersao.quanto > 0) {
      const distancia = (aleatorio() - 0.5) * 2 * dispersao.quanto * diametro;
      const direcao = ponto.direcao ?? 0;
      if (dispersao.ambosEixos) {
        x += distancia;
        y += (aleatorio() - 0.5) * 2 * dispersao.quanto * diametro;
      } else {
        x += -Math.sin(direcao) * distancia;
        y += Math.cos(direcao) * distancia;
      }
    }
    // A cor: quanto vai para a de fundo (o controle tira do primeiro plano; o tremor sorteia) e as variações; sem
    // "por ponta", o motor guarda a do começo do traço
    const paraOFundo = cor.primeiroFundo.controle === "nenhum" ? 0 : 1 - valorDoControle(cor.primeiroFundo.controle, pose, indice, 0);
    const comCor = cor.ligado
      ? {
          fundo: Math.min(1, Math.max(0, paraOFundo + cor.primeiroFundo.tremor * aleatorio())),
          matiz: (aleatorio() - 0.5) * 2 * cor.matiz,
          saturacao: (aleatorio() - 0.5) * 2 * cor.saturacao + cor.pureza,
          brilho: (aleatorio() - 0.5) * 2 * cor.brilho,
        }
      : null;
    marcas.push({ x, y, diametro: Math.max(0.5, tamanho), angulo, arredondamento: Math.max(0.01, arredondamento), virarX, virarY, alfa: Math.max(0, Math.min(1, alfa)), cor: comCor });
  }
  return marcas;
}

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
    const direcao = Math.atan2(ponto.y - de.y, ponto.x - de.x);
    while (andado + this.falta <= distancia) {
      andado += this.falta;
      const t = andado / distancia;
      const pressao = de.pressao + (ponto.pressao - de.pressao) * t;
      marcas.push({ ...ponto, x: de.x + (ponto.x - de.x) * t, y: de.y + (ponto.y - de.y) * t, pressao, direcao });
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

/** A simetria da pintura, como nos editores de imagem: em volta do meio do quadro. */
export type Simetria = { tipo: "vertical" | "horizontal" | "doisEixos" | "diagonal" | "radial" | "mandala"; segmentos: number };

export const TIPOS_DE_SIMETRIA: { id: Simetria["tipo"]; nome: string }[] = [
  { id: "vertical", nome: "Vertical" },
  { id: "horizontal", nome: "Horizontal" },
  { id: "doisEixos", nome: "Dois eixos" },
  { id: "diagonal", nome: "Diagonal" },
  { id: "radial", nome: "Radial" },
  { id: "mandala", nome: "Mandala" },
];

/**
 * As cópias de um ponto (a primeira é ele mesmo) pela simetria, em volta de `centro`: o espelho no eixo vertical, no
 * horizontal, nos dois, na diagonal de 45°, os giros do radial e, na mandala, os giros com os espelhos deles.
 */
export function copiasDaSimetria(ponto: PontoDoTraco, simetria: Simetria | null, centro: { x: number; y: number }): PontoDoTraco[] {
  if (!simetria) return [ponto];
  const dx = ponto.x - centro.x;
  const dy = ponto.y - centro.y;
  const em = (x: number, y: number): PontoDoTraco => ({ ...ponto, x: centro.x + x, y: centro.y + y });
  const giros = (n: number, espelhar: boolean) => {
    const copias: PontoDoTraco[] = [];
    for (let i = 0; i < n; i++) {
      const angulo = (2 * Math.PI * i) / n;
      const cos = Math.cos(angulo);
      const sen = Math.sin(angulo);
      copias.push(em(dx * cos - dy * sen, dx * sen + dy * cos));
      if (espelhar) copias.push(em(-dx * cos - dy * sen, -dx * sen + dy * cos));
    }
    return copias;
  };
  switch (simetria.tipo) {
    case "vertical":
      return [ponto, em(-dx, dy)];
    case "horizontal":
      return [ponto, em(dx, -dy)];
    case "doisEixos":
      return [ponto, em(-dx, dy), em(dx, -dy), em(-dx, -dy)];
    case "diagonal":
      // O espelho na reta de 45° pelo meio troca os dois eixos
      return [ponto, em(dy, dx)];
    case "radial":
      return giros(Math.max(2, Math.round(simetria.segmentos)), false);
    case "mandala":
      return giros(Math.max(2, Math.round(simetria.segmentos)), true);
  }
}
