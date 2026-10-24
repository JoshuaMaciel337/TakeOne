// Filtro › Nitidez, Ruído e Outros (ADR 0003, onda 13.11). As contas no alfa pré-multiplicado (comum.ts) ou na cor
// reta, conforme o filtro; as medidas já chegam em pixels da imagem.
import { caixaNoPlano, type ContextoDoFiltro, dePlanos, desfocarPlano, type ImagemDoFiltro, limitar, lumaDe, paraPlanos, type Planos, porPixelReto, type Rgb, sorteio } from "./comum.ts";
import { forma, movimento } from "./desfoque.ts";

// ——— Nitidez ———
/** A máscara de nitidez: o pixel mais `quantidade` vezes a diferença para a versão borrada, onde ela passa do limiar. */
export function mascaraDeNitidez(imagem: ImagemDoFiltro, quantidade: number, borrada: ImagemDoFiltro, limiar = 0, suavizarDetalhe = 0): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const a = paraPlanos(imagem);
  const b = paraPlanos(borrada);
  const detalhe = [0, 1, 2].map((k) => {
    const d = new Float32Array(largura * altura);
    for (let p = 0; p < d.length; p++) d[p] = a[k][p] - b[k][p];
    return suavizarDetalhe > 0.05 ? desfocarPlano(d, largura, altura, suavizarDetalhe) : d;
  });
  const saida = [new Float32Array(largura * altura), new Float32Array(largura * altura), new Float32Array(largura * altura), a[3]] as Planos;
  for (let p = 0; p < largura * altura; p++) {
    // O limiar vale pela diferença de luminância (em 0 a 1)
    const dl = Math.abs(lumaDe(detalhe[0][p], detalhe[1][p], detalhe[2][p]));
    const vale = dl * 255 >= limiar;
    for (let k = 0; k < 3; k++) saida[k][p] = vale ? a[k][p] + quantidade * detalhe[k][p] : a[k][p];
  }
  return dePlanos(saida, largura, altura);
}

function borrar(imagem: ImagemDoFiltro, sigma: number): ImagemDoFiltro {
  const { largura, altura } = imagem;
  return dePlanos(paraPlanos(imagem).map((plano) => desfocarPlano(plano, largura, altura, sigma)) as Planos, largura, altura);
}

export function nitidez(imagem: ImagemDoFiltro, quantidade: number, sigma: number, limiar = 0): ImagemDoFiltro {
  return mascaraDeNitidez(imagem, quantidade, borrar(imagem, sigma), limiar);
}

/** Nitidez nas bordas: só onde a luz muda bastante (o gradiente da versão borrada passa de 4%). */
export function nitidezNasBordas(imagem: ImagemDoFiltro, escala: number): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const borrada = borrar(imagem, Math.max(0.5, escala));
  const nitida = mascaraDeNitidez(imagem, 1, borrada);
  const b = paraPlanos(borrada);
  const luma = new Float32Array(largura * altura);
  for (let p = 0; p < luma.length; p++) luma[p] = lumaDe(b[0][p], b[1][p], b[2][p]);
  const dados = imagem.dados.slice();
  for (let y = 1; y < altura - 1; y++) {
    for (let x = 1; x < largura - 1; x++) {
      const p = y * largura + x;
      const gx = luma[p + 1] - luma[p - 1];
      const gy = luma[p + largura] - luma[p - largura];
      if (Math.hypot(gx, gy) > 0.04) for (let k = 0; k < 3; k++) dados[p * 4 + k] = nitida.dados[p * 4 + k];
    }
  }
  return { largura, altura, dados };
}

/** Nitidez inteligente: tira o borrão que se escolher (gaussiano, de lente ou de movimento), com o ruído suavizado. */
export function nitidezInteligente(imagem: ImagemDoFiltro, quantidade: number, raio: number, ruido: number, remover: string, angulo: number): ImagemDoFiltro {
  const borrada = remover === "movimento" ? movimento(imagem, angulo, Math.max(1, raio * 2)) : remover === "lente" ? forma(imagem, Math.max(0.5, raio), "circulo") : borrar(imagem, Math.max(0.1, raio));
  return mascaraDeNitidez(imagem, quantidade, borrada, 0, (ruido / 100) * 1.5);
}

// ——— Ruído ———
/** Um número de média 0 e desvio 1 (Box–Muller), preso ao ponto. */
function normal(x: number, y: number, canal: number): number {
  const u = Math.max(1e-7, sorteio(x, y, canal * 2));
  const v = sorteio(x, y, canal * 2 + 1);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Adicionar ruído: em cada pixel do documento (o mesmo em qualquer zoom), uniforme ou gaussiano, colorido ou cinza. */
export function adicionarRuido(imagem: ImagemDoFiltro, quantidade: number, distribuicao: string, monocromatico: boolean, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const q = quantidade / 100;
  return porPixelReto(imagem, (r, g, b, x, y) => {
    const dx = Math.floor(ctx.origem.x + (x + 0.5) / ctx.escala);
    const dy = Math.floor(ctx.origem.y + (y + 0.5) / ctx.escala);
    const amostra = (canal: number) => (distribuicao === "gaussiana" ? normal(dx, dy, canal) * 0.25 : (sorteio(dx, dy, canal) * 2 - 1) * 0.5) * q;
    if (monocromatico) {
      const n = amostra(0);
      return [r + n, g + n, b + n];
    }
    return [r + amostra(0), g + amostra(1), b + amostra(2)];
  });
}

/** A mediana de um plano de 8 bits num quadrado de lado 2·raio+1, pelo histograma que anda na linha. */
export function medianaDoPlano(plano: Uint8Array, largura: number, altura: number, raio: number): Uint8Array {
  const r = Math.max(1, Math.round(raio));
  const saida = new Uint8Array(plano.length);
  const hist = new Uint32Array(256);
  for (let y = 0; y < altura; y++) {
    hist.fill(0);
    let n = 0;
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(altura - 1, y + r);
    const somar = (x: number, sinal: number) => {
      if (x < 0 || x >= largura) return;
      for (let yy = y0; yy <= y1; yy++) hist[plano[yy * largura + x]] += sinal;
      n += sinal * (y1 - y0 + 1);
    };
    for (let x = -r; x <= r; x++) somar(x, 1);
    for (let x = 0; x < largura; x++) {
      let acumulado = 0;
      let v = 0;
      while (v < 255 && acumulado + hist[v] <= n / 2) acumulado += hist[v++];
      saida[y * largura + x] = v;
      somar(x - r, -1);
      somar(x + r + 1, 1);
    }
  }
  return saida;
}

function mediana(imagem: ImagemDoFiltro, raio: number): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const canais = [0, 1, 2, 3].map((k) => {
    const plano = new Uint8Array(largura * altura);
    for (let p = 0; p < plano.length; p++) plano[p] = imagem.dados[p * 4 + k];
    return medianaDoPlano(plano, largura, altura, raio);
  });
  const dados = new Uint8ClampedArray(imagem.dados.length);
  for (let p = 0; p < largura * altura; p++) {
    const a = canais[3][p];
    dados[p * 4 + 3] = a;
    for (let k = 0; k < 3; k++) dados[p * 4 + k] = Math.min(a, canais[k][p]);
  }
  return { largura, altura, dados };
}

export { mediana };

/** Poeira e riscos: a mediana só onde o pixel foge dela mais que o limiar (as manchas pequenas). */
export function poeiraERiscos(imagem: ImagemDoFiltro, raio: number, limiar: number): ImagemDoFiltro {
  const med = mediana(imagem, raio);
  const dados = imagem.dados.slice();
  for (let i = 0; i < dados.length; i += 4) {
    let maior = 0;
    for (let k = 0; k < 3; k++) maior = Math.max(maior, Math.abs(dados[i + k] - med.dados[i + k]));
    if (maior > limiar) for (let k = 0; k < 4; k++) dados[i + k] = med.dados[i + k];
  }
  return { ...imagem, dados };
}

/** Remover manchas: a mediana pequena, menos nas bordas (onde a luz muda muito). */
export function removerManchas(imagem: ImagemDoFiltro, escala: number): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const med = mediana(imagem, Math.max(1, Math.round(escala)));
  const dados = imagem.dados.slice();
  const luma = (p: number) => lumaDe(imagem.dados[p * 4], imagem.dados[p * 4 + 1], imagem.dados[p * 4 + 2]) / 255;
  for (let y = 1; y < altura - 1; y++) {
    for (let x = 1; x < largura - 1; x++) {
      const p = y * largura + x;
      const g = Math.hypot(luma(p + 1) - luma(p - 1), luma(p + largura) - luma(p - largura));
      if (g < 0.12) for (let k = 0; k < 4; k++) dados[p * 4 + k] = med.dados[p * 4 + k];
    }
  }
  return { largura, altura, dados };
}

/** Reduzir ruído: a luz suavizada guardando as bordas, a cor desfocada à parte e a nitidez de volta. */
export function reduzirRuido(imagem: ImagemDoFiltro, forca: number, preservar: number, cor: number, nitida: number, escala: number): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const planos = paraPlanos(imagem);
  const n = largura * altura;
  // A luz e a cor (Y, Cb, Cr) em cor reta
  const y = new Float32Array(n);
  const cb = new Float32Array(n);
  const cr = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const a = planos[3][p] || 1;
    const r = planos[0][p] / a;
    const g = planos[1][p] / a;
    const b = planos[2][p] / a;
    y[p] = lumaDe(r, g, b);
    cb[p] = b - y[p];
    cr[p] = r - y[p];
  }
  // A luz: a média dos vizinhos parecidos (o limiar cai quando se preserva mais)
  const raio = Math.max(1, Math.round((forca / 10) * 3 * escala));
  const limiar = (0.02 + (forca / 10) * 0.12) * (1 - (preservar / 100) * 0.8);
  const ys = new Float32Array(n);
  for (let yy = 0; yy < altura; yy++) {
    for (let x = 0; x < largura; x++) {
      const p = yy * largura + x;
      let soma = 0;
      let pesos = 0;
      for (let dy = -raio; dy <= raio; dy++) {
        const j = yy + dy;
        if (j < 0 || j >= altura) continue;
        for (let dx = -raio; dx <= raio; dx++) {
          const i = x + dx;
          if (i < 0 || i >= largura) continue;
          const q = j * largura + i;
          const peso = Math.max(0, 1 - Math.abs(y[q] - y[p]) / limiar);
          soma += y[q] * peso;
          pesos += peso;
        }
      }
      ys[p] = forca > 0 ? soma / pesos : y[p];
    }
  }
  const sigmaCor = (cor / 100) * 3 * escala;
  const cbs = sigmaCor > 0.1 ? desfocarPlano(cb, largura, altura, sigmaCor) : cb;
  const crs = sigmaCor > 0.1 ? desfocarPlano(cr, largura, altura, sigmaCor) : cr;
  const pesosCor = sigmaCor > 0.1 ? desfocarPlano(new Float32Array(n).fill(1), largura, altura, sigmaCor) : null;
  const saida = [new Float32Array(n), new Float32Array(n), new Float32Array(n), planos[3]] as Planos;
  for (let p = 0; p < n; p++) {
    const a = planos[3][p];
    const k = pesosCor ? Math.max(1e-6, pesosCor[p]) : 1;
    const r = ys[p] + crs[p] / k;
    const b = ys[p] + cbs[p] / k;
    const g = (ys[p] - 0.299 * r - 0.114 * b) / 0.587;
    saida[0][p] = limitar(r) * a;
    saida[1][p] = limitar(g) * a;
    saida[2][p] = limitar(b) * a;
  }
  const limpa = dePlanos(saida, largura, altura);
  return nitida > 0 ? nitidez(limpa, nitida / 100, Math.max(0.5, escala)) : limpa;
}

// ——— Outros ———
/** Personalizado: a convolução pela matriz 5 × 5 (a de lá), dividida pela escala e com o deslocamento, na cor reta. */
export function personalizado(imagem: ImagemDoFiltro, matriz: number[], escala: number, deslocamento: number): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const reta = porPixelReto(imagem, (r, g, b) => [r, g, b]);
  const dados = imagem.dados.slice();
  const ler = (x: number, y: number, k: number) => {
    const xx = Math.min(largura - 1, Math.max(0, x));
    const yy = Math.min(altura - 1, Math.max(0, y));
    const i = (yy * largura + xx) * 4;
    return reta.dados[i + 3] ? (reta.dados[i + k] * 255) / reta.dados[i + 3] : 0;
  };
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 4;
      const a = imagem.dados[i + 3];
      if (!a) continue;
      for (let k = 0; k < 3; k++) {
        let soma = 0;
        for (let j = 0; j < 25; j++) if (matriz[j]) soma += matriz[j] * ler(x + (j % 5) - 2, y + Math.floor(j / 5) - 2, k);
        dados[i + k] = Math.round((limitar((soma / (escala || 1) + deslocamento) / 255) * a));
      }
    }
  }
  return { largura, altura, dados };
}

function rgbParaHsb(r: number, g: number, b: number): Rgb {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, max > 0 ? d / max : 0, max];
}
function hsbParaRgb(h: number, s: number, v: number): Rgb {
  const i = Math.floor(h * 6) % 6;
  const f = h * 6 - Math.floor(h * 6);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  return ([[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]] as Rgb[])[i];
}
function rgbParaHsl(r: number, g: number, b: number): Rgb {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const [h] = rgbParaHsb(r, g, b);
  return [h, d > 0 ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
}
function hslParaRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const v = l + c / 2;
  return hsbParaRgb(h, v > 0 ? c / v : 0, v);
}

/** HSB/HSL: põe nos canais R, G e B o matiz, a saturação e o brilho (ou a luminosidade), ou faz o caminho de volta. */
export function hsbHsl(imagem: ImagemDoFiltro, entrada: string, saida: string): ImagemDoFiltro {
  return porPixelReto(imagem, (r, g, b) => {
    const rgb: Rgb = entrada === "hsb" ? hsbParaRgb(r, g, b) : entrada === "hsl" ? hslParaRgb(r, g, b) : [r, g, b];
    return saida === "hsb" ? rgbParaHsb(...rgb) : saida === "hsl" ? rgbParaHsl(...rgb) : rgb;
  });
}

/** Alta frequência: o cinza do meio mais o que a versão borrada não tem (as bordas e os detalhes). */
export function altaFrequencia(imagem: ImagemDoFiltro, sigma: number): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const a = paraPlanos(imagem);
  const b = a.map((plano) => desfocarPlano(plano, largura, altura, Math.max(0.1, sigma)));
  const saida = [new Float32Array(largura * altura), new Float32Array(largura * altura), new Float32Array(largura * altura), a[3]] as Planos;
  for (let p = 0; p < largura * altura; p++) for (let k = 0; k < 3; k++) saida[k][p] = (0.5 + (a[k][p] - b[k][p])) * a[3][p];
  return dePlanos(saida, largura, altura);
}

/** Máximo e mínimo: cada canal vira o maior (ou o menor) da vizinhança, quadrada ou redonda. */
export function maximoMinimo(imagem: ImagemDoFiltro, raio: number, maximo: boolean, redondo: boolean): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const r = Math.max(1, Math.round(raio));
  const escolher = maximo ? Math.max : Math.min;
  const planos = paraPlanos(imagem);
  const saida = planos.map((plano) => {
    if (!redondo) {
      // Separável: primeiro na linha, depois na coluna
      const meio = new Float32Array(plano.length);
      for (let y = 0; y < altura; y++)
        for (let x = 0; x < largura; x++) {
          let v = plano[y * largura + x];
          for (let d = -r; d <= r; d++) if (x + d >= 0 && x + d < largura) v = escolher(v, plano[y * largura + x + d]);
          meio[y * largura + x] = v;
        }
      const fim = new Float32Array(plano.length);
      for (let y = 0; y < altura; y++)
        for (let x = 0; x < largura; x++) {
          let v = meio[y * largura + x];
          for (let d = -r; d <= r; d++) if (y + d >= 0 && y + d < altura) v = escolher(v, meio[(y + d) * largura + x]);
          fim[y * largura + x] = v;
        }
      return fim;
    }
    const fim = new Float32Array(plano.length);
    for (let y = 0; y < altura; y++)
      for (let x = 0; x < largura; x++) {
        let v = plano[y * largura + x];
        for (let dy = -r; dy <= r; dy++) {
          if (y + dy < 0 || y + dy >= altura) continue;
          const largo = Math.floor(Math.sqrt(r * r - dy * dy));
          for (let dx = -largo; dx <= largo; dx++) if (x + dx >= 0 && x + dx < largura) v = escolher(v, plano[(y + dy) * largura + x + dx]);
        }
        fim[y * largura + x] = v;
      }
    return fim;
  }) as Planos;
  return dePlanos(saida, largura, altura);
}

/** Deslocamento: a imagem anda; o que sobra fica transparente, repete a borda ou dá a volta. */
export function deslocar(imagem: ImagemDoFiltro, dx: number, dy: number, sobra: string): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const dados = new Uint8ClampedArray(imagem.dados.length);
  const ix = Math.round(dx);
  const iy = Math.round(dy);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      let sx = x - ix;
      let sy = y - iy;
      if (sobra === "volta") {
        sx = ((sx % largura) + largura) % largura;
        sy = ((sy % altura) + altura) % altura;
      } else if (sobra === "repetir") {
        sx = Math.min(largura - 1, Math.max(0, sx));
        sy = Math.min(altura - 1, Math.max(0, sy));
      } else if (sx < 0 || sy < 0 || sx >= largura || sy >= altura) continue;
      const i = (y * largura + x) * 4;
      const j = (sy * largura + sx) * 4;
      for (let k = 0; k < 4; k++) dados[i + k] = imagem.dados[j + k];
    }
  }
  return { largura, altura, dados };
}

/** Cor para alfa: a cor escolhida vira transparência, e o resto perde a parte dela (a conta clássica de quem edita imagens). */
export function corParaAlfa(imagem: ImagemDoFiltro, cor: Rgb): ImagemDoFiltro {
  const dados = new Uint8ClampedArray(imagem.dados.length);
  for (let i = 0; i < dados.length; i += 4) {
    const a0 = imagem.dados[i + 3] / 255;
    if (!a0) continue;
    const c = [imagem.dados[i] / 255 / a0, imagem.dados[i + 1] / 255 / a0, imagem.dados[i + 2] / 255 / a0];
    let alfa = 0;
    for (let k = 0; k < 3; k++) {
      const d = c[k] > cor[k] ? (c[k] - cor[k]) / (1 - cor[k] || 1) : c[k] < cor[k] ? (cor[k] - c[k]) / (cor[k] || 1) : 0;
      alfa = Math.max(alfa, d);
    }
    const a = alfa * a0;
    dados[i + 3] = Math.round(a * 255);
    if (alfa <= 0) continue;
    for (let k = 0; k < 3; k++) {
      const reta = limitar((c[k] - cor[k]) / alfa + cor[k]);
      dados[i + k] = Math.round(reta * a * 255);
    }
  }
  return { ...imagem, dados };
}

export { borrar, caixaNoPlano };
