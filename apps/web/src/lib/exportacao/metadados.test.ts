import assert from "node:assert/strict";
import { test } from "node:test";

import { codificarPng8 } from "./formatos/png8.ts";
import { comInformacoes, emAscii, etiquetasDoTiff, INFORMACOES_VAZIAS, temInformacoes, xmpDasInformacoes } from "./metadados.ts";
import { crc32 } from "./resolucao.ts";

const info = { ...INFORMACOES_VAZIAS, titulo: "Cartaz <verão>", autor: "Equipe & Cia", palavras_chave: ["promoção", "loja"], direitos: "© 2026", situacao_direitos: "protegido" as const, url: "https://exemplo.com.br" };

test("o XMP traz os campos, escapados", () => {
  const xmp = xmpDasInformacoes(info);
  assert.ok(xmp.includes('<rdf:li xml:lang="x-default">Cartaz &lt;verão&gt;</rdf:li>'));
  assert.ok(xmp.includes("<rdf:li>Equipe &amp; Cia</rdf:li>"));
  assert.ok(xmp.includes("<rdf:Bag><rdf:li>promoção</rdf:li><rdf:li>loja</rdf:li></rdf:Bag>"));
  assert.ok(xmp.includes("<xmpRights:Marked>True</xmpRights:Marked>"));
  assert.ok(!xmp.includes("dc:description"), "o que está vazio não entra");
  assert.equal(temInformacoes(INFORMACOES_VAZIAS), false);
  assert.equal(temInformacoes(info), true);
});

test("no PNG, os iTXt vêm logo depois do IHDR, com o CRC certo", async () => {
  const png = await codificarPng8({ largura: 2, altura: 1, indices: Uint8Array.from([0, 1]), paleta: [[0, 0, 0], [255, 255, 255]], transparente: null });
  const com = comInformacoes(png, "png", info, { largura: 2, altura: 1 });
  const v = new DataView(com.buffer);
  const blocos: string[] = [];
  for (let pos = 8; pos < com.length; ) {
    const tamanho = v.getUint32(pos);
    const tipo = String.fromCharCode(...com.subarray(pos + 4, pos + 8));
    assert.equal(v.getUint32(pos + 8 + tamanho), crc32(com.subarray(pos + 4, pos + 8 + tamanho)), tipo);
    if (tipo === "iTXt") blocos.push(new TextDecoder().decode(com.subarray(pos + 8, pos + 8 + tamanho)).split("\0")[0]);
    else blocos.push(tipo);
    pos += 12 + tamanho;
  }
  assert.deepEqual(blocos.slice(0, 7), ["IHDR", "XML:com.adobe.xmp", "Title", "Author", "Copyright", "Software", "PLTE"]);
});

test("no JPG, o APP1 do XMP vem depois do JFIF", () => {
  const jfif = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...new Array(14).fill(0), 0xff, 0xdb, 0, 2, 0xff, 0xd9]);
  const com = comInformacoes(jfif, "jpeg", info, { largura: 1, altura: 1 });
  assert.deepEqual(Array.from(com.subarray(20, 22)), [0xff, 0xe1]);
  const tamanho = (com[22] << 8) | com[23];
  const corpo = new TextDecoder().decode(com.subarray(24, 22 + tamanho));
  assert.ok(corpo.startsWith("http://ns.adobe.com/xap/1.0/\0<?xpacket"));
  assert.deepEqual(Array.from(com.subarray(22 + tamanho, 22 + tamanho + 2)), [0xff, 0xdb]);
});

test("as etiquetas do TIFF terminam no nulo e o XMP é a 700", () => {
  const etiquetas = etiquetasDoTiff(info);
  assert.deepEqual(
    etiquetas.map((e) => e.tag),
    [270, 305, 315, 700, 33432],
  );
  assert.equal(etiquetas.find((e) => e.tag === 315)!.bytes.at(-1), 0);
  assert.equal(new TextDecoder().decode(etiquetas.find((e) => e.tag === 33432)!.bytes), "(c) 2026\0");
  assert.equal(emAscii("Peça de verão ©"), "Peca de verao (c)");
});
