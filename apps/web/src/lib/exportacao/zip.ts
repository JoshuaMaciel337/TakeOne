// Um ZIP sem compressão (o método "armazenado"): as pranchetas exportadas saem num arquivo só, e o PNG, o JPG e o WebP
// já vêm comprimidos. Os nomes vão em UTF-8 (o bit 11 das opções).
import { crc32 } from "./resolucao.ts";

export function zipSemCompressao(arquivos: { nome: string; dados: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const codificador = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let posicao = 0;
  // 1º de janeiro de 2026, 00:00, no formato do DOS (a data não importa para quem abre)
  const hora = 0;
  const data = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const arquivo of arquivos) {
    const nome = codificador.encode(arquivo.nome);
    const crc = crc32(arquivo.dados);
    const local = new Uint8Array(30 + nome.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true);
    l.setUint16(8, 0, true);
    l.setUint16(10, hora, true);
    l.setUint16(12, data, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, arquivo.dados.length, true);
    l.setUint32(22, arquivo.dados.length, true);
    l.setUint16(26, nome.length, true);
    l.setUint16(28, 0, true);
    local.set(nome, 30);
    const entrada = new Uint8Array(46 + nome.length);
    const c = new DataView(entrada.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, data, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, arquivo.dados.length, true);
    c.setUint32(24, arquivo.dados.length, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, posicao, true);
    entrada.set(nome, 46);
    partes.push(local, arquivo.dados);
    central.push(entrada);
    posicao += local.length + arquivo.dados.length;
  }
  const tamanhoCentral = central.reduce((soma, item) => soma + item.length, 0);
  const fim = new Uint8Array(22);
  const f = new DataView(fim.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, arquivos.length, true);
  f.setUint16(10, arquivos.length, true);
  f.setUint32(12, tamanhoCentral, true);
  f.setUint32(16, posicao, true);
  const saida = new Uint8Array(posicao + tamanhoCentral + 22);
  let onde = 0;
  for (const parte of [...partes, ...central, fim]) {
    saida.set(parte, onde);
    onde += parte.length;
  }
  return saida;
}
