// O TIFF (ADR 0003, onda 13.13): o básico da especificação 6.0, em little-endian, RGB ou RGBA de 8 bits (o alfa não
// associado), numa faixa só, sem compressão ou com a Deflate (o código 8, que os editores leem) e o previsor
// horizontal (a diferença para o vizinho comprime melhor), com a resolução em pixels por polegada.
import { temTransparencia, zlib } from "./comum.ts";

export type CompressaoDoTiff = "nenhuma" | "deflate";

type Campo = { tag: number; tipo: 3 | 4 | 5; valores: number[] };

const bytesDoCampo = (c: Campo) => (c.tipo === 3 ? 2 : c.tipo === 4 ? 4 : 4) * c.valores.length;

export async function codificarTiff(
  rgba: Uint8ClampedArray | Uint8Array,
  largura: number,
  altura: number,
  { compressao = "deflate", ppi = 72 }: { compressao?: CompressaoDoTiff; ppi?: number | null } = {},
): Promise<Uint8Array> {
  const alfa = temTransparencia(rgba);
  const canais = alfa ? 4 : 3;
  const cru = new Uint8Array(largura * altura * canais);
  for (let p = 0, o = 0; p < largura * altura; p++) for (let c = 0; c < canais; c++) cru[o++] = rgba[p * 4 + c];
  let dados: Uint8Array = cru;
  if (compressao === "deflate") {
    const previsto = new Uint8Array(cru.length);
    const porLinha = largura * canais;
    for (let y = 0; y < altura; y++)
      for (let i = 0; i < porLinha; i++) {
        const o = y * porLinha + i;
        previsto[o] = i < canais ? cru[o] : (cru[o] - cru[o - canais]) & 0xff;
      }
    dados = await zlib(previsto);
  }
  const resolucao = Math.max(1, Math.round(ppi ?? 72));
  // Os valores racionais (tipo 5) são pares numerador e denominador
  const campos: Campo[] = [
    { tag: 256, tipo: 4, valores: [largura] },
    { tag: 257, tipo: 4, valores: [altura] },
    { tag: 258, tipo: 3, valores: new Array(canais).fill(8) },
    { tag: 259, tipo: 3, valores: [compressao === "deflate" ? 8 : 1] },
    { tag: 262, tipo: 3, valores: [2] },
    { tag: 273, tipo: 4, valores: [8] },
    { tag: 277, tipo: 3, valores: [canais] },
    { tag: 278, tipo: 4, valores: [altura] },
    { tag: 279, tipo: 4, valores: [dados.length] },
    { tag: 282, tipo: 5, valores: [resolucao, 1] },
    { tag: 283, tipo: 5, valores: [resolucao, 1] },
    { tag: 284, tipo: 3, valores: [1] },
    { tag: 296, tipo: 3, valores: [2] },
    ...(compressao === "deflate" ? [{ tag: 317, tipo: 3 as const, valores: [2] }] : []),
    ...(alfa ? [{ tag: 338, tipo: 3 as const, valores: [2] }] : []),
  ];
  const inicioDoDiretorio = 8 + dados.length + (dados.length & 1);
  let fim = inicioDoDiretorio + 2 + campos.length * 12 + 4;
  // Os valores que não cabem nos 4 bytes do campo vão depois do diretório
  const fora = new Map<Campo, number>();
  for (const campo of campos)
    if (bytesDoCampo(campo) > 4) {
      fora.set(campo, fim);
      fim += bytesDoCampo(campo);
    }
  const saida = new Uint8Array(fim);
  const v = new DataView(saida.buffer);
  saida.set([0x49, 0x49, 42, 0], 0);
  v.setUint32(4, inicioDoDiretorio, true);
  saida.set(dados, 8);
  v.setUint16(inicioDoDiretorio, campos.length, true);
  const escrever = (pos: number, campo: Campo) =>
    campo.valores.forEach((valor, i) => (campo.tipo === 3 ? v.setUint16(pos + i * 2, valor, true) : v.setUint32(pos + i * 4, valor, true)));
  campos.forEach((campo, i) => {
    const pos = inicioDoDiretorio + 2 + i * 12;
    v.setUint16(pos, campo.tag, true);
    v.setUint16(pos + 2, campo.tipo, true);
    v.setUint32(pos + 4, campo.tipo === 5 ? campo.valores.length / 2 : campo.valores.length, true);
    const longe = fora.get(campo);
    if (longe !== undefined) {
      v.setUint32(pos + 8, longe, true);
      escrever(longe, campo);
    } else escrever(pos + 8, campo);
  });
  return saida;
}
