// A seleção do documento (ADR 0003, decisão 4, onda 13.3): uma máscara de cobertura (0 a 255) do tamanho do
// documento, guardada no editor e não no projeto. Toda ferramenta de seleção escreve nela (nova, somar, subtrair,
// intersectar) e o resto (pintar, preencher, copiar, filtros) respeita ela. As contas aqui são puras, sem canvas.

export type Selecao = { largura: number; altura: number; dados: Uint8Array };
export type ModoDaSelecao = "nova" | "somar" | "subtrair" | "intersectar";
export type Retangulo = { x: number; y: number; largura: number; altura: number };

export function vazia(largura: number, altura: number): Selecao {
  return { largura, altura, dados: new Uint8Array(largura * altura) };
}

export function cheia(largura: number, altura: number): Selecao {
  return { largura, altura, dados: new Uint8Array(largura * altura).fill(255) };
}

/** A seleção tem algum pixel (mais de meio coberto). */
export function temAlgo(selecao: Selecao | null): boolean {
  return Boolean(selecao?.dados.some((valor) => valor >= 128));
}

/** O retângulo dos pixels cobertos (algum valor acima de zero), ou null. */
export function limites(selecao: Selecao): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  const { largura, altura, dados } = selecao;
  for (let y = 0; y < altura; y++) {
    const linha = y * largura;
    for (let x = 0; x < largura; x++) {
      if (!dados[linha + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** A cobertura de cada pixel por uma função dentro/fora, com 4 × 4 amostras por pixel na borda (suavizar). */
function porAmostras(largura: number, altura: number, caixa: { x0: number; y0: number; x1: number; y1: number }, dentro: (x: number, y: number) => boolean, suavizar: boolean): Selecao {
  const selecao = vazia(largura, altura);
  const x0 = Math.max(0, Math.floor(caixa.x0));
  const y0 = Math.max(0, Math.floor(caixa.y0));
  const x1 = Math.min(largura, Math.ceil(caixa.x1));
  const y1 = Math.min(altura, Math.ceil(caixa.y1));
  const n = suavizar ? 4 : 1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let soma = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (dentro(x + (i + 0.5) / n, y + (j + 0.5) / n)) soma++;
      selecao.dados[y * largura + x] = Math.round((soma / (n * n)) * 255);
    }
  }
  return selecao;
}

export function retangulo(largura: number, altura: number, r: Retangulo, suavizar = true): Selecao {
  const x1 = r.x + r.largura;
  const y1 = r.y + r.altura;
  return porAmostras(largura, altura, { x0: r.x, y0: r.y, x1, y1 }, (x, y) => x >= r.x && x < x1 && y >= r.y && y < y1, suavizar);
}

export function elipse(largura: number, altura: number, r: Retangulo, suavizar = true): Selecao {
  const cx = r.x + r.largura / 2;
  const cy = r.y + r.altura / 2;
  const rx = Math.max(1e-6, r.largura / 2);
  const ry = Math.max(1e-6, r.altura / 2);
  return porAmostras(largura, altura, { x0: r.x, y0: r.y, x1: r.x + r.largura, y1: r.y + r.altura }, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, suavizar);
}

/** O polígono (o laço), pela regra par-ímpar. */
export function poligono(largura: number, altura: number, pontos: { x: number; y: number }[], suavizar = true): Selecao {
  if (pontos.length < 3) return vazia(largura, altura);
  const xs = pontos.map((p) => p.x);
  const ys = pontos.map((p) => p.y);
  const caixa = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  const dentro = (px: number, py: number) => {
    let impar = false;
    for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
      const a = pontos[i];
      const b = pontos[j];
      if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) impar = !impar;
    }
    return impar;
  };
  return porAmostras(largura, altura, caixa, dentro, suavizar);
}

/** A seleção nova junto da de antes: nova, somar, subtrair ou intersectar (cobertura por pixel). */
export function combinar(antes: Selecao | null, nova: Selecao, modo: ModoDaSelecao): Selecao | null {
  if (modo === "nova") return nova;
  // Sem seleção antes: somar é a nova; subtrair não deixa nada; intersectar fica vazia
  if (!antes) return modo === "somar" ? nova : modo === "subtrair" ? null : vazia(nova.largura, nova.altura);
  const saida = vazia(nova.largura, nova.altura);
  for (let i = 0; i < saida.dados.length; i++) {
    const a = antes.dados[i];
    const b = nova.dados[i];
    saida.dados[i] = modo === "somar" ? Math.max(a, b) : modo === "subtrair" ? Math.round((a * (255 - b)) / 255) : Math.min(a, b);
  }
  return saida;
}

export function inverter(selecao: Selecao): Selecao {
  const saida = vazia(selecao.largura, selecao.altura);
  for (let i = 0; i < saida.dados.length; i++) saida.dados[i] = 255 - selecao.dados[i];
  return saida;
}

/** As larguras das três caixas cuja passagem seguida imita a gaussiana de `sigma` (Kutskir). */
function caixasDoGauss(sigma: number): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / 3 + 1);
  let menor = Math.floor(ideal);
  if (menor % 2 === 0) menor--;
  const maior = menor + 2;
  const quantas = Math.round((12 * sigma * sigma - 3 * menor * menor - 12 * menor - 9) / (-4 * menor - 4));
  return [0, 1, 2].map((i) => (i < quantas ? menor : maior));
}

/** Uma passada de média móvel de raio `r` numa linha (ou coluna), com a borda repetida. */
function caixa(entrada: Float32Array, saida: Float32Array, inicio: number, passo: number, n: number, r: number) {
  const largura = 2 * r + 1;
  let soma = 0;
  for (let k = -r; k <= r; k++) soma += entrada[inicio + Math.min(n - 1, Math.max(0, k)) * passo];
  for (let i = 0; i < n; i++) {
    saida[inicio + i * passo] = soma / largura;
    soma += entrada[inicio + Math.min(n - 1, i + r + 1) * passo] - entrada[inicio + Math.max(0, i - r) * passo];
  }
}

/**
 * Desfoque gaussiano separável da cobertura (a difusão, Shift+F6), com sigma em pixels. Até sigma 4, a conta exata;
 * acima, três médias móveis seguidas, que custam o mesmo em qualquer raio (numa imagem grande, a exata levaria
 * minutos) e ficam a menos de 1% da gaussiana.
 */
export function difusao(selecao: Selecao, sigma: number): Selecao {
  if (sigma <= 0.05) return selecao;
  const { largura, altura } = selecao;
  if (sigma > 4) {
    let a = Float32Array.from(selecao.dados);
    let b = new Float32Array(a.length);
    for (const tamanho of caixasDoGauss(sigma)) {
      const r = (tamanho - 1) / 2;
      for (let y = 0; y < altura; y++) caixa(a, b, y * largura, 1, largura, r);
      [a, b] = [b, a];
      for (let x = 0; x < largura; x++) caixa(a, b, x, largura, altura, r);
      [a, b] = [b, a];
    }
    const saida = vazia(largura, altura);
    for (let i = 0; i < a.length; i++) saida.dados[i] = Math.round(a[i]);
    return saida;
  }
  const raio = Math.ceil(sigma * 3);
  const pesos = Array.from({ length: raio * 2 + 1 }, (_, i) => Math.exp(-((i - raio) ** 2) / (2 * sigma * sigma)));
  const total = pesos.reduce((a, b) => a + b, 0);
  const meio = new Float32Array(largura * altura);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      let soma = 0;
      for (let k = -raio; k <= raio; k++) soma += selecao.dados[y * largura + Math.min(largura - 1, Math.max(0, x + k))] * pesos[k + raio];
      meio[y * largura + x] = soma / total;
    }
  }
  const saida = vazia(largura, altura);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      let soma = 0;
      for (let k = -raio; k <= raio; k++) soma += meio[Math.min(altura - 1, Math.max(0, y + k)) * largura + x] * pesos[k + raio];
      saida.dados[y * largura + x] = Math.round(soma / total);
    }
  }
  return saida;
}

/** A distância euclidiana ao quadrado de cada pixel ao pixel "alvo" mais perto (Felzenszwalb e Huttenlocher). */
function distanciaAoQuadrado(largura: number, altura: number, alvo: (i: number) => boolean): Float64Array {
  const INF = 1e20;
  const d = new Float64Array(largura * altura);
  for (let i = 0; i < d.length; i++) d[i] = alvo(i) ? 0 : INF;
  const n = Math.max(largura, altura);
  const f = new Float64Array(n);
  const z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  const passar = (tamanho: number, ler: (k: number) => number, escrever: (k: number, valor: number) => void) => {
    for (let q = 0; q < tamanho; q++) f[q] = ler(q);
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < tamanho; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < tamanho; q++) {
      while (z[k + 1] < q) k++;
      escrever(q, (q - v[k]) ** 2 + f[v[k]]);
    }
  };
  for (let x = 0; x < largura; x++) passar(altura, (k) => d[k * largura + x], (k, valor) => (d[k * largura + x] = valor));
  for (let y = 0; y < altura; y++) passar(largura, (k) => d[y * largura + k], (k, valor) => (d[y * largura + k] = valor));
  return d;
}

/** Expandir: o que está a até `raio` pixels da seleção entra (com meio pixel de borda suave). */
export function expandir(selecao: Selecao, raio: number): Selecao {
  if (raio <= 0) return selecao;
  const d = distanciaAoQuadrado(selecao.largura, selecao.altura, (i) => selecao.dados[i] >= 128);
  const saida = vazia(selecao.largura, selecao.altura);
  // A distância é entre os centros dos pixels, e o pixel selecionado já vai meio pixel além do centro dele
  for (let i = 0; i < d.length; i++) saida.dados[i] = Math.max(selecao.dados[i], Math.round(Math.min(1, Math.max(0, raio + 1 - Math.sqrt(d[i]))) * 255));
  return saida;
}

/** Contrair: o que está a até `raio` pixels de fora da seleção sai. */
export function contrair(selecao: Selecao, raio: number): Selecao {
  if (raio <= 0) return selecao;
  return inverter(expandir(inverter(selecao), raio));
}

/** Borda: uma faixa de `largura` pixels em volta da borda da seleção (a de fora menos a de dentro), suave. */
export function borda(selecao: Selecao, largura: number): Selecao {
  const fora = expandir(selecao, largura / 2);
  const dentro = contrair(selecao, largura / 2);
  return difusao(combinar(fora, dentro, "subtrair")!, Math.max(0.5, largura / 6));
}

/** Suavizar: arredonda os cantos e tira as pontas soltas (desfoca no raio e corta no meio). */
export function suavizar(selecao: Selecao, raio: number): Selecao {
  const desfocada = difusao(selecao, raio / 2);
  const saida = vazia(selecao.largura, selecao.altura);
  for (let i = 0; i < saida.dados.length; i++) saida.dados[i] = Math.round(Math.min(1, Math.max(0, (desfocada.dados[i] - 128) / 32 + 0.5)) * 255);
  return saida;
}

/** As bordas da seleção numa grade menor (a da tela): 1 onde o pixel está dentro e um vizinho está fora. */
export function bordaNaTela(selecao: Selecao, largura: number, altura: number): Uint8Array {
  const reduzida = new Uint8Array(largura * altura);
  for (let y = 0; y < altura; y++) {
    const ys = Math.min(selecao.altura - 1, Math.floor(((y + 0.5) / altura) * selecao.altura));
    for (let x = 0; x < largura; x++) {
      const xs = Math.min(selecao.largura - 1, Math.floor(((x + 0.5) / largura) * selecao.largura));
      reduzida[y * largura + x] = selecao.dados[ys * selecao.largura + xs] >= 128 ? 1 : 0;
    }
  }
  const borda = new Uint8Array(largura * altura);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      if (!reduzida[i]) continue;
      if (x === 0 || y === 0 || x === largura - 1 || y === altura - 1 || !reduzida[i - 1] || !reduzida[i + 1] || !reduzida[i - largura] || !reduzida[i + largura]) borda[i] = 1;
    }
  }
  return borda;
}
