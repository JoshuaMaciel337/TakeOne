// Filtro › Pixelização (ADR 0003, onda 13.11): meio-tom em cores, cristalizar, facetar, fragmentar, meia-tinta,
// mosaico e pontilhismo. As células e os sorteios ficam presos ao documento (o mesmo desenho em qualquer zoom).
import { type ContextoDoFiltro, dePlanos, type ImagemDoFiltro, lerPlano, limitar, paraPlanos, type Planos, porPixelReto, type Rgb, sorteio } from "./comum.ts";
import { deslocar } from "./nitidezRuido.ts";

/** O ponto do documento de um pixel da imagem do filtro. */
const noDocumento = (x: number, y: number, ctx: ContextoDoFiltro) => [ctx.origem.x + (x + 0.5) / ctx.escala, ctx.origem.y + (y + 0.5) / ctx.escala];

/** Mosaico: a média de cada quadrado da grade do documento. */
export function mosaico(imagem: ImagemDoFiltro, tamanho: number, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const planos = paraPlanos(imagem);
  const celula = (x: number, y: number) => {
    const [dx, dy] = noDocumento(x, y, ctx);
    return `${Math.floor(dx / tamanho)},${Math.floor(dy / tamanho)}`;
  };
  const somas = new Map<string, number[]>();
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const chave = celula(x, y);
      const p = y * largura + x;
      const s = somas.get(chave) ?? [0, 0, 0, 0, 0];
      for (let k = 0; k < 4; k++) s[k] += planos[k][p];
      s[4]++;
      somas.set(chave, s);
    }
  }
  const saida = [new Float32Array(largura * altura), new Float32Array(largura * altura), new Float32Array(largura * altura), new Float32Array(largura * altura)] as Planos;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const s = somas.get(celula(x, y))!;
      const p = y * largura + x;
      for (let k = 0; k < 4; k++) saida[k][p] = s[k] / s[4];
    }
  }
  return dePlanos(saida, largura, altura);
}

/** As sementes das células de Voronoi (uma por quadrado da grade, sorteada dentro dele), em pixels do documento. */
function semente(i: number, j: number, tamanho: number): [number, number] {
  return [(i + 0.15 + 0.7 * sorteio(i, j, 11)) * tamanho, (j + 0.15 + 0.7 * sorteio(i, j, 12)) * tamanho];
}

/** A célula de Voronoi de um ponto do documento: a semente mais perto entre as dos 9 quadrados em volta. */
function celulaDe(dx: number, dy: number, tamanho: number): { i: number; j: number; distancia: number } {
  const ci = Math.floor(dx / tamanho);
  const cj = Math.floor(dy / tamanho);
  let melhor = { i: ci, j: cj, distancia: Infinity };
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      const [sx, sy] = semente(i, j, tamanho);
      const d = Math.hypot(sx - dx, sy - dy);
      if (d < melhor.distancia) melhor = { i, j, distancia: d };
    }
  }
  return melhor;
}

/** Cristalizar: cada célula de Voronoi com a média dela. */
export function cristalizar(imagem: ImagemDoFiltro, tamanho: number, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const planos = paraPlanos(imagem);
  const celulas = new Int32Array(largura * altura * 2);
  const somas = new Map<string, number[]>();
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const [dx, dy] = noDocumento(x, y, ctx);
      const c = celulaDe(dx, dy, tamanho);
      const p = y * largura + x;
      celulas[2 * p] = c.i;
      celulas[2 * p + 1] = c.j;
      const chave = `${c.i},${c.j}`;
      const s = somas.get(chave) ?? [0, 0, 0, 0, 0];
      for (let k = 0; k < 4; k++) s[k] += planos[k][p];
      s[4]++;
      somas.set(chave, s);
    }
  }
  const saida = [new Float32Array(largura * altura), new Float32Array(largura * altura), new Float32Array(largura * altura), new Float32Array(largura * altura)] as Planos;
  for (let p = 0; p < largura * altura; p++) {
    const s = somas.get(`${celulas[2 * p]},${celulas[2 * p + 1]}`)!;
    for (let k = 0; k < 4; k++) saida[k][p] = s[k] / s[4];
  }
  return dePlanos(saida, largura, altura);
}

/** Pontilhismo: a cor de cada célula num ponto redondo em volta da semente, sobre a cor de fundo. */
export function pontilhismo(imagem: ImagemDoFiltro, tamanho: number, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const cristal = cristalizar(imagem, tamanho, ctx);
  const raio = tamanho * 0.45;
  const fundo = ctx.fundo;
  const dados = new Uint8ClampedArray(imagem.dados.length);
  for (let y = 0; y < imagem.altura; y++) {
    for (let x = 0; x < imagem.largura; x++) {
      const i = (y * imagem.largura + x) * 4;
      const a = imagem.dados[i + 3];
      if (!a) continue;
      const [dx, dy] = noDocumento(x, y, ctx);
      const c = celulaDe(dx, dy, tamanho);
      // A borda do ponto suave, com o sorteio deixando o tamanho de cada um um pouco diferente
      const r = raio * (0.75 + 0.5 * sorteio(c.i, c.j, 13));
      const dentro = limitar((r - c.distancia) * ctx.escala + 0.5);
      for (let k = 0; k < 3; k++) {
        const cor = cristal.dados[i + 3] ? cristal.dados[i + k] / cristal.dados[i + 3] : 0;
        dados[i + k] = Math.round((cor * dentro + fundo[k] * (1 - dentro)) * a);
      }
      dados[i + 3] = a;
    }
  }
  return { ...imagem, dados };
}

/** Fragmentar: a média de quatro cópias deslocadas (o tremido de lá). */
export function fragmentar(imagem: ImagemDoFiltro, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const d = 4 * ctx.escala;
  const copias = [deslocar(imagem, d, d, "repetir"), deslocar(imagem, -d, d, "repetir"), deslocar(imagem, d, -d, "repetir"), deslocar(imagem, -d, -d, "repetir")];
  const dados = new Uint8ClampedArray(imagem.dados.length);
  for (let i = 0; i < dados.length; i++) dados[i] = Math.round((copias[0].dados[i] + copias[1].dados[i] + copias[2].dados[i] + copias[3].dados[i]) / 4);
  return { ...imagem, dados };
}

/** Facetar: cada pixel fica com a média do quadrante mais liso em volta (o filtro de Kuwahara), o que junta as cores parecidas em facetas. */
export function kuwahara(imagem: ImagemDoFiltro, raio: number): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const r = Math.max(1, Math.round(raio));
  const planos = paraPlanos(imagem);
  const saida = [new Float32Array(largura * altura), new Float32Array(largura * altura), new Float32Array(largura * altura), planos[3].slice()] as Planos;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      let melhor = Infinity;
      const p = y * largura + x;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const soma = [0, 0, 0];
        let quadrados = 0;
        let n = 0;
        for (let dy = 0; dy <= r; dy++) {
          const yy = y + dy * sy;
          if (yy < 0 || yy >= altura) continue;
          for (let dx = 0; dx <= r; dx++) {
            const xx = x + dx * sx;
            if (xx < 0 || xx >= largura) continue;
            const q = yy * largura + xx;
            const l = 0.299 * planos[0][q] + 0.587 * planos[1][q] + 0.114 * planos[2][q];
            for (let k = 0; k < 3; k++) soma[k] += planos[k][q];
            quadrados += l * l;
            n++;
          }
        }
        if (!n) continue;
        const media = (0.299 * soma[0] + 0.587 * soma[1] + 0.114 * soma[2]) / n;
        const variancia = quadrados / n - media * media;
        if (variancia < melhor) {
          melhor = variancia;
          for (let k = 0; k < 3; k++) saida[k][p] = Math.min(soma[k] / n, saida[3][p]);
        }
      }
    }
  }
  return dePlanos(saida, largura, altura);
}

/** Meia-tinta: pontos ou traços de cor cheia (cada canal ligado ou desligado) pela luz, com o grão sorteado do tipo. */
export function meiaTinta(imagem: ImagemDoFiltro, tipo: string, ctx: ContextoDoFiltro): ImagemDoFiltro {
  const tamanhos: Record<string, [number, number]> = {
    pontos_finos: [1, 1],
    pontos_medios: [2, 2],
    pontos_granulados: [1.5, 1.5],
    pontos_grossos: [3, 3],
    linhas_curtas: [6, 1],
    linhas_medias: [12, 1],
    linhas_longas: [24, 1],
    tracos_curtos: [5, 1.5],
    tracos_medios: [10, 1.5],
    tracos_longos: [20, 1.5],
  };
  const [cx, cy] = tamanhos[tipo] ?? [2, 2];
  return porPixelReto(imagem, (r, g, b, x, y) => {
    const [dx, dy] = noDocumento(x, y, ctx);
    const i = Math.floor(dx / cx);
    const j = Math.floor(dy / cy);
    return [r, g, b].map((v, k) => (v > sorteio(i, j, 20 + k) ? 1 : 0)) as Rgb;
  });
}

/** Meio-tom em cores: em ciano, magenta e amarelo, cada canal numa grade girada de pontos do tamanho da tinta da célula. */
export function meioTomEmCores(imagem: ImagemDoFiltro, raioMaximo: number, angulos: [number, number, number], ctx: ContextoDoFiltro): ImagemDoFiltro {
  const { largura, altura } = imagem;
  const planos = paraPlanos(imagem);
  const lado = 2 * raioMaximo * ctx.escala;
  const saida = [new Float32Array(largura * altura), new Float32Array(largura * altura), new Float32Array(largura * altura), planos[3]] as Planos;
  for (let k = 0; k < 3; k++) {
    const a = (angulos[k] * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        const gx = x + ctx.origem.x * ctx.escala;
        const gy = y + ctx.origem.y * ctx.escala;
        // Na grade girada: o centro da célula e a tinta lida nele
        const u = gx * c + gy * s;
        const v = -gx * s + gy * c;
        const cu = (Math.floor(u / lado) + 0.5) * lado;
        const cv = (Math.floor(v / lado) + 0.5) * lado;
        const px = cu * c - cv * s - ctx.origem.x * ctx.escala;
        const py = cu * s + cv * c - ctx.origem.y * ctx.escala;
        const alfa = lerPlano(planos[3], largura, altura, px, py);
        const tinta = alfa > 0 ? 1 - lerPlano(planos[k], largura, altura, px, py) / alfa : 0;
        const raio = Math.sqrt(limitar(tinta)) * (lado / 2) * Math.SQRT2;
        const d = Math.hypot(u - cu, v - cv);
        const ponto = limitar(raio - d + 0.5);
        const p = y * largura + x;
        saida[k][p] = (1 - ponto) * planos[3][p];
      }
    }
  }
  return dePlanos(saida, largura, altura);
}
