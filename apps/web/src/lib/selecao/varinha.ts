// A varinha mágica, o Aumentar e o Semelhante (ADR 0003, onda 13.3): a seleção pela cor de uma imagem RGBA do
// tamanho do documento (a imagem inteira ou só a camada). A cor é comparada no alfa pré-multiplicado, canal por
// canal, para o transparente valer como uma cor só, qualquer que seja o RGB guardado nele.
import { difusao, type Selecao, vazia } from "./mascara.ts";

export type ImagemRgba = { largura: number; altura: number; dados: Uint8ClampedArray | Uint8Array };

/** Os tamanhos da amostra: o ponto ou a média de um quadrado em volta dele. */
export const AMOSTRAS = [1, 3, 5, 11, 31, 51, 101] as const;
export type TamanhoDaAmostra = (typeof AMOSTRAS)[number];

type Cor = [number, number, number, number];

/** A cor pré-multiplicada de um pixel. */
function corEm(imagem: ImagemRgba, i: number): Cor {
  const d = imagem.dados;
  const a = d[i * 4 + 3];
  return [(d[i * 4] * a) / 255, (d[i * 4 + 1] * a) / 255, (d[i * 4 + 2] * a) / 255, a];
}

/** A cor da amostra em volta de (x, y): a média do quadrado, cortado na borda da imagem. */
export function corDaAmostra(imagem: ImagemRgba, x: number, y: number, tamanho: TamanhoDaAmostra = 1): Cor {
  const raio = (tamanho - 1) / 2;
  const soma: Cor = [0, 0, 0, 0];
  let n = 0;
  for (let yy = Math.max(0, y - raio); yy <= Math.min(imagem.altura - 1, y + raio); yy++) {
    for (let xx = Math.max(0, x - raio); xx <= Math.min(imagem.largura - 1, x + raio); xx++) {
      const cor = corEm(imagem, yy * imagem.largura + xx);
      for (let c = 0; c < 4; c++) soma[c] += cor[c];
      n++;
    }
  }
  return soma.map((v) => v / Math.max(1, n)) as Cor;
}

/** Cada canal dentro de [mínimo, máximo]. */
function dentroDaFaixa(imagem: ImagemRgba, i: number, minimo: Cor, maximo: Cor): boolean {
  const cor = corEm(imagem, i);
  for (let c = 0; c < 4; c++) if (cor[c] < minimo[c] || cor[c] > maximo[c]) return false;
  return true;
}

/**
 * Os pixels na faixa: contíguos às sementes (4 vizinhos, sem atravessar o que está fora) ou em toda a imagem. As
 * sementes que estão fora da faixa também espalham (o Aumentar parte da seleção inteira).
 */
function porFaixa(imagem: ImagemRgba, sementes: number[], minimo: Cor, maximo: Cor, contigua: boolean): Uint8Array {
  const { largura, altura } = imagem;
  const marcado = new Uint8Array(largura * altura);
  if (!contigua) {
    for (let i = 0; i < marcado.length; i++) if (dentroDaFaixa(imagem, i, minimo, maximo)) marcado[i] = 1;
    for (const i of sementes) marcado[i] = 1;
    return marcado;
  }
  const pilha: number[] = [];
  for (const i of sementes) {
    if (marcado[i]) continue;
    marcado[i] = 1;
    pilha.push(i);
  }
  while (pilha.length) {
    const i = pilha.pop()!;
    const x = i % largura;
    const vizinhos = [x > 0 ? i - 1 : -1, x < largura - 1 ? i + 1 : -1, i >= largura ? i - largura : -1, i + largura < marcado.length ? i + largura : -1];
    for (const v of vizinhos) {
      if (v < 0 || marcado[v] || !dentroDaFaixa(imagem, v, minimo, maximo)) continue;
      marcado[v] = 1;
      pilha.push(v);
    }
  }
  return marcado;
}

/** Os marcados como seleção: 0 ou 255, ou com a borda suave (meio pixel de difusão). */
function comoSelecao(largura: number, altura: number, marcado: Uint8Array, suavizar: boolean): Selecao {
  const selecao = vazia(largura, altura);
  for (let i = 0; i < marcado.length; i++) selecao.dados[i] = marcado[i] ? 255 : 0;
  if (!suavizar) return selecao;
  // A borda ganha meio pixel de rampa de cada lado; o miolo (os quatro vizinhos marcados) fica cheio
  const suave = difusao(selecao, 0.6);
  for (let i = 0; i < marcado.length; i++) {
    if (!marcado[i]) continue;
    const x = i % largura;
    const miolo = x > 0 && x < largura - 1 && i >= largura && i < marcado.length - largura && marcado[i - 1] && marcado[i + 1] && marcado[i - largura] && marcado[i + largura];
    suave.dados[i] = miolo ? 255 : Math.max(suave.dados[i], 128);
  }
  return suave;
}

export type OpcoesDaVarinha = { tolerancia: number; contigua: boolean; suavizar: boolean; amostra: TamanhoDaAmostra };

/** A varinha: os pixels até `tolerancia` (0 a 255, em cada canal) da cor clicada. */
export function varinha(imagem: ImagemRgba, x: number, y: number, opcoes: OpcoesDaVarinha): Selecao {
  const px = Math.min(imagem.largura - 1, Math.max(0, Math.floor(x)));
  const py = Math.min(imagem.altura - 1, Math.max(0, Math.floor(y)));
  const cor = corDaAmostra(imagem, px, py, opcoes.amostra);
  const minimo = cor.map((v) => v - opcoes.tolerancia) as Cor;
  const maximo = cor.map((v) => v + opcoes.tolerancia) as Cor;
  const marcado = porFaixa(imagem, [py * imagem.largura + px], minimo, maximo, opcoes.contigua);
  return comoSelecao(imagem.largura, imagem.altura, marcado, opcoes.suavizar);
}

/**
 * Aumentar (contígua) e Semelhante (em toda a imagem): entram os pixels cuja cor fica dentro da faixa das cores
 * já selecionadas, alargada pela tolerância da varinha.
 */
export function aumentar(imagem: ImagemRgba, selecao: Selecao, tolerancia: number, contigua: boolean): Selecao {
  const minimo: Cor = [Infinity, Infinity, Infinity, Infinity];
  const maximo: Cor = [-Infinity, -Infinity, -Infinity, -Infinity];
  const sementes: number[] = [];
  for (let i = 0; i < selecao.dados.length; i++) {
    if (selecao.dados[i] < 128) continue;
    sementes.push(i);
    const cor = corEm(imagem, i);
    for (let c = 0; c < 4; c++) {
      if (cor[c] < minimo[c]) minimo[c] = cor[c];
      if (cor[c] > maximo[c]) maximo[c] = cor[c];
    }
  }
  if (!sementes.length) return selecao;
  for (let c = 0; c < 4; c++) {
    minimo[c] -= tolerancia;
    maximo[c] += tolerancia;
  }
  const marcado = porFaixa(imagem, sementes, minimo, maximo, contigua);
  const saida = comoSelecao(selecao.largura, selecao.altura, marcado, true);
  // O que já estava (com a borda difusa) continua
  for (let i = 0; i < saida.dados.length; i++) saida.dados[i] = Math.max(saida.dados[i], selecao.dados[i]);
  return saida;
}
