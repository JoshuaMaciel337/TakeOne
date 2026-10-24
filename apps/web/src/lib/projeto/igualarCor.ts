// Igualar a cor de um clipe à de outro: a média e o desvio da luz (Y) e das duas cores (Cb e Cr, BT.709) do
// clipe passam a ser os da referência, como no método de Reinhard, num espaço em que luz e cor andam separadas.
// O resultado é uma LUT .cube que vai para a API como qualquer LUT importada: a prévia e o render a aplicam do
// mesmo jeito (lib/projeto/lutImportada.ts e core/utils/lut.py).

import { ajustesEfetivos, type Cor, corNeutra, curvasNeutras, hslNeutro, lerLut, lutDaCor } from "./cor.ts";
import { lutGuardada } from "./lutImportada.ts";

export type Estatisticas = { media: [number, number, number]; desvio: [number, number, number] };

/**
 * A cor que um clipe já mostra (ajustes, filtro, LUT importada, cor por matiz e curvas; sem a vinheta, que depende
 * do lugar): a mesma LUT 3D da prévia, lida ponto a ponto. Null quando a cor do clipe é a original.
 */
export function corDoClipeEmPixels(cor: Cor | null | undefined): ((rgb: [number, number, number]) => [number, number, number]) | null {
  const ajustes = { ...ajustesEfetivos(cor), vinheta: 0 };
  const curvas = curvasNeutras(cor?.curvas) ? null : cor!.curvas!;
  const hsl = hslNeutro(cor?.hsl) ? null : cor!.hsl!;
  const tabela = cor?.lut && cor.lut.intensidade > 0 ? lutGuardada(cor.lut.id) : null;
  const importada = tabela ? { lut: tabela, intensidade: cor!.lut!.intensidade } : null;
  if (corNeutra(ajustes) && !curvas && !hsl && !importada) return null;
  const dados = lutDaCor(ajustes, curvas, hsl, importada);
  return (rgb) => lerLut(dados, rgb);
}

const KR = 0.2126;
const KB = 0.0722;

export function paraYcc(r: number, g: number, b: number): [number, number, number] {
  const y = KR * r + (1 - KR - KB) * g + KB * b;
  return [y, (b - y) / (2 * (1 - KB)), (r - y) / (2 * (1 - KR))];
}

export function deYcc(y: number, cb: number, cr: number): [number, number, number] {
  const r = y + 2 * (1 - KR) * cr;
  const b = y + 2 * (1 - KB) * cb;
  const g = (y - KR * r - KB * b) / (1 - KR - KB);
  return [r, g, b];
}

/**
 * Média e desvio de Y, Cb e Cr numa amostra RGBA (o `getImageData`), com a cor de cada pixel passada antes por
 * `transformar` (a cor que o clipe de referência já tem). Pixels quase transparentes ficam de fora.
 */
export function estatisticasDaCor(rgba: ArrayLike<number>, transformar?: (rgb: [number, number, number]) => [number, number, number]): Estatisticas | null {
  const soma = [0, 0, 0];
  const quadrados = [0, 0, 0];
  let n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    let rgb: [number, number, number] = [rgba[i] / 255, rgba[i + 1] / 255, rgba[i + 2] / 255];
    if (transformar) rgb = transformar(rgb);
    const ycc = paraYcc(...rgb);
    for (let k = 0; k < 3; k++) {
      soma[k] += ycc[k];
      quadrados[k] += ycc[k] * ycc[k];
    }
    n++;
  }
  if (!n) return null;
  const media = soma.map((s) => s / n) as [number, number, number];
  const desvio = quadrados.map((q, k) => Math.sqrt(Math.max(q / n - media[k] ** 2, 0))) as [number, number, number];
  return { media, desvio };
}

/** Quanto o desvio pode crescer ou encolher: uma imagem quase lisa não vira ruído, nem uma colorida vira cinza. */
const GANHO_DA_LUZ: [number, number] = [0.5, 2];
const GANHO_DA_COR: [number, number] = [0.25, 3];

/** A cor de um pixel do clipe depois de igualada à referência. */
export function igualarPixel(rgb: [number, number, number], alvo: Estatisticas, referencia: Estatisticas): [number, number, number] {
  const ycc = paraYcc(...rgb);
  const saida = ycc.map((v, k) => {
    const [minimo, maximo] = k === 0 ? GANHO_DA_LUZ : GANHO_DA_COR;
    const ganho = alvo.desvio[k] > 1e-4 ? Math.min(Math.max(referencia.desvio[k] / alvo.desvio[k], minimo), maximo) : 1;
    return (v - alvo.media[k]) * ganho + referencia.media[k];
  }) as [number, number, number];
  return deYcc(...saida).map((v) => Math.min(Math.max(v, 0), 1)) as [number, number, number];
}

/** A LUT .cube (33 pontos, o vermelho variando mais rápido) que leva a cor do clipe à da referência. */
export function cubeParaIgualar(alvo: Estatisticas, referencia: Estatisticas, titulo: string, pontos = 33): string {
  const linhas = [`TITLE "${titulo.replace(/"/g, "'")}"`, `LUT_3D_SIZE ${pontos}`];
  const passo = pontos - 1;
  for (let b = 0; b < pontos; b++) {
    for (let g = 0; g < pontos; g++) {
      for (let r = 0; r < pontos; r++) linhas.push(igualarPixel([r / passo, g / passo, b / passo], alvo, referencia).map((v) => v.toFixed(6)).join(" "));
    }
  }
  return `${linhas.join("\n")}\n`;
}
