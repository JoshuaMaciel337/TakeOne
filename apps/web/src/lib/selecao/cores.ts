// Selecionar › Intervalo de cores e Área de foco (ADR 0003, onda 13.3): seleções que olham a imagem inteira, sem
// clique. O intervalo de cores mede a distância de cada pixel às cores amostradas no Lab (a distância que o olho vê),
// ou o quanto ele cai numa faixa (uma cor do círculo, os realces, os meios-tons, as sombras ou os tons de pele). A área
// de foco acha o que está nítido pela energia do laplaciano em volta de cada pixel.
import { difusao, type Selecao, vazia } from "./mascara.ts";
import type { ImagemRgba } from "./varinha.ts";

export type FaixaDeCores = "amostradas" | "vermelhos" | "amarelos" | "verdes" | "cianos" | "azuis" | "magentas" | "realces" | "meiosTons" | "sombras" | "pele";

export const FAIXAS_DE_CORES: { id: FaixaDeCores; nome: string }[] = [
  { id: "amostradas", nome: "Cores amostradas" },
  { id: "vermelhos", nome: "Vermelhos" },
  { id: "amarelos", nome: "Amarelos" },
  { id: "verdes", nome: "Verdes" },
  { id: "cianos", nome: "Cianos" },
  { id: "azuis", nome: "Azuis" },
  { id: "magentas", nome: "Magentas" },
  { id: "realces", nome: "Realces" },
  { id: "meiosTons", nome: "Meios-tons" },
  { id: "sombras", nome: "Sombras" },
  { id: "pele", nome: "Tons de pele" },
];

export type Rgb = [number, number, number];

export type OpcoesDoIntervalo = {
  faixa: FaixaDeCores;
  /** As cores amostradas (0 a 255) e as tiradas da amostra (o conta-gotas com −). */
  amostras: Rgb[];
  tiradas: Rgb[];
  /** A imprecisão (0 a 200): o quanto a seleção se espalha em volta das cores. */
  imprecisao: number;
  /** Realces e sombras: onde a faixa começa (0 a 255 de luz). */
  limiar: number;
  inverter: boolean;
};

export const INTERVALO_PADRAO: OpcoesDoIntervalo = { faixa: "amostradas", amostras: [], tiradas: [], imprecisao: 40, limiar: 190, inverter: false };

const LINEAR = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** O Lab (D65) de uma cor sRGB de 0 a 255. */
export function lab([r, g, b]: Rgb): Rgb {
  const lr = LINEAR[Math.round(r)];
  const lg = LINEAR[Math.round(g)];
  const lb = LINEAR[Math.round(b)];
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** O matiz (0 a 360), a saturação e o valor (0 a 1) do HSV. */
function hsv([r, g, b]: Rgb): Rgb {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r / 255) h = (((g - b) / 255 / d) % 6) * 60;
    else if (max === g / 255) h = ((b - r) / 255 / d + 2) * 60;
    else h = ((r - g) / 255 / d + 4) * 60;
  }
  return [(h + 360) % 360, max ? d / max : 0, max];
}

const CENTRO_DA_FAIXA: Partial<Record<FaixaDeCores, number>> = { vermelhos: 0, amarelos: 60, verdes: 120, cianos: 180, azuis: 240, magentas: 300 };

/** Quanto (0 a 1) uma cor entra na seleção do intervalo. As cores amostradas já vêm em Lab. */
function coberturaDaCor(cor: Rgb, opcoes: OpcoesDoIntervalo, amostras: Rgb[], tiradas: Rgb[]): number {
  const { faixa, imprecisao } = opcoes;
  if (faixa === "amostradas") {
    if (!amostras.length) return 0;
    // Até um quarto da imprecisão a cor entra inteira; some em 0,75 da imprecisão (ΔE do Lab)
    const ate = (d: number) => Math.min(1, Math.max(0, (imprecisao * 0.75 - d) / Math.max(1e-6, imprecisao * 0.5)));
    const l = lab(cor);
    const perto = (lista: Rgb[]) => Math.max(0, ...lista.map((a) => ate(Math.hypot(l[0] - a[0], l[1] - a[1], l[2] - a[2]))));
    return perto(amostras) * (1 - perto(tiradas));
  }
  const luz = (0.2126 * cor[0] + 0.7152 * cor[1] + 0.0722 * cor[2]) / 255;
  const rampa = Math.max(0.02, imprecisao / 400);
  if (faixa === "realces") return Math.min(1, Math.max(0, (luz - opcoes.limiar / 255) / rampa + 0.5));
  if (faixa === "sombras") return Math.min(1, Math.max(0, ((255 - opcoes.limiar) / 255 - luz) / rampa + 0.5));
  if (faixa === "meiosTons") return Math.max(0, 1 - Math.abs(luz - 0.5) / (0.25 + rampa));
  if (faixa === "pele") {
    // A caixa clássica da pele no YCbCr (Cb 77 a 127, Cr 133 a 173), com a borda suave pela imprecisão
    const cb = 128 - 0.168736 * cor[0] - 0.331264 * cor[1] + 0.5 * cor[2];
    const cr = 128 + 0.5 * cor[0] - 0.418688 * cor[1] - 0.081312 * cor[2];
    const fora = Math.max(77 - cb, cb - 127, 133 - cr, cr - 173, 0);
    return Math.max(0, 1 - fora / Math.max(1, imprecisao / 4));
  }
  const [h, s, v] = hsv(cor);
  const centro = CENTRO_DA_FAIXA[faixa]!;
  const distancia = Math.min(Math.abs(h - centro), 360 - Math.abs(h - centro));
  // Inteira até 15° do centro, some em 45°; o cinza e o quase preto não têm cor
  const doMatiz = Math.min(1, Math.max(0, (45 - distancia) / 30));
  return doMatiz * Math.min(1, s * 3) * Math.min(1, v * 4);
}

/** Selecionar › Intervalo de cores: a seleção da imagem toda pela faixa escolhida. */
export function intervaloDeCores(imagem: ImagemRgba, opcoes: OpcoesDoIntervalo): Selecao {
  const { largura, altura, dados } = imagem;
  const amostras = opcoes.amostras.map(lab);
  const tiradas = opcoes.tiradas.map(lab);
  const selecao = vazia(largura, altura);
  // As cores repetem muito: guarda a conta de cada uma
  const feitas = new Map<number, number>();
  for (let i = 0; i < largura * altura; i++) {
    const chave = (dados[i * 4] << 16) | (dados[i * 4 + 1] << 8) | dados[i * 4 + 2];
    let valor = feitas.get(chave);
    if (valor === undefined) {
      valor = Math.round(coberturaDaCor([dados[i * 4], dados[i * 4 + 1], dados[i * 4 + 2]], opcoes, amostras, tiradas) * 255);
      if (feitas.size < 1 << 20) feitas.set(chave, valor);
    }
    // O transparente não tem cor
    const alfa = dados[i * 4 + 3];
    const coberto = Math.round((valor * alfa) / 255);
    selecao.dados[i] = opcoes.inverter ? 255 - coberto : coberto;
  }
  return selecao;
}

export type OpcoesDaAreaDeFoco = {
  /** 0 a 1: quanto do que é nítido entra (0 pega só o mais nítido; null acha o limite sozinho). */
  intervalo: number | null;
  /** 0 a 1: o quanto a borda é limpa de pontinhos soltos. */
  ruido: number;
};

/** O limite de Otsu de um histograma de 256 caixas: o que melhor separa os dois grupos. */
function otsu(caixas: Uint32Array, total: number): number {
  let soma = 0;
  for (let i = 0; i < 256; i++) soma += i * caixas[i];
  let somaB = 0;
  let pesoB = 0;
  let melhor = 0;
  let limite = 128;
  for (let i = 0; i < 256; i++) {
    pesoB += caixas[i];
    if (!pesoB) continue;
    const pesoF = total - pesoB;
    if (!pesoF) break;
    somaB += i * caixas[i];
    const mB = somaB / pesoB;
    const mF = (soma - somaB) / pesoF;
    const entre = pesoB * pesoF * (mB - mF) ** 2;
    if (entre > melhor) {
      melhor = entre;
      limite = i;
    }
  }
  return limite;
}

/** Selecionar › Área de foco: o que está nítido (a energia do laplaciano numa janela), com as bordas limpas. */
export function areaDeFoco(imagem: ImagemRgba, opcoes: OpcoesDaAreaDeFoco): Selecao {
  const { largura, altura, dados } = imagem;
  const luz = new Float32Array(largura * altura);
  for (let i = 0; i < luz.length; i++) luz[i] = 0.2126 * dados[i * 4] + 0.7152 * dados[i * 4 + 1] + 0.0722 * dados[i * 4 + 2];
  const energia = vazia(largura, altura);
  const bruta = new Float32Array(largura * altura);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      const v = (dx: number, dy: number) => luz[Math.min(altura - 1, Math.max(0, y + dy)) * largura + Math.min(largura - 1, Math.max(0, x + dx))];
      const lap = 4 * luz[i] - v(-1, 0) - v(1, 0) - v(0, -1) - v(0, 1);
      bruta[i] = lap * lap;
    }
  }
  // A energia média numa janela (um desfoque grande do quadrado do laplaciano), em escala de 0 a 255 pelo percentil 99
  let maior = 0;
  for (const v of bruta) if (v > maior) maior = v;
  const r = Math.max(2, Math.round(Math.min(largura, altura) / 60));
  for (let i = 0; i < bruta.length; i++) energia.dados[i] = Math.round(Math.sqrt(bruta[i] / Math.max(1e-6, maior)) * 255);
  const media = difusao(energia, r);
  const caixas = new Uint32Array(256);
  for (const v of media.dados) caixas[v]++;
  let teto = 255;
  for (let conta = 0, k = 255; k >= 0; k--) {
    conta += caixas[k];
    if (conta >= media.dados.length * 0.01) {
      teto = Math.max(1, k);
      break;
    }
  }
  const normal = vazia(largura, altura);
  for (let i = 0; i < normal.dados.length; i++) normal.dados[i] = Math.min(255, Math.round((media.dados[i] / teto) * 255));
  const caixasNormal = new Uint32Array(256);
  for (const v of normal.dados) caixasNormal[v]++;
  // O intervalo vai do mais nítido (0) a quase tudo (1); sem ele, Otsu
  const limite = opcoes.intervalo === null ? otsu(caixasNormal, normal.dados.length) : Math.round((1 - opcoes.intervalo) * 230 + 10);
  const binaria = vazia(largura, altura);
  for (let i = 0; i < binaria.dados.length; i++) binaria.dados[i] = normal.dados[i] > limite ? 255 : 0;
  // Limpar: desfoca e corta no meio (some o pontinho solto, a borda arredonda)
  const limpa = difusao(binaria, r * (0.5 + opcoes.ruido * 2));
  for (let i = 0; i < limpa.dados.length; i++) limpa.dados[i] = Math.round(Math.min(1, Math.max(0, (limpa.dados[i] - 128) / 48 + 0.5)) * 255);
  return limpa;
}

/** Uma cópia menor da imagem (lado maior até `lado`), para a prévia das janelas. */
export function imagemMenor(imagem: ImagemRgba, lado: number): ImagemRgba {
  const fator = Math.min(1, lado / Math.max(imagem.largura, imagem.altura));
  if (fator >= 1) return imagem;
  const largura = Math.max(1, Math.round(imagem.largura * fator));
  const altura = Math.max(1, Math.round(imagem.altura * fator));
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    const ys = Math.min(imagem.altura - 1, Math.floor((y + 0.5) / fator));
    for (let x = 0; x < largura; x++) {
      const xs = Math.min(imagem.largura - 1, Math.floor((x + 0.5) / fator));
      for (let c = 0; c < 4; c++) dados[(y * largura + x) * 4 + c] = imagem.dados[(ys * imagem.largura + xs) * 4 + c];
    }
  }
  return { largura, altura, dados };
}

/** A mediana de cada posição numa janela de raio `r`. */
function medianaMovel(valores: Int32Array, r: number): Int32Array {
  return Int32Array.from(valores, (_, x) => {
    const janela: number[] = [];
    for (let k = Math.max(0, x - r); k <= Math.min(valores.length - 1, x + r); k++) janela.push(valores[k]);
    janela.sort((p, q) => p - q);
    return janela[janela.length >> 1];
  });
}

/**
 * Selecionar › Céu: coluna a coluna, de cima para baixo, enquanto a cor (Lab, numa cópia desfocada) não salta mais de
 * 30 da média dos pixels de cima (com duas linhas de atraso, para a média não seguir a borda desfocada passo a passo):
 * o degradê do céu e as nuvens macias passam, o contorno dos prédios, das montanhas e das pessoas para. Depois, a linha
 * do céu é limpa: a coluna que desce muito além das vizinhas (uma fresta entre dois objetos) ou para muito antes delas
 * (numa nuvem) volta perto da mediana delas, e nenhuma passa do percentil 90 das colunas mais 8% da altura. Use numa
 * cópia menor da imagem.
 */
export function ceu(imagem: ImagemRgba, { limite = 30, atraso = 2 }: { limite?: number; atraso?: number } = {}): Selecao {
  const { largura, altura, dados } = imagem;
  const canais = [0, 1, 2].map((c) => {
    const canal = vazia(largura, altura);
    for (let i = 0; i < canal.dados.length; i++) canal.dados[i] = dados[i * 4 + c];
    return difusao(canal, Math.max(1, Math.min(largura, altura) / 300)).dados;
  });
  const parada = new Int32Array(largura);
  // A média segue a coluna com quatro linhas de atraso: sem ele, ela acompanhava a borda desfocada passo a passo
  for (let x = 0; x < largura; x++) {
    const cores: Rgb[] = [lab([canais[0][x], canais[1][x], canais[2][x]])];
    const media = [...cores[0]];
    let y = 1;
    for (; y < altura; y++) {
      const i = y * largura + x;
      const cor = lab([canais[0][i], canais[1][i], canais[2][i]]);
      if (Math.hypot(cor[0] - media[0], cor[1] - media[1], cor[2] - media[2]) > limite) break;
      cores.push(cor);
      const atrasada = cores[Math.max(0, cores.length - 1 - atraso)];
      for (let c = 0; c < 3; c++) media[c] = media[c] * 0.7 + atrasada[c] * 0.3;
    }
    parada[x] = y;
  }
  const vizinhas = medianaMovel(parada, 4);
  const ordenadas = [...parada].sort((p, q) => p - q);
  const teto = ordenadas[Math.floor(ordenadas.length * 0.9)] + Math.round(altura * 0.08);
  const linha = medianaMovel(Int32Array.from(parada, (p, x) => Math.min(Math.max(p, vizinhas[x] - 6), vizinhas[x] + 4, teto)), 2);
  const selecao = vazia(largura, altura);
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) if (y < linha[x]) selecao.dados[y * largura + x] = 255;
  return difusao(selecao, 0.7);
}
