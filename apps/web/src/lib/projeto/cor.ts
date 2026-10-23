// Ajustes de cor e filtros prontos. A mesma conta roda aqui e no Python do render (core/utils/cor.py), e vira
// a mesma LUT 3D nos dois: o render passa ao lut3d do FFmpeg, a prévia lê numa textura 3D (lutDaCor e lerLut).
// Os casos de tests/casos/cor.json conferem o TypeScript e o Python.
//
// Ordem: níveis (na tela); exposição e balanço de branco em luz linear; contraste, realces, sombras, brancos,
// pretos, as rodas de cor, a saturação e a vibração nos valores de tela (sRGB); depois a cor por matiz e as
// curvas. A vinheta depende da posição do pixel e fica à parte.

export type AjustesCor = {
  /** -1 (frio, azulado) a 1 (quente, alaranjado). */
  temperatura: number;
  /** -1 (esverdeado) a 1 (magenta). */
  tom: number;
  /** Em pontos de luz (stops): -2 a 2. */
  exposicao: number;
  /** -1 a 1. */
  contraste: number;
  /** -1 (escurece os claros) a 1 (clareia). */
  realces: number;
  /** -1 (escurece os escuros) a 1 (clareia). */
  sombras: number;
  /** -1 (preto e branco) a 1. */
  saturacao: number;
  /** 0 a 1: escurece as bordas. */
  vinheta: number;
  /** Rodas de cor: o matiz (0 a 360°) e a força (0 a 1) que puxam escuros, meios-tons e claros. */
  matiz_escuros: number;
  forca_escuros: number;
  matiz_medios: number;
  forca_medios: number;
  matiz_claros: number;
  forca_claros: number;
  /** -1 a 1: como a saturação, mas mais forte nas cores apagadas. */
  vibracao: number;
  /** -1 a 1: como realces e sombras, só nas pontas (o quase branco e o quase preto). */
  brancos: number;
  pretos: number;
  /** Níveis: o preto de entrada (0 a 0,45), o branco de entrada contado de 1 para baixo (0 a 0,45) e a gama em potência de 2 (-1 a 1). */
  niveis_preto: number;
  niveis_branco: number;
  niveis_gama: number;
};

/** As três rodas, na ordem dos tons. */
export const RODAS = [
  { id: "escuros", nome: "Escuros", matiz: "matiz_escuros", forca: "forca_escuros" },
  { id: "medios", nome: "Meios-tons", matiz: "matiz_medios", forca: "forca_medios" },
  { id: "claros", nome: "Claros", matiz: "matiz_claros", forca: "forca_claros" },
] as const;

export type Cor = AjustesCor & {
  /** Filtro pronto somado aos ajustes, com intensidade de 0 a 2 (200%). */
  filtro: string | null;
  intensidade: number;
  /** Curvas depois dos ajustes; sem elas, nada muda. */
  curvas?: Curvas | null;
  /** Cor por matiz, entre os ajustes e as curvas; só as faixas mexidas. */
  hsl?: Hsl | null;
};

export const AJUSTES_NEUTROS: AjustesCor = {
  temperatura: 0,
  tom: 0,
  exposicao: 0,
  contraste: 0,
  realces: 0,
  sombras: 0,
  saturacao: 0,
  vinheta: 0,
  matiz_escuros: 0,
  forca_escuros: 0,
  matiz_medios: 0,
  forca_medios: 0,
  matiz_claros: 0,
  forca_claros: 0,
  vibracao: 0,
  brancos: 0,
  pretos: 0,
  niveis_preto: 0,
  niveis_branco: 0,
  niveis_gama: 0,
};
export const COR_PADRAO: Cor = { ...AJUSTES_NEUTROS, filtro: null, intensidade: 1, curvas: null, hsl: null };

export const LIMITES_COR: Record<keyof AjustesCor, { minimo: number; maximo: number }> = {
  temperatura: { minimo: -1, maximo: 1 },
  tom: { minimo: -1, maximo: 1 },
  exposicao: { minimo: -2, maximo: 2 },
  contraste: { minimo: -1, maximo: 1 },
  realces: { minimo: -1, maximo: 1 },
  sombras: { minimo: -1, maximo: 1 },
  saturacao: { minimo: -1, maximo: 1 },
  vinheta: { minimo: 0, maximo: 1 },
  matiz_escuros: { minimo: 0, maximo: 360 },
  forca_escuros: { minimo: 0, maximo: 1 },
  matiz_medios: { minimo: 0, maximo: 360 },
  forca_medios: { minimo: 0, maximo: 1 },
  matiz_claros: { minimo: 0, maximo: 360 },
  forca_claros: { minimo: 0, maximo: 1 },
  vibracao: { minimo: -1, maximo: 1 },
  brancos: { minimo: -1, maximo: 1 },
  pretos: { minimo: -1, maximo: 1 },
  niveis_preto: { minimo: 0, maximo: 0.45 },
  niveis_branco: { minimo: 0, maximo: 0.45 },
  niveis_gama: { minimo: -1, maximo: 1 },
};

/** O matiz sozinho não muda nada: só conta com força. */
const MATIZES = new Set<keyof AjustesCor>(["matiz_escuros", "matiz_medios", "matiz_claros"]);

/** Filtros prontos: nomes e valores do TakeOne. */
export const FILTROS: { id: string; nome: string; ajustes: Partial<AjustesCor> }[] = [
  { id: "quente", nome: "Quente", ajustes: { temperatura: 0.45, saturacao: 0.1 } },
  { id: "frio", nome: "Frio", ajustes: { temperatura: -0.45, tom: -0.05 } },
  { id: "vivido", nome: "Vívido", ajustes: { saturacao: 0.35, contraste: 0.15 } },
  { id: "suave", nome: "Suave", ajustes: { contraste: -0.25, sombras: 0.25, saturacao: -0.1 } },
  { id: "pb", nome: "Preto e branco", ajustes: { saturacao: -1, contraste: 0.1 } },
  { id: "noite", nome: "Noite", ajustes: { temperatura: -0.35, exposicao: -0.4, contraste: 0.15, vinheta: 0.4 } },
  { id: "antigo", nome: "Antigo", ajustes: { temperatura: 0.3, saturacao: -0.35, contraste: -0.15, sombras: 0.2, vinheta: 0.3 } },
  { id: "drama", nome: "Drama", ajustes: { contraste: 0.35, saturacao: -0.15, sombras: -0.2, realces: -0.2, vinheta: 0.25 } },
  {
    id: "cinema",
    nome: "Cinema",
    ajustes: { contraste: 0.15, matiz_escuros: 195, forca_escuros: 0.5, matiz_claros: 30, forca_claros: 0.35, saturacao: -0.05 },
  },
];

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/** Os ajustes que valem: os do clipe mais os do filtro vezes a intensidade, dentro dos limites. */
export function ajustesEfetivos(cor: Cor | null | undefined): AjustesCor {
  if (!cor) return AJUSTES_NEUTROS;
  const filtro = FILTROS.find((item) => item.id === cor.filtro)?.ajustes ?? {};
  const resultado = { ...AJUSTES_NEUTROS };
  for (const chave of Object.keys(AJUSTES_NEUTROS) as (keyof AjustesCor)[]) {
    const { minimo, maximo } = LIMITES_COR[chave];
    // O matiz do filtro substitui o do clipe (somar ângulos não faz sentido); a força soma
    const valor = MATIZES.has(chave) && filtro[chave] !== undefined ? filtro[chave] : (cor[chave] ?? 0) + (filtro[chave] ?? 0) * cor.intensidade;
    resultado[chave] = limitar(valor, minimo, maximo);
  }
  return resultado;
}

/** Os ajustes com outros somados (os de um efeito), dentro dos limites. */
export function somarAjustes(ajustes: AjustesCor, mais: Partial<AjustesCor>): AjustesCor {
  const resultado = { ...ajustes };
  for (const chave of Object.keys(mais) as (keyof AjustesCor)[]) {
    resultado[chave] = limitar(ajustes[chave] + (mais[chave] ?? 0), LIMITES_COR[chave].minimo, LIMITES_COR[chave].maximo);
  }
  return resultado;
}

export function corNeutra(ajustes: AjustesCor): boolean {
  return (Object.keys(AJUSTES_NEUTROS) as (keyof AjustesCor)[]).every((chave) => MATIZES.has(chave) || Math.abs(ajustes[chave]) < 1e-9);
}

// -----------------------------------------------
// A conta, pixel a pixel (valores de 0 a 1)
// -----------------------------------------------
export function paraLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function paraTela(c: number): number {
  const v = limitar(c, 0, 1);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** Quanto a temperatura e o tom mexem em cada canal. */
export const FORCA_TEMPERATURA = 0.15;
export const FORCA_TOM = 0.1;
/** Quanto realces e sombras somam, no máximo. */
const FORCA_REALCES_SOMBRAS = 0.25;
/** Brancos e pretos: como realces e sombras, mas só nas pontas (a quarta potência da luminância). */
const FORCA_BRANCOS_PRETOS = 0.25;
/** Quanto uma roda de cor com força 1 desloca a cor. */
const FORCA_RODAS = 0.3;
const LUMA = [0.2126, 0.7152, 0.0722];

/** A direção de uma roda: a cor pura do matiz menos a luminância dela (não clareia nem escurece). */
export function vetorDaRoda(matiz: number): [number, number, number] {
  const h = (((matiz % 360) + 360) % 360) / 60;
  const pura = [limitar(Math.abs(h - 3) - 1, 0, 1), limitar(2 - Math.abs(h - 2), 0, 1), limitar(2 - Math.abs(h - 4), 0, 1)];
  const y = LUMA[0] * pura[0] + LUMA[1] * pura[1] + LUMA[2] * pura[2];
  return [pura[0] - y, pura[1] - y, pura[2] - y];
}

/** O deslocamento de cada roda, já com a força: é o que o shader recebe. */
export function deslocamentosDasRodas(a: AjustesCor): [number, number, number][] {
  return RODAS.map((roda) => vetorDaRoda(a[roda.matiz]).map((v) => v * a[roda.forca] * FORCA_RODAS) as [number, number, number]);
}

/** Cor de um pixel (sem a vinheta). */
export function aplicarCor(entrada: [number, number, number], a: AjustesCor): [number, number, number] {
  // Níveis, antes de tudo e na tela: o preto e o branco de entrada viram 0 e 1, e a gama curva o meio
  const preto = a.niveis_preto ?? 0;
  const branco = 1 - (a.niveis_branco ?? 0);
  const expoente = 1 / 2 ** (a.niveis_gama ?? 0);
  const [r, g, b] = entrada.map((v) => limitar((v - preto) / (branco - preto), 0, 1) ** expoente);

  // Luz linear: exposição e balanço de branco
  const ganho = 2 ** a.exposicao;
  let lr = paraLinear(r) * ganho * (1 + FORCA_TEMPERATURA * a.temperatura);
  let lg = paraLinear(g) * ganho * (1 - FORCA_TOM * a.tom);
  let lb = paraLinear(b) * ganho * (1 - FORCA_TEMPERATURA * a.temperatura);
  [lr, lg, lb] = [paraTela(lr), paraTela(lg), paraTela(lb)];

  // Contraste em volta do cinza médio
  const fatorContraste = 1 + a.contraste;
  let c = [lr, lg, lb].map((v) => limitar((v - 0.5) * fatorContraste + 0.5, 0, 1));

  // Realces pesam nos claros e sombras nos escuros, pela luminância
  const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const soma =
    FORCA_REALCES_SOMBRAS * (a.realces * y * y + a.sombras * (1 - y) * (1 - y)) + FORCA_BRANCOS_PRETOS * ((a.brancos ?? 0) * y ** 4 + (a.pretos ?? 0) * (1 - y) ** 4);
  c = c.map((v) => limitar(v + soma, 0, 1));

  // Rodas de cor: escuros, meios-tons e claros, pesados pela luminância (os pesos somam 1)
  const yr = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const pesos = [(1 - yr) * (1 - yr), 2 * yr * (1 - yr), yr * yr];
  const rodas = deslocamentosDasRodas(a);
  c = c.map((v, k) => limitar(v + pesos[0] * rodas[0][k] + pesos[1] * rodas[1][k] + pesos[2] * rodas[2][k], 0, 1));

  // Saturação e vibração: afasta ou aproxima cada canal da luminância; a vibração pesa mais nas cores apagadas
  const y2 = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const croma = Math.max(...c) - Math.min(...c);
  const fatorSaturacao = 1 + a.saturacao + (a.vibracao ?? 0) * (1 - croma);
  c = c.map((v) => limitar(y2 + (v - y2) * fatorSaturacao, 0, 1));
  return [c[0], c[1], c[2]];
}

function suave(borda0: number, borda1: number, x: number): number {
  const t = limitar((x - borda0) / (borda1 - borda0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Quanto a vinheta escurece no ponto (u, v) do clipe (0 a 1 em cada eixo): 0 no meio, até `vinheta` nos cantos. */
export function escurecimentoDaVinheta(u: number, v: number, vinheta: number): number {
  const distancia = Math.hypot((u - 0.5) * 2, (v - 0.5) * 2) / Math.SQRT2;
  return vinheta * suave(0.3, 1, distancia);
}

// -----------------------------------------------
// Curvas: RGB (as três juntas) e uma por canal, aplicadas depois dos ajustes. A mesma conta de
// core/utils/cor.py (casos em tests/casos/curvas.json). O shader lê a curva numa tabela de 256 tons.
// -----------------------------------------------
export type PontoDaCurva = [number, number];
export type CanalDaCurva = "rgb" | "r" | "g" | "b";
export type Curvas = Record<CanalDaCurva, PontoDaCurva[]>;

export const CURVA_NEUTRA: PontoDaCurva[] = [
  [0, 0],
  [1, 1],
];
export const CURVAS_NEUTRAS: Curvas = { rgb: CURVA_NEUTRA, r: CURVA_NEUTRA, g: CURVA_NEUTRA, b: CURVA_NEUTRA };
export const PONTOS_MAXIMOS_DA_CURVA = 16;

/** Fritsch–Carlson: tangentes que mantêm a curva sem passar dos pontos (monótona entre eles). */
function tangentes(xs: number[], ys: number[]): number[] {
  const n = xs.length;
  const d = xs.slice(0, -1).map((x, k) => (ys[k + 1] - ys[k]) / (xs[k + 1] - x));
  const m = [d[0], ...d.slice(1).map((dk, i) => (d[i] * dk > 0 ? (d[i] + dk) / 2 : 0)), d[n - 2]];
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const a = m[k] / d[k];
    const b = m[k + 1] / d[k];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[k] = t * a * d[k];
      m[k + 1] = t * b * d[k];
    }
  }
  return m;
}

/** A curva no ponto x (0 a 1): cúbica monótona pelos pontos, reta fora deles, de 0 a 1. */
export function valorDaCurva(pontos: PontoDaCurva[], x: number): number {
  const xs = pontos.map((p) => p[0]);
  const ys = pontos.map((p) => p[1]);
  if (x <= xs[0]) return limitar(ys[0], 0, 1);
  if (x >= xs[xs.length - 1]) return limitar(ys[ys.length - 1], 0, 1);
  const m = tangentes(xs, ys);
  let k = 0;
  while (k < xs.length - 2 && xs[k + 1] <= x) k++;
  const h = xs[k + 1] - xs[k];
  const t = (x - xs[k]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const valor = (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1];
  return limitar(valor, 0, 1);
}

const ehNeutra = (pontos: PontoDaCurva[] | undefined) =>
  !pontos || (pontos.length === 2 && pontos[0][0] === 0 && pontos[0][1] === 0 && pontos[1][0] === 1 && pontos[1][1] === 1);

export function curvasNeutras(curvas: Partial<Curvas> | null | undefined): boolean {
  return !curvas || (["rgb", "r", "g", "b"] as const).every((canal) => ehNeutra(curvas[canal]));
}

/** A curva RGB nos três canais, depois a de cada canal. */
export function aplicarCurvas([r, g, b]: [number, number, number], curvas: Partial<Curvas> | null | undefined): [number, number, number] {
  if (curvasNeutras(curvas)) return [r, g, b];
  const geral = curvas!.rgb ?? CURVA_NEUTRA;
  const canal = (pontos: PontoDaCurva[] | undefined, v: number) => valorDaCurva(pontos ?? CURVA_NEUTRA, valorDaCurva(geral, v));
  return [canal(curvas!.r, r), canal(curvas!.g, g), canal(curvas!.b, b)];
}

// -----------------------------------------------
// Cor por matiz: oito faixas, cada uma com o giro do matiz, a saturação e a luminância (de -1 a 1)
// -----------------------------------------------
export type FaixaDeMatiz = "vermelho" | "laranja" | "amarelo" | "verde" | "ciano" | "azul" | "roxo" | "magenta";
export type AjusteDaFaixa = { matiz: number; saturacao: number; luminancia: number };
export type Hsl = Partial<Record<FaixaDeMatiz, AjusteDaFaixa>>;

export const FAIXAS_DE_MATIZ: { id: FaixaDeMatiz; nome: string; centro: number; amostra: string }[] = [
  { id: "vermelho", nome: "Vermelho", centro: 0, amostra: "#e5484d" },
  { id: "laranja", nome: "Laranja", centro: 30, amostra: "#f2913d" },
  { id: "amarelo", nome: "Amarelo", centro: 60, amostra: "#e9d53a" },
  { id: "verde", nome: "Verde", centro: 120, amostra: "#46b562" },
  { id: "ciano", nome: "Ciano", centro: 180, amostra: "#3dc4cf" },
  { id: "azul", nome: "Azul", centro: 240, amostra: "#4867e0" },
  { id: "roxo", nome: "Roxo", centro: 270, amostra: "#8a52d6" },
  { id: "magenta", nome: "Magenta", centro: 300, amostra: "#d64fb4" },
];
/** Graus que o matiz gira com o ajuste da faixa em 1. */
const GIRO_MAXIMO = 30;
const FORCA_LUMINANCIA = 0.3;

export function hslNeutro(hsl: Hsl | null | undefined): boolean {
  return !hsl || Object.values(hsl).every((faixa) => !faixa || Object.values(faixa).every((v) => Math.abs(v) < 1e-9));
}

/** As duas faixas vizinhas do matiz (em graus) e o peso de cada uma, que somam 1. */
function pesosDasFaixas(matiz: number): [FaixaDeMatiz, number][] {
  const h = ((matiz % 360) + 360) % 360;
  for (let i = 0; i < FAIXAS_DE_MATIZ.length; i++) {
    const atual = FAIXAS_DE_MATIZ[i];
    const proxima = FAIXAS_DE_MATIZ[(i + 1) % FAIXAS_DE_MATIZ.length];
    const fim = i === FAIXAS_DE_MATIZ.length - 1 ? proxima.centro + 360 : proxima.centro;
    if (atual.centro <= h && h < fim) {
      const t = (h - atual.centro) / (fim - atual.centro);
      return [
        [atual.id, 1 - t],
        [proxima.id, t],
      ];
    }
  }
  return [[FAIXAS_DE_MATIZ[0].id, 1]];
}

function paraHsl(r: number, g: number, b: number): [number, number, number] {
  const maior = Math.max(r, g, b);
  const menor = Math.min(r, g, b);
  const l = (maior + menor) / 2;
  const d = maior - menor;
  if (d < 1e-12) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  // O resto de Python (sempre positivo) no setor do vermelho
  const h = maior === r ? 60 * ((((g - b) / d) % 6) + 6) % 360 : maior === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return [h, s, l];
}

function deHsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const setor = Math.floor(hh) % 6;
  const [r, g, b] = ([[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]] as const)[setor];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

/**
 * Cor por matiz, depois dos ajustes: cada pixel pega a mistura das duas faixas vizinhas do matiz dele. O giro e a
 * saturação não mexem no cinza (que não tem matiz); a luminância pesa pelo croma, para o cinza também ficar.
 */
export function aplicarHsl(rgb: [number, number, number], hsl: Hsl | null | undefined): [number, number, number] {
  if (hslNeutro(hsl)) return rgb;
  const [h, s0, l0] = paraHsl(...rgb);
  const croma = Math.max(...rgb) - Math.min(...rgb);
  let giro = 0;
  let saturacao = 0;
  let luminancia = 0;
  for (const [faixa, peso] of pesosDasFaixas(h)) {
    const ajuste = hsl![faixa];
    giro += peso * (ajuste?.matiz ?? 0);
    saturacao += peso * (ajuste?.saturacao ?? 0);
    luminancia += peso * (ajuste?.luminancia ?? 0);
  }
  const s = limitar(s0 * (1 + saturacao), 0, 1);
  const l = limitar(l0 + FORCA_LUMINANCIA * luminancia * croma, 0, 1);
  return deHsl(h + GIRO_MAXIMO * giro, s, l).map((v) => limitar(v, 0, 1)) as [number, number, number];
}

/** Os pontos de cada eixo da LUT 3D, os mesmos do render (PONTOS_LUT em core/utils/cor.py). */
export const PONTOS_DA_LUT = 33;

/** A LUT 3D da prévia: a chave (para não subir a mesma de novo) e os valores em RGBA. */
export type LutDaCor = { chave: string; dados: Float32Array };

/**
 * A LUT 3D dos ajustes e das curvas, a mesma do .cube do render (gerar_cube): o vermelho varia mais rápido,
 * depois o verde e o azul, que é a ordem de uma textura 3D (x, y, z). A vinheta fica fora, porque depende do lugar.
 */
export function lutDaCor(ajustes: AjustesCor, curvas: Partial<Curvas> | null | undefined, hsl: Hsl | null = null): Float32Array {
  const n = PONTOS_DA_LUT;
  const passo = n - 1;
  const dados = new Float32Array(n * n * n * 4);
  let i = 0;
  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        const saida = aplicarCurvas(aplicarHsl(aplicarCor([r / passo, g / passo, b / passo], ajustes), hsl), curvas);
        dados[i] = saida[0];
        dados[i + 1] = saida[1];
        dados[i + 2] = saida[2];
        dados[i + 3] = 1;
        i += 4;
      }
    }
  }
  return dados;
}

/**
 * A leitura tetraédrica da LUT, a do lut3d do FFmpeg (interp=tetrahedral): o cubo entre os pontos vizinhos é
 * dividido em seis tetraedros pela ordem das frações. O shader da prévia faz a mesma conta.
 */
export function lerLut(dados: Float32Array, [r, g, b]: [number, number, number]): [number, number, number] {
  const n = PONTOS_DA_LUT;
  const s = [r, g, b].map((v) => Math.min(Math.max(v, 0), 1) * (n - 1));
  const p = s.map((v) => Math.floor(v));
  const q = p.map((v) => Math.min(v + 1, n - 1));
  const [dr, dg, db] = s.map((v, k) => v - p[k]);
  const ponto = (x: number, y: number, z: number) => {
    const j = ((z * n + y) * n + x) * 4;
    return [dados[j], dados[j + 1], dados[j + 2]];
  };
  const c000 = ponto(p[0], p[1], p[2]);
  const c111 = ponto(q[0], q[1], q[2]);
  const somar = (pesos: number[], cantos: number[][]) => [0, 1, 2].map((k) => pesos.reduce((soma, peso, m) => soma + peso * cantos[m][k], 0)) as [number, number, number];
  if (dr > dg) {
    if (dg > db) return somar([1 - dr, dr - dg, dg - db, db], [c000, ponto(q[0], p[1], p[2]), ponto(q[0], q[1], p[2]), c111]);
    if (dr > db) return somar([1 - dr, dr - db, db - dg, dg], [c000, ponto(q[0], p[1], p[2]), ponto(q[0], p[1], q[2]), c111]);
    return somar([1 - db, db - dr, dr - dg, dg], [c000, ponto(p[0], p[1], q[2]), ponto(q[0], p[1], q[2]), c111]);
  }
  if (db > dg) return somar([1 - db, db - dg, dg - dr, dr], [c000, ponto(p[0], p[1], q[2]), ponto(p[0], q[1], q[2]), c111]);
  if (db > dr) return somar([1 - dg, dg - db, db - dr, dr], [c000, ponto(p[0], q[1], p[2]), ponto(p[0], q[1], q[2]), c111]);
  return somar([1 - dg, dg - dr, dr - db, db], [c000, ponto(p[0], q[1], p[2]), ponto(q[0], q[1], p[2]), c111]);
}

/** A tabela que o shader lê: 256 tons, cada um com o vermelho, o verde e o azul da curva (RGBA de 8 bits). */
export function tabelaDasCurvas(curvas: Partial<Curvas>): Uint8Array {
  const tabela = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = aplicarCurvas([i / 255, i / 255, i / 255], curvas);
    tabela.set([Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255], i * 4);
  }
  return tabela;
}
