// Degradê de preenchimento (textos e formas): a mesma conta de core/utils/gradiente.py, conferida pelos casos de
// tests/casos/gradiente.json. Aqui ela pinta a amostra do painel; o desenho de verdade é feito no servidor.
// De 2 a 5 cores igualmente espaçadas, linear no ângulo (0° para a direita, 90° para baixo) ou radial (do centro
// para as bordas), com o ponto médio empurrando o meio do caminho; as cores se misturam em sRGB.

export type Degrade = { tipo: "linear" | "radial"; cores: string[]; angulo: number; meio: number };

export const DEGRADE_PADRAO: Degrade = { tipo: "linear", cores: ["#ff624a", "#ff3478"], angulo: 0, meio: 0.5 };
export const CORES_DO_DEGRADE = { minimo: 2, maximo: 5 } as const;
export const MEIO_DO_DEGRADE = { minimo: 0.05, maximo: 0.95 } as const;

const rgb = (cor: string): [number, number, number] => {
  const hex = cor.replace("#", "");
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
};

/** O ponto médio: `meio` vai para 0,5 e cada lado estica em linha reta. */
export function comMeio(u: number, meio: number): number {
  const m = Math.min(MEIO_DO_DEGRADE.maximo, Math.max(MEIO_DO_DEGRADE.minimo, meio));
  return u < m ? (0.5 * u) / m : 0.5 + (0.5 * (u - m)) / (1 - m);
}

/** A cor (0 a 255, sem arredondar) em `t` (0 a 1) do caminho. */
export function corNoDegrade(degrade: Degrade, t: number): [number, number, number] {
  const cores = degrade.cores.map(rgb);
  const v = Math.min(1, Math.max(0, comMeio(Math.min(1, Math.max(0, t)), degrade.meio))) * (cores.length - 1);
  const i = Math.min(Math.floor(v), cores.length - 2);
  const f = v - i;
  return [0, 1, 2].map((c) => cores[i][c] * (1 - f) + cores[i + 1][c] * f) as [number, number, number];
}

/** O `t` do pixel (x, y) (o centro dele), pela caixa [x0, y0, x1, y1] que o degradê cobre. */
export function tNoPixel(degrade: Degrade, x: number, y: number, caixa: [number, number, number, number]): number {
  const [x0, y0, x1, y1] = caixa;
  const px = x + 0.5;
  const py = y + 0.5;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const meiaL = Math.max((x1 - x0) / 2, 1e-6);
  const meiaA = Math.max((y1 - y0) / 2, 1e-6);
  if (degrade.tipo === "radial") return Math.min(1, Math.max(0, Math.hypot((px - cx) / meiaL, (py - cy) / meiaA)));
  const angulo = (degrade.angulo * Math.PI) / 180;
  const dx = Math.cos(angulo);
  const dy = Math.sin(angulo);
  const alcance = Math.abs(dx) * meiaL + Math.abs(dy) * meiaA;
  return Math.min(1, Math.max(0, ((px - cx) * dx + (py - cy) * dy) / (2 * alcance) + 0.5));
}

/** Pinta a amostra do degradê num canvas (o painel). */
export function pintarAmostra(canvas: HTMLCanvasElement, degrade: Degrade) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: largura, height: altura } = canvas;
  const imagem = ctx.createImageData(largura, altura);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const [r, g, b] = corNoDegrade(degrade, tNoPixel(degrade, x, y, [0, 0, largura, altura]));
      const k = (y * largura + x) * 4;
      imagem.data[k] = r;
      imagem.data[k + 1] = g;
      imagem.data[k + 2] = b;
      imagem.data[k + 3] = 255;
    }
  }
  ctx.putImageData(imagem, 0, 0);
}
