import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateSync } from "node:zlib";

import { codificarBmp } from "./bmp.ts";
import { codificarGif, lzw } from "./gif.ts";
import { codificarIco } from "./ico.ts";
import { codificarPdf } from "./pdf.ts";
import { codificarPng8 } from "./png8.ts";
import { indexar, OPCOES_PADRAO_DA_PALETA, rgbaDaIndexada } from "./quantizar.ts";
import { codificarTiff } from "./tiff.ts";

/** O LZW do GIF de volta (a especificação, escrita à parte para conferir o codificador). */
function deslzw(dados: Uint8Array, bitsMinimos: number): number[] {
  const limpar = 1 << bitsMinimos;
  const fim = limpar + 1;
  let largura = bitsMinimos + 1;
  let tabela: number[][] = [];
  const reiniciar = () => {
    tabela = Array.from({ length: limpar }, (_, i) => [i]);
    tabela.push([], []);
    largura = bitsMinimos + 1;
  };
  reiniciar();
  const saida: number[] = [];
  let pos = 0;
  let anterior: number[] | null = null;
  const ler = () => {
    let v = 0;
    for (let i = 0; i < largura; i++, pos++) v |= ((dados[pos >> 3] >> (pos & 7)) & 1) << i;
    return v;
  };
  for (;;) {
    const codigo = ler();
    if (codigo === limpar) {
      reiniciar();
      anterior = null;
      continue;
    }
    if (codigo === fim) break;
    let entrada: number[];
    if (codigo < tabela.length) entrada = tabela[codigo];
    else entrada = [...anterior!, anterior![0]];
    saida.push(...entrada);
    if (anterior) tabela.push([...anterior, entrada[0]]);
    anterior = entrada;
    if (tabela.length === 1 << largura && largura < 12) largura++;
  }
  return saida;
}

function imagemDeTeste(l: number, a: number) {
  const rgba = new Uint8ClampedArray(l * a * 4);
  for (let y = 0; y < a; y++)
    for (let x = 0; x < l; x++) {
      const i = (y * l + x) * 4;
      rgba.set([(x * 255) / (l - 1), (y * 255) / (a - 1), 128, x < 3 && y < 3 ? 0 : 255], i);
    }
  return rgba;
}

test("a paleta exata quando a imagem tem poucas cores, e o índice transparente", () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 9, 9, 0]);
  const imagem = indexar(rgba, 2, 2, { ...OPCOES_PADRAO_DA_PALETA, pontilhado: "nenhum" });
  assert.equal(imagem.transparente, 3);
  assert.deepEqual(Array.from(rgbaDaIndexada(imagem)), [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0]);
  const pb = indexar(rgba, 2, 2, { ...OPCOES_PADRAO_DA_PALETA, paleta: "preto_branco", transparencia: false, pontilhado: "nenhum" });
  assert.equal(pb.paleta.length, 2);
});

test("o pontilhado guarda a média de um degradê com poucas cores", () => {
  const l = 128;
  const rgba = new Uint8ClampedArray(l * 8 * 4);
  for (let y = 0; y < 8; y++) for (let x = 0; x < l; x++) rgba.set([x * 2, x * 2, x * 2, 255], (y * l + x) * 4);
  for (const pontilhado of ["difusao", "padrao"] as const) {
    const volta = rgbaDaIndexada(indexar(rgba, l, 8, { ...OPCOES_PADRAO_DA_PALETA, paleta: "cinza", cores: 4, pontilhado, transparencia: false }));
    let erro = 0;
    // A média de cada bloco de 16 colunas fica perto da original
    for (let bloco = 0; bloco < l / 16; bloco++) {
      let soma = 0;
      let original = 0;
      for (let y = 0; y < 8; y++)
        for (let x = bloco * 16; x < bloco * 16 + 16; x++) {
          soma += volta[(y * l + x) * 4];
          original += rgba[(y * l + x) * 4];
        }
      erro = Math.max(erro, Math.abs(soma - original) / 128);
    }
    assert.ok(erro < 12, `${pontilhado}: ${erro}`);
  }
});

test("o LZW volta igual, também depois de encher o dicionário", () => {
  const indices = new Uint8Array(40000);
  let s = 7;
  for (let i = 0; i < indices.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    indices[i] = i % 3 === 0 ? (s >> 16) & 255 : indices[Math.max(0, i - 1)];
  }
  assert.deepEqual(deslzw(lzw(indices, 8), 8), Array.from(indices));
  const pequenos = Uint8Array.from({ length: 999 }, (_, i) => i % 4);
  assert.deepEqual(deslzw(lzw(pequenos, 2), 2), Array.from(pequenos));
});

test("o GIF tem o cabeçalho, a tabela, a transparência e os pixels", () => {
  const imagem = indexar(imagemDeTeste(40, 30), 40, 30, { ...OPCOES_PADRAO_DA_PALETA, cores: 16 });
  const gif = codificarGif(imagem);
  assert.equal(String.fromCharCode(...gif.subarray(0, 6)), "GIF89a");
  const n = (gif[10] & 7) + 1;
  let pos = 13 + 3 * (1 << n);
  assert.equal(gif[pos], 0x21);
  assert.equal(gif[pos + 6], imagem.transparente);
  pos += 8;
  assert.equal(gif[pos], 0x2c);
  pos += 10;
  const bitsMinimos = gif[pos++];
  const blocos: number[] = [];
  while (gif[pos]) {
    blocos.push(...gif.subarray(pos + 1, pos + 1 + gif[pos]));
    pos += gif[pos] + 1;
  }
  assert.deepEqual(deslzw(Uint8Array.from(blocos), bitsMinimos), Array.from(imagem.indices));
  assert.equal(gif[gif.length - 1], 0x3b);
});

test("o PNG-8 tem a paleta, o tRNS e os índices", async () => {
  const imagem = indexar(imagemDeTeste(21, 9), 21, 9, { ...OPCOES_PADRAO_DA_PALETA, cores: 8 });
  const png = await codificarPng8(imagem, 300);
  const blocos = new Map<string, Uint8Array>();
  for (let pos = 8; pos < png.length; ) {
    const tamanho = new DataView(png.buffer, png.byteOffset).getUint32(pos);
    blocos.set(String.fromCharCode(...png.subarray(pos + 4, pos + 8)), png.subarray(pos + 8, pos + 8 + tamanho));
    pos += 12 + tamanho;
  }
  assert.equal(blocos.get("IHDR")![8], 4);
  assert.equal(blocos.get("PLTE")!.length, imagem.paleta.length * 3);
  assert.equal(blocos.get("tRNS")![imagem.transparente!], 0);
  assert.equal(new DataView(blocos.get("pHYs")!.buffer, blocos.get("pHYs")!.byteOffset).getUint32(0), Math.round(300 / 0.0254));
  const cru = inflateSync(blocos.get("IDAT")!);
  const porLinha = Math.ceil((21 * 4) / 8);
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 21; x++) {
      const byte = cru[y * (porLinha + 1) + 1 + (x >> 1)];
      assert.equal(x & 1 ? byte & 15 : byte >> 4, imagem.indices[y * 21 + x]);
    }
});

test("o BMP guarda os pixels de baixo para cima, com e sem alfa", () => {
  const rgba = imagemDeTeste(5, 3);
  const bmp = codificarBmp(rgba, 5, 3);
  const v = new DataView(bmp.buffer);
  assert.equal(v.getUint16(28, true), 32);
  const inicio = v.getUint32(10, true);
  // O pixel (1, 0) está na última linha do arquivo
  const o = inicio + 2 * 20 + 1 * 4;
  assert.deepEqual([bmp[o + 2], bmp[o + 1], bmp[o], bmp[o + 3]], Array.from(rgba.subarray(4, 8)));
  const opaca = imagemDeTeste(5, 3).map((valor, i) => (i % 4 === 3 ? 255 : valor));
  const bmp24 = codificarBmp(opaca, 5, 3);
  assert.equal(new DataView(bmp24.buffer).getUint16(28, true), 24);
  // Linhas de 15 bytes viram 16
  assert.equal(bmp24.length, 54 + 16 * 3);
});

test("o TIFF com Deflate e previsor volta aos mesmos pixels", async () => {
  const rgba = imagemDeTeste(13, 7);
  const tiff = await codificarTiff(rgba, 13, 7, { ppi: 150 });
  const v = new DataView(tiff.buffer);
  assert.equal(String.fromCharCode(tiff[0], tiff[1]), "II");
  const dir = v.getUint32(4, true);
  const campos = new Map<number, { tipo: number; n: number; valor: number }>();
  for (let i = 0; i < v.getUint16(dir, true); i++) {
    const pos = dir + 2 + i * 12;
    const tipo = v.getUint16(pos + 2, true);
    campos.set(v.getUint16(pos, true), { tipo, n: v.getUint32(pos + 4, true), valor: tipo === 3 ? v.getUint16(pos + 8, true) : v.getUint32(pos + 8, true) });
  }
  assert.equal(campos.get(256)!.valor, 13);
  assert.equal(campos.get(277)!.valor, 4);
  assert.equal(campos.get(338)!.valor, 2);
  assert.equal(v.getUint32(campos.get(282)!.valor, true), 150);
  const comprimido = tiff.subarray(campos.get(273)!.valor, campos.get(273)!.valor + campos.get(279)!.valor);
  const previsto = inflateSync(comprimido);
  for (let y = 0; y < 7; y++) for (let i = 4; i < 13 * 4; i++) previsto[y * 52 + i] = (previsto[y * 52 + i] + previsto[y * 52 + i - 4]) & 255;
  assert.deepEqual(Array.from(previsto), Array.from(rgba));
});

test("o ICO aponta para cada PNG", () => {
  const a = Uint8Array.from([1, 2, 3]);
  const b = Uint8Array.from([4, 5]);
  const ico = codificarIco([
    { lado: 16, png: a },
    { lado: 256, png: b },
  ]);
  const v = new DataView(ico.buffer);
  assert.equal(v.getUint16(4, true), 2);
  assert.equal(ico[6], 16);
  assert.equal(ico[22], 0);
  assert.deepEqual(Array.from(ico.subarray(v.getUint32(18, true), v.getUint32(18, true) + 3)), [1, 2, 3]);
  assert.deepEqual(Array.from(ico.subarray(v.getUint32(34, true), v.getUint32(34, true) + 2)), [4, 5]);
});

test("o PDF tem a tabela de posições certa e a página do tamanho da imagem", () => {
  const pdf = codificarPdf(
    [
      { largura: 300, altura: 150, ppi: 300, imagem: { tipo: "jpeg", bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]) }, alfa: Uint8Array.from([1, 2]) },
      { largura: 72, altura: 72, ppi: 72, imagem: { tipo: "flate", bytes: Uint8Array.from([9]) } },
    ],
    "Ação",
  );
  const texto = Buffer.from(pdf).toString("latin1");
  assert.ok(texto.startsWith("%PDF-1.4"));
  assert.ok(texto.includes("/MediaBox [0 0 72 36]"));
  assert.ok(texto.includes("/MediaBox [0 0 72 72]"));
  assert.ok(texto.includes("/Count 2"));
  const inicioDoXref = Number(/startxref\n(\d+)/.exec(texto)![1]);
  assert.ok(texto.slice(inicioDoXref).startsWith("xref"));
  const linhas = texto.slice(inicioDoXref).split("\n").slice(3).filter((l) => / n $/.test(l));
  linhas.forEach((linha, i) => assert.ok(texto.slice(Number(linha.slice(0, 10))).startsWith(`${i + 1} 0 obj`), `objeto ${i + 1}`));
  assert.ok(texto.includes("/Title <FEFF004100E700E3006F>"));
});
