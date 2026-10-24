// O retoque com pincel (ADR 0003, onda 13.5). Dois jeitos, em contas puras sobre RGBA sem pré-multiplicar:
// - pelo alvo (Desfoque, Nitidez, Subexposição, Superexposição e Esponja): no começo do traço, a camada inteira com o
//   efeito na força escolhida vira a fonte do traço, e o pincel leva a camada em direção a ela (como o carimbo); passar
//   de novo, noutro traço, soma o efeito;
// - marca a marca (Borrar, Pincel misturador, Substituição de cor e Borracha de fundo): cada marca lê o que está na
//   tela debaixo dela e escreve ali mesmo, porque o resultado depende do que as marcas anteriores deixaram.
import { misturar } from "./mesclar.ts";
import { desfocarCanal } from "./recuperar.ts";
import type { ModoDaPintura } from "./traco.ts";

type Rgb = [number, number, number];

export type FerramentaDeAlvo = "desfoque" | "nitidez" | "subexposicao" | "superexposicao" | "esponja";
export type FerramentaDeMarca = "borrar" | "misturador" | "substituicaoDeCor" | "borrachaDeFundo";

/** Os modos que o Desfoque, a Nitidez e o Borrar oferecem. */
export const MODOS_DO_RETOQUE: { id: ModoDaPintura; nome: string }[] = [
  { id: "normal", nome: "Normal" },
  { id: "escurecer", nome: "Escurecer" },
  { id: "clarear", nome: "Clarear" },
  { id: "matiz", nome: "Matiz" },
  { id: "saturacao", nome: "Saturação" },
  { id: "cor", nome: "Cor" },
  { id: "luminosidade", nome: "Luminosidade" },
];

export type OpcoesDoRetoque = {
  /** A força (Desfoque, Nitidez, Borrar), a exposição (Subexposição, Superexposição) ou o fluxo (Esponja), de 0 a 1. */
  forca: number;
  modo: ModoDaPintura;
  /** Nitidez: não passa do mais claro e do mais escuro em volta (sem halo nem chuvisco). */
  protegerDetalhes: boolean;
  /** Borrar: a primeira marca leva a cor do primeiro plano. */
  pinturaComDedo: boolean;
  intervalo: "sombras" | "meiosTons" | "realces";
  /** Subexposição e Superexposição: mudam a luz e guardam o matiz e a saturação. */
  protegerTons: boolean;
  esponja: "dessaturar" | "saturar";
  /** Esponja: o que já é saturado muda menos. */
  vibracao: boolean;
};

export const RETOQUE_PADRAO: OpcoesDoRetoque = {
  forca: 0.5,
  modo: "normal",
  protegerDetalhes: true,
  pinturaComDedo: false,
  intervalo: "meiosTons",
  protegerTons: true,
  esponja: "dessaturar",
  vibracao: true,
};

const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;

/** Leva a cor para dentro de 0..1 mantendo a luminância e o matiz (o corte dos modos de cor). */
function cortar(c: Rgb): Rgb {
  const l = lum(c[0], c[1], c[2]);
  const n = Math.min(c[0], c[1], c[2]);
  const x = Math.max(c[0], c[1], c[2]);
  let r = c;
  if (n < 0) r = r.map((v) => l + ((v - l) * l) / Math.max(l - n, 1e-6)) as Rgb;
  if (x > 1) r = r.map((v) => l + ((v - l) * (1 - l)) / Math.max(x - l, 1e-6)) as Rgb;
  return r.map((v) => Math.min(1, Math.max(0, v))) as Rgb;
}

/** O peso do intervalo de tons pela luz (0 a 1). */
function pesoDoIntervalo(intervalo: OpcoesDoRetoque["intervalo"], l: number): number {
  if (intervalo === "sombras") return (1 - l) * (1 - l);
  if (intervalo === "realces") return l * l;
  return 4 * l * (1 - l);
}

/** A camada desfocada no alfa pré-multiplicado (a cor dos pixels transparentes não vaza). */
function desfocada(dados: Uint8ClampedArray, largura: number, altura: number, sigma: number): Float32Array[] {
  const n = largura * altura;
  return [0, 1, 2, 3].map((c) => desfocarCanal(Float32Array.from({ length: n }, (_, i) => (c === 3 ? dados[i * 4 + 3] : (dados[i * 4 + c] * dados[i * 4 + 3]) / 255)), largura, altura, sigma));
}

/**
 * O alvo do traço: a camada com o efeito da ferramenta na força das opções. `escala` é quantos pixels da camada há
 * num da imagem (o desfoque e a nitidez medem em pixels da imagem).
 */
export function alvoDoRetoque(ferramenta: FerramentaDeAlvo, dados: Uint8ClampedArray, largura: number, altura: number, opcoes: OpcoesDoRetoque, escala = 1): Uint8ClampedArray<ArrayBuffer> {
  const n = largura * altura;
  const saida = new Uint8ClampedArray(dados);
  const forca = Math.min(1, Math.max(0, opcoes.forca));
  if (forca <= 0) return saida;
  if (ferramenta === "desfoque") {
    const canais = desfocada(dados, largura, altura, (0.5 + 4.5 * forca) * escala);
    for (let i = 0; i < n; i++) {
      const a = canais[3][i];
      saida[i * 4 + 3] = Math.round(a);
      for (let c = 0; c < 3; c++) saida[i * 4 + c] = a > 0 ? Math.round(Math.min(255, (canais[c][i] * 255) / a)) : 0;
    }
  } else if (ferramenta === "nitidez") {
    // A máscara de nitidez: o pixel mais (ele menos a vizinhança desfocada) vezes até 2,5
    const canais = desfocada(dados, largura, altura, Math.max(0.6, escala));
    const quanto = 2.5 * forca;
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        const i = y * largura + x;
        const a = dados[i * 4 + 3];
        if (!a) continue;
        for (let c = 0; c < 3; c++) {
          const v = dados[i * 4 + c];
          const media = canais[3][i] > 0 ? (canais[c][i] * 255) / canais[3][i] : v;
          let novo = v + quanto * (v - media);
          if (opcoes.protegerDetalhes) {
            let menor = 255;
            let maior = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const xx = Math.min(largura - 1, Math.max(0, x + dx));
                const yy = Math.min(altura - 1, Math.max(0, y + dy));
                const w = dados[(yy * largura + xx) * 4 + c];
                if (w < menor) menor = w;
                if (w > maior) maior = w;
              }
            }
            novo = Math.min(maior, Math.max(menor, novo));
          }
          saida[i * 4 + c] = Math.round(novo);
        }
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      if (!dados[i * 4 + 3]) continue;
      const cor: Rgb = [dados[i * 4] / 255, dados[i * 4 + 1] / 255, dados[i * 4 + 2] / 255];
      let nova: Rgb;
      if (ferramenta === "esponja") {
        const l = lum(...cor);
        const saturacao = Math.max(...cor) - Math.min(...cor);
        const peso = opcoes.vibracao ? (opcoes.esponja === "saturar" ? 1 - saturacao : 0.5 + saturacao / 2) : 1;
        const fator = opcoes.esponja === "saturar" ? 1 + forca * peso : 1 - forca * peso;
        nova = cortar(cor.map((v) => l + (v - l) * fator) as Rgb);
      } else {
        // Subexposição clareia e Superexposição escurece por uma potência: nunca estoura nem entope de uma vez
        const clarear = ferramenta === "subexposicao";
        const curva = (v: number, w: number) => (clarear ? 1 - Math.pow(1 - v, 1 + 2 * forca * w) : Math.pow(v, 1 + 2 * forca * w));
        if (opcoes.protegerTons) {
          const l = lum(...cor);
          const l2 = curva(l, pesoDoIntervalo(opcoes.intervalo, l));
          nova = l > 1e-4 ? cortar(cor.map((v) => (v * l2) / l) as Rgb) : [l2, l2, l2];
        } else nova = cor.map((v) => curva(v, pesoDoIntervalo(opcoes.intervalo, v))) as Rgb;
      }
      for (let c = 0; c < 3; c++) saida[i * 4 + c] = Math.round(nova[c] * 255);
    }
  }
  // O modo (Desfoque e Nitidez): o efeito entra só no que o modo deixa (escurecer, só o que escurece; cor, só a cor...)
  if ((ferramenta === "desfoque" || ferramenta === "nitidez") && opcoes.modo !== "normal") {
    for (let i = 0; i < n; i++) {
      const base: Rgb = [dados[i * 4] / 255, dados[i * 4 + 1] / 255, dados[i * 4 + 2] / 255];
      const efeito: Rgb = [saida[i * 4] / 255, saida[i * 4 + 1] / 255, saida[i * 4 + 2] / 255];
      const junto = misturar(opcoes.modo, base, efeito);
      for (let c = 0; c < 3; c++) saida[i * 4 + c] = Math.round(Math.min(1, Math.max(0, junto[c])) * 255);
    }
  }
  return saida;
}

// ---- Marca a marca ----

export type OpcoesDoMisturador = {
  /** Quanto o pincel pega da tela (0 a 1). */
  umido: number;
  /** Quanta tinta cabe no reservatório (0 a 1): com pouca, ela acaba no traço. */
  carga: number;
  /** Quanto da tinta é a da tela e quanto a do reservatório (0 a 1). */
  mistura: number;
  fluxo: number;
  carregarDepois: boolean;
  limparDepois: boolean;
};
export const MISTURADOR_PADRAO: OpcoesDoMisturador = { umido: 0.5, carga: 0.5, mistura: 0.5, fluxo: 1, carregarDepois: true, limparDepois: false };

export type OpcoesDaSubstituicao = {
  modo: "matiz" | "saturacao" | "cor" | "luminosidade";
  amostragem: "continua" | "umaVez" | "fundo";
  limites: "contiguo" | "naoContiguo" | "arestas";
  /** De 0 a 255, em cada canal (como a varinha). */
  tolerancia: number;
  suavizar: boolean;
  /** Borracha de fundo: a cor do primeiro plano não é apagada. */
  protegerPrimeiroPlano: boolean;
};
export const SUBSTITUICAO_PADRAO: OpcoesDaSubstituicao = { modo: "cor", amostragem: "continua", limites: "contiguo", tolerancia: 77, suavizar: true, protegerPrimeiroPlano: false };

/** A marca: um quadrado de `lado` pixels centrado no pincel, com a tela debaixo dele e o peso de cada pixel. */
export type Marca = {
  lado: number;
  /** RGBA sem pré-multiplicar, lido da tela e escrito de volta. */
  pixels: Uint8ClampedArray;
  /** O quanto a marca vale em cada pixel (a ponta, a seleção), 0 fora da imagem. */
  peso: Float32Array;
  /** 1 onde o pixel está dentro da imagem. */
  dentro: Uint8Array;
};

/** O que um traço carrega de uma marca para a outra (e o misturador, de um traço para o outro). */
export type EstadoDoTraco = {
  /** A tinta carregada, pré-multiplicada (RGBA de 0 a 1), alinhada à marca. */
  carregado: Float32Array | null;
  lado: number;
  /** A cor amostrada uma vez (Substituição de cor e Borracha de fundo). */
  amostra: Rgb | null;
  /** O quanto ainda há de tinta no reservatório (misturador). */
  tinta: number;
};
export const estadoNovo = (): EstadoDoTraco => ({ carregado: null, lado: 0, amostra: null, tinta: 1 });

function preMultiplicada(pixels: Uint8ClampedArray, lado: number): Float32Array {
  const saida = new Float32Array(lado * lado * 4);
  for (let i = 0; i < lado * lado; i++) {
    const a = pixels[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) saida[i * 4 + c] = (pixels[i * 4 + c] / 255) * a;
    saida[i * 4 + 3] = a;
  }
  return saida;
}

function escrever(pixels: Uint8ClampedArray, i: number, pre: ArrayLike<number>, j: number) {
  const a = Math.min(1, Math.max(0, pre[j + 3]));
  pixels[i * 4 + 3] = Math.round(a * 255);
  for (let c = 0; c < 3; c++) pixels[i * 4 + c] = a > 0 ? Math.round(Math.min(1, Math.max(0, pre[j + c] / a)) * 255) : 0;
}

/**
 * Borrar: a tinta que o dedo carrega (a da marca anterior) é puxada sobre a tela na força; o que fica embaixo vira o
 * que ele carrega na marca seguinte. Com a pintura com o dedo, a primeira marca leva o primeiro plano.
 */
export function borrarMarca(marca: Marca, estado: EstadoDoTraco, forca: number, primeiroPlano: Rgb, comDedo: boolean) {
  const { lado, pixels, peso, dentro } = marca;
  const tela = preMultiplicada(pixels, lado);
  if (!estado.carregado || estado.lado !== lado) {
    estado.lado = lado;
    estado.carregado = tela;
    if (!comDedo) return;
    estado.carregado = new Float32Array(lado * lado * 4);
    for (let i = 0; i < lado * lado; i++) estado.carregado.set([primeiroPlano[0], primeiroPlano[1], primeiroPlano[2], 1], i * 4);
  }
  const carregado = estado.carregado;
  for (let i = 0; i < lado * lado; i++) {
    if (!dentro[i]) continue;
    const w = peso[i] * forca;
    for (let c = 0; c < 4; c++) tela[i * 4 + c] += (carregado[i * 4 + c] - tela[i * 4 + c]) * w;
    if (w > 0) escrever(pixels, i, tela, i * 4);
    carregado.set(tela.subarray(i * 4, i * 4 + 4), i * 4);
  }
}

/**
 * O pincel misturador: o pincel carrega tinta (a do reservatório, o primeiro plano, e a que pegou da tela). Úmido é o
 * quanto ele pega da tela debaixo a cada marca (até a metade: o resto é o que já trazia, e por isso ele arrasta a
 * tinta); a mistura é quanto da tinta que sai é essa da tela e quanto a do reservatório; com pouca carga, a do
 * reservatório acaba ao longo do traço.
 */
export function misturarMarca(marca: Marca, estado: EstadoDoTraco, opcoes: OpcoesDoMisturador, reservatorio: Rgb | null) {
  const { lado, pixels, peso, dentro } = marca;
  const tela = preMultiplicada(pixels, lado);
  if (!estado.carregado || estado.lado !== lado) {
    estado.lado = lado;
    // O pincel chega com a tinta do reservatório; limpo (sem tinta), com a da tela
    estado.carregado = new Float32Array(lado * lado * 4);
    for (let i = 0; i < lado * lado; i++) {
      if (reservatorio) estado.carregado.set([reservatorio[0], reservatorio[1], reservatorio[2], 1], i * 4);
      else estado.carregado.set(tela.subarray(i * 4, i * 4 + 4), i * 4);
    }
  }
  const carregado = estado.carregado;
  // A tinta do reservatório que ainda sai nesta marca
  const doReservatorio = reservatorio ? estado.tinta * (1 - opcoes.mistura) : 0;
  const pega = opcoes.umido / 2;
  const tinta = new Float32Array(4);
  for (let i = 0; i < lado * lado; i++) {
    if (!dentro[i]) continue;
    for (let c = 0; c < 4; c++) {
      const noPincel = carregado[i * 4 + c] + (tela[i * 4 + c] - carregado[i * 4 + c]) * pega;
      tinta[c] = reservatorio ? noPincel + ((c === 3 ? 1 : reservatorio[c]) - noPincel) * doReservatorio : noPincel;
    }
    const w = peso[i] * opcoes.fluxo;
    for (let c = 0; c < 4; c++) tela[i * 4 + c] += (tinta[c] - tela[i * 4 + c]) * w;
    if (w > 0) escrever(pixels, i, tela, i * 4);
    // O pincel fica com a tinta que soltou, suja do que ficou na tela pelo úmido
    for (let c = 0; c < 4; c++) carregado[i * 4 + c] = tinta[c] + (tela[i * 4 + c] - tinta[c]) * pega;
  }
  // A carga: com 100%, a tinta não acaba; com 0, acaba em umas 10 marcas
  estado.tinta = Math.max(0, estado.tinta - 0.1 * (1 - opcoes.carga));
}

/** O quanto o pixel está na cor da amostra: 1 até 3/4 da tolerância, caindo até 0 nela (sem suavizar, 1 ou 0). */
function naCor(pixels: Uint8ClampedArray, i: number, cor: Rgb, tolerancia: number, suavizar: boolean): number {
  const d = Math.max(Math.abs(pixels[i * 4] - cor[0] * 255), Math.abs(pixels[i * 4 + 1] - cor[1] * 255), Math.abs(pixels[i * 4 + 2] - cor[2] * 255));
  if (d > tolerancia) return 0;
  if (!suavizar || tolerancia <= 0) return 1;
  const comeco = tolerancia * 0.75;
  return d <= comeco ? 1 : 1 - (d - comeco) / (tolerancia - comeco);
}

/** Onde a marca vale pela cor: a cor da amostra (pela amostragem) até a tolerância, ligada ao meio ou não. */
function regiaoDaCor(marca: Marca, estado: EstadoDoTraco, opcoes: OpcoesDaSubstituicao, fundo: Rgb): Float32Array {
  const { lado, pixels, peso, dentro } = marca;
  const meio = Math.floor(lado / 2) * lado + Math.floor(lado / 2);
  const daTela: Rgb = [pixels[meio * 4] / 255, pixels[meio * 4 + 1] / 255, pixels[meio * 4 + 2] / 255];
  let cor = daTela;
  if (opcoes.amostragem === "fundo") cor = fundo;
  else if (opcoes.amostragem === "umaVez") cor = estado.amostra ??= daTela;
  const suavizar = opcoes.suavizar && opcoes.limites !== "arestas";
  const quanto = new Float32Array(lado * lado);
  for (let i = 0; i < lado * lado; i++) if (dentro[i] && peso[i] > 0 && pixels[i * 4 + 3] > 0) quanto[i] = naCor(pixels, i, cor, opcoes.tolerancia, suavizar);
  if (opcoes.limites === "naoContiguo") return quanto;
  // Ligado ao meio: só a parte da cor que encosta no centro da marca
  const ligado = new Float32Array(lado * lado);
  if (!quanto[meio]) return ligado;
  const fila = [meio];
  ligado[meio] = quanto[meio];
  while (fila.length) {
    const i = fila.pop()!;
    const x = i % lado;
    const y = (i - x) / lado;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= lado || yy >= lado) continue;
      const j = yy * lado + xx;
      if (ligado[j] || !quanto[j]) continue;
      ligado[j] = quanto[j];
      fila.push(j);
    }
  }
  return ligado;
}

/** Substituição de cor: onde a cor é a da amostra, ela vira o primeiro plano pelo modo (matiz, saturação, cor ou luz). */
export function substituirCorNaMarca(marca: Marca, estado: EstadoDoTraco, opcoes: OpcoesDaSubstituicao, primeiroPlano: Rgb, fundo: Rgb, opacidade: number) {
  const { lado, pixels, peso } = marca;
  const regiao = regiaoDaCor(marca, estado, opcoes, fundo);
  for (let i = 0; i < lado * lado; i++) {
    const w = regiao[i] * peso[i] * opacidade;
    if (w <= 0) continue;
    const base: Rgb = [pixels[i * 4] / 255, pixels[i * 4 + 1] / 255, pixels[i * 4 + 2] / 255];
    const nova = misturar(opcoes.modo, base, primeiroPlano);
    for (let c = 0; c < 3; c++) pixels[i * 4 + c] = Math.round((base[c] + (Math.min(1, Math.max(0, nova[c])) - base[c]) * w) * 255);
  }
}

/** Borracha de fundo: apaga a cor da amostra até a tolerância (e guarda a do primeiro plano, se pedido). */
export function apagarFundoNaMarca(marca: Marca, estado: EstadoDoTraco, opcoes: OpcoesDaSubstituicao, primeiroPlano: Rgb, fundo: Rgb, opacidade: number) {
  const { lado, pixels, peso } = marca;
  const regiao = regiaoDaCor(marca, estado, opcoes, fundo);
  for (let i = 0; i < lado * lado; i++) {
    let w = regiao[i] * peso[i] * opacidade;
    if (w <= 0) continue;
    if (opcoes.protegerPrimeiroPlano) w *= 1 - naCor(pixels, i, primeiroPlano, opcoes.tolerancia, true);
    pixels[i * 4 + 3] = Math.round(pixels[i * 4 + 3] * (1 - w));
  }
}
