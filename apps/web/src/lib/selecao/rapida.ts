// A seleção rápida (ADR 0003, onda 13.3): um pincel que cresce até as bordas. De cada marca do pincel, a seleção anda
// pelos vizinhos enquanto a distância geodésica de cor fica baixa: cada passo custa o quanto a cor muda além do ruído,
// então no liso ela corre até o limite da janela e numa borda para logo. A janela é de cinco raios em volta da marca.
import type { ImagemRgba } from "./varinha.ts";

/** A mudança de cor que um passo tolera de graça (o ruído e a textura fina), em níveis de 0 a 255. */
const RUIDO = 10;
/** O custo acumulado em que o crescimento para (a soma das mudanças além do ruído, em níveis). */
const LIMITE = 28;

/** A diferença entre dois pixels: o maior canal, no alfa pré-multiplicado. */
function diferenca(dados: ImagemRgba["dados"], a: number, b: number): number {
  const aa = dados[a * 4 + 3];
  const ab = dados[b * 4 + 3];
  let maior = Math.abs(aa - ab);
  for (let c = 0; c < 3; c++) maior = Math.max(maior, Math.abs((dados[a * 4 + c] * aa - dados[b * 4 + c] * ab) / 255));
  return maior;
}

/**
 * Uma marca do pincel em (x, y), de raio `raio`: marca em `marcado` (do tamanho da imagem) os pixels a que a seleção
 * chega. Devolve o retângulo que mudou, ou null.
 */
export function marcaRapida(imagem: ImagemRgba, marcado: Uint8Array, x: number, y: number, raio: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const { largura, altura, dados } = imagem;
  const alcance = Math.ceil(raio * 5);
  const x0 = Math.max(0, Math.floor(x - alcance));
  const y0 = Math.max(0, Math.floor(y - alcance));
  const x1 = Math.min(largura - 1, Math.ceil(x + alcance));
  const y1 = Math.min(altura - 1, Math.ceil(y + alcance));
  if (x1 < x0 || y1 < y0) return null;
  const lj = x1 - x0 + 1;
  const aj = y1 - y0 + 1;
  const custo = new Float32Array(lj * aj).fill(Infinity);
  // Uma fila por baldes de custo inteiro (o custo é pequeno e inteiro o bastante): sem monte, mais rápido
  const baldes: number[][] = Array.from({ length: LIMITE + 1 }, () => []);
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 > raio * raio) continue;
      const local = (yy - y0) * lj + (xx - x0);
      custo[local] = 0;
      baldes[0].push(local);
    }
  }
  let mudou = false;
  let mx0 = Infinity;
  let my0 = Infinity;
  let mx1 = -1;
  let my1 = -1;
  for (let b = 0; b <= LIMITE; b++) {
    const balde = baldes[b];
    for (let k = 0; k < balde.length; k++) {
      const local = balde[k];
      // Entrada velha (o pixel já saiu de um balde mais barato)
      if (Math.floor(custo[local]) !== b) continue;
      const lx = local % lj;
      const ly = (local - lx) / lj;
      const global = (ly + y0) * largura + lx + x0;
      if (!marcado[global]) {
        marcado[global] = 1;
        mudou = true;
        mx0 = Math.min(mx0, lx + x0);
        my0 = Math.min(my0, ly + y0);
        mx1 = Math.max(mx1, lx + x0 + 1);
        my1 = Math.max(my1, ly + y0 + 1);
      }
      const vizinhos = [lx > 0 ? local - 1 : -1, lx < lj - 1 ? local + 1 : -1, ly > 0 ? local - lj : -1, ly < aj - 1 ? local + lj : -1];
      for (const v of vizinhos) {
        if (v < 0) continue;
        const vx = v % lj;
        const vy = (v - vx) / lj;
        const passo = Math.max(0, diferenca(dados, global, (vy + y0) * largura + vx + x0) - RUIDO);
        const novo = custo[local] + passo;
        if (novo < custo[v] && novo <= LIMITE) {
          custo[v] = novo;
          baldes[Math.floor(novo)].push(v);
        }
      }
    }
  }
  return mudou ? { x0: mx0, y0: my0, x1: mx1, y1: my1 } : null;
}
