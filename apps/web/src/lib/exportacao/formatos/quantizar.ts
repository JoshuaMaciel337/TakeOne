// A imagem em cores indexadas (ADR 0003, onda 13.13): a paleta (adaptável pelo corte na mediana, a da web, cinza ou
// preto e branco), o pontilhado (difusão de Floyd–Steinberg, padrão de Bayer ou ruído) e a transparência de um índice
// só, como no GIF e no PNG-8. Serve ao GIF, ao PNG-8 e ao modo Cores indexadas. Contas puras sobre RGBA.

export type Rgb = [number, number, number];
export type PaletaDaExportacao = "adaptavel" | "perceptual" | "web" | "cinza" | "preto_branco";
export type Pontilhado = "nenhum" | "difusao" | "padrao" | "ruido";

export type OpcoesDaPaleta = {
  paleta: PaletaDaExportacao;
  /** 2 a 256 (na web, no cinza e no preto e branco, o teto). */
  cores: number;
  pontilhado: Pontilhado;
  /** 0 a 1: o quanto do erro (ou do padrão) entra. */
  quantidade: number;
  /** Com transparência, o que tem alfa abaixo de 128 vira o índice transparente. */
  transparencia: boolean;
  /** A cor por baixo do que é meio transparente (o resto do alfa vai embora). */
  fosco: Rgb;
};

export type ImagemIndexada = { largura: number; altura: number; indices: Uint8Array; paleta: Rgb[]; transparente: number | null };

export const OPCOES_PADRAO_DA_PALETA: OpcoesDaPaleta = { paleta: "adaptavel", cores: 256, pontilhado: "difusao", quantidade: 1, transparencia: true, fosco: [255, 255, 255] };

const limitar = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Os 216 tons da paleta da web (6 níveis por canal). */
function paletaDaWeb(): Rgb[] {
  const lista: Rgb[] = [];
  for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) lista.push([r * 51, g * 51, b * 51]);
  return lista;
}

function paletaCinza(n: number): Rgb[] {
  return Array.from({ length: n }, (_, i) => {
    const v = Math.round((i * 255) / Math.max(1, n - 1));
    return [v, v, v] as Rgb;
  });
}

type Caixa = { cores: Uint32Array; inicio: number; fim: number };

/**
 * A paleta adaptável pelo corte na mediana sobre o histograma de 5 bits por canal (32 mil caixas no máximo, então a
 * conta não depende do tamanho da imagem). Cada passo divide a caixa de maior variância pesada pela quantidade, no eixo
 * mais comprido; o "perceptual" pesa o verde e o vermelho como o olho.
 */
function paletaAdaptavel(rgba: Uint8ClampedArray | Uint8Array, opacos: Uint8Array, n: number, perceptual: boolean): Rgb[] {
  const contagem = new Uint32Array(32768);
  const soma = new Float64Array(32768 * 3);
  for (let p = 0, i = 0; i < rgba.length; i += 4, p++) {
    if (!opacos[p]) continue;
    const chave = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3);
    contagem[chave]++;
    soma[chave * 3] += rgba[i];
    soma[chave * 3 + 1] += rgba[i + 1];
    soma[chave * 3 + 2] += rgba[i + 2];
  }
  const presentes: number[] = [];
  for (let k = 0; k < 32768; k++) if (contagem[k]) presentes.push(k);
  if (!presentes.length) return [[0, 0, 0]];
  const media = (k: number): Rgb => [soma[k * 3] / contagem[k], soma[k * 3 + 1] / contagem[k], soma[k * 3 + 2] / contagem[k]];
  // Poucas cores: a paleta é exata
  if (presentes.length <= n) return presentes.map((k) => media(k).map(Math.round) as Rgb);
  const pesos: Rgb = perceptual ? [0.299 * 3, 0.587 * 3, 0.114 * 3] : [1, 1, 1];
  const cores = Uint32Array.from(presentes);
  const centro = new Float64Array(32768 * 3);
  for (const k of presentes) {
    const m = media(k);
    centro[k * 3] = m[0];
    centro[k * 3 + 1] = m[1];
    centro[k * 3 + 2] = m[2];
  }
  const medir = (c: Caixa) => {
    let total = 0;
    const s = [0, 0, 0];
    const s2 = [0, 0, 0];
    const min = [255, 255, 255];
    const max = [0, 0, 0];
    for (let i = c.inicio; i < c.fim; i++) {
      const k = c.cores[i];
      const w = contagem[k];
      total += w;
      for (let e = 0; e < 3; e++) {
        const v = centro[k * 3 + e];
        s[e] += v * w;
        s2[e] += v * v * w;
        if (v < min[e]) min[e] = v;
        if (v > max[e]) max[e] = v;
      }
    }
    const variancia = [0, 1, 2].map((e) => (s2[e] - (s[e] * s[e]) / total) * pesos[e]);
    const eixo = [0, 1, 2].reduce((melhor, e) => ((max[e] - min[e]) * pesos[e] > (max[melhor] - min[melhor]) * pesos[melhor] ? e : melhor), 0);
    return { total, nota: variancia[0] + variancia[1] + variancia[2], eixo };
  };
  const caixas: (Caixa & { nota: number; eixo: number; total: number })[] = [{ cores, inicio: 0, fim: cores.length, ...medir({ cores, inicio: 0, fim: cores.length }) }];
  while (caixas.length < n) {
    let alvo = -1;
    for (let i = 0; i < caixas.length; i++) if (caixas[i].fim - caixas[i].inicio > 1 && (alvo < 0 || caixas[i].nota > caixas[alvo].nota)) alvo = i;
    if (alvo < 0) break;
    const c = caixas[alvo];
    const trecho = Array.from(c.cores.subarray(c.inicio, c.fim)).sort((a, b) => centro[a * 3 + c.eixo] - centro[b * 3 + c.eixo]);
    c.cores.set(trecho, c.inicio);
    // A mediana pela quantidade de pixels
    let acumulado = 0;
    let corte = c.inicio + 1;
    for (let i = c.inicio; i < c.fim - 1; i++) {
      acumulado += contagem[c.cores[i]];
      corte = i + 1;
      if (acumulado >= c.total / 2) break;
    }
    const a = { cores: c.cores, inicio: c.inicio, fim: corte };
    const b = { cores: c.cores, inicio: corte, fim: c.fim };
    caixas.splice(alvo, 1, { ...a, ...medir(a) }, { ...b, ...medir(b) });
  }
  return caixas.map((c) => {
    const s = [0, 0, 0];
    let total = 0;
    for (let i = c.inicio; i < c.fim; i++) {
      const k = c.cores[i];
      const w = contagem[k];
      total += w;
      for (let e = 0; e < 3; e++) s[e] += centro[k * 3 + e] * w;
    }
    return s.map((v) => Math.round(v / total)) as Rgb;
  });
}

/** A cor mais perto na paleta, com um cache de 6 bits por canal (o pontilhado pede a mesma cor muitas vezes). */
function buscador(paleta: Rgb[]) {
  const cache = new Int16Array(1 << 18).fill(-1);
  return (r: number, g: number, b: number) => {
    const chave = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    const guardado = cache[chave];
    if (guardado >= 0) return guardado;
    let melhor = 0;
    let menor = Infinity;
    for (let i = 0; i < paleta.length; i++) {
      const [pr, pg, pb] = paleta[i];
      const d = (r - pr) * (r - pr) * 2 + (g - pg) * (g - pg) * 4 + (b - pb) * (b - pb) * 3;
      if (d < menor) {
        menor = d;
        melhor = i;
      }
    }
    cache[chave] = melhor;
    return melhor;
  };
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Um número de 0 a 1 por pixel, sempre o mesmo (o ruído do pontilhado não muda a cada exportação). */
function sorteio(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A imagem RGBA em cores indexadas. */
export function indexar(rgba: Uint8ClampedArray | Uint8Array, largura: number, altura: number, opcoes: OpcoesDaPaleta): ImagemIndexada {
  const total = largura * altura;
  const opacos = new Uint8Array(total);
  const cor = new Float32Array(total * 3);
  for (let p = 0; p < total; p++) {
    const a = rgba[p * 4 + 3];
    opacos[p] = !opcoes.transparencia || a >= 128 ? 1 : 0;
    // O que é meio transparente vai sobre o fosco
    const t = a / 255;
    for (let e = 0; e < 3; e++) cor[p * 3 + e] = rgba[p * 4 + e] * t + opcoes.fosco[e] * (1 - t);
  }
  const plano = new Uint8ClampedArray(total * 4);
  for (let p = 0; p < total; p++) {
    plano[p * 4] = cor[p * 3];
    plano[p * 4 + 1] = cor[p * 3 + 1];
    plano[p * 4 + 2] = cor[p * 3 + 2];
    plano[p * 4 + 3] = 255;
  }
  const temTransparente = opcoes.transparencia && opacos.some((v) => !v);
  const maximo = Math.max(2, Math.min(256, Math.round(opcoes.cores))) - (temTransparente ? 1 : 0);
  let paleta: Rgb[];
  if (opcoes.paleta === "web") paleta = paletaDaWeb().slice(0, Math.max(maximo, 2));
  else if (opcoes.paleta === "cinza") paleta = paletaCinza(maximo);
  else if (opcoes.paleta === "preto_branco") paleta = [[0, 0, 0], [255, 255, 255]];
  else paleta = paletaAdaptavel(plano, opacos, maximo, opcoes.paleta === "perceptual");
  const perto = buscador(paleta);
  const indices = new Uint8Array(total);
  const transparente = temTransparente ? paleta.length : null;
  const q = Math.max(0, Math.min(1, opcoes.quantidade));
  // O padrão e o ruído desviam a cor em até um passo da paleta (a mediana da distância de cada cor à vizinha mais
  // perto, por canal): assim a média de uma área lisa cai entre as duas cores certas
  const vizinhas = paleta.map((a, i) => Math.min(...paleta.map((b, j) => (i === j ? Infinity : Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])))));
  const passo = (vizinhas.length > 1 ? [...vizinhas].sort((a, b) => a - b)[vizinhas.length >> 1] / Math.sqrt(3) : 255) * q;
  for (let y = 0; y < altura; y++)
    for (let x = 0; x < largura; x++) {
      const p = y * largura + x;
      if (!opacos[p]) {
        indices[p] = transparente!;
        continue;
      }
      let r = cor[p * 3];
      let g = cor[p * 3 + 1];
      let b = cor[p * 3 + 2];
      if (opcoes.pontilhado === "padrao" || opcoes.pontilhado === "ruido") {
        const d = (opcoes.pontilhado === "padrao" ? (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 : sorteio(x, y)) - 0.5;
        r += d * passo;
        g += d * passo;
        b += d * passo;
      }
      const i = perto(limitar(Math.round(r)), limitar(Math.round(g)), limitar(Math.round(b)));
      indices[p] = i;
      if (opcoes.pontilhado === "difusao" && q > 0) {
        const [pr, pg, pb] = paleta[i];
        const er = (limitar(r) - pr) * q;
        const eg = (limitar(g) - pg) * q;
        const eb = (limitar(b) - pb) * q;
        const espalhar = (dx: number, dy: number, peso: number) => {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= largura || ny >= altura) return;
          const n = ny * largura + nx;
          cor[n * 3] += er * peso;
          cor[n * 3 + 1] += eg * peso;
          cor[n * 3 + 2] += eb * peso;
        };
        espalhar(1, 0, 7 / 16);
        espalhar(-1, 1, 3 / 16);
        espalhar(0, 1, 5 / 16);
        espalhar(1, 1, 1 / 16);
      }
    }
  return { largura, altura, indices, paleta: temTransparente ? [...paleta, opcoes.fosco] : paleta, transparente };
}

/** A imagem indexada de volta em RGBA (a prévia do "Salvar para web" e o modo Cores indexadas). */
export function rgbaDaIndexada({ largura, altura, indices, paleta, transparente }: ImagemIndexada): Uint8ClampedArray {
  const saida = new Uint8ClampedArray(largura * altura * 4);
  for (let p = 0; p < indices.length; p++) {
    const i = indices[p];
    if (i === transparente) continue;
    const [r, g, b] = paleta[i];
    saida[p * 4] = r;
    saida[p * 4 + 1] = g;
    saida[p * 4 + 2] = b;
    saida[p * 4 + 3] = 255;
  }
  return saida;
}
