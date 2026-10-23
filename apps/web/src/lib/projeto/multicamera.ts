// Multicâmera: acha, pelo som, quanto uma gravação começou depois da outra. Os níveis da ingestão
// (niveis.bin, o pico em dB a cada 10 ms) viram uma curva de ataques (só as subidas do nível: palmas,
// sílabas, batidas), e a correlação das duas curvas, pela FFT, aponta o atraso em que elas se encaixam.
// As subidas, e não o nível, porque cada câmera ouve o ambiente com outro volume e outro ruído.
import { TICKS_POR_SEGUNDO, type Tick } from "../tempo.ts";
import type { Clipe } from "./modelo.ts";
import { NIVEIS_POR_SEGUNDO } from "./nivelar.ts";

/** A sobreposição mínima entre as gravações para valer o encaixe: 10 s, ou metade da mais curta. */
const SOBREPOSICAO_MINIMA_S = 10;
/** Quanto o melhor encaixe precisa passar do segundo melhor (fora de 1 s em volta dele) para ser aceito. */
const FOLGA_DO_ENCAIXE = 1.25;
/** A maior subida que conta: um estalo de 60 dB não decide o encaixe sozinho. */
const SUBIDA_MAXIMA_DB = 30;

export type Encaixe = {
  /** Em segundos: o que a primeira gravação ouve no instante x, a segunda ouve em x - atraso. */
  atraso: number;
  /** Quanto o melhor encaixe passa do segundo melhor (1 = empate). */
  confianca: number;
};

/** As subidas do nível, sem a média e em desvios-padrão. */
function ataques(niveis: Int8Array): Float64Array {
  const saida = new Float64Array(niveis.length);
  for (let i = 1; i < niveis.length; i++) saida[i] = Math.min(SUBIDA_MAXIMA_DB, Math.max(0, niveis[i] - niveis[i - 1]));
  let media = 0;
  for (const v of saida) media += v;
  media /= saida.length || 1;
  let variancia = 0;
  for (const v of saida) variancia += (v - media) ** 2;
  const desvio = Math.sqrt(variancia / (saida.length || 1)) || 1;
  for (let i = 0; i < saida.length; i++) saida[i] = (saida[i] - media) / desvio;
  return saida;
}

/** FFT de raiz 2 no lugar (re e im do mesmo tamanho, potência de 2); `inversa` sem dividir por n. */
function fft(re: Float64Array, im: Float64Array, inversa: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let tamanho = 2; tamanho <= n; tamanho <<= 1) {
    const angulo = ((inversa ? 2 : -2) * Math.PI) / tamanho;
    const wr = Math.cos(angulo);
    const wi = Math.sin(angulo);
    for (let i = 0; i < n; i += tamanho) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < tamanho / 2; k++) {
        const a = i + k;
        const b = a + tamanho / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const proximo = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = proximo;
      }
    }
  }
}

/**
 * O atraso da segunda gravação em relação à primeira, pelos níveis das duas. `null` quando elas não
 * se sobrepõem o bastante ou quando nenhum encaixe se destaca (gravações de lugares diferentes).
 */
export function atrasoPeloSom(primeira: Int8Array, segunda: Int8Array): Encaixe | null {
  const na = primeira.length;
  const nb = segunda.length;
  const minima = Math.min(SOBREPOSICAO_MINIMA_S * NIVEIS_POR_SEGUNDO, Math.floor(Math.min(na, nb) / 2));
  if (minima < NIVEIS_POR_SEGUNDO * 2) return null;
  let n = 1;
  while (n < na + nb) n <<= 1;
  const ar = new Float64Array(n);
  const ai = new Float64Array(n);
  const br = new Float64Array(n);
  const bi = new Float64Array(n);
  ar.set(ataques(primeira));
  br.set(ataques(segunda));
  fft(ar, ai, false);
  fft(br, bi, false);
  // A · conj(B): a correlação c[k] = Σ a[i + k] · b[i]
  for (let i = 0; i < n; i++) {
    const re = ar[i] * br[i] + ai[i] * bi[i];
    const im = ai[i] * br[i] - ar[i] * bi[i];
    ar[i] = re;
    ai[i] = im;
  }
  fft(ar, ai, true);
  const correlacao = (k: number) => ar[(k + n) % n] / n;
  // A nota de cada atraso é a correlação sobre a raiz da sobreposição: o quanto ela foge do acaso
  const nota = (k: number) => {
    const sobreposicao = Math.min(na, nb + k) - Math.max(0, k);
    return sobreposicao >= minima ? correlacao(k) / Math.sqrt(sobreposicao) : Number.NEGATIVE_INFINITY;
  };
  let melhor = 0;
  let melhorNota = Number.NEGATIVE_INFINITY;
  for (let k = -(nb - 1); k < na; k++) {
    const valor = nota(k);
    if (valor > melhorNota) {
      melhorNota = valor;
      melhor = k;
    }
  }
  if (!Number.isFinite(melhorNota) || melhorNota <= 0) return null;
  let segundaNota = 0;
  for (let k = -(nb - 1); k < na; k++) {
    if (Math.abs(k - melhor) <= NIVEIS_POR_SEGUNDO) continue;
    segundaNota = Math.max(segundaNota, nota(k));
  }
  const confianca = segundaNota > 0 ? melhorNota / segundaNota : Number.POSITIVE_INFINITY;
  if (confianca < FOLGA_DO_ENCAIXE) return null;
  // Entre duas amostras: o vértice da parábola pelos três pontos em volta do pico
  const [y0, y1, y2] = [correlacao(melhor - 1), correlacao(melhor), correlacao(melhor + 1)];
  const curvatura = y0 - 2 * y1 + y2;
  const fracao = curvatura < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / curvatura)) : 0;
  return { atraso: (melhor + fracao) / NIVEIS_POR_SEGUNDO, confianca };
}

/**
 * O atraso da câmera na linha do tempo (o tempo da mídia dela é o da linha menos ele), a partir do clipe de
 * referência e do encaixe das gravações. A referência precisa estar na velocidade normal.
 */
export function atrasoNaLinha(referencia: Pick<Clipe, "inicio" | "entrada">, encaixe: Encaixe): Tick {
  return Math.round(referencia.inicio - referencia.entrada + encaixe.atraso * TICKS_POR_SEGUNDO);
}
