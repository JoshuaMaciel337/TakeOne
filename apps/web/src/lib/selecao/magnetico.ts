// O laço magnético (ADR 0003, onda 13.3): o caminho entre dois pontos que segue as bordas da imagem, o "live wire"
// (Mortensen e Barrett, 1995). Cada pixel custa menos quanto mais forte a borda nele; o caminho é o mais barato por
// Dijkstra, numa janela em volta dos dois pontos. A Largura procura a borda mais forte perto do ponteiro, o Contraste
// ignora as bordas fracas e a Frequência põe os pontos de ancoragem sozinha.
import type { ImagemRgba } from "./varinha.ts";

export type Ponto = { x: number; y: number };
export type MapaDeBordas = { largura: number; altura: number; forca: Float32Array };

/**
 * A força da borda em cada pixel (0 a 1): o maior Sobel dos três canais de cor (a luz sozinha não vê o roxo escuro
 * contra o verde, que têm quase a mesma luz), dividido pelo percentil 99,5 (só as bordas mais fortes saturam).
 */
export function mapaDeBordas(imagem: ImagemRgba): MapaDeBordas {
  const { largura, altura, dados } = imagem;
  const canais = [0, 1, 2].map(() => new Float32Array(largura * altura));
  for (let i = 0; i < largura * altura; i++) {
    const a = dados[i * 4 + 3] / 255;
    // Pré-multiplicado sobre um cinza: a borda de um recorte sobre o transparente também conta
    for (let c = 0; c < 3; c++) canais[c][i] = dados[i * 4 + c] * a + (1 - a) * 128;
  }
  const forca = new Float32Array(largura * altura);
  for (const canal of canais) {
    const em = (x: number, y: number) => canal[Math.min(altura - 1, Math.max(0, y)) * largura + Math.min(largura - 1, Math.max(0, x))];
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        const gx = em(x + 1, y - 1) + 2 * em(x + 1, y) + em(x + 1, y + 1) - em(x - 1, y - 1) - 2 * em(x - 1, y) - em(x - 1, y + 1);
        const gy = em(x - 1, y + 1) + 2 * em(x, y + 1) + em(x + 1, y + 1) - em(x - 1, y - 1) - 2 * em(x, y - 1) - em(x + 1, y - 1);
        const i = y * largura + x;
        forca[i] = Math.max(forca[i], Math.hypot(gx, gy));
      }
    }
  }
  // O percentil 99,5 por um histograma (sem ordenar milhões de números)
  let maior = 0;
  for (const v of forca) if (v > maior) maior = v;
  if (maior > 0) {
    const caixas = new Uint32Array(1024);
    for (const v of forca) caixas[Math.min(1023, Math.floor((v / maior) * 1023))]++;
    let conta = 0;
    let referencia = maior;
    for (let k = 0; k < 1024; k++) {
      conta += caixas[k];
      if (conta >= forca.length * 0.995) {
        referencia = Math.max(1e-6, ((k + 1) / 1024) * maior);
        break;
      }
    }
    for (let i = 0; i < forca.length; i++) forca[i] = Math.min(1, forca[i] / referencia);
  }
  return { largura, altura, forca };
}

/** O ponto de borda mais forte a até `raio` pixels de `ponto` (o mais perto, no empate); o próprio, sem borda. */
export function bordaPerto(mapa: MapaDeBordas, ponto: Ponto, raio: number, contraste: number): Ponto {
  const cx = Math.round(ponto.x);
  const cy = Math.round(ponto.y);
  let melhor = { x: Math.min(mapa.largura - 1, Math.max(0, cx)), y: Math.min(mapa.altura - 1, Math.max(0, cy)) };
  let nota = -Infinity;
  for (let y = Math.max(0, cy - raio); y <= Math.min(mapa.altura - 1, cy + raio); y++) {
    for (let x = Math.max(0, cx - raio); x <= Math.min(mapa.largura - 1, cx + raio); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > raio) continue;
      const f = mapa.forca[y * mapa.largura + x];
      if (f < contraste) continue;
      const n = f - d * 1e-3;
      if (n > nota) {
        nota = n;
        melhor = { x, y };
      }
    }
  }
  return melhor;
}

/** Um monte binário de mínimo (índice e custo), para o Dijkstra. */
class Monte {
  private indices: number[] = [];
  private custos: number[] = [];
  get vazio() {
    return this.indices.length === 0;
  }
  por(indice: number, custo: number) {
    let i = this.indices.length;
    this.indices.push(indice);
    this.custos.push(custo);
    while (i > 0) {
      const pai = (i - 1) >> 1;
      if (this.custos[pai] <= custo) break;
      this.indices[i] = this.indices[pai];
      this.custos[i] = this.custos[pai];
      i = pai;
    }
    this.indices[i] = indice;
    this.custos[i] = custo;
  }
  tirar(): number {
    const topo = this.indices[0];
    const ultimoIndice = this.indices.pop()!;
    const ultimoCusto = this.custos.pop()!;
    if (this.indices.length) {
      let i = 0;
      const n = this.indices.length;
      for (;;) {
        let filho = 2 * i + 1;
        if (filho >= n) break;
        if (filho + 1 < n && this.custos[filho + 1] < this.custos[filho]) filho++;
        if (this.custos[filho] >= ultimoCusto) break;
        this.indices[i] = this.indices[filho];
        this.custos[i] = this.custos[filho];
        i = filho;
      }
      this.indices[i] = ultimoIndice;
      this.custos[i] = ultimoCusto;
    }
    return topo;
  }
}

/**
 * O caminho mais barato de `de` a `ate` (pixels inteiros, 8 vizinhos), numa janela que cobre os dois com `margem` em
 * volta. O custo de entrar num pixel é 1 − força (as bordas abaixo do contraste custam 1) mais um pouco pela distância,
 * para o caminho não fazer voltas no liso.
 */
export function caminhoMagnetico(mapa: MapaDeBordas, de: Ponto, ate: Ponto, margem: number, contraste = 0): Ponto[] {
  const x0 = Math.max(0, Math.min(de.x, ate.x) - margem);
  const y0 = Math.max(0, Math.min(de.y, ate.y) - margem);
  const x1 = Math.min(mapa.largura - 1, Math.max(de.x, ate.x) + margem);
  const y1 = Math.min(mapa.altura - 1, Math.max(de.y, ate.y) + margem);
  const largura = x1 - x0 + 1;
  const altura = y1 - y0 + 1;
  const custo = new Float64Array(largura * altura).fill(Infinity);
  const veio = new Int32Array(largura * altura).fill(-1);
  const feito = new Uint8Array(largura * altura);
  const local = (p: Ponto) => (p.y - y0) * largura + (p.x - x0);
  const inicio = local(de);
  const fim = local(ate);
  custo[inicio] = 0;
  const monte = new Monte();
  monte.por(inicio, 0);
  while (!monte.vazio) {
    const i = monte.tirar();
    if (feito[i]) continue;
    feito[i] = 1;
    if (i === fim) break;
    const x = i % largura;
    const y = (i - x) / largura;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= largura || ny >= altura) continue;
        const j = ny * largura + nx;
        if (feito[j]) continue;
        const f = mapa.forca[(ny + y0) * mapa.largura + nx + x0];
        const passo = (dx && dy ? Math.SQRT2 : 1) * ((f < contraste ? 1 : 1 - f) + 0.08);
        if (custo[i] + passo < custo[j]) {
          custo[j] = custo[i] + passo;
          veio[j] = i;
          monte.por(j, custo[j]);
        }
      }
    }
  }
  const caminho: Ponto[] = [];
  for (let i = fim; i >= 0; i = veio[i]) {
    caminho.push({ x: (i % largura) + x0, y: Math.floor(i / largura) + y0 });
    if (i === inicio) break;
  }
  return caminho.reverse();
}

/** A distância entre âncoras automáticas pela Frequência (0 a 100; 0 não põe nenhuma), em pixels do documento. */
export function distanciaDasAncoras(frequencia: number): number {
  return frequencia <= 0 ? Infinity : 20 + (100 - frequencia) * 3;
}
