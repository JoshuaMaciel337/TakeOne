// O que os codificadores de imagem dividem: o zlib do navegador (CompressionStream "deflate" é o formato zlib, o que o
// PNG, o TIFF e o PDF pedem) e a junção de bytes.

export async function zlib(bytes: Uint8Array): Promise<Uint8Array> {
  const fluxo = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

export function juntar(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((soma, parte) => soma + parte.length, 0);
  const saida = new Uint8Array(total);
  let pos = 0;
  for (const parte of partes) {
    saida.set(parte, pos);
    pos += parte.length;
  }
  return saida;
}

export const textoEmBytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/** A imagem tem algum pixel que não é opaco. */
export function temTransparencia(rgba: Uint8ClampedArray | Uint8Array): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true;
  return false;
}
