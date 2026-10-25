// Os escopos de cor do editor de vídeo (forma de onda, desfile RGB, vetorscópio e histograma), contados sobre o quadro
// que a prévia acabou de desenhar. Contas puras: recebem os pixels RGBA e devolvem as contagens; quem pinta é o painel.
// A luz e a cor são as do BT.709 sobre os valores com gama, a mesma matriz em que o render grava o vídeo.

export type Pixels = { largura: number; altura: number; dados: Uint8ClampedArray };
export type CanalDoEscopo = "luma" | "r" | "g" | "b";

/** O Y do BT.709 de um pixel de 8 bits (0 a 255). */
export function lumaDe(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * A forma de onda de um canal: para cada uma das `colunas` (a largura da imagem dividida por igual), quantos pixels
 * têm cada nível de 0 a 255. Fica em `contagens[coluna * 256 + nivel]`.
 */
export function formaDeOnda(pixels: Pixels, canal: CanalDoEscopo, colunas: number): Uint32Array {
  const contagens = new Uint32Array(colunas * 256);
  const { largura, altura, dados } = pixels;
  for (let x = 0; x < largura; x++) {
    const base = Math.min(colunas - 1, Math.floor((x * colunas) / largura)) * 256;
    for (let y = 0; y < altura; y++) {
      const i = (y * largura + x) * 4;
      const nivel = canal === "luma" ? Math.round(lumaDe(dados[i], dados[i + 1], dados[i + 2])) : dados[i + (canal === "r" ? 0 : canal === "g" ? 1 : 2)];
      contagens[base + nivel]++;
    }
  }
  return contagens;
}

/** Onde a cor cai no vetorscópio: o Cb para a direita e o Cr para cima, de -0,5 a 0,5 (o círculo de raio 0,5 é o limite). */
export function posicaoNoVetorscopio(r: number, g: number, b: number): [number, number] {
  const y = lumaDe(r, g, b);
  return [(b - y) / 255 / 1.8556, (r - y) / 255 / 1.5748];
}

/** O vetorscópio num quadrado de `lado` × `lado`: quantos pixels caem em cada casa (linha 0 em cima, o Cr positivo). */
export function vetorscopio(pixels: Pixels, lado: number): Uint32Array {
  const contagens = new Uint32Array(lado * lado);
  const { largura, altura, dados } = pixels;
  for (let i = 0; i < largura * altura * 4; i += 4) {
    const [cb, cr] = posicaoNoVetorscopio(dados[i], dados[i + 1], dados[i + 2]);
    const x = Math.min(lado - 1, Math.max(0, Math.floor((cb + 0.5) * lado)));
    const y = Math.min(lado - 1, Math.max(0, Math.floor((0.5 - cr) * lado)));
    contagens[y * lado + x]++;
  }
  return contagens;
}

export type Histogramas = { r: Uint32Array; g: Uint32Array; b: Uint32Array; luma: Uint32Array };

export function histogramas(pixels: Pixels): Histogramas {
  const saida = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), luma: new Uint32Array(256) };
  const { largura, altura, dados } = pixels;
  for (let i = 0; i < largura * altura * 4; i += 4) {
    saida.r[dados[i]]++;
    saida.g[dados[i + 1]]++;
    saida.b[dados[i + 2]]++;
    saida.luma[Math.round(lumaDe(dados[i], dados[i + 1], dados[i + 2]))]++;
  }
  return saida;
}

/** As casas das barras de cor (a 75% e a 100%) e a linha dos tons de pele, para o desenho do vetorscópio. */
export const ALVOS_DO_VETORSCOPIO: { nome: string; cor: [number, number, number] }[] = [
  { nome: "R", cor: [255, 0, 0] },
  { nome: "Mg", cor: [255, 0, 255] },
  { nome: "B", cor: [0, 0, 255] },
  { nome: "Cy", cor: [0, 255, 255] },
  { nome: "G", cor: [0, 255, 0] },
  { nome: "Yl", cor: [255, 255, 0] },
];

/** O ângulo da linha dos tons de pele no vetorscópio, em graus a partir do Cb positivo, no sentido anti-horário. */
export const ANGULO_DA_PELE = 123;

/**
 * Leva uma contagem a um brilho de 0 a 1 pela escala logarítmica, que mostra os poucos pixels sem estourar os muitos:
 * `referencia` é a contagem que já sai no brilho máximo.
 */
export function brilhoDaContagem(contagem: number, referencia: number): number {
  if (contagem <= 0) return 0;
  return Math.min(1, Math.log1p(contagem) / Math.log1p(Math.max(1, referencia)));
}

