// O PNG-8 (ADR 0003, onda 13.13): a imagem indexada num PNG de paleta (tipo de cor 3), com o tRNS no índice
// transparente e a resolução no pHYs, como o "Salvar para web" faz.
import { crc32 } from "../resolucao.ts";
import { juntar, textoEmBytes, zlib } from "./comum.ts";
import type { ImagemIndexada } from "./quantizar.ts";

function bloco(tipo: string, dados: Uint8Array): Uint8Array {
  const saida = new Uint8Array(12 + dados.length);
  const visao = new DataView(saida.buffer);
  visao.setUint32(0, dados.length);
  saida.set(textoEmBytes(tipo), 4);
  saida.set(dados, 8);
  visao.setUint32(8 + dados.length, crc32(saida.subarray(4, 8 + dados.length)));
  return saida;
}

export async function codificarPng8(imagem: ImagemIndexada, ppi?: number | null): Promise<Uint8Array> {
  const { largura, altura, indices, paleta, transparente } = imagem;
  // A menor profundidade em que a paleta cabe (1, 2, 4 ou 8 bits)
  const profundidade = paleta.length <= 2 ? 1 : paleta.length <= 4 ? 2 : paleta.length <= 16 ? 4 : 8;
  const porLinha = Math.ceil((largura * profundidade) / 8);
  const cru = new Uint8Array((porLinha + 1) * altura);
  for (let y = 0; y < altura; y++) {
    const base = y * (porLinha + 1) + 1;
    for (let x = 0; x < largura; x++) {
      const bit = x * profundidade;
      cru[base + (bit >> 3)] |= indices[y * largura + x] << (8 - profundidade - (bit & 7));
    }
  }
  const ihdr = new Uint8Array(13);
  const visao = new DataView(ihdr.buffer);
  visao.setUint32(0, largura);
  visao.setUint32(4, altura);
  ihdr.set([profundidade, 3, 0, 0, 0], 8);
  const partes = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco("IHDR", ihdr), bloco("PLTE", Uint8Array.from(paleta.flat()))];
  if (transparente !== null) {
    const trns = new Uint8Array(transparente + 1).fill(255);
    trns[transparente] = 0;
    partes.push(bloco("tRNS", trns));
  }
  if (ppi) {
    const phys = new Uint8Array(9);
    const v = new DataView(phys.buffer);
    v.setUint32(0, Math.round(ppi / 0.0254));
    v.setUint32(4, Math.round(ppi / 0.0254));
    phys[8] = 1;
    partes.push(bloco("pHYs", phys));
  }
  partes.push(bloco("IDAT", await zlib(cru)), bloco("IEND", new Uint8Array(0)));
  return juntar(partes);
}
