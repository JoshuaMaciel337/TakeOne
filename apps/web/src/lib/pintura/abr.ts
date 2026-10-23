// Leitura dos arquivos de pincéis .abr (ADR 0003, onda 13.2): só as pontas de amostra (a imagem de cada pincel),
// como o GIMP lê (gimpbrush-load.c): nas versões 1 e 2, a lista de pincéis com as amostras; da 6 em diante, a seção
// "samp" do arquivo, cada amostra crua ou em PackBits, com 8 ou 16 bits. O resto (as configurações de cada pincel,
// em descritores) fica de fora: o pincel importado entra com as opções padrão e a ponta dele.

export type PontaImportada = { nome: string; largura: number; altura: number; /** Um valor por pixel (0 a 255), 255 é tinta cheia. */ dados: Uint8Array };

export class ErroAbr extends Error {}

class Leitor {
  posicao = 0;
  readonly visao: DataView;

  constructor(visao: DataView) {
    this.visao = visao;
  }
  get fim() {
    return this.posicao >= this.visao.byteLength;
  }
  u8() {
    this.exigir(1);
    return this.visao.getUint8(this.posicao++);
  }
  i8() {
    this.exigir(1);
    return this.visao.getInt8(this.posicao++);
  }
  u16() {
    this.exigir(2);
    const v = this.visao.getUint16(this.posicao);
    this.posicao += 2;
    return v;
  }
  u32() {
    this.exigir(4);
    const v = this.visao.getUint32(this.posicao);
    this.posicao += 4;
    return v;
  }
  i32() {
    this.exigir(4);
    const v = this.visao.getInt32(this.posicao);
    this.posicao += 4;
    return v;
  }
  texto(n: number) {
    this.exigir(n);
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.visao.getUint8(this.posicao + i));
    this.posicao += n;
    return s;
  }
  /** Uma cadeia em UTF-16 com o tamanho (em caracteres) antes. */
  unicode() {
    const n = this.u32();
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u16());
    return s.replace(/\0+$/, "");
  }
  pular(n: number) {
    this.exigir(n);
    this.posicao += n;
  }
  exigir(n: number) {
    if (this.posicao + n > this.visao.byteLength) throw new ErroAbr("O arquivo de pincéis está cortado.");
  }
}

/** Os dados da amostra: crus ou em PackBits (com a contagem de bytes de cada linha antes), em 8 ou 16 bits. */
function lerAmostra(leitor: Leitor, largura: number, altura: number, profundidade: number, comprimido: boolean): Uint8Array {
  if (largura <= 0 || altura <= 0 || largura > 5000 || altura > 5000) throw new ErroAbr("Uma ponta do arquivo tem tamanho inválido.");
  const bytesPorPixel = profundidade >> 3;
  if (bytesPorPixel !== 1 && bytesPorPixel !== 2) throw new ErroAbr("Só pontas de 8 ou 16 bits são lidas.");
  const linha = largura * bytesPorPixel;
  const brutos = new Uint8Array(linha * altura);
  if (!comprimido) {
    for (let i = 0; i < brutos.length; i++) brutos[i] = leitor.u8();
  } else {
    const contagens: number[] = [];
    for (let y = 0; y < altura; y++) contagens.push(leitor.u16());
    let saida = 0;
    for (let y = 0; y < altura; y++) {
      const fimDaLinha = leitor.posicao + contagens[y];
      const fimNaSaida = (y + 1) * linha;
      while (leitor.posicao < fimDaLinha && saida < fimNaSaida) {
        const n = leitor.i8();
        if (n >= 0) {
          for (let i = 0; i <= n && saida < fimNaSaida; i++) brutos[saida++] = leitor.u8();
        } else if (n !== -128) {
          const valor = leitor.u8();
          for (let i = 0; i <= -n && saida < fimNaSaida; i++) brutos[saida++] = valor;
        }
      }
      leitor.posicao = fimDaLinha;
      saida = fimNaSaida;
    }
  }
  if (bytesPorPixel === 1) return brutos;
  // 16 bits: o byte mais alto de cada valor
  const dados = new Uint8Array(largura * altura);
  for (let i = 0; i < dados.length; i++) dados[i] = brutos[i * 2];
  return dados;
}

/** Versões 1 e 2: a contagem e os pincéis em fila (os computados são pulados; os de amostra trazem a imagem). */
function lerVersaoAntiga(leitor: Leitor, versao: number): PontaImportada[] {
  const quantos = leitor.u16();
  const pontas: PontaImportada[] = [];
  for (let i = 0; i < quantos && !leitor.fim; i++) {
    const tipo = leitor.u16();
    const tamanho = leitor.u32();
    const proximo = leitor.posicao + tamanho;
    if (tipo === 2) {
      leitor.pular(4); // misc
      leitor.pular(2); // espaçamento
      const nome = versao === 2 ? leitor.unicode() : "";
      leitor.pular(1); // suavização de serrilhado
      leitor.pular(8); // os limites em short
      const topo = leitor.i32();
      const esquerda = leitor.i32();
      const base = leitor.i32();
      const direita = leitor.i32();
      const profundidade = leitor.u16();
      const comprimido = leitor.u8() === 1;
      const largura = direita - esquerda;
      const altura = base - topo;
      pontas.push({ nome: nome || `Pincel ${pontas.length + 1}`, largura, altura, dados: lerAmostra(leitor, largura, altura, profundidade, comprimido) });
    }
    leitor.posicao = proximo;
  }
  return pontas;
}

/** Da versão 6 em diante: acha a seção "samp" entre as seções 8BIM e lê as amostras dela. */
function lerVersaoNova(leitor: Leitor, subversao: number): PontaImportada[] {
  for (;;) {
    if (leitor.fim) throw new ErroAbr("O arquivo não tem pontas de amostra (só pincéis calculados).");
    const assinatura = leitor.texto(4);
    if (assinatura !== "8BIM") throw new ErroAbr("O arquivo de pincéis tem uma seção estragada.");
    const etiqueta = leitor.texto(4);
    const tamanho = leitor.u32();
    if (etiqueta !== "samp") {
      leitor.pular(tamanho);
      continue;
    }
    const fimDaSecao = leitor.posicao + tamanho;
    const pontas: PontaImportada[] = [];
    while (leitor.posicao < fimDaSecao) {
      let tamanhoDoPincel = leitor.u32();
      while (tamanhoDoPincel % 4 !== 0) tamanhoDoPincel++;
      const proximo = leitor.posicao + tamanhoDoPincel;
      // A chave (um texto de 37 bytes) e o que vem antes dos limites: 47 bytes na subversão 1, 301 na 2
      leitor.pular(subversao === 1 ? 47 : 301);
      const topo = leitor.i32();
      const esquerda = leitor.i32();
      const base = leitor.i32();
      const direita = leitor.i32();
      const profundidade = leitor.u16();
      const comprimido = leitor.u8() === 1;
      const largura = direita - esquerda;
      const altura = base - topo;
      pontas.push({ nome: `Pincel ${pontas.length + 1}`, largura, altura, dados: lerAmostra(leitor, largura, altura, profundidade, comprimido) });
      leitor.posicao = proximo;
    }
    return pontas;
  }
}

/** As pontas de amostra de um .abr. Lança ErroAbr com a mensagem para a pessoa. */
export function lerAbr(buffer: ArrayBuffer): PontaImportada[] {
  const leitor = new Leitor(new DataView(buffer));
  const versao = leitor.u16();
  let pontas: PontaImportada[];
  if (versao === 1 || versao === 2) pontas = lerVersaoAntiga(leitor, versao);
  else if (versao >= 6 && versao <= 10) pontas = lerVersaoNova(leitor, leitor.u16());
  else throw new ErroAbr(`Esta versão do arquivo de pincéis (${versao}) não é lida.`);
  if (!pontas.length) throw new ErroAbr("O arquivo não tem pontas de amostra (só pincéis calculados).");
  return pontas;
}
