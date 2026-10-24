// A leitura dos arquivos de padrões (.pat) do editor de imagem profissional (ADR 0003, onda 13.5), pela especificação
// pública do formato: "8BPT", a versão (1) e a contagem; cada padrão tem o modo de cor, o tamanho, o nome (UTF-16),
// um id e a lista de canais ("virtual memory array list"), cada canal cru ou em PackBits, linha a linha. Saem os modos
// tons de cinza, cores indexadas, RGB e CMYK, em 8 ou 16 bits; o primeiro canal escrito depois dos de cor, do mesmo
// tamanho, é a transparência.

export type PadraoLido = { nome: string; largura: number; altura: number; rgba: Uint8ClampedArray<ArrayBuffer> };

const CANAIS_DO_MODO: Record<number, number> = { 1: 1, 2: 1, 3: 3, 4: 4 };

class Leitor {
  pos = 0;
  private readonly visao: DataView;
  readonly bytes: Uint8Array;
  constructor(buffer: ArrayBuffer) {
    this.visao = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
  }
  private conferir(n: number) {
    if (this.pos + n > this.bytes.length) throw new Error("O arquivo de padrões acaba antes da hora.");
  }
  u8() {
    this.conferir(1);
    return this.visao.getUint8(this.pos++);
  }
  u16() {
    this.conferir(2);
    const v = this.visao.getUint16(this.pos);
    this.pos += 2;
    return v;
  }
  u32() {
    this.conferir(4);
    const v = this.visao.getUint32(this.pos);
    this.pos += 4;
    return v;
  }
  pedaco(n: number) {
    this.conferir(n);
    const v = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return v;
  }
}

/** PackBits, uma linha: `n` bytes de saída a partir de `tamanho` bytes de entrada. */
function desempacotar(entrada: Uint8Array, saida: Uint8Array, inicioDaSaida: number, n: number) {
  let i = 0;
  let o = 0;
  while (o < n && i < entrada.length) {
    const cabeca = entrada[i++];
    if (cabeca < 128) {
      const quantos = Math.min(cabeca + 1, n - o);
      saida.set(entrada.subarray(i, i + quantos), inicioDaSaida + o);
      i += cabeca + 1;
      o += quantos;
    } else if (cabeca > 128) {
      const quantos = Math.min(257 - cabeca, n - o);
      saida.fill(entrada[i++], inicioDaSaida + o, inicioDaSaida + o + quantos);
      o += quantos;
    } else i++;
  }
}

/** Um canal: os bytes por pixel (1 ou 2), crus ou em PackBits, levados a 8 bits. */
function lerCanal(leitor: Leitor, largura: number, altura: number, profundidade: number, compressao: number): Uint8Array | null {
  const porPixel = profundidade === 16 ? 2 : profundidade === 8 ? 1 : 0;
  if (!porPixel) return null;
  const porLinha = largura * porPixel;
  const crus = new Uint8Array(porLinha * altura);
  if (compressao === 1) {
    const tamanhos = Array.from({ length: altura }, () => leitor.u16());
    tamanhos.forEach((tamanho, y) => desempacotar(leitor.pedaco(tamanho), crus, y * porLinha, porLinha));
  } else if (compressao === 0) crus.set(leitor.pedaco(porLinha * altura));
  else return null;
  if (porPixel === 1) return crus;
  return Uint8Array.from({ length: largura * altura }, (_, i) => crus[i * 2]);
}

/** Os padrões do arquivo (até `maximo`), em RGBA. Os de um modo que não sai são pulados. */
export function lerPat(buffer: ArrayBuffer, maximo = 100): PadraoLido[] {
  const leitor = new Leitor(buffer);
  const assinatura = String.fromCharCode(...leitor.pedaco(4));
  if (assinatura !== "8BPT") throw new Error("Não é um arquivo de padrões (.pat).");
  if (leitor.u16() !== 1) throw new Error("Esta versão do arquivo de padrões não é conhecida.");
  const quantos = leitor.u32();
  const lidos: PadraoLido[] = [];
  for (let k = 0; k < quantos && lidos.length < maximo; k++) {
    leitor.u32();
    const modo = leitor.u32();
    const altura = leitor.u16();
    const largura = leitor.u16();
    const letras = leitor.u32();
    const nomeEmBytes = leitor.pedaco(letras * 2);
    let nome = "";
    for (let i = 0; i < letras; i++) nome += String.fromCharCode((nomeEmBytes[i * 2] << 8) | nomeEmBytes[i * 2 + 1]);
    nome = nome.replace(/\0+$/, "").trim() || `Padrão ${k + 1}`;
    leitor.pedaco(leitor.u8());
    const paleta = modo === 2 ? leitor.pedaco(768) : null;
    // A lista de canais
    leitor.u32();
    const tamanho = leitor.u32();
    const fim = leitor.pos + tamanho;
    leitor.pedaco(16);
    const slots = leitor.u32();
    const canais: Uint8Array[] = [];
    for (let c = 0; c < slots + 2 && leitor.pos + 4 <= fim; c++) {
      if (!leitor.u32()) continue;
      const doCanal = leitor.u32();
      if (!doCanal) continue;
      const fimDoCanal = leitor.pos + doCanal;
      const profundidade = leitor.u32();
      const topo = leitor.u32();
      const esquerda = leitor.u32();
      const baixo = leitor.u32();
      const direita = leitor.u32();
      leitor.u16();
      const compressao = leitor.u8();
      const w = direita - esquerda;
      const h = baixo - topo;
      if (w === largura && h === altura) {
        const canal = lerCanal(leitor, w, h, profundidade, compressao);
        if (canal) canais.push(canal);
      }
      leitor.pos = fimDoCanal;
    }
    leitor.pos = fim;
    const deCor = CANAIS_DO_MODO[modo];
    if (!deCor || canais.length < deCor || !largura || !altura) continue;
    const n = largura * altura;
    const rgba = new Uint8ClampedArray(n * 4);
    const alfa = canais[deCor];
    for (let i = 0; i < n; i++) {
      let cor: [number, number, number];
      if (modo === 1) cor = [canais[0][i], canais[0][i], canais[0][i]];
      else if (modo === 2) cor = [paleta![canais[0][i] * 3], paleta![canais[0][i] * 3 + 1], paleta![canais[0][i] * 3 + 2]];
      else if (modo === 3) cor = [canais[0][i], canais[1][i], canais[2][i]];
      else {
        // CMYK guardado invertido (255 é sem tinta)
        const k2 = canais[3][i] / 255;
        cor = [canais[0][i] * k2, canais[1][i] * k2, canais[2][i] * k2];
      }
      rgba.set([cor[0], cor[1], cor[2], alfa ? alfa[i] : 255], i * 4);
    }
    lidos.push({ nome, largura, altura, rgba });
  }
  return lidos;
}
