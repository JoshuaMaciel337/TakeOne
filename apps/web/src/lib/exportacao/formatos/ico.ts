// O ícone (ADR 0003, onda 13.13): o ICO com um PNG por tamanho (o jeito do Windows Vista em diante, que todo
// navegador lê). Os PNGs vêm prontos, cada um já no tamanho dele.

export const TAMANHOS_DO_ICONE = [16, 24, 32, 48, 64, 128, 256];

export function codificarIco(imagens: { lado: number; png: Uint8Array }[]): Uint8Array {
  const cabecalho = 6 + imagens.length * 16;
  const saida = new Uint8Array(cabecalho + imagens.reduce((soma, item) => soma + item.png.length, 0));
  const v = new DataView(saida.buffer);
  v.setUint16(2, 1, true);
  v.setUint16(4, imagens.length, true);
  let pos = cabecalho;
  imagens.forEach(({ lado, png }, i) => {
    const e = 6 + i * 16;
    // O lado de 256 se escreve 0
    saida[e] = lado >= 256 ? 0 : lado;
    saida[e + 1] = lado >= 256 ? 0 : lado;
    v.setUint16(e + 4, 1, true);
    v.setUint16(e + 6, 32, true);
    v.setUint32(e + 8, png.length, true);
    v.setUint32(e + 12, pos, true);
    saida.set(png, pos);
    pos += png.length;
  });
  return saida;
}
