// Os modos da pintura, pixel a pixel, com as fórmulas de misturarModo no shader do compositor
// (lib/previa/compositor.ts): pintar em "Luz suave" dá a mesma cor que uma camada em "Luz suave" por cima.
import type { ModoDaPintura } from "./traco.ts";

type Rgb = [number, number, number];

const queimarCor = (b: number, s: number) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s));
const esquivarCor = (b: number, s: number) => (b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s)));
const luzSuave = (b: number, s: number) => (s < 0.5 ? 2 * b * s + b * b * (1 - 2 * s) : 2 * b * (1 - s) + Math.sqrt(b) * (2 * s - 1));
const luzBrilhante = (b: number, s: number) => (s <= 0.5 ? queimarCor(b, 2 * s) : esquivarCor(b, 2 * (s - 0.5)));
const luzDoPino = (b: number, s: number) => (s < 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * (s - 0.5)));
const dividirCanal = (b: number, s: number) => (s <= 0 ? (b <= 0 ? 0 : 1) : Math.min(1, b / s));
const lumDe = (c: Rgb) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
function cortarCor(c: Rgb): Rgb {
  const l = lumDe(c);
  const n = Math.min(c[0], c[1], c[2]);
  const x = Math.max(c[0], c[1], c[2]);
  let r = c;
  if (n < 0) r = r.map((v) => l + ((v - l) * l) / Math.max(l - n, 1e-6)) as Rgb;
  if (x > 1) r = r.map((v) => l + ((v - l) * (1 - l)) / Math.max(x - l, 1e-6)) as Rgb;
  return r;
}
const comLum = (c: Rgb, l: number): Rgb => cortarCor(c.map((v) => v + (l - lumDe(c))) as Rgb);
const satDe = (c: Rgb) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
function comSat(c: Rgb, s: number): Rgb {
  const n = Math.min(c[0], c[1], c[2]);
  const x = Math.max(c[0], c[1], c[2]);
  return x > n ? (c.map((v) => ((v - n) * s) / (x - n)) as Rgb) : [0, 0, 0];
}
const porCanal = (b: Rgb, s: Rgb, f: (b: number, s: number) => number): Rgb => [f(b[0], s[0]), f(b[1], s[1]), f(b[2], s[2])];

/** A cor misturada de um modo (fundo `b` e tinta `s`, sem o alfa, de 0 a 1). */
export function misturar(modo: ModoDaPintura, b: Rgb, s: Rgb): Rgb {
  switch (modo) {
    case "multiplicar":
      return porCanal(b, s, (x, y) => x * y);
    case "tela":
      return porCanal(b, s, (x, y) => x + y - x * y);
    case "somar":
      return porCanal(b, s, (x, y) => Math.min(x + y, 1));
    case "escurecer":
      return porCanal(b, s, Math.min);
    case "clarear":
      return porCanal(b, s, Math.max);
    case "sobrepor":
      return porCanal(b, s, (x, y) => (x < 0.5 ? 2 * x * y : 1 - 2 * (1 - x) * (1 - y)));
    case "luz_forte":
      return porCanal(b, s, (x, y) => (y < 0.5 ? 2 * x * y : 1 - 2 * (1 - x) * (1 - y)));
    case "diferenca":
      return porCanal(b, s, (x, y) => Math.abs(x - y));
    case "exclusao":
      return porCanal(b, s, (x, y) => x + y - 2 * x * y);
    case "superexposicao_cores":
      return porCanal(b, s, queimarCor);
    case "superexposicao_linear":
      return porCanal(b, s, (x, y) => Math.max(x + y - 1, 0));
    case "cor_mais_escura":
      return lumDe(s) < lumDe(b) ? s : b;
    case "subexposicao_cores":
      return porCanal(b, s, esquivarCor);
    case "cor_mais_clara":
      return lumDe(s) > lumDe(b) ? s : b;
    case "luz_suave":
      return porCanal(b, s, luzSuave);
    case "luz_brilhante":
      return porCanal(b, s, luzBrilhante);
    case "luz_linear":
      return porCanal(b, s, (x, y) => Math.min(1, Math.max(0, x + 2 * y - 1)));
    case "luz_do_pino":
      return porCanal(b, s, luzDoPino);
    case "mistura_solida":
      return porCanal(b, s, (x, y) => (x + y >= 1 ? 1 : 0));
    case "subtrair":
      return porCanal(b, s, (x, y) => Math.max(x - y, 0));
    case "dividir":
      return porCanal(b, s, dividirCanal);
    case "matiz":
      return comLum(comSat(s, satDe(b)), lumDe(b));
    case "saturacao":
      return comLum(comSat(b, satDe(s)), lumDe(b));
    case "cor":
      return comLum(s, lumDe(b));
    case "luminosidade":
      return comLum(b, lumDe(s));
    default:
      return s;
  }
}

/**
 * Junta o traço (cor da tinta com o alfa acumulado) à camada, pixel a pixel, num retângulo: `fundo` e `traco` são
 * RGBA de 8 bits sem pré-multiplicar (os do getImageData); o resultado vai para `saida`. A opacidade limita o traço,
 * como nos editores de imagem; com a transparência travada, o alfa da camada não muda (só pinta onde já há pixel).
 * Dissolver é o sorteio fixo por pixel do compositor; Limpar tira o alfa.
 */
export function juntarTraco(
  fundo: Uint8ClampedArray,
  traco: Uint8ClampedArray,
  saida: Uint8ClampedArray,
  { modo, opacidade, travarTransparencia, apagar, largura, x0, y0 }: { modo: ModoDaPintura; opacidade: number; travarTransparencia: boolean; apagar: boolean; largura: number; x0: number; y0: number },
): void {
  for (let i = 0; i < fundo.length; i += 4) {
    const as = (traco[i + 3] / 255) * opacidade;
    const ab = fundo[i + 3] / 255;
    if (as <= 0) {
      saida[i] = fundo[i];
      saida[i + 1] = fundo[i + 1];
      saida[i + 2] = fundo[i + 2];
      saida[i + 3] = fundo[i + 3];
      continue;
    }
    if (apagar || modo === "limpar") {
      const alfa = travarTransparencia ? ab : ab * (1 - as);
      saida[i] = fundo[i];
      saida[i + 1] = fundo[i + 1];
      saida[i + 2] = fundo[i + 2];
      saida[i + 3] = Math.round(alfa * 255);
      continue;
    }
    let a = as;
    if (modo === "dissolver") {
      const p = i / 4;
      const x = x0 + (p % largura);
      const y = y0 + Math.floor(p / largura);
      // O fract do shader (o sorteio fixo por pixel), também para os valores negativos
      const sorteio = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      a = sorteio - Math.floor(sorteio) < as ? 1 : 0;
      if (a === 0) {
        saida[i] = fundo[i];
        saida[i + 1] = fundo[i + 1];
        saida[i + 2] = fundo[i + 2];
        saida[i + 3] = fundo[i + 3];
        continue;
      }
    }
    const s: Rgb = [traco[i] / 255, traco[i + 1] / 255, traco[i + 2] / 255];
    const b: Rgb = [fundo[i] / 255, fundo[i + 1] / 255, fundo[i + 2] / 255];
    const m = modo === "normal" || modo === "dissolver" ? s : misturar(modo, b, s);
    // A conta do W3C: onde o fundo é transparente fica a tinta; onde é opaco, a mistura
    const ao = travarTransparencia ? ab : a + ab * (1 - a);
    for (let c = 0; c < 3; c++) {
      const misturada = (1 - ab) * s[c] + ab * m[c];
      const pre = travarTransparencia ? ab * (a * m[c] + (1 - a) * b[c]) : a * misturada + (1 - a) * ab * b[c];
      saida[i + c] = ao > 0 ? Math.round((pre / ao) * 255) : 0;
    }
    saida[i + 3] = Math.round(ao * 255);
  }
}
