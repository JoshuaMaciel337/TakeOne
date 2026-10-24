// Os ajustes clássicos que vão direto nos pixels (ADR 0003, onda 13.10), os de Imagem › Ajustes que dependem da
// vizinhança ou da imagem inteira e por isso não cabem numa camada de ajuste: Sombras/Realces, Tonalização HDR,
// Dessaturar, Equalizar, Corresponder cor e Substituir cor. Todos trabalham em RGBA de 8 bits sem pré-multiplicar, no
// lugar, e deixam o alfa como está; a seleção (a cobertura de 0 a 255 por pixel) mistura com o de antes.
import { type Campo, desfocar } from "./efeitos.ts";
import { compilarAjuste, deHsl, emHsl } from "./ajustes.ts";
import { deYcc, estatisticasDaCor, type Estatisticas, paraYcc } from "../projeto/igualarCor.ts";

export type Cobertura = Uint8Array | Uint8ClampedArray | null;
const limitar = (v: number, minimo = 0, maximo = 1) => Math.min(maximo, Math.max(minimo, v));
const suave = (a: number, b: number, x: number) => {
  const t = limitar((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
};

/** A luminância de cada pixel (0 a 1), num campo para o desfoque. */
function campoDaLuma(dados: Uint8ClampedArray, largura: number, altura: number): Campo {
  const luma = new Float32Array(largura * altura);
  for (let p = 0, i = 0; p < luma.length; p++, i += 4) luma[p] = (0.299 * dados[i] + 0.587 * dados[i + 1] + 0.114 * dados[i + 2]) / 255;
  return { largura, altura, dados: luma };
}

/**
 * A luz da vizinhança: o desfoque dividido pelo de uma imagem toda 1 (a convolução normalizada). O desfoque de
 * efeitos.ts conta o lado de fora como zero, o que escureceria as bordas e faria o ajuste mexer na moldura da foto.
 */
function vizinhanca(luma: Campo, sigma: number): Campo {
  const borrada = desfocar(luma, sigma);
  const pesos = desfocar({ largura: luma.largura, altura: luma.altura, dados: new Float32Array(luma.dados.length).fill(1) }, sigma);
  for (let p = 0; p < borrada.dados.length; p++) borrada.dados[p] /= Math.max(1e-6, pesos.dados[p]);
  return borrada;
}

/** Mistura o resultado com o original pela cobertura (onde ela é 0, o original fica). */
export function misturarComCobertura(original: Uint8ClampedArray, resultado: Uint8ClampedArray, cobertura: Cobertura) {
  if (!cobertura) return;
  for (let p = 0, i = 0; i < resultado.length; p++, i += 4) {
    const peso = cobertura[p] / 255;
    if (peso >= 1) continue;
    for (let k = 0; k < 3; k++) resultado[i + k] = Math.round(original[i + k] + (resultado[i + k] - original[i + k]) * peso);
  }
}

/** Troca a luminância de um pixel (escala a cor; perto do preto, soma). */
function comLuma(dados: Uint8ClampedArray, i: number, antes: number, depois: number) {
  if (antes > 0.02) {
    const fator = depois / antes;
    for (let k = 0; k < 3; k++) dados[i + k] = Math.round(limitar((dados[i + k] / 255) * fator) * 255);
  } else for (let k = 0; k < 3; k++) dados[i + k] = Math.round(limitar(dados[i + k] / 255 + depois - antes) * 255);
}

// ——— Sombras/Realces ———
export type TomDoSombrasRealces = { quantidade: number; tom: number; raio: number };
export type SombrasRealces = { sombras: TomDoSombrasRealces; realces: TomDoSombrasRealces; cor: number; meios: number };
export const SOMBRAS_REALCES_PADRAO: SombrasRealces = { sombras: { quantidade: 35, tom: 50, raio: 30 }, realces: { quantidade: 0, tom: 50, raio: 30 }, cor: 20, meios: 0 };

/**
 * Clareia as sombras e escurece os realces pela vizinhança (o desfoque no raio): o ganho sai da curva de potência
 * aplicada à luz da vizinhança (o preto continua preto) e multiplica o pixel, o que guarda o contraste dos detalhes;
 * o tom diz até onde vai cada faixa, a cor satura o que mudou e os meios-tons mexem no contraste do meio.
 */
export function sombrasRealces(dados: Uint8ClampedArray, largura: number, altura: number, o: SombrasRealces) {
  const luma = campoDaLuma(dados, largura, altura);
  const vizinhancaS = vizinhanca(luma, Math.max(0.5, o.sombras.raio / 2));
  const vizinhancaR = o.realces.raio === o.sombras.raio ? vizinhancaS : vizinhanca(luma, Math.max(0.5, o.realces.raio / 2));
  const qs = o.sombras.quantidade / 100;
  const qr = o.realces.quantidade / 100;
  const ts = Math.max(0.02, o.sombras.tom / 100);
  const tr = Math.max(0.02, o.realces.tom / 100);
  // A potência da curva: 100% leva a luz da vizinhança à raiz cúbica (mais ou menos)
  const gs = 1 / (1 + 2 * qs);
  const gr = 1 / (1 + 2 * qr);
  const ganho = (x: number, g: number) => Math.min(8, Math.max(1e-3, x) ** g / Math.max(1e-3, x));
  for (let p = 0, i = 0; p < luma.dados.length; p++, i += 4) {
    const bs = vizinhancaS.dados[p];
    const br = vizinhancaR.dados[p];
    const ws = qs > 0 ? 1 - suave(0, ts, bs) : 0;
    const wr = qr > 0 ? suave(1 - tr, 1, br) : 0;
    const ganhoS = 1 + ws * (ganho(bs, gs) - 1);
    const ganhoR = 1 + wr * (ganho(1 - br, gr) - 1);
    for (let k = 0; k < 3; k++) {
      // As sombras multiplicam a cor; os realces multiplicam o que falta para o branco
      let v = (dados[i + k] / 255) * ganhoS;
      v = 1 - (1 - limitar(v)) * ganhoR;
      dados[i + k] = Math.round(limitar(v) * 255);
    }
    const l = (0.299 * dados[i] + 0.587 * dados[i + 1] + 0.114 * dados[i + 2]) / 255;
    if (o.meios) comLuma(dados, i, l, limitar(l + (o.meios / 100) * (l - 0.5) * 4 * l * (1 - l)));
    // A cor: satura (ou tira a cor de) o que as sombras e os realces mudaram
    const peso = Math.min(1, qs * ws + qr * wr);
    if (o.cor && peso > 0) {
      const y = (0.299 * dados[i] + 0.587 * dados[i + 1] + 0.114 * dados[i + 2]) / 255;
      const fator = Math.max(0, 1 + (o.cor / 100) * peso);
      for (let k = 0; k < 3; k++) dados[i + k] = Math.round(limitar(y + (dados[i + k] / 255 - y) * fator) * 255);
    }
  }
}

// ——— Tonalização HDR ———
export type MetodoHdr = "adaptacao" | "exposicao_gama" | "compressao" | "equalizar";
export type Hdr = { metodo: MetodoHdr; raio: number; forca: number; gama: number; exposicao: number; detalhe: number; vibracao: number; saturacao: number };
export const HDR_PADRAO: Hdr = { metodo: "adaptacao", raio: 30, forca: 0.5, gama: 1, exposicao: 0, detalhe: 30, vibracao: 0, saturacao: 20 };

/** A tabela da equalização: a luminância acumulada vira o tom novo (cada tom ganha a mesma parte dos pixels). */
export function tabelaDaEqualizacao(luma: Float32Array, cobertura: Cobertura = null): Float32Array {
  const contagem = new Float64Array(256);
  for (let p = 0; p < luma.length; p++) contagem[Math.min(255, Math.floor(luma[p] * 255 + 0.5))] += cobertura ? cobertura[p] / 255 : 1;
  const tabela = new Float32Array(256);
  let total = 0;
  for (const v of contagem) total += v;
  let acumulado = 0;
  const primeiro = contagem.findIndex((v) => v > 0);
  const base = primeiro >= 0 ? contagem[primeiro] : 0;
  for (let i = 0; i < 256; i++) {
    acumulado += contagem[i];
    tabela[i] = total > base ? limitar((acumulado - base) / (total - base)) : i / 255;
  }
  return tabela;
}

export function tonalizacaoHdr(dados: Uint8ClampedArray, largura: number, altura: number, o: Hdr) {
  const luma = campoDaLuma(dados, largura, altura);
  const exposicao = 2 ** o.exposicao;
  const gama = 1 / Math.max(0.1, o.gama);
  const tabela = o.metodo === "equalizar" ? tabelaDaEqualizacao(luma.dados) : null;
  const base = o.metodo === "adaptacao" ? vizinhanca(luma, Math.max(0.5, o.raio / 3)) : null;
  for (let p = 0, i = 0; p < luma.dados.length; p++, i += 4) {
    const l = luma.dados[p];
    let nova: number;
    if (o.metodo === "exposicao_gama") nova = (l * exposicao) ** gama;
    else if (o.metodo === "compressao") nova = (2 * l) / (1 + l);
    else if (tabela) nova = tabela[Math.min(255, Math.floor(l * 255 + 0.5))];
    else {
      // A adaptação local: a base (a vizinhança) é achatada pela força e o detalhe volta por cima, aumentado
      const b = base!.dados[p];
      const achatada = 0.5 + (b - 0.5) * (1 - limitar(o.forca / 4, 0, 0.9));
      nova = ((achatada + (l - b) * (1 + o.detalhe / 100)) * exposicao) ** gama;
    }
    comLuma(dados, i, l, limitar(nova));
  }
  // A vibração e a saturação por cima, pela mesma conta da camada de ajuste
  if (o.vibracao || o.saturacao) {
    const compilado = compilarAjuste({ tipo: "vibracao", vibracao: o.vibracao, saturacao: o.saturacao });
    if (compilado.tipo === "funcao") {
      for (let i = 0; i < dados.length; i += 4) {
        const [r, g, b] = compilado.funcao([dados[i] / 255, dados[i + 1] / 255, dados[i + 2] / 255]);
        dados[i] = Math.round(r * 255);
        dados[i + 1] = Math.round(g * 255);
        dados[i + 2] = Math.round(b * 255);
      }
    }
  }
}

// ——— Dessaturar e Equalizar ———
/** Dessaturar: cada pixel vira o cinza da luminosidade dele (a média do maior e do menor canal). */
export function dessaturar(dados: Uint8ClampedArray) {
  for (let i = 0; i < dados.length; i += 4) {
    const cinza = Math.round((Math.max(dados[i], dados[i + 1], dados[i + 2]) + Math.min(dados[i], dados[i + 1], dados[i + 2])) / 2);
    dados[i] = cinza;
    dados[i + 1] = cinza;
    dados[i + 2] = cinza;
  }
}

/** Equalizar: o brilho espalhado por igual pelos tons, a mesma tabela nos três canais (a cor não muda de matiz). */
export function equalizar(dados: Uint8ClampedArray, largura: number, altura: number, cobertura: Cobertura = null) {
  const tabela = tabelaDaEqualizacao(campoDaLuma(dados, largura, altura).dados, cobertura);
  for (let i = 0; i < dados.length; i += 4) for (let k = 0; k < 3; k++) dados[i + k] = Math.round(tabela[dados[i + k]] * 255);
}

// ——— Corresponder cor ———
export type Corresponder = { luminancia: number; intensidade: number; atenuar: number; neutralizar: boolean };
export const CORRESPONDER_PADRAO: Corresponder = { luminancia: 100, intensidade: 100, atenuar: 0, neutralizar: false };
export { estatisticasDaCor, type Estatisticas };

/** Leva a média e o desvio da luz e da cor da imagem aos da origem (como o Igualar a cor do vídeo), com os controles de lá. */
export function corresponderCor(dados: Uint8ClampedArray, alvo: Estatisticas, origem: Estatisticas, o: Corresponder) {
  const ganho = (k: number, minimo: number, maximo: number) => (alvo.desvio[k] > 1e-4 ? limitar(origem.desvio[k] / alvo.desvio[k], minimo, maximo) : 1);
  const ganhos = [ganho(0, 0.5, 2), ganho(1, 0.25, 3), ganho(2, 0.25, 3)];
  const mistura = 1 - o.atenuar / 100;
  for (let i = 0; i < dados.length; i += 4) {
    const r = dados[i] / 255;
    const g = dados[i + 1] / 255;
    const b = dados[i + 2] / 255;
    const [y, cb, cr] = paraYcc(r, g, b);
    const y2 = ((y - alvo.media[0]) * ganhos[0] + origem.media[0]) * (o.luminancia / 100);
    // Neutralizar tira o tom geral da origem: a cor fica em volta do cinza
    const cb2 = ((cb - alvo.media[1]) * ganhos[1] + (o.neutralizar ? 0 : origem.media[1])) * (o.intensidade / 100);
    const cr2 = ((cr - alvo.media[2]) * ganhos[2] + (o.neutralizar ? 0 : origem.media[2])) * (o.intensidade / 100);
    const nova = deYcc(y2, cb2, cr2);
    const antes = [r, g, b];
    for (let k = 0; k < 3; k++) dados[i + k] = Math.round(limitar(antes[k] + (limitar(nova[k]) - antes[k]) * mistura) * 255);
  }
}

// ——— Substituir cor ———
export type Substituir = { cor: string; imprecisao: number; matiz: number; saturacao: number; luminosidade: number };
export const SUBSTITUIR_PADRAO: Substituir = { cor: "#ff0000", imprecisao: 40, matiz: 0, saturacao: 0, luminosidade: 0 };

/** Quanto o pixel é da cor escolhida (1 perto, 0 além da imprecisão), pela distância em RGB de 8 bits. */
export function pesoDaCor(r: number, g: number, b: number, alvo: [number, number, number], imprecisao: number): number {
  const d = Math.hypot(r - alvo[0], g - alvo[1], b - alvo[2]);
  const alcance = Math.max(1, imprecisao * 1.5);
  return d >= alcance ? 0 : 1 - suave(alcance * 0.5, alcance, d);
}

export function substituirCor(dados: Uint8ClampedArray, o: Substituir) {
  const v = Number.parseInt(o.cor.replace("#", ""), 16);
  const alvo: [number, number, number] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  for (let i = 0; i < dados.length; i += 4) {
    const peso = pesoDaCor(dados[i], dados[i + 1], dados[i + 2], alvo, o.imprecisao);
    if (peso <= 0) continue;
    const [h, s, l] = emHsl([dados[i] / 255, dados[i + 1] / 255, dados[i + 2] / 255]);
    const s2 = limitar(o.saturacao < 0 ? s * (1 + o.saturacao / 100) : s + (1 - s) * (o.saturacao / 100));
    const l2 = limitar(o.luminosidade < 0 ? l * (1 + o.luminosidade / 100) : l + (1 - l) * (o.luminosidade / 100));
    const nova = deHsl(h + o.matiz, s2, l2);
    for (let k = 0; k < 3; k++) dados[i + k] = Math.round((dados[i + k] / 255 + (nova[k] - dados[i + k] / 255) * peso) * 255);
  }
}
