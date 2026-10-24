// Exibir › Prova de cores e Alerta de gama do editor de imagem (ADR 0003, onda 13.13): só na tela, depois do modo de
// cor, nunca nos arquivos. A prova mostra a imagem como sairia na impressão em CMYK (a mesma separação e prova do modo
// CMYK) ou como a veem pessoas com daltonismo (as matrizes de Machado, Oliveira e Fernandes, 2009, de gravidade total,
// em luz linear). O alerta de gama pinta de cinza o que a impressão não alcança.
import { CMYK_PADRAO, type ModoDeCor, provaCmyk, rgbParaLab } from "./modos.ts";

export type TipoDaProva = "cmyk" | "protanopia" | "deuteranopia" | "tritanopia" | "cinza";

export const PROVAS: { id: TipoDaProva; nome: string }[] = [
  { id: "cmyk", nome: "CMYK de trabalho" },
  { id: "protanopia", nome: "Daltonismo — protanopia" },
  { id: "deuteranopia", nome: "Daltonismo — deuteranopia" },
  { id: "tritanopia", nome: "Daltonismo — tritanopia" },
  { id: "cinza", nome: "Escala de cinza (luz)" },
];

type Matriz = [number, number, number, number, number, number, number, number, number];

const DALTONISMO: Record<"protanopia" | "deuteranopia" | "tritanopia", Matriz> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

const PARA_LINEAR = (() => {
  const tabela = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    tabela[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }
  return tabela;
})();
const paraTela = (v: number) => {
  const c = v <= 0 ? 0 : v >= 1 ? 1 : v;
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
};

/** A cor como a pessoa com o daltonismo a vê (sRGB de 0 a 255). */
export function corDaltonica(tipo: "protanopia" | "deuteranopia" | "tritanopia", r: number, g: number, b: number): [number, number, number] {
  const m = DALTONISMO[tipo];
  const [lr, lg, lb] = [PARA_LINEAR[r], PARA_LINEAR[g], PARA_LINEAR[b]];
  return [paraTela(m[0] * lr + m[1] * lg + m[2] * lb), paraTela(m[3] * lr + m[4] * lg + m[5] * lb), paraTela(m[6] * lr + m[7] * lg + m[8] * lb)];
}

/**
 * A distância de cor (ΔE 1976) a partir da qual a cor conta como fora do que a impressão alcança. Numa foto noturna,
 * 12 marca 8% dela (o céu azul-escuro e as luzes saturadas); com 10, eram 22%.
 */
export const LIMITE_DA_GAMA = 12;

/** A cor sai da gama de impressão: a prova dela fica longe dela (em L*a*b*). */
export function foraDaGama(r: number, g: number, b: number, cmyk: Extract<ModoDeCor, { tipo: "cmyk" }> = CMYK_PADRAO): boolean {
  const [pr, pg, pb] = provaCmyk(r, g, b, cmyk);
  const a = rgbParaLab(r / 255, g / 255, b / 255);
  const d = rgbParaLab(pr / 255, pg / 255, pb / 255);
  return Math.hypot(a[0] - d[0], a[1] - d[1], a[2] - d[2]) > LIMITE_DA_GAMA;
}

/**
 * A prova e o alerta nos pixels (em lugar). O alerta olha a cor antes da prova e pinta de cinza médio o que sai da
 * gama; o CMYK da prova e do alerta é o do documento, quando ele está no modo CMYK.
 */
export function aplicarProva(dados: Uint8ClampedArray, prova: TipoDaProva | null, alerta: boolean, modo?: ModoDeCor | null) {
  const cmyk = modo?.tipo === "cmyk" ? modo : CMYK_PADRAO;
  // As duas contas por cor guardadas (as fotos repetem muitas cores)
  const cache = new Map<number, number>();
  for (let i = 0; i < dados.length; i += 4) {
    if (!dados[i + 3]) continue;
    const r = dados[i];
    const g = dados[i + 1];
    const b = dados[i + 2];
    const chave = (r << 16) | (g << 8) | b;
    let pronta = cache.get(chave);
    if (pronta === undefined) {
      let saida: [number, number, number] = [r, g, b];
      if (alerta && foraDaGama(r, g, b, cmyk)) saida = [128, 128, 128];
      else if (prova === "cmyk") saida = provaCmyk(r, g, b, cmyk);
      else if (prova === "cinza") {
        const v = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        saida = [v, v, v];
      } else if (prova) saida = corDaltonica(prova, r, g, b);
      pronta = (saida[0] << 16) | (saida[1] << 8) | saida[2];
      if (cache.size < 200_000) cache.set(chave, pronta);
    }
    dados[i] = pronta >> 16;
    dados[i + 1] = (pronta >> 8) & 255;
    dados[i + 2] = pronta & 255;
  }
}
