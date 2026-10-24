// O BMP (ADR 0003, onda 13.13): 24 bits quando a imagem é opaca, 32 bits com o alfa (o cabeçalho V4 com as máscaras
// dos canais, que os visualizadores de hoje leem); as linhas de baixo para cima, como o formato pede.
import { temTransparencia } from "./comum.ts";

export function codificarBmp(rgba: Uint8ClampedArray | Uint8Array, largura: number, altura: number, ppi?: number | null): Uint8Array {
  const opaca = !temTransparencia(rgba);
  const bytesPorPixel = opaca ? 3 : 4;
  const porLinha = Math.ceil((largura * bytesPorPixel) / 4) * 4;
  const cabecalho = opaca ? 40 : 108;
  const inicio = 14 + cabecalho;
  const saida = new Uint8Array(inicio + porLinha * altura);
  const v = new DataView(saida.buffer);
  saida[0] = 0x42;
  saida[1] = 0x4d;
  v.setUint32(2, saida.length, true);
  v.setUint32(10, inicio, true);
  v.setUint32(14, cabecalho, true);
  v.setInt32(18, largura, true);
  v.setInt32(22, altura, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, bytesPorPixel * 8, true);
  v.setUint32(30, opaca ? 0 : 3, true);
  v.setUint32(34, porLinha * altura, true);
  const porMetro = Math.round((ppi || 72) / 0.0254);
  v.setInt32(38, porMetro, true);
  v.setInt32(42, porMetro, true);
  if (!opaca) {
    // As máscaras do vermelho, do verde, do azul e do alfa, e o espaço de cor sRGB
    v.setUint32(54, 0x00ff0000, true);
    v.setUint32(58, 0x0000ff00, true);
    v.setUint32(62, 0x000000ff, true);
    v.setUint32(66, 0xff000000, true);
    v.setUint32(70, 0x73524742, true);
  }
  for (let y = 0; y < altura; y++) {
    const linha = inicio + (altura - 1 - y) * porLinha;
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 4;
      const o = linha + x * bytesPorPixel;
      saida[o] = rgba[i + 2];
      saida[o + 1] = rgba[i + 1];
      saida[o + 2] = rgba[i];
      if (!opaca) saida[o + 3] = rgba[i + 3];
    }
  }
  return saida;
}
