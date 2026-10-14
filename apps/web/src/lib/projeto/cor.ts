// Ajustes de cor e filtros prontos. A mesma conta roda em três lugares: aqui (testes e referência),
// no shader do compositor da prévia (lib/previa/compositor.ts) e no Python do render
// (core/utils/cor.py), que gera uma LUT 3D para o FFmpeg. Os casos de tests/casos/cor.json conferem
// o TypeScript e o Python.
//
// Ordem: exposição e balanço de branco em luz linear; contraste, realces, sombras e saturação nos
// valores de tela (sRGB). A vinheta depende da posição do pixel e fica à parte.

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
};

export type Cor = AjustesCor & {
  /** Filtro pronto somado aos ajustes, com intensidade de 0 a 2 (200%). */
  filtro: string | null;
  intensidade: number;
};

export const AJUSTES_NEUTROS: AjustesCor = { temperatura: 0, tom: 0, exposicao: 0, contraste: 0, realces: 0, sombras: 0, saturacao: 0, vinheta: 0 };
export const COR_PADRAO: Cor = { ...AJUSTES_NEUTROS, filtro: null, intensidade: 1 };

export const LIMITES_COR: Record<keyof AjustesCor, { minimo: number; maximo: number }> = {
  temperatura: { minimo: -1, maximo: 1 },
  tom: { minimo: -1, maximo: 1 },
  exposicao: { minimo: -2, maximo: 2 },
  contraste: { minimo: -1, maximo: 1 },
  realces: { minimo: -1, maximo: 1 },
  sombras: { minimo: -1, maximo: 1 },
  saturacao: { minimo: -1, maximo: 1 },
  vinheta: { minimo: 0, maximo: 1 },
};

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
    resultado[chave] = limitar(cor[chave] + (filtro[chave] ?? 0) * cor.intensidade, minimo, maximo);
  }
  return resultado;
}

export function corNeutra(ajustes: AjustesCor): boolean {
  return (Object.keys(AJUSTES_NEUTROS) as (keyof AjustesCor)[]).every((chave) => Math.abs(ajustes[chave]) < 1e-9);
}

// -----------------------------------------------
// A conta, pixel a pixel (valores de 0 a 1)
// -----------------------------------------------
function paraLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function paraTela(c: number): number {
  const v = limitar(c, 0, 1);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** Quanto a temperatura e o tom mexem em cada canal. */
const FORCA_TEMPERATURA = 0.15;
const FORCA_TOM = 0.1;
/** Quanto realces e sombras somam, no máximo. */
const FORCA_REALCES_SOMBRAS = 0.25;

/** Cor de um pixel (sem a vinheta). */
export function aplicarCor([r, g, b]: [number, number, number], a: AjustesCor): [number, number, number] {
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
  const soma = FORCA_REALCES_SOMBRAS * (a.realces * y * y + a.sombras * (1 - y) * (1 - y));
  c = c.map((v) => limitar(v + soma, 0, 1));

  // Saturação: afasta ou aproxima cada canal da luminância
  const y2 = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const fatorSaturacao = 1 + a.saturacao;
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
