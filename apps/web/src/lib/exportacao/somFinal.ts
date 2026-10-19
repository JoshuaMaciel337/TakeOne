// O acabamento do som na exportação pelo navegador, como o render faz depois da mistura
// (core/utils/render.py): mede o loudness integrado (ITU-R BS.1770, a conta do ebur128 do FFmpeg), leva a
// mistura inteira a -14 LUFS com um ganho fixo, segura só os picos acima de -1,5 dBFS (como o alimiter,
// com 5 ms de antecipação e 50 ms de soltura) e abre e fecha bem de leve nas pontas. Funções puras.

export const LUFS_ALVO = -14;
export const PICO_MAXIMO_DB = -1.5;
export const SILENCIO_LUFS = -70;
export const GANHO_MAXIMO_DB = 30;
export const FADE_ENTRADA_S = 0.02;
export const FADE_SAIDA_S = 0.05;
const ANTECIPACAO_S = 0.005;
const SOLTURA_S = 0.05;

type Biquad = { b: [number, number, number]; a: [number, number, number] };

/**
 * Os dois filtros do K-weighting (prefiltro de prateleira e passa-altas RLB) para a taxa dada, pelas
 * fórmulas da norma (as mesmas do ebur128 e da libebur128).
 */
function filtrosK(taxa: number): [Biquad, Biquad] {
  let f0 = 1681.974450955533;
  const g = 3.999843853973347;
  let q = 0.7071752369554196;
  let k = Math.tan((Math.PI * f0) / taxa);
  const vh = 10 ** (g / 20);
  const vb = vh ** 0.4996667741545416;
  let a0 = 1 + k / q + k * k;
  const prateleira: Biquad = {
    b: [(vh + (vb * k) / q + k * k) / a0, (2 * (k * k - vh)) / a0, (vh - (vb * k) / q + k * k) / a0],
    a: [1, (2 * (k * k - 1)) / a0, (1 - k / q + k * k) / a0],
  };
  f0 = 38.13547087602444;
  q = 0.5003270373238773;
  k = Math.tan((Math.PI * f0) / taxa);
  a0 = 1 + k / q + k * k;
  const passaAltas: Biquad = { b: [1, -2, 1], a: [1, (2 * (k * k - 1)) / a0, (1 - k / q + k * k) / a0] };
  return [prateleira, passaAltas];
}

function filtrar(entrada: Float32Array, { b, a }: Biquad): Float64Array {
  const saida = new Float64Array(entrada.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < entrada.length; i++) {
    const x = entrada[i];
    const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    saida[i] = y;
  }
  return saida;
}

/** O loudness integrado em LUFS (blocos de 400 ms a cada 100 ms, portões de -70 LUFS e de -10 LU), ou null no silêncio. */
export function loudnessIntegrado(canais: Float32Array[], taxa: number): number | null {
  const [prateleira, passaAltas] = filtrosK(taxa);
  const ponderados = canais.map((canal) => {
    const filtrado = filtrar(Float32Array.from(filtrar(canal, prateleira)), passaAltas);
    // Soma acumulada dos quadrados: a média de cada bloco sai em tempo constante
    const acumulado = new Float64Array(filtrado.length + 1);
    for (let i = 0; i < filtrado.length; i++) acumulado[i + 1] = acumulado[i] + filtrado[i] * filtrado[i];
    return acumulado;
  });
  const tamanho = Math.round(0.4 * taxa);
  const passo = Math.round(0.1 * taxa);
  const total = canais[0]?.length ?? 0;
  const blocos: number[] = [];
  for (let inicio = 0; inicio + tamanho <= total; inicio += passo) {
    let soma = 0;
    for (const acumulado of ponderados) soma += (acumulado[inicio + tamanho] - acumulado[inicio]) / tamanho;
    blocos.push(soma);
  }
  const lufs = (energia: number) => -0.691 + 10 * Math.log10(energia);
  const absolutos = blocos.filter((energia) => energia > 0 && lufs(energia) > SILENCIO_LUFS);
  if (!absolutos.length) return null;
  const relativo = lufs(absolutos.reduce((a, b) => a + b, 0) / absolutos.length) - 10;
  const relevantes = absolutos.filter((energia) => lufs(energia) > relativo);
  if (!relevantes.length) return null;
  return lufs(relevantes.reduce((a, b) => a + b, 0) / relevantes.length);
}

/** Quanto subir ou descer a mistura inteira para chegar em -14 LUFS (em dB). Silêncio não ganha nada. */
export function ganhoParaOAlvo(lufs: number | null): number {
  if (lufs === null || lufs <= SILENCIO_LUFS) return 0;
  return Math.min(Math.max(LUFS_ALVO - lufs, -GANHO_MAXIMO_DB), GANHO_MAXIMO_DB);
}

/**
 * O acabamento inteiro, nos canais (alterados no lugar): o ganho em dB, o limitador nos picos e os fades
 * das pontas. O limitador olha 5 ms à frente: o ganho já está baixo quando o pico chega, e volta em 50 ms.
 */
export function acabarSom(canais: Float32Array[], taxa: number, ganhoDb: number) {
  const ganho = 10 ** (ganhoDb / 20);
  const teto = 10 ** (PICO_MAXIMO_DB / 20);
  const total = canais[0]?.length ?? 0;
  for (const canal of canais) for (let i = 0; i < total; i++) canal[i] *= ganho;
  // O ganho necessário em cada amostra (o menor dos canais), e o mínimo na janela à frente
  const antecipacao = Math.max(1, Math.round(ANTECIPACAO_S * taxa));
  const necessario = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    let pico = 0;
    for (const canal of canais) pico = Math.max(pico, Math.abs(canal[i]));
    necessario[i] = pico > teto ? teto / pico : 1;
  }
  const soltura = Math.exp(-1 / (SOLTURA_S * taxa));
  const fila: number[] = [];
  let atual = 1;
  for (let i = 0; i < total + antecipacao; i++) {
    // Mínimo deslizante da janela [i - antecipacao, i] (fila crescente de índices)
    if (i < total) {
      while (fila.length && necessario[fila[fila.length - 1]] >= necessario[i]) fila.pop();
      fila.push(i);
    }
    const saida = i - antecipacao;
    while (fila.length && fila[0] < saida) fila.shift();
    if (saida < 0) continue;
    const alvo = fila.length ? necessario[fila[0]] : 1;
    atual = alvo < atual ? alvo : alvo - (alvo - atual) * soltura;
    for (const canal of canais) canal[saida] *= atual;
  }
  const entrada = Math.min(total, Math.round(FADE_ENTRADA_S * taxa));
  const saida = Math.min(total, Math.round(FADE_SAIDA_S * taxa));
  for (const canal of canais) {
    for (let i = 0; i < entrada; i++) canal[i] *= i / entrada;
    for (let i = 0; i < saida; i++) canal[total - 1 - i] *= i / saida;
  }
}
