// A Escala sensível ao conteúdo (Editar › Escala sensível ao conteúdo; ADR 0003, onda 13.6): o corte por costuras
// (Avidan e Shamir, 2007). A energia de cada pixel é o quanto ele muda em volta (o gradiente da luz), somada à proteção
// (a seleção ou um canal) e, se pedido, aos tons de pele; as costuras de menor energia, de cima a baixo, saem (para
// diminuir) ou são repetidas (para aumentar). Várias costuras que não se cruzam saem em cada passada, para a conta caber
// em imagens grandes. A altura é a largura da imagem deitada.
import { redimensionar } from "./reamostragem.ts";

type Imagem = { dados: ArrayLike<number>; largura: number; altura: number };
const PESO_DA_PROTECAO = 10_000;

/** O tom de pele pelo Cb e Cr (a faixa clássica de Chai e Ngan), de 0 a 1. */
function pele(r: number, g: number, b: number): number {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 ? 1 : 0;
}

type Estado = { dados: Uint8ClampedArray; protecao: Float32Array; origem: Int32Array; largura: number; altura: number };

/** A luz de cada pixel (com o alfa, para a borda do que é transparente contar). */
function luzes(estado: Estado): Float32Array {
  const { dados, largura, altura } = estado;
  const luz = new Float32Array(largura * altura);
  for (let i = 0; i < largura * altura; i++) luz[i] = (0.299 * dados[i * 4] + 0.587 * dados[i * 4 + 1] + 0.114 * dados[i * 4 + 2]) * (dados[i * 4 + 3] / 255) + dados[i * 4 + 3] * 0.25;
  return luz;
}

/**
 * Até `quantas` costuras de cima a baixo que não se cruzam, das de menor custo: cada uma é o x em cada linha. O custo
 * soma a energia para a frente (Rubinstein, Shamir e Avidan, 2008), o quanto a borda nova entre os vizinhos que passam
 * a se encostar destoa (a costura não deixa um degrau), à de sempre, o gradiente do pixel (a costura não atravessa o
 * contorno de cima e de baixo de uma coisa lisa por dentro, que só a primeira deixaria encolher).
 */
function costuras(estado: Estado, quantas: number, protegerPele: boolean): Int32Array[] {
  const { largura, altura, dados, protecao } = estado;
  const luz = luzes(estado);
  const L = (x: number, y: number) => luz[y * largura + Math.min(largura - 1, Math.max(0, x))];
  // O que não pode sair: a proteção e, se pedida, a pele
  const extra = new Float32Array(largura * altura);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      extra[i] = protecao[i] * PESO_DA_PROTECAO + Math.abs(L(x + 1, y) - L(x - 1, y)) + Math.abs(luz[Math.min(altura - 1, y + 1) * largura + x] - luz[Math.max(0, y - 1) * largura + x]);
      if (protegerPele && pele(dados[i * 4], dados[i * 4 + 1], dados[i * 4 + 2])) extra[i] += PESO_DA_PROTECAO;
    }
  }
  const cu = (x: number, y: number) => Math.abs(L(x + 1, y) - L(x - 1, y));
  const cl = (x: number, y: number) => cu(x, y) + (y > 0 ? Math.abs(L(x, y - 1) - L(x - 1, y)) : 0);
  const cr = (x: number, y: number) => cu(x, y) + (y > 0 ? Math.abs(L(x, y - 1) - L(x + 1, y)) : 0);
  const custo = new Float32Array(largura * altura);
  for (let x = 0; x < largura; x++) custo[x] = cu(x, 0) + extra[x];
  for (let y = 1; y < altura; y++) {
    const acima = (y - 1) * largura;
    for (let x = 0; x < largura; x++) {
      let menor = custo[acima + x] + cu(x, y);
      if (x > 0) menor = Math.min(menor, custo[acima + x - 1] + cl(x, y));
      if (x < largura - 1) menor = Math.min(menor, custo[acima + x + 1] + cr(x, y));
      custo[y * largura + x] = menor + extra[y * largura + x];
    }
  }
  const ultima = (altura - 1) * largura;
  const ordem = Array.from({ length: largura }, (_, x) => x).sort((a, b) => custo[ultima + a] - custo[ultima + b]);
  const usado = new Uint8Array(largura * altura);
  const achadas: Int32Array[] = [];
  for (const inicio of ordem) {
    if (achadas.length >= quantas) break;
    if (usado[ultima + inicio]) continue;
    const costura = new Int32Array(altura);
    costura[altura - 1] = inicio;
    let ok = true;
    for (let y = altura - 1; y > 0; y--) {
      const x = costura[y];
      const acima = (y - 1) * largura;
      let melhor = -1;
      let menor = Infinity;
      const candidatos: [number, number][] = [[x, cu(x, y)]];
      if (x > 0) candidatos.push([x - 1, cl(x, y)]);
      if (x < largura - 1) candidatos.push([x + 1, cr(x, y)]);
      for (const [xx, passo] of candidatos) {
        if (usado[acima + xx]) continue;
        const valor = custo[acima + xx] + passo;
        if (valor < menor) {
          menor = valor;
          melhor = xx;
        }
      }
      if (melhor < 0) {
        ok = false;
        break;
      }
      costura[y - 1] = melhor;
    }
    if (!ok) continue;
    for (let y = 0; y < altura; y++) usado[y * largura + costura[y]] = 1;
    achadas.push(costura);
  }
  return achadas;
}

/** Tira as costuras (marcadas por linha) do estado. */
function tirar(estado: Estado, lista: Int32Array[]): Estado {
  const { largura, altura } = estado;
  const nova = largura - lista.length;
  const marcado = new Uint8Array(largura * altura);
  for (const costura of lista) for (let y = 0; y < altura; y++) marcado[y * largura + costura[y]] = 1;
  const dados = new Uint8ClampedArray(nova * altura * 4);
  const protecao = new Float32Array(nova * altura);
  const origem = new Int32Array(nova * altura);
  for (let y = 0; y < altura; y++) {
    let k = 0;
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      if (marcado[i]) continue;
      const j = y * nova + k++;
      dados.set(estado.dados.subarray(i * 4, i * 4 + 4), j * 4);
      protecao[j] = estado.protecao[i];
      origem[j] = estado.origem[i];
    }
  }
  return { dados, protecao, origem, largura: nova, altura };
}

/** Muda só a largura, pelas costuras. */
function larguraPorCosturas(dados: Uint8ClampedArray, largura: number, altura: number, protecao: Float32Array, alvo: number, protegerPele: boolean): Uint8ClampedArray {
  if (alvo === largura) return dados;
  let estado: Estado = { dados, protecao, origem: Int32Array.from({ length: largura * altura }, (_, i) => i % largura), largura, altura };
  const tirarAte = Math.max(1, alvo < largura ? alvo : 2 * largura - alvo);
  // As costuras saem em passadas de no máximo um quarto do que falta (e 64), as de menor custo de cada vez
  while (estado.largura > tirarAte) {
    const falta = estado.largura - tirarAte;
    const lista = costuras(estado, Math.min(64, Math.max(1, Math.ceil(falta / 4))), protegerPele);
    if (!lista.length) break;
    estado = tirar(estado, lista);
  }
  if (alvo < largura) return estado.dados;
  // Aumentar: as colunas que sairiam são repetidas (cada uma com a média dela e da vizinha), no lugar delas
  const repetir = new Uint8Array(largura * altura);
  const ficou = new Uint8Array(largura * altura);
  for (let i = 0; i < estado.origem.length; i++) ficou[Math.floor(i / estado.largura) * largura + estado.origem[i]] = 1;
  for (let i = 0; i < largura * altura; i++) if (!ficou[i]) repetir[i] = 1;
  const saida = new Uint8ClampedArray(alvo * altura * 4);
  for (let y = 0; y < altura; y++) {
    let k = 0;
    for (let x = 0; x < largura && k < alvo; x++) {
      const i = y * largura + x;
      saida.set(dados.subarray(i * 4, i * 4 + 4), (y * alvo + k++) * 4);
      if (repetir[i] && k < alvo) {
        const vizinho = y * largura + Math.min(largura - 1, x + 1);
        for (let c = 0; c < 4; c++) saida[(y * alvo + k) * 4 + c] = (dados[i * 4 + c] + dados[vizinho * 4 + c]) / 2;
        k++;
      }
    }
    // Se faltou (mais que o dobro), a última coluna se repete
    for (; k < alvo; k++) saida.copyWithin((y * alvo + k) * 4, (y * alvo + k - 1) * 4, (y * alvo + k) * 4);
  }
  return saida;
}

function deitar(dados: Uint8ClampedArray, largura: number, altura: number): Uint8ClampedArray {
  const saida = new Uint8ClampedArray(dados.length);
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) saida.set(dados.subarray((y * largura + x) * 4, (y * largura + x) * 4 + 4), (x * altura + y) * 4);
  return saida;
}
function deitarCanal(dados: Float32Array, largura: number, altura: number): Float32Array {
  const saida = new Float32Array(dados.length);
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) saida[x * altura + y] = dados[y * largura + x];
  return saida;
}

/**
 * A imagem no tamanho novo pelas costuras (primeiro a largura, depois a altura, na imagem deitada). `protecao` (0 a 255
 * por pixel) não é tocada enquanto houver outro lugar; `quantidade` mistura com a escala comum (1 é toda pelas costuras).
 */
export function escalaSensivel(imagem: Imagem, largura: number, altura: number, opcoes: { protecao?: ArrayLike<number> | null; protegerPele?: boolean; quantidade?: number } = {}): Uint8ClampedArray<ArrayBuffer> {
  const { protegerPele = false, quantidade = 1 } = opcoes;
  const fonte = Uint8ClampedArray.from(imagem.dados);
  const protecao = new Float32Array(imagem.largura * imagem.altura);
  if (opcoes.protecao) for (let i = 0; i < protecao.length; i++) protecao[i] = opcoes.protecao[i] / 255;
  // A largura
  let dados = larguraPorCosturas(fonte, imagem.largura, imagem.altura, protecao, largura, protegerPele);
  // A proteção acompanha (pela escala comum, que basta para ela)
  let protecaoNova = protecao;
  if (largura !== imagem.largura) {
    const comoImagem = new Uint8ClampedArray(protecao.length * 4);
    for (let i = 0; i < protecao.length; i++) comoImagem.fill(protecao[i] * 255, i * 4, i * 4 + 4);
    const mudada = redimensionar({ dados: comoImagem, largura: imagem.largura, altura: imagem.altura }, largura, imagem.altura, "bilinear");
    protecaoNova = Float32Array.from({ length: largura * imagem.altura }, (_, i) => mudada[i * 4] / 255);
  }
  // A altura: a imagem deitada
  if (altura !== imagem.altura) {
    const deitada = deitar(dados, largura, imagem.altura);
    const mudada = larguraPorCosturas(deitada, imagem.altura, largura, deitarCanal(protecaoNova, largura, imagem.altura), altura, protegerPele);
    dados = deitar(mudada, altura, largura);
  }
  const saida = new Uint8ClampedArray(largura * altura * 4);
  saida.set(dados.subarray(0, saida.length));
  if (quantidade < 1) {
    const comum = redimensionar({ dados: fonte, largura: imagem.largura, altura: imagem.altura }, largura, altura, "bicubica");
    for (let i = 0; i < saida.length; i++) saida[i] = saida[i] * quantidade + comum[i] * (1 - quantidade);
  }
  return saida;
}
