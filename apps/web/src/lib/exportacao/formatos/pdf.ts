// O PDF de imagens (ADR 0003, onda 13.13): uma página por imagem, do tamanho dela na resolução do documento (os
// pontos são 1/72 de polegada), com a imagem em JPEG (DCTDecode) ou sem perda (Flate), e a transparência numa máscara
// suave (SMask) à parte. Serve à exportação da imagem e às pranchetas num PDF só.
import { juntar, textoEmBytes } from "./comum.ts";

export type PaginaDoPdf = {
  largura: number;
  altura: number;
  /** Pixels por polegada: o tamanho da página em pontos sai daqui. */
  ppi: number;
  /** A cor: o JPEG inteiro, ou o RGB de 8 bits já no zlib. */
  imagem: { tipo: "jpeg"; bytes: Uint8Array } | { tipo: "flate"; bytes: Uint8Array };
  /** O alfa em cinza de 8 bits, já no zlib (sem ele, a imagem é opaca). */
  alfa?: Uint8Array | null;
};

/** O texto em UTF-16 com a marca de ordem, em hexadecimal: vale para qualquer acento. */
function textoDoPdf(s: string): string {
  let hex = "FEFF";
  for (const c of s) {
    const codigo = c.codePointAt(0)!;
    if (codigo > 0xffff) {
      const v = codigo - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, "0") + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, "0");
    } else hex += codigo.toString(16).padStart(4, "0");
  }
  return `<${hex.toUpperCase()}>`;
}

const numero = (v: number) => (Math.round(v * 1000) / 1000).toString();

/** O dicionário de informações do PDF (o título, o autor, o assunto e as palavras-chave). */
export type InfoDoPdf = { titulo?: string; autor?: string; assunto?: string; palavras?: string };

export function codificarPdf(paginas: PaginaDoPdf[], info: InfoDoPdf = {}): Uint8Array {
  const objetos: Uint8Array[] = [];
  // Os números dos objetos: 1 catálogo, 2 páginas, 3 informações, e de 4 em diante, cada página com os seus
  const reservar = () => objetos.push(new Uint8Array(0));
  reservar();
  reservar();
  reservar();
  const definir = (n: number, partes: (string | Uint8Array)[]) => {
    objetos[n - 1] = juntar([textoEmBytes(`${n} 0 obj\n`), ...partes.map((p) => (typeof p === "string" ? textoEmBytes(p) : p)), textoEmBytes("\nendobj\n")]);
  };
  const filhas: number[] = [];
  for (const pagina of paginas) {
    const nPagina = objetos.length + 1;
    reservar();
    const nConteudo = objetos.length + 1;
    reservar();
    const nImagem = objetos.length + 1;
    reservar();
    const nAlfa = pagina.alfa ? objetos.length + 1 : 0;
    if (pagina.alfa) reservar();
    const largura = (pagina.largura * 72) / pagina.ppi;
    const altura = (pagina.altura * 72) / pagina.ppi;
    const desenho = textoEmBytes(`q ${numero(largura)} 0 0 ${numero(altura)} 0 0 cm /Im0 Do Q`);
    definir(nPagina, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${numero(largura)} ${numero(altura)}] /Resources << /XObject << /Im0 ${nImagem} 0 R >> >> /Contents ${nConteudo} 0 R >>`]);
    definir(nConteudo, [`<< /Length ${desenho.length} >>\nstream\n`, desenho, "\nendstream"]);
    const filtro = pagina.imagem.tipo === "jpeg" ? "/DCTDecode" : "/FlateDecode";
    definir(nImagem, [
      `<< /Type /XObject /Subtype /Image /Width ${pagina.largura} /Height ${pagina.altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filtro}${nAlfa ? ` /SMask ${nAlfa} 0 R` : ""} /Length ${pagina.imagem.bytes.length} >>\nstream\n`,
      pagina.imagem.bytes,
      "\nendstream",
    ]);
    if (pagina.alfa)
      definir(nAlfa, [`<< /Type /XObject /Subtype /Image /Width ${pagina.largura} /Height ${pagina.altura} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${pagina.alfa.length} >>\nstream\n`, pagina.alfa, "\nendstream"]);
    filhas.push(nPagina);
  }
  definir(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  definir(2, [`<< /Type /Pages /Kids [${filhas.map((n) => `${n} 0 R`).join(" ")}] /Count ${filhas.length} >>`]);
  const campos: [string, string | undefined][] = [["Title", info.titulo], ["Author", info.autor], ["Subject", info.assunto], ["Keywords", info.palavras]];
  definir(3, [`<< /Producer ${textoDoPdf("TakeOne")}${campos.map(([chave, valor]) => (valor ? ` /${chave} ${textoDoPdf(valor)}` : "")).join("")} >>`]);
  // O cabeçalho com bytes acima de 127 avisa que o arquivo é binário
  const cabecalho = juntar([textoEmBytes("%PDF-1.4\n%"), Uint8Array.from([0xe2, 0xe3, 0xcf, 0xd3]), textoEmBytes("\n")]);
  const posicoes: number[] = [];
  let pos = cabecalho.length;
  for (const objeto of objetos) {
    posicoes.push(pos);
    pos += objeto.length;
  }
  const xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posicoes.map((p) => `${p.toString().padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  return juntar([cabecalho, ...objetos, textoEmBytes(xref)]);
}
