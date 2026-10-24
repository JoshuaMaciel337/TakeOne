// Filtro › Desfoque (ADR 0003, onda 13.11): média, desfoque, mais desfoque, caixa, gaussiano, movimento, radial,
// forma, inteligente e superfície. Tudo no alfa pré-multiplicado (comum.ts).
import { caixaNoPlano, type ContextoDoFiltro, dePlanos, desfocarPlano, type ImagemDoFiltro, lerPlano, limitar, paraPlanos, type Planos } from "./comum.ts";

/** Média: a cor média da camada (pesada pelo alfa) em todos os pixels dela; o alfa fica. */
export function media(imagem: ImagemDoFiltro): ImagemDoFiltro {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (let i = 0; i < imagem.dados.length; i += 4) {
    r += imagem.dados[i];
    g += imagem.dados[i + 1];
    b += imagem.dados[i + 2];
    a += imagem.dados[i + 3];
  }
  const dados = new Uint8ClampedArray(imagem.dados.length);
  if (!a) return { ...imagem, dados };
  const cor = [r / a, g / a, b / a];
  for (let i = 0; i < dados.length; i += 4) {
    const alfa = imagem.dados[i + 3];
    for (let k = 0; k < 3; k++) dados[i + k] = Math.round(cor[k] * alfa);
    dados[i + 3] = alfa;
  }
  return { ...imagem, dados };
}

export function gaussiano(imagem: ImagemDoFiltro, sigma: number): ImagemDoFiltro {
  const { largura, altura } = imagem;
  if (sigma < 0.05) return imagem;
  const planos = paraPlanos(imagem).map((plano) => desfocarPlano(plano, largura, altura, sigma)) as Planos;
  return dePlanos(planos, largura, altura);
}

export function caixa(imagem: ImagemDoFiltro, raio: number): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const planos = paraPlanos(imagem).map((plano) => caixaNoPlano(plano, largura, altura, raio)) as Planos;
  return dePlanos(planos, largura, altura);
}

/** A média de amostras de cada pixel: `deslocamentos(x, y)` dá os pontos lidos (bilinear). */
function porAmostras(imagem: ImagemDoFiltro, pontos: (x: number, y: number, saida: Float64Array) => number): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const planos = paraPlanos(imagem);
  const saida = [new Float32Array(largura * altura), new Float32Array(largura * altura), new Float32Array(largura * altura), new Float32Array(largura * altura)] as Planos;
  const lista = new Float64Array(2 * 512);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const n = pontos(x + 0.5, y + 0.5, lista);
      const p = y * largura + x;
      for (let k = 0; k < 4; k++) {
        let soma = 0;
        for (let j = 0; j < n; j++) soma += lerPlano(planos[k], largura, altura, lista[2 * j], lista[2 * j + 1]);
        saida[k][p] = soma / n;
      }
    }
  }
  return dePlanos(saida, largura, altura);
}

/** Movimento: a média ao longo de uma reta no ângulo (graus, 0 na horizontal), da distância pedida (pixels da imagem). */
export function movimento(imagem: ImagemDoFiltro, angulo: number, distancia: number): ImagemDoFiltro {
  if (distancia < 1) return imagem;
  const r = (angulo * Math.PI) / 180;
  const dx = Math.cos(r);
  const dy = -Math.sin(r);
  const n = Math.min(256, Math.max(2, Math.ceil(distancia)));
  return porAmostras(imagem, (x, y, lista) => {
    for (let j = 0; j < n; j++) {
      const t = (j / (n - 1) - 0.5) * distancia;
      lista[2 * j] = x + dx * t;
      lista[2 * j + 1] = y + dy * t;
    }
    return n;
  });
}

/** Radial: giro (em volta do centro, até 45° com 100) ou zoom (em direção ao centro), com 32 amostras. */
export function radial(imagem: ImagemDoFiltro, quantidade: number, metodo: string, centro: { x: number; y: number }): ImagemDoFiltro {
  const n = 32;
  const forca = limitar(quantidade / 100);
  return porAmostras(imagem, (x, y, lista) => {
    const vx = x - centro.x;
    const vy = y - centro.y;
    for (let j = 0; j < n; j++) {
      const t = j / (n - 1);
      if (metodo === "zoom") {
        const s = 1 - forca * 0.5 * t;
        lista[2 * j] = centro.x + vx * s;
        lista[2 * j + 1] = centro.y + vy * s;
      } else {
        const a = (t - 0.5) * forca * (Math.PI / 4);
        const c = Math.cos(a);
        const s = Math.sin(a);
        lista[2 * j] = centro.x + vx * c - vy * s;
        lista[2 * j + 1] = centro.y + vx * s + vy * c;
      }
    }
    return n;
  });
}

/** O núcleo de uma forma (os pontos dentro dela, num lado de 1), para o desfoque de forma. */
export function dentroDaForma(forma: string, x: number, y: number): boolean {
  const r = Math.hypot(x, y);
  if (forma === "quadrado") return Math.abs(x) <= 1 && Math.abs(y) <= 1;
  if (forma === "losango") return Math.abs(x) + Math.abs(y) <= 1;
  if (forma === "hexagono") return Math.abs(y) <= 0.866 && Math.abs(x) * 0.866 + Math.abs(y) * 0.5 <= 0.866;
  if (forma === "estrela") {
    const a = Math.atan2(y, x);
    const raio = 0.5 + 0.5 * Math.abs(Math.cos((5 * a) / 2)) ** 2;
    return r <= raio;
  }
  if (forma === "coracao") {
    const yy = -y * 1.1 + 0.25;
    return (x * x + yy * yy - 0.5) ** 3 - x * x * yy * yy * yy <= 0;
  }
  return r <= 1;
}

/** Forma: a média dentro da forma, com no máximo uns 300 pontos (a grade fica mais rala nos raios grandes). */
export function forma(imagem: ImagemDoFiltro, raio: number, qual: string): ImagemDoFiltro {
  if (raio < 0.5) return imagem;
  const passo = Math.max(1, raio / 9);
  const nucleo: [number, number][] = [];
  for (let y = -raio; y <= raio + 1e-9; y += passo) for (let x = -raio; x <= raio + 1e-9; x += passo) if (dentroDaForma(qual, x / raio, y / raio)) nucleo.push([x, y]);
  if (!nucleo.length) nucleo.push([0, 0]);
  const n = Math.min(512, nucleo.length);
  return porAmostras(imagem, (x, y, lista) => {
    for (let j = 0; j < n; j++) {
      lista[2 * j] = x + nucleo[j][0];
      lista[2 * j + 1] = y + nucleo[j][1];
    }
    return n;
  });
}

/**
 * Inteligente e superfície: a média dos vizinhos parecidos (o limiar na diferença de cada canal). A superfície pesa
 * pela diferença (1 − |Δ| / 2,5 limiar); o inteligente só conta os de dentro do limiar, e pode desenhar as bordas.
 */
export function preservandoBordas(imagem: ImagemDoFiltro, raio: number, limiar: number, jeito: "superficie" | "inteligente", modo = "normal"): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const planos = paraPlanos(imagem);
  const saida = [new Float32Array(largura * altura), new Float32Array(largura * altura), new Float32Array(largura * altura), planos[3].slice()] as Planos;
  const r = Math.max(1, Math.round(raio));
  // Até uns 15 vizinhos por lado: nos raios grandes, a janela é lida em passos
  const passo = Math.max(1, Math.ceil(r / 7));
  const borda = new Uint8Array(largura * altura);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const p = y * largura + x;
      const a0 = planos[3][p];
      if (a0 <= 0) continue;
      const c0 = [planos[0][p] / a0, planos[1][p] / a0, planos[2][p] / a0];
      const soma = [0, 0, 0];
      let pesos = 0;
      let fora = 0;
      for (let dy = -r; dy <= r; dy += passo) {
        const yy = y + dy;
        if (yy < 0 || yy >= altura) continue;
        for (let dx = -r; dx <= r; dx += passo) {
          const xx = x + dx;
          if (xx < 0 || xx >= largura) continue;
          const q = yy * largura + xx;
          const a = planos[3][q];
          if (a <= 0) continue;
          let peso = 1;
          for (let k = 0; k < 3; k++) {
            const d = Math.abs(planos[k][q] / a - c0[k]);
            if (jeito === "superficie") peso *= Math.max(0, 1 - d / (2.5 * limiar));
            else if (d > limiar) peso = 0;
          }
          if (peso <= 0) {
            fora++;
            continue;
          }
          for (let k = 0; k < 3; k++) soma[k] += (planos[k][q] / a) * peso;
          pesos += peso;
        }
      }
      if (fora > 0) borda[p] = 1;
      for (let k = 0; k < 3; k++) saida[k][p] = (pesos > 0 ? soma[k] / pesos : c0[k]) * a0;
    }
  }
  if (jeito === "inteligente" && modo !== "normal") {
    // Só as bordas: branco nas bordas sobre o preto; sobrepor: as bordas brancas sobre a imagem
    for (let p = 0; p < borda.length; p++) {
      const a = planos[3][p];
      for (let k = 0; k < 3; k++) {
        if (modo === "bordas") saida[k][p] = borda[p] ? a : 0;
        else if (borda[p]) saida[k][p] = a;
      }
    }
  }
  return dePlanos(saida, largura, altura);
}

/** Os filtros do grupo, pelas opções (as medidas em pixels do documento). */
export const desfoques = {
  media: (imagem: ImagemDoFiltro) => media(imagem),
  desfoque: (imagem: ImagemDoFiltro, _v: unknown, ctx: ContextoDoFiltro) => gaussiano(imagem, 0.7 * ctx.escala),
  mais_desfoque: (imagem: ImagemDoFiltro, _v: unknown, ctx: ContextoDoFiltro) => gaussiano(imagem, 1.6 * ctx.escala),
};
