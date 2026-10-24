// O GIF de um quadro (ADR 0003, onda 13.13): GIF89a com a paleta da imagem indexada, a transparência de um índice
// e os pixels comprimidos pelo LZW de códigos variáveis (até 12 bits), na especificação de 1989.
import type { ImagemIndexada } from "./quantizar.ts";

class Escritor {
  private partes: number[] = [];
  byte(v: number) {
    this.partes.push(v & 0xff);
  }
  palavra(v: number) {
    this.byte(v);
    this.byte(v >> 8);
  }
  bytes(lista: ArrayLike<number>) {
    for (let i = 0; i < lista.length; i++) this.partes.push(lista[i]);
  }
  texto(s: string) {
    for (const c of s) this.byte(c.charCodeAt(0));
  }
  pronto() {
    return Uint8Array.from(this.partes);
  }
}

/** Os códigos do LZW em bytes, do bit menos significativo para o mais. */
export function lzw(indices: Uint8Array, bitsMinimos: number): Uint8Array {
  const limpar = 1 << bitsMinimos;
  const fim = limpar + 1;
  const saida: number[] = [];
  let acumulado = 0;
  let bits = 0;
  let largura = bitsMinimos + 1;
  const emitir = (codigo: number) => {
    acumulado |= codigo << bits;
    bits += largura;
    while (bits >= 8) {
      saida.push(acumulado & 0xff);
      acumulado >>>= 8;
      bits -= 8;
    }
  };
  // O dicionário: (prefixo << 8 | índice) → código
  let dicionario = new Map<number, number>();
  let proximo = fim + 1;
  emitir(limpar);
  if (!indices.length) {
    emitir(fim);
    if (bits) saida.push(acumulado & 0xff);
    return Uint8Array.from(saida);
  }
  let prefixo = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const chave = (prefixo << 8) | k;
    const achado = dicionario.get(chave);
    if (achado !== undefined) {
      prefixo = achado;
      continue;
    }
    emitir(prefixo);
    if (proximo < 4096) {
      dicionario.set(chave, proximo++);
      // O código seguinte já não cabe: cresce a largura (o decodificador cresce no mesmo ponto)
      if (proximo > 1 << largura && largura < 12) largura++;
    } else {
      emitir(limpar);
      dicionario = new Map();
      proximo = fim + 1;
      largura = bitsMinimos + 1;
    }
    prefixo = k;
  }
  emitir(prefixo);
  emitir(fim);
  if (bits) saida.push(acumulado & 0xff);
  return Uint8Array.from(saida);
}

/** O arquivo GIF da imagem indexada. */
export function codificarGif(imagem: ImagemIndexada): Uint8Array {
  const { largura, altura, indices, paleta, transparente } = imagem;
  // A tabela de cores tem 2^n entradas (n de 1 a 8)
  let n = 1;
  while (1 << n < paleta.length) n++;
  const e = new Escritor();
  e.texto("GIF89a");
  e.palavra(largura);
  e.palavra(altura);
  e.byte(0x80 | ((n - 1) << 4) | (n - 1));
  e.byte(0);
  e.byte(0);
  for (let i = 0; i < 1 << n; i++) {
    const [r, g, b] = paleta[i] ?? [0, 0, 0];
    e.bytes([r, g, b]);
  }
  if (transparente !== null) {
    // Controle gráfico: só a transparência
    e.bytes([0x21, 0xf9, 4, 0x01, 0, 0, transparente, 0]);
  }
  e.byte(0x2c);
  e.palavra(0);
  e.palavra(0);
  e.palavra(largura);
  e.palavra(altura);
  e.byte(0);
  const bitsMinimos = Math.max(2, n);
  e.byte(bitsMinimos);
  const dados = lzw(indices, bitsMinimos);
  for (let i = 0; i < dados.length; i += 255) {
    const bloco = dados.subarray(i, i + 255);
    e.byte(bloco.length);
    e.bytes(bloco);
  }
  e.byte(0);
  e.byte(0x3b);
  return e.pronto();
}
