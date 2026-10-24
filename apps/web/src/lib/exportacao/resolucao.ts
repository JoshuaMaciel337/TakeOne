// A resolução (pixels por polegada) gravada no arquivo exportado (ADR 0003, onda 13.6): o canvas não grava, então o
// PNG ganha o bloco pHYs logo depois do IHDR e o JPG tem a densidade do JFIF trocada. O WebP não tem um campo comum.

const TABELA_DO_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = TABELA_DO_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Os bytes do arquivo com a resolução; os de outro formato (ou já sem o lugar dela) voltam como estão. */
export function comResolucao(bytes: Uint8Array, formato: string, ppi: number): Uint8Array {
  if (formato === "png") {
    // A assinatura (8) e o IHDR (4 + 4 + 13 + 4)
    if (bytes.length < 33 || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return bytes;
    const porMetro = Math.round(ppi / 0.0254);
    const bloco = new Uint8Array(4 + 4 + 9 + 4);
    const visao = new DataView(bloco.buffer);
    visao.setUint32(0, 9);
    bloco.set([0x70, 0x48, 0x59, 0x73], 4);
    visao.setUint32(8, porMetro);
    visao.setUint32(12, porMetro);
    bloco[16] = 1;
    visao.setUint32(17, crc32(bloco.subarray(4, 17)));
    const saida = new Uint8Array(bytes.length + bloco.length);
    saida.set(bytes.subarray(0, 33));
    saida.set(bloco, 33);
    saida.set(bytes.subarray(33), 33 + bloco.length);
    return saida;
  }
  if (formato === "jpeg") {
    // SOI, APP0 com "JFIF\0", a versão, a unidade (1 = polegada) e as densidades
    if (bytes.length < 18 || bytes[2] !== 0xff || bytes[3] !== 0xe0 || String.fromCharCode(...bytes.subarray(6, 11)) !== "JFIF\0") return bytes;
    const saida = new Uint8Array(bytes);
    const densidade = Math.min(65535, Math.max(1, Math.round(ppi)));
    saida[13] = 1;
    saida[14] = densidade >> 8;
    saida[15] = densidade & 255;
    saida[16] = densidade >> 8;
    saida[17] = densidade & 255;
    return saida;
  }
  return bytes;
}
