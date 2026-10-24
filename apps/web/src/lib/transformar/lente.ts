// Filtro › Correção de lente e Filtro › Grande-angular adaptável (ADR 0003, onda 13.6). As duas são um mapa de cada
// pixel do resultado para o ponto da foto, lido na interpolação de sempre:
// - a correção de lente: a distorção (barril ou almofada, um termo radial), a franja de cor (o vermelho e o azul lidos
//   num raio um pouco maior ou menor), a vinheta (a luz pela distância ao meio) e a perspectiva vertical e horizontal,
//   o giro e a escala;
// - a grande-angular: a projeção da lente (olho de peixe equidistante, a estereográfica das grandes-angulares comuns
//   ou a esférica de um panorama) levada à retilínea, com a distância focal em frações da meia diagonal. As restrições
//   (linhas que deveriam ser retas, marcadas na foto) acham a focal que mais as endireita.
import { coeficientesDaHomografia, type Ponto, type Quadrilatero } from "./malha.ts";
import { type Interpolacao, leitor } from "./livre.ts";

type Imagem = { dados: ArrayLike<number>; largura: number; altura: number };

export type OpcoesDaLente = {
  /** −100 (almofada) a 100 (barril): o quanto tirar da distorção. */
  distorcao: number;
  /** −100 a 100: a franja vermelha e ciano e a azul e amarela. */
  franjaVermelha: number;
  franjaAzul: number;
  /** −100 (escurece a borda) a 100 (clareia) e o ponto médio (0 a 100). */
  vinheta: number;
  pontoMedio: number;
  /** −100 a 100: o quanto o alto ou o lado cresce (corrige o prédio que cai para trás). */
  perspectivaV: number;
  perspectivaH: number;
  /** Graus e porcentagem. */
  angulo: number;
  escala: number;
};
export const LENTE_PADRAO: OpcoesDaLente = { distorcao: 0, franjaVermelha: 0, franjaAzul: 0, vinheta: 0, pontoMedio: 50, perspectivaV: 0, perspectivaH: 0, angulo: 0, escala: 100 };

/** A homografia da perspectiva (do resultado para a foto, em coordenadas de −1 a 1): o alto ou o lado encolhem. */
function quadDaPerspectiva(v: number, h: number): Quadrilatero {
  const kv = (v / 100) * 0.4;
  const kh = (h / 100) * 0.4;
  // Os cantos da foto que vão para os cantos do resultado
  return [
    { x: -1 - kv, y: -1 - kh },
    { x: 1 + kv, y: -1 + kh },
    { x: 1 - kv, y: 1 - kh },
    { x: -1 + kv, y: 1 + kh },
  ];
}

/** A foto corrigida (do mesmo tamanho). Fora da foto fica transparente. */
export function corrigirLente(imagem: Imagem, opcoes: OpcoesDaLente, interpolacao: Interpolacao = "bilinear"): Uint8ClampedArray<ArrayBuffer> {
  const { largura, altura } = imagem;
  const saida = new Uint8ClampedArray(largura * altura * 4);
  const cx = largura / 2;
  const cy = altura / 2;
  const meiaDiagonal = Math.hypot(cx, cy);
  const k1 = (opcoes.distorcao / 100) * 0.5;
  const kr = (opcoes.franjaVermelha / 100) * 0.01;
  const kb = (opcoes.franjaAzul / 100) * 0.01;
  const a = (opcoes.angulo * Math.PI) / 180;
  const escala = opcoes.escala / 100;
  const [ha, hb, hc, hd, he, hf, hg, hh] = coeficientesDaHomografia(quadDaPerspectiva(opcoes.perspectivaV, opcoes.perspectivaH));
  const ler = leitor(imagem, interpolacao);
  const canal = new Uint8ClampedArray(4);
  const vinheta = opcoes.vinheta / 100;
  const meio = 0.2 + (opcoes.pontoMedio / 100) * 0.8;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      // O ponto do resultado, de −1 a 1 pela meia diagonal, sem a escala e o giro
      let nx = (x + 0.5 - cx) / meiaDiagonal / escala;
      let ny = (y + 0.5 - cy) / meiaDiagonal / escala;
      [nx, ny] = [nx * Math.cos(-a) - ny * Math.sin(-a), nx * Math.sin(-a) + ny * Math.cos(-a)];
      // A perspectiva: a homografia leva o quadrado (de −1 a 1, em u e v de 0 a 1) aos cantos da foto
      const u = ((nx * meiaDiagonal) / cx + 1) / 2;
      const v = ((ny * meiaDiagonal) / cy + 1) / 2;
      const w = hg * u + hh * v + 1;
      nx = (((ha * u + hb * v + hc) / w) * cx) / meiaDiagonal;
      ny = (((hd * u + he * v + hf) / w) * cy) / meiaDiagonal;
      // A distorção: o ponto da foto fica mais longe (barril) ou mais perto (almofada) do meio
      const r2 = nx * nx + ny * ny;
      const fator = 1 + k1 * r2;
      const k = (y * largura + x) * 4;
      const fonte = (extra: number) => ({ x: cx + nx * fator * (1 + extra) * meiaDiagonal - 0.5, y: cy + ny * fator * (1 + extra) * meiaDiagonal - 0.5 });
      const p = fonte(0);
      ler(p.x, p.y, saida, k);
      if (kr || kb) {
        canal.fill(0);
        const pr = fonte(kr);
        ler(pr.x, pr.y, canal, 0);
        saida[k] = canal[0];
        canal.fill(0);
        const pb = fonte(kb);
        ler(pb.x, pb.y, canal, 0);
        saida[k + 2] = canal[2];
      }
      if (vinheta) {
        const r = Math.sqrt(r2);
        const t = Math.max(0, Math.min(1, (r - meio * 0.5) / Math.max(0.05, 1 - meio * 0.5)));
        const ganho = 1 + vinheta * t * t;
        for (let c = 0; c < 3; c++) saida[k + c] = saida[k + c] * ganho;
      }
    }
  }
  return saida;
}

export type TipoDaGrandeAngular = "olhoDePeixe" | "perspectiva" | "esferica";
export type OpcoesDaGrandeAngular = { tipo: TipoDaGrandeAngular; /** A distância focal em frações da meia diagonal. */ focal: number; escala: number };

/** O raio na foto (da lente) para o raio no resultado (retilíneo), os dois em frações da meia diagonal. */
function raioNaFoto(tipo: TipoDaGrandeAngular, r: number, f: number): number {
  const theta = Math.atan(r / f);
  if (tipo === "olhoDePeixe") return f * theta;
  // A estereográfica (as grandes-angulares comuns ficam entre ela e a retilínea)
  return 2 * f * Math.tan(theta / 2);
}
/** O contrário: o raio no resultado para um raio na foto (o mapa das restrições). */
function raioNoResultado(tipo: TipoDaGrandeAngular, r: number, f: number): number {
  const theta = tipo === "olhoDePeixe" ? r / f : 2 * Math.atan(r / (2 * f));
  return theta >= Math.PI / 2 - 1e-3 ? f * Math.tan(Math.PI / 2 - 1e-3) : f * Math.tan(theta);
}

/** Um ponto do resultado levado à foto (em frações da meia diagonal, a partir do meio). */
export function naFoto(tipo: TipoDaGrandeAngular, x: number, y: number, f: number): Ponto {
  if (tipo === "esferica") {
    // O panorama: longitude e latitude na foto; o resultado é a vista retilínea na direção do meio
    const comprimento = Math.hypot(x, y, f);
    const longitude = Math.atan2(x, f);
    const latitude = Math.asin(y / comprimento);
    return { x: f * longitude, y: f * latitude };
  }
  const r = Math.hypot(x, y);
  if (r < 1e-12) return { x, y };
  const k = raioNaFoto(tipo, r, f) / r;
  return { x: x * k, y: y * k };
}

/** A foto levada à projeção retilínea (as linhas retas do mundo ficam retas). */
export function corrigirGrandeAngular(imagem: Imagem, opcoes: OpcoesDaGrandeAngular, interpolacao: Interpolacao = "bilinear"): Uint8ClampedArray<ArrayBuffer> {
  const { largura, altura } = imagem;
  const saida = new Uint8ClampedArray(largura * altura * 4);
  const cx = largura / 2;
  const cy = altura / 2;
  const meiaDiagonal = Math.hypot(cx, cy);
  const escala = opcoes.escala / 100;
  const ler = leitor(imagem, interpolacao);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const p = naFoto(opcoes.tipo, (x + 0.5 - cx) / meiaDiagonal / escala, (y + 0.5 - cy) / meiaDiagonal / escala, opcoes.focal);
      ler(cx + p.x * meiaDiagonal - 0.5, cy + p.y * meiaDiagonal - 0.5, saida, (y * largura + x) * 4);
    }
  }
  return saida;
}

/** Um ponto da foto levado ao resultado (sem a escala), em pixels: para mostrar e medir as restrições. */
export function pontoNoResultado(tipo: TipoDaGrandeAngular, p: Ponto, largura: number, altura: number, f: number): Ponto {
  const cx = largura / 2;
  const cy = altura / 2;
  const d = Math.hypot(cx, cy);
  const x = (p.x - cx) / d;
  const y = (p.y - cy) / d;
  if (tipo === "esferica") {
    const longitude = x / f;
    const latitude = y / f;
    const dx = Math.sin(longitude) * Math.cos(latitude);
    const dy = Math.sin(latitude);
    const dz = Math.cos(longitude) * Math.cos(latitude);
    return { x: cx + ((dx / Math.max(1e-6, dz)) * f) * d, y: cy + ((dy / Math.max(1e-6, dz)) * f) * d };
  }
  const r = Math.hypot(x, y);
  if (r < 1e-12) return { ...p };
  const k = raioNoResultado(tipo, r, f) / r;
  return { x: cx + x * k * d, y: cy + y * k * d };
}

/** O quanto os pontos fogem da reta que melhor passa por eles (o menor autovalor, sobre o comprimento ao quadrado). */
function torto(pontos: Ponto[]): number {
  const n = pontos.length;
  const mx = pontos.reduce((s, p) => s + p.x, 0) / n;
  const my = pontos.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pontos) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  const traco = sxx + syy;
  const menor = traco / 2 - Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
  return menor / Math.max(1e-9, traco);
}

/** A focal (entre 0,2 e 5 meias diagonais) que mais endireita as restrições (cada uma com 3 pontos ou mais). */
export function focalPelasRestricoes(restricoes: Ponto[][], largura: number, altura: number, tipo: TipoDaGrandeAngular): number | null {
  const validas = restricoes.filter((r) => r.length >= 3);
  if (!validas.length) return null;
  const erro = (f: number) => validas.reduce((s, r) => s + torto(r.map((p) => pontoNoResultado(tipo, p, largura, altura, f))), 0);
  // Uma grade em escala logarítmica e a seção áurea em volta do melhor
  let melhor = 1;
  let menor = Infinity;
  for (let i = 0; i <= 60; i++) {
    const f = 0.2 * Math.pow(25, i / 60);
    const e = erro(f);
    if (e < menor) {
      menor = e;
      melhor = f;
    }
  }
  let a = melhor / 1.06;
  let b = melhor * 1.06;
  const fi = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 40; k++) {
    const c = b - fi * (b - a);
    const d = a + fi * (b - a);
    if (erro(c) < erro(d)) b = d;
    else a = c;
  }
  return (a + b) / 2;
}
