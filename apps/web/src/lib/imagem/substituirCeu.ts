// Editar › Substituição do céu (ADR 0003, onda 13.12), no navegador: o céu novo desenhado no quadro (um pronto ou uma
// imagem da biblioteca, cobrindo a área de cima até a base do céu, com a escala e a virada), a máscara do céu (a
// borda deslocada) e a luz do primeiro plano (a cor média do céu novo). A prévia da janela e as camadas do OK saem
// destas mesmas contas, em tamanhos diferentes.
import { contrair, expandir, inverter, type Selecao } from "../selecao/mascara.ts";
import { ajustarCeu, baseDoCeu, type CeuPronto, corMediaDoCeu, pintarCeu } from "./ceus.ts";

export type ModoDaLuz = "luz_suave" | "multiplicar" | "tela";
export type OpcoesDoCeu = {
  fonte: { tipo: "pronto"; id: CeuPronto } | { tipo: "midia"; id: string };
  /** A borda do céu: positiva cresce, negativa encolhe (pixels do documento). */
  deslocar: number;
  /** A borda suave (pixels do documento): a difusão da máscara. */
  esmaecer: number;
  brilho: number;
  temperatura: number;
  /** 50 a 200%, a partir da base do céu. */
  escala: number;
  virar: boolean;
  /** 0 a 100: o quanto a cor do céu novo tinge o primeiro plano. */
  luz: number;
  modoDaLuz: ModoDaLuz;
};

// A borda fica no lugar (crescer 3 px já comia as torres finas) e esmaece pouco (com 6, a cor do céu velho ficava
// em volta dos prédios)
export const CEU_PADRAO: OpcoesDoCeu = { fonte: { tipo: "pronto", id: "por_do_sol" }, deslocar: 0, esmaecer: 4, brilho: 0, temperatura: 0, escala: 100, virar: false, luz: 40, modoDaLuz: "luz_suave" };

/** O canvas do céu novo no quadro (largura × altura), ajustado; `fator` leva as medidas do documento ao quadro. */
export function desenharCeuNovo(opcoes: OpcoesDoCeu, largura: number, altura: number, base: number, imagem: CanvasImageSource | null): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  // A área do céu vai do alto até um pouco abaixo da base dele; a escala cresce a partir da base, no meio
  const alturaDoCeu = Math.min(altura, Math.max(8, Math.round((base + 1) * 1.1)));
  const s = opcoes.escala / 100;
  const w = largura * s;
  const h = alturaDoCeu * s;
  const x0 = (largura - w) / 2;
  const y0 = alturaDoCeu - h;
  ctx.save();
  if (opcoes.virar) {
    ctx.translate(largura, 0);
    ctx.scale(-1, 1);
  }
  if (opcoes.fonte.tipo === "pronto") {
    const lado = { largura: Math.max(1, Math.round(largura)), altura: Math.max(1, Math.round(alturaDoCeu)) };
    const pronto = document.createElement("canvas");
    pronto.width = lado.largura;
    pronto.height = lado.altura;
    pronto.getContext("2d")!.putImageData(new ImageData(pintarCeu(opcoes.fonte.id, lado.largura, lado.altura) as Uint8ClampedArray<ArrayBuffer>, lado.largura, lado.altura), 0, 0);
    ctx.drawImage(pronto, x0, y0, w, h);
  } else if (imagem) {
    // A imagem cobre a área (cortada no meio)
    const iw = (imagem as { width: number }).width;
    const ih = (imagem as { height: number }).height;
    const k = Math.max(w / iw, h / ih);
    const sw = w / k;
    const sh = h / k;
    ctx.drawImage(imagem, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x0, y0, w, h);
  }
  ctx.restore();
  // Abaixo da área, a linha de baixo esticada (a máscara esconde; a borda suave não mostra o vazio)
  if (alturaDoCeu < altura) ctx.drawImage(canvas, 0, alturaDoCeu - 1, largura, 1, 0, alturaDoCeu, largura, altura - alturaDoCeu);
  if (opcoes.brilho || opcoes.temperatura) {
    const dados = ctx.getImageData(0, 0, largura, altura);
    ajustarCeu(dados.data, opcoes.brilho, opcoes.temperatura);
    ctx.putImageData(dados, 0, 0);
  }
  return canvas;
}

/** A máscara do céu com a borda deslocada (pixels do quadro). */
export function mascaraDoCeu(selecao: Selecao, deslocar: number): Selecao {
  const raio = Math.round(Math.abs(deslocar));
  if (!raio) return selecao;
  return deslocar > 0 ? expandir(selecao, raio) : contrair(selecao, raio);
}

/** A base do céu (a linha mais baixa com céu) na máscara. */
export const baseDaMascara = (selecao: Selecao) => Math.max(0, baseDoCeu(selecao));

/** A cor média do céu novo onde a máscara cobre (o tom da luz do primeiro plano). */
export function corDoCeuNovo(ceu: HTMLCanvasElement, mascara: Selecao): [number, number, number] {
  const dados = ceu.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, ceu.width, ceu.height).data;
  return corMediaDoCeu(dados, ceu.width === mascara.largura && ceu.height === mascara.altura ? mascara.dados : undefined);
}

/** O canvas da luz do primeiro plano: a cor do céu, com a transparência fora do céu (a máscara invertida). */
export function desenharLuz(cor: [number, number, number], mascara: Selecao): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = mascara.largura;
  canvas.height = mascara.altura;
  const ctx = canvas.getContext("2d")!;
  const dados = ctx.createImageData(mascara.largura, mascara.altura);
  const fora = inverter(mascara).dados;
  for (let p = 0, i = 0; p < fora.length; p++, i += 4) {
    dados.data[i] = Math.round(cor[0] * 255);
    dados.data[i + 1] = Math.round(cor[1] * 255);
    dados.data[i + 2] = Math.round(cor[2] * 255);
    dados.data[i + 3] = fora[p];
  }
  ctx.putImageData(dados, 0, 0);
  return canvas;
}

/** O nome do modo de composição do canvas para o modo da luz (a prévia da janela). */
export const COMPOSICAO_DA_LUZ: Record<ModoDaLuz, GlobalCompositeOperation> = { luz_suave: "soft-light", multiplicar: "multiply", tela: "screen" };
