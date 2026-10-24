// A Distorção de marionete (Editar › Distorção de marionete; ADR 0003, onda 13.6): os alfinetes puxam a camada pela
// deformação de mínimos quadrados móveis (Schaefer, McPhail e Warren, 2006): cada ponto vai pela transformação que
// melhor leva os alfinetes de onde estavam para onde estão, pesando mais os perto dele. Rígido não estica nem inclina,
// normal pode crescer por igual, distorcer vale qualquer afim. A conta é feita numa grade sobre o que tem conteúdo
// (com a expansão) e o desenho vai pela grade, sem emendas.
import type { Ponto } from "./malha.ts";

export type ModoDaMarionete = "rigido" | "normal" | "distorcer";
export type Alfinete = { origem: Ponto; destino: Ponto };
export type CaixaDaMarionete = { x0: number; y0: number; x1: number; y1: number };

/** O ponto v levado pelos alfinetes. */
export function levarPelosAlfinetes(v: Ponto, alfinetes: Alfinete[], modo: ModoDaMarionete): Ponto {
  if (!alfinetes.length) return v;
  if (alfinetes.length === 1) return { x: v.x + alfinetes[0].destino.x - alfinetes[0].origem.x, y: v.y + alfinetes[0].destino.y - alfinetes[0].origem.y };
  let soma = 0;
  let px = 0;
  let py = 0;
  let qx = 0;
  let qy = 0;
  const pesos: number[] = [];
  for (const { origem, destino } of alfinetes) {
    const d2 = (origem.x - v.x) ** 2 + (origem.y - v.y) ** 2;
    if (d2 < 1e-10) return { ...destino };
    const w = 1 / d2;
    pesos.push(w);
    soma += w;
    px += w * origem.x;
    py += w * origem.y;
    qx += w * destino.x;
    qy += w * destino.y;
  }
  px /= soma;
  py /= soma;
  qx /= soma;
  qy /= soma;
  const dx = v.x - px;
  const dy = v.y - py;
  if (modo === "distorcer") {
    // M = (Σ w p̂ᵀp̂)⁻¹ Σ w p̂ᵀq̂
    let a = 0;
    let b = 0;
    let d = 0;
    let m00 = 0;
    let m01 = 0;
    let m10 = 0;
    let m11 = 0;
    alfinetes.forEach(({ origem, destino }, i) => {
      const w = pesos[i];
      const hx = origem.x - px;
      const hy = origem.y - py;
      const gx = destino.x - qx;
      const gy = destino.y - qy;
      a += w * hx * hx;
      b += w * hx * hy;
      d += w * hy * hy;
      m00 += w * hx * gx;
      m01 += w * hx * gy;
      m10 += w * hy * gx;
      m11 += w * hy * gy;
    });
    const det = a * d - b * b;
    if (Math.abs(det) < 1e-12) return { x: v.x + qx - px, y: v.y + qy - py };
    const i00 = d / det;
    const i01 = -b / det;
    const i11 = a / det;
    const n00 = i00 * m00 + i01 * m10;
    const n01 = i00 * m01 + i01 * m11;
    const n10 = i01 * m00 + i11 * m10;
    const n11 = i01 * m01 + i11 * m11;
    return { x: dx * n00 + dy * n10 + qx, y: dx * n01 + dy * n11 + qy };
  }
  // Semelhança e rígida: f⃗ = Σ q̂ᵢ Aᵢ, com Aᵢ = wᵢ [p̂ᵢ; −p̂ᵢ⊥] [d; −d⊥]ᵀ
  let fx = 0;
  let fy = 0;
  let mu = 0;
  alfinetes.forEach(({ origem, destino }, i) => {
    const w = pesos[i];
    const hx = origem.x - px;
    const hy = origem.y - py;
    const gx = destino.x - qx;
    const gy = destino.y - qy;
    // As linhas de L: (hx, hy) e (hy, −hx); as de R: (dx, dy) e (dy, −dx)
    const a00 = w * (hx * dx + hy * dy);
    const a01 = w * (hx * dy - hy * dx);
    const a10 = w * (hy * dx - hx * dy);
    const a11 = w * (hy * dy + hx * dx);
    fx += gx * a00 + gy * a10;
    fy += gx * a01 + gy * a11;
    mu += w * (hx * hx + hy * hy);
  });
  if (modo === "rigido") {
    const tamanho = Math.hypot(fx, fy);
    const distancia = Math.hypot(dx, dy);
    if (tamanho < 1e-12) return { x: qx, y: qy };
    return { x: (fx / tamanho) * distancia + qx, y: (fy / tamanho) * distancia + qy };
  }
  return { x: fx / mu + qx, y: fy / mu + qy };
}

/** A grade (divisões + 1 em cada lado) da caixa, com cada ponto já levado pelos alfinetes. */
export function gradeDaMarionete(caixa: CaixaDaMarionete, divisoes: number, alfinetes: Alfinete[], modo: ModoDaMarionete): Ponto[] {
  const pontos: Ponto[] = [];
  for (let j = 0; j <= divisoes; j++) {
    for (let i = 0; i <= divisoes; i++) {
      const v = { x: caixa.x0 + ((caixa.x1 - caixa.x0) * i) / divisoes, y: caixa.y0 + ((caixa.y1 - caixa.y0) * j) / divisoes };
      pontos.push(levarPelosAlfinetes(v, alfinetes, modo));
    }
  }
  return pontos;
}

/** O mapa da caixa (u, v de 0 a 1) para o documento, pela grade deformada (bilinear em cada quadradinho). */
export function mapaDaGrade(grade: Ponto[], divisoes: number): (u: number, v: number) => Ponto {
  return (u, v) => {
    const fu = Math.min(divisoes - 1e-9, Math.max(0, u * divisoes));
    const fv = Math.min(divisoes - 1e-9, Math.max(0, v * divisoes));
    const i = Math.floor(fu);
    const j = Math.floor(fv);
    const s = fu - i;
    const t = fv - j;
    const p00 = grade[j * (divisoes + 1) + i];
    const p10 = grade[j * (divisoes + 1) + i + 1];
    const p01 = grade[(j + 1) * (divisoes + 1) + i];
    const p11 = grade[(j + 1) * (divisoes + 1) + i + 1];
    return {
      x: p00.x * (1 - s) * (1 - t) + p10.x * s * (1 - t) + p01.x * (1 - s) * t + p11.x * s * t,
      y: p00.y * (1 - s) * (1 - t) + p10.y * s * (1 - t) + p01.y * (1 - s) * t + p11.y * s * t,
    };
  };
}

/** A caixa do que não é transparente na camada, aumentada pela expansão (em pixels), dentro da imagem. */
export function caixaDoConteudo(dados: ArrayLike<number>, largura: number, altura: number, expansao: number): CaixaDaMarionete | null {
  let x0 = largura;
  let y0 = altura;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (dados[(y * largura + x) * 4 + 3] < 8) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { x0: Math.max(0, x0 - expansao), y0: Math.max(0, y0 - expansao), x1: Math.min(largura, x1 + 1 + expansao), y1: Math.min(altura, y1 + 1 + expansao) };
}
