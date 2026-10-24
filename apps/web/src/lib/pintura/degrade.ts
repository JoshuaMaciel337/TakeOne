// Os degradês da ferramenta Degradê (G) e do Editor de degradês (ADR 0003, onda 13.5): paradas de cor e de opacidade
// com posição e ponto médio, o tipo sólido (com a suavidade) ou de ruído (cores sorteadas com a aspereza), e as cinco
// formas: linear, radial, ângulo, refletido e losango. As contas são puras, sobre RGBA, para o editor, o painel e os
// testes usarem a mesma.

export type Rgb = [number, number, number];
/** A cor de uma parada: uma fixa ("#rrggbb"), ou a de primeiro plano ou a de fundo da vez. */
export type CorDaParada = string | "primeiroPlano" | "fundo";
export type ParadaDeCor = { posicao: number; cor: CorDaParada; meio: number };
export type ParadaDeOpacidade = { posicao: number; opacidade: number; meio: number };
export type Degrade = {
  nome: string;
  tipo: "solido" | "ruido";
  cores: ParadaDeCor[];
  opacidades: ParadaDeOpacidade[];
  /** Sólido: 0 a 1, o quanto a curva entre as paradas é suave (1, a curva em S; 0, a reta). */
  suavidade: number;
  /** Ruído: 0 a 1, o quanto as cores mudam de um ponto para o outro, e o sorteio. */
  aspereza: number;
  semente: number;
};
export type FormaDoDegrade = "linear" | "radial" | "angulo" | "refletido" | "losango";
export const FORMAS_DO_DEGRADE: { id: FormaDoDegrade; nome: string }[] = [
  { id: "linear", nome: "Linear" },
  { id: "radial", nome: "Radial" },
  { id: "angulo", nome: "Ângulo" },
  { id: "refletido", nome: "Refletido" },
  { id: "losango", nome: "Losango" },
];

const comum = { tipo: "solido" as const, suavidade: 1, aspereza: 0.5, semente: 1 };
const opaco: ParadaDeOpacidade[] = [
  { posicao: 0, opacidade: 1, meio: 0.5 },
  { posicao: 1, opacidade: 1, meio: 0.5 },
];
const cores = (...lista: CorDaParada[]): ParadaDeCor[] => lista.map((cor, i) => ({ posicao: lista.length === 1 ? 0 : i / (lista.length - 1), cor, meio: 0.5 }));

/** As predefinições do painel Degradês, em pastas. */
export const DEGRADES_PRONTOS: { pasta: string; degrades: Degrade[] }[] = [
  {
    pasta: "Básicos",
    degrades: [
      { ...comum, nome: "Primeiro plano para fundo", cores: cores("primeiroPlano", "fundo"), opacidades: opaco },
      { ...comum, nome: "Primeiro plano para transparente", cores: cores("primeiroPlano", "primeiroPlano"), opacidades: [{ posicao: 0, opacidade: 1, meio: 0.5 }, { posicao: 1, opacidade: 0, meio: 0.5 }] },
      { ...comum, nome: "Preto para branco", cores: cores("#000000", "#ffffff"), opacidades: opaco },
    ],
  },
  {
    pasta: "Cores",
    degrades: [
      { ...comum, nome: "Espectro", cores: cores("#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "#ff0000"), opacidades: opaco },
      { ...comum, nome: "Pôr do sol", cores: cores("#2b1055", "#d53369", "#ff9a44", "#ffd56b"), opacidades: opaco },
      { ...comum, nome: "Oceano", cores: cores("#03045e", "#0077b6", "#00b4d8", "#caf0f8"), opacidades: opaco },
      { ...comum, nome: "Floresta", cores: cores("#0b3d0b", "#2d6a4f", "#74c69d", "#d8f3dc"), opacidades: opaco },
      { ...comum, nome: "Fogo", cores: cores("#3a0000", "#c1121f", "#ff7b00", "#ffd60a"), opacidades: opaco },
      { ...comum, nome: "Algodão-doce", cores: cores("#ffafcc", "#cdb4db", "#a2d2ff"), opacidades: opaco },
      { ...comum, nome: "Metal", cores: cores("#3c3c3c", "#dcdcdc", "#5a5a5a", "#f0f0f0", "#4a4a4a"), opacidades: opaco },
      { ...comum, nome: "Ouro", cores: cores("#7a5410", "#f5d76e", "#a8790e", "#fff2a8", "#8c6212"), opacidades: opaco },
    ],
  },
  {
    pasta: "Ruído",
    degrades: [{ ...comum, tipo: "ruido", nome: "Ruído colorido", cores: cores("#000000", "#ffffff"), opacidades: opaco, aspereza: 0.5, semente: 7 }],
  },
];

export function rgbDe(cor: CorDaParada, primeiroPlano: string, fundo: string): Rgb {
  const hex = cor === "primeiroPlano" ? primeiroPlano : cor === "fundo" ? fundo : cor;
  const valor = Number.parseInt(hex.replace("#", "").slice(0, 6).padEnd(6, "0"), 16);
  return [(valor >> 16) & 255, (valor >> 8) & 255, valor & 255];
}

/** O quanto de b vale em t entre duas paradas (a em 0, b em 1), com o ponto médio e a suavidade. */
function entre(t: number, meio: number, suavidade: number): number {
  const m = Math.min(0.95, Math.max(0.05, meio));
  let s = t < m ? (0.5 * t) / m : 0.5 + (0.5 * (t - m)) / (1 - m);
  // A suavidade puxa a reta para a curva em S
  const curva = s * s * (3 - 2 * s);
  s = s + (curva - s) * suavidade;
  return s;
}

/** O valor de uma lista de paradas (ordenadas) em t. */
function nasParadas<T extends { posicao: number; meio: number }>(paradas: T[], t: number, valor: (p: T) => number[], suavidade: number): number[] {
  const ordenadas = [...paradas].sort((a, b) => a.posicao - b.posicao);
  if (t <= ordenadas[0].posicao) return valor(ordenadas[0]);
  const ultima = ordenadas[ordenadas.length - 1];
  if (t >= ultima.posicao) return valor(ultima);
  for (let i = 0; i < ordenadas.length - 1; i++) {
    const a = ordenadas[i];
    const b = ordenadas[i + 1];
    if (t > b.posicao) continue;
    const s = entre((t - a.posicao) / Math.max(1e-9, b.posicao - a.posicao), a.meio, suavidade);
    const va = valor(a);
    const vb = valor(b);
    return va.map((v, k) => v + (vb[k] - v) * s);
  }
  return valor(ultima);
}

/** Um sorteio repetível (mulberry32). */
function sorteio(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A tabela de 256 cores (RGBA, 0 a 255) do degradê: o que cada t (0 a 1) vale. O de ruído é um passeio sorteado em
 * cada canal, mais rápido quanto mais áspero, entre as cores das paradas como limites.
 */
export function tabelaDoDegrade(degrade: Degrade, primeiroPlano: string, fundo: string): Uint8ClampedArray {
  const tabela = new Uint8ClampedArray(256 * 4);
  if (degrade.tipo === "ruido") {
    const proximo = sorteio(degrade.semente);
    const passos = Math.max(2, Math.round(2 + degrade.aspereza * 30));
    const nos = Array.from({ length: passos }, () => [proximo() * 255, proximo() * 255, proximo() * 255]);
    for (let k = 0; k < 256; k++) {
      const x = (k / 255) * (passos - 1);
      const i = Math.min(passos - 2, Math.floor(x));
      const f = x - i;
      const s = f * f * (3 - 2 * f);
      for (let c = 0; c < 3; c++) tabela[k * 4 + c] = Math.round(nos[i][c] + (nos[i + 1][c] - nos[i][c]) * s);
      tabela[k * 4 + 3] = Math.round(nasParadas(degrade.opacidades, k / 255, (p) => [p.opacidade], 0)[0] * 255);
    }
    return tabela;
  }
  for (let k = 0; k < 256; k++) {
    const t = k / 255;
    const [r, g, b] = nasParadas(degrade.cores, t, (p) => rgbDe(p.cor, primeiroPlano, fundo), degrade.suavidade);
    const [a] = nasParadas(degrade.opacidades, t, (p) => [p.opacidade], degrade.suavidade);
    tabela.set([Math.round(r), Math.round(g), Math.round(b), Math.round(a * 255)], k * 4);
  }
  return tabela;
}

/** O t (0 a 1) de um ponto para a forma, do ponto `de` (o começo) ao `ate` (o fim do arrasto). */
export function tDoPonto(forma: FormaDoDegrade, x: number, y: number, de: { x: number; y: number }, ate: { x: number; y: number }): number {
  const vx = ate.x - de.x;
  const vy = ate.y - de.y;
  const comprimento = Math.hypot(vx, vy) || 1;
  const dx = x - de.x;
  const dy = y - de.y;
  // As coordenadas no eixo do arrasto (u ao longo, v de lado), em frações do comprimento
  const u = (dx * vx + dy * vy) / (comprimento * comprimento);
  const v = (dx * -vy + dy * vx) / (comprimento * comprimento);
  switch (forma) {
    case "linear":
      return Math.min(1, Math.max(0, u));
    case "radial":
      return Math.min(1, Math.hypot(dx, dy) / comprimento);
    case "refletido":
      return Math.min(1, Math.abs(u));
    case "losango":
      return Math.min(1, Math.abs(u) + Math.abs(v));
    case "angulo": {
      // O ângulo a partir da direção do arrasto, no sentido anti-horário
      const angulo = Math.atan2(-(dx * -vy + dy * vx), dx * vx + dy * vy);
      return ((angulo / (2 * Math.PI)) % 1 + 1) % 1;
    }
  }
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * O degradê em pixels (RGBA, sem pré-multiplicar), de `de` a `ate`, na forma. `inverter` troca o começo e o fim, e
 * `pontilhar` espalha meio nível (Bayer 4 × 4) para o degradê não fazer faixas.
 */
export function pixelsDoDegrade(
  largura: number,
  altura: number,
  de: { x: number; y: number },
  ate: { x: number; y: number },
  forma: FormaDoDegrade,
  tabela: Uint8ClampedArray,
  { inverter = false, pontilhar = true }: { inverter?: boolean; pontilhar?: boolean } = {},
): Uint8ClampedArray {
  const saida = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      let t = tDoPonto(forma, x + 0.5, y + 0.5, de, ate);
      if (inverter) t = 1 - t;
      const ruido = pontilhar ? (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) / 255 : 0;
      const posicao = Math.min(255, Math.max(0, t * 255 + ruido * 255));
      const k = Math.floor(posicao);
      const f = posicao - k;
      const k2 = Math.min(255, k + 1);
      const i = (y * largura + x) * 4;
      for (let c = 0; c < 4; c++) saida[i + c] = Math.round(tabela[k * 4 + c] + (tabela[k2 * 4 + c] - tabela[k * 4 + c]) * f + (pontilhar && c < 3 ? ruido * 255 : 0));
    }
  }
  return saida;
}

/** O degradê com as cores de primeiro plano e de fundo trocadas pelas da vez (para guardar numa forma). */
export function degradeComCores(degrade: Degrade, primeiroPlano: string, fundo: string): Degrade {
  const hex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  return { ...degrade, cores: degrade.cores.map((parada) => ({ ...parada, cor: hex(rgbDe(parada.cor, primeiroPlano, fundo)) })) };
}
