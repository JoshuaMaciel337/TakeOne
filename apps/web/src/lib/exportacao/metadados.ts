// As informações do arquivo nos arquivos exportados (ADR 0003, onda 13.13): o título, o autor, a descrição, as
// palavras-chave, os direitos e o endereço viram um pacote XMP (o padrão que os editores e os bancos de imagem leem) e,
// onde o formato tem campos próprios, também eles: o tEXt/iTXt do PNG, o segmento APP1 do JPG, o bloco "XMP " do WebP
// (que passa ao formato estendido, com o VP8X), as etiquetas do TIFF e o dicionário de informações do PDF.
import { crc32 } from "./resolucao.ts";
import { juntar, textoEmBytes } from "./formatos/comum.ts";

export type InformacoesDoArquivo = {
  titulo: string;
  autor: string;
  descricao: string;
  palavras_chave: string[];
  direitos: string;
  situacao_direitos: "desconhecido" | "protegido" | "dominio_publico";
  url: string;
};

export const INFORMACOES_VAZIAS: InformacoesDoArquivo = { titulo: "", autor: "", descricao: "", palavras_chave: [], direitos: "", situacao_direitos: "desconhecido", url: "" };

export function temInformacoes(info: InformacoesDoArquivo | null | undefined): info is InformacoesDoArquivo {
  return Boolean(info && (info.titulo || info.autor || info.descricao || info.palavras_chave.length || info.direitos || info.url || info.situacao_direitos !== "desconhecido"));
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const utf8 = (s: string) => new TextEncoder().encode(s);

/** O pacote XMP (UTF-8, com o cabeçalho e o rodapé de pacote). */
export function xmpDasInformacoes(info: InformacoesDoArquivo): string {
  const alt = (nome: string, valor: string) => (valor ? `<${nome}><rdf:Alt><rdf:li xml:lang="x-default">${xml(valor)}</rdf:li></rdf:Alt></${nome}>` : "");
  const marcado = info.situacao_direitos === "protegido" ? "<xmpRights:Marked>True</xmpRights:Marked>" : info.situacao_direitos === "dominio_publico" ? "<xmpRights:Marked>False</xmpRights:Marked>" : "";
  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/">',
    "<xmp:CreatorTool>TakeOne</xmp:CreatorTool>",
    alt("dc:title", info.titulo),
    info.autor ? `<dc:creator><rdf:Seq><rdf:li>${xml(info.autor)}</rdf:li></rdf:Seq></dc:creator>` : "",
    alt("dc:description", info.descricao),
    info.palavras_chave.length ? `<dc:subject><rdf:Bag>${info.palavras_chave.map((p) => `<rdf:li>${xml(p)}</rdf:li>`).join("")}</rdf:Bag></dc:subject>` : "",
    alt("dc:rights", info.direitos),
    marcado,
    info.url ? `<xmpRights:WebStatement>${xml(info.url)}</xmpRights:WebStatement>` : "",
    "</rdf:Description></rdf:RDF></x:xmpmeta>",
    '<?xpacket end="w"?>',
  ].join("");
}

// ——— PNG ———
function blocoPng(tipo: string, dados: Uint8Array): Uint8Array {
  const saida = new Uint8Array(12 + dados.length);
  const v = new DataView(saida.buffer);
  v.setUint32(0, dados.length);
  saida.set(textoEmBytes(tipo), 4);
  saida.set(dados, 8);
  v.setUint32(8 + dados.length, crc32(saida.subarray(4, 8 + dados.length)));
  return saida;
}

/** Um iTXt sem compressão: palavra-chave, nulo, sem compressão, método, idioma vazio, nulo, chave traduzida vazia, nulo, texto. */
function itxt(chave: string, texto: string): Uint8Array {
  return blocoPng("iTXt", juntar([textoEmBytes(chave), Uint8Array.from([0, 0, 0, 0, 0]), utf8(texto)]));
}

function noPng(bytes: Uint8Array, info: InformacoesDoArquivo): Uint8Array {
  if (bytes.length < 33 || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return bytes;
  const fimDoIhdr = 8 + 25;
  const blocos = [
    itxt("XML:com.adobe.xmp", xmpDasInformacoes(info)),
    ...(info.titulo ? [itxt("Title", info.titulo)] : []),
    ...(info.autor ? [itxt("Author", info.autor)] : []),
    ...(info.descricao ? [itxt("Description", info.descricao)] : []),
    ...(info.direitos ? [itxt("Copyright", info.direitos)] : []),
    itxt("Software", "TakeOne"),
  ];
  return juntar([bytes.subarray(0, fimDoIhdr), ...blocos, bytes.subarray(fimDoIhdr)]);
}

// ——— JPG ———
function noJpg(bytes: Uint8Array, info: InformacoesDoArquivo): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const corpo = juntar([textoEmBytes("http://ns.adobe.com/xap/1.0/"), Uint8Array.from([0]), utf8(xmpDasInformacoes(info))]);
  // O segmento tem no máximo 64 KB; um XMP maior que isso fica de fora
  if (corpo.length + 2 > 0xffff) return bytes;
  const segmento = new Uint8Array(4 + corpo.length);
  segmento.set([0xff, 0xe1, (corpo.length + 2) >> 8, (corpo.length + 2) & 0xff]);
  segmento.set(corpo, 4);
  // Depois do APP0 (JFIF), quando há um
  let pos = 2;
  if (bytes[2] === 0xff && bytes[3] === 0xe0) pos = 4 + ((bytes[4] << 8) | bytes[5]);
  return juntar([bytes.subarray(0, pos), segmento, bytes.subarray(pos)]);
}

// ——— WebP ———
function blocoRiff(tipo: string, dados: Uint8Array): Uint8Array {
  const saida = new Uint8Array(8 + dados.length + (dados.length & 1));
  saida.set(textoEmBytes(tipo), 0);
  new DataView(saida.buffer).setUint32(4, dados.length, true);
  saida.set(dados, 8);
  return saida;
}

function noWebp(bytes: Uint8Array, info: InformacoesDoArquivo, largura: number, altura: number): Uint8Array {
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.subarray(8, 12)) !== "WEBP") return bytes;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const blocos: { tipo: string; dados: Uint8Array }[] = [];
  for (let pos = 12; pos + 8 <= bytes.length; ) {
    const tamanho = v.getUint32(pos + 4, true);
    blocos.push({ tipo: String.fromCharCode(...bytes.subarray(pos, pos + 4)), dados: bytes.subarray(pos + 8, pos + 8 + tamanho) });
    pos += 8 + tamanho + (tamanho & 1);
  }
  let vp8x = blocos.find((b) => b.tipo === "VP8X");
  if (!vp8x) {
    // O formato simples passa ao estendido: a tela e a transparência (o VP8L diz no cabeçalho; o VP8 com ALPH também)
    const vp8l = blocos.find((b) => b.tipo === "VP8L");
    const alfa = Boolean(blocos.some((b) => b.tipo === "ALPH") || (vp8l && (vp8l.dados[4] >> 4) & 1));
    const dados = new Uint8Array(10);
    dados[0] = alfa ? 0x10 : 0;
    const l = largura - 1;
    const a = altura - 1;
    dados.set([l & 255, (l >> 8) & 255, (l >> 16) & 255, a & 255, (a >> 8) & 255, (a >> 16) & 255], 4);
    vp8x = { tipo: "VP8X", dados };
    blocos.unshift(vp8x);
  }
  const marcas = new Uint8Array(vp8x.dados);
  marcas[0] |= 0x04;
  vp8x.dados = marcas;
  const corpo = juntar([...blocos.filter((b) => b.tipo !== "XMP ").map((b) => blocoRiff(b.tipo, b.dados)), blocoRiff("XMP ", utf8(xmpDasInformacoes(info)))]);
  const saida = new Uint8Array(12 + corpo.length);
  saida.set(textoEmBytes("RIFF"), 0);
  new DataView(saida.buffer).setUint32(4, 4 + corpo.length, true);
  saida.set(textoEmBytes("WEBP"), 8);
  saida.set(corpo, 12);
  return saida;
}

/** Os bytes do arquivo com as informações; os formatos sem lugar para elas voltam como estão. */
export function comInformacoes(bytes: Uint8Array, formato: "png" | "jpeg" | "webp", info: InformacoesDoArquivo, tamanho: { largura: number; altura: number }): Uint8Array {
  if (formato === "png") return noPng(bytes, info);
  if (formato === "jpeg") return noJpg(bytes, info);
  return noWebp(bytes, info, tamanho.largura, tamanho.altura);
}

/** O texto em ASCII de 7 bits (o que a norma do TIFF pede nas etiquetas de texto): sem acentos, © vira (c). */
export function emAscii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/©/g, "(c)")
    .replace(/®/g, "(R)")
    .replace(/[^\x20-\x7e\n\t]/g, "?");
}

/** As etiquetas de texto do TIFF (descrição, autor, direitos, em ASCII) e o XMP (a 700, com o texto inteiro). */
export function etiquetasDoTiff(info: InformacoesDoArquivo): { tag: number; tipo: 1 | 2; bytes: Uint8Array }[] {
  const texto = (s: string) => juntar([textoEmBytes(emAscii(s)), Uint8Array.from([0])]);
  return [
    ...(info.descricao || info.titulo ? [{ tag: 270, tipo: 2 as const, bytes: texto(info.descricao || info.titulo) }] : []),
    { tag: 305, tipo: 2 as const, bytes: texto("TakeOne") },
    ...(info.autor ? [{ tag: 315, tipo: 2 as const, bytes: texto(info.autor) }] : []),
    { tag: 700, tipo: 1 as const, bytes: utf8(xmpDasInformacoes(info)) },
    ...(info.direitos ? [{ tag: 33432, tipo: 2 as const, bytes: texto(info.direitos) }] : []),
  ];
}
