// Os ajustes do editor de imagem (ADR 0003, onda 13.10): os dezesseis das camadas de ajuste dos editores de imagem,
// com as propriedades de lá, numa conta só para a camada de ajuste (a prévia e a exportação, pelo compositor) e para
// aplicar direto nos pixels (Imagem › Ajustes). Cada ajuste vira uma de três coisas:
// - uma tabela por canal (256 tons): o vermelho, o verde e o azul passam cada um pela sua (níveis, curvas, brilho e
//   contraste, exposição, inverter, posterizar), exata nos 8 bits;
// - uma tabela pela luminância (256 tons, a cor inteira): limiar e mapa de degradê, também exata;
// - uma função da cor, que vira a LUT 3D de 33 pontos que o compositor já lê para a cor dos clipes (o resto).
// As medidas seguem os painéis de lá: 0 a 255 nos níveis, -100 a 100 nos deslizantes de porcentagem, graus no matiz.
import { PONTOS_DA_LUT, type PontoDaCurva, valorDaCurva } from "../projeto/cor.ts";
import type { LutImportada } from "../projeto/lutImportada.ts";
import { aplicarLutImportada } from "../projeto/lutImportada.ts";

export type Rgb = [number, number, number];
export type CanalDoAjuste = "rgb" | "r" | "g" | "b";
export type NiveisDoCanal = { preto: number; branco: number; gama: number; saida_preto: number; saida_branco: number };
/** A curva de um canal: pelos pontos (0 a 1) ou, desenhada a lápis, os 256 valores. */
export type CurvaDoAjuste = { pontos: PontoDaCurva[]; lapis?: number[] | null };
export type TomHsl = { matiz: number; saturacao: number; luminosidade: number };
export type FaixaDoMatiz = "vermelhos" | "amarelos" | "verdes" | "cianos" | "azuis" | "magentas";
/** Uma faixa do Matiz/Saturação: o ajuste e os quatro limites em graus (o começo e o fim da subida e da descida). */
export type AjusteDaFaixa = TomHsl & { limites: [number, number, number, number] };
export type CorDaSeletiva = FaixaDoMatiz | "brancos" | "neutros" | "pretos";
export type Tintas = { ciano: number; magenta: number; amarelo: number; preto: number };
export type LinhaDoMixer = { r: number; g: number; b: number; constante: number };
export type TonsDoEquilibrio = { ciano_vermelho: number; magenta_verde: number; amarelo_azul: number };

export type AjusteDaImagem =
  | { tipo: "brilho_contraste"; brilho: number; contraste: number; antigo: boolean }
  | { tipo: "niveis"; canais: Partial<Record<CanalDoAjuste, NiveisDoCanal>> }
  | { tipo: "curvas"; canais: Partial<Record<CanalDoAjuste, CurvaDoAjuste>> }
  | { tipo: "exposicao"; exposicao: number; deslocamento: number; gama: number }
  | { tipo: "vibracao"; vibracao: number; saturacao: number }
  | { tipo: "matiz_saturacao"; mestre: TomHsl; faixas: Partial<Record<FaixaDoMatiz, AjusteDaFaixa>>; colorir: boolean; cor_colorir: TomHsl }
  | { tipo: "equilibrio"; sombras: TonsDoEquilibrio; meios: TonsDoEquilibrio; realces: TonsDoEquilibrio; preservar: boolean }
  | { tipo: "preto_branco"; pesos: Record<FaixaDoMatiz, number>; tonalizar: boolean; matiz: number; saturacao: number }
  | { tipo: "filtro_de_fotos"; cor: string; densidade: number; preservar: boolean }
  | { tipo: "mixer"; monocromatico: boolean; vermelho: LinhaDoMixer; verde: LinhaDoMixer; azul: LinhaDoMixer; cinza: LinhaDoMixer }
  | { tipo: "pesquisa"; lut: { id: string; intensidade: number } | null }
  | { tipo: "inverter" }
  | { tipo: "posterizar"; niveis: number }
  | { tipo: "limiar"; nivel: number }
  | { tipo: "mapa_degrade"; cores: { posicao: number; cor: string }[]; inverter: boolean }
  | { tipo: "cor_seletiva"; absoluto: boolean; cores: Partial<Record<CorDaSeletiva, Tintas>> };

export type TipoDoAjuste = AjusteDaImagem["tipo"];

export const FAIXAS_DO_MATIZ: { id: FaixaDoMatiz; nome: string; limites: [number, number, number, number]; amostra: string }[] = [
  { id: "vermelhos", nome: "Vermelhos", limites: [315, 345, 15, 45], amostra: "#ff0000" },
  { id: "amarelos", nome: "Amarelos", limites: [15, 45, 75, 105], amostra: "#ffff00" },
  { id: "verdes", nome: "Verdes", limites: [75, 105, 135, 165], amostra: "#00ff00" },
  { id: "cianos", nome: "Cianos", limites: [135, 165, 195, 225], amostra: "#00ffff" },
  { id: "azuis", nome: "Azuis", limites: [195, 225, 255, 285], amostra: "#0000ff" },
  { id: "magentas", nome: "Magentas", limites: [255, 285, 315, 345], amostra: "#ff00ff" },
];

export const CORES_DA_SELETIVA: { id: CorDaSeletiva; nome: string }[] = [
  ...FAIXAS_DO_MATIZ.map(({ id, nome }) => ({ id, nome })),
  { id: "brancos", nome: "Brancos" },
  { id: "neutros", nome: "Neutros" },
  { id: "pretos", nome: "Pretos" },
];

/** Os filtros de fotos prontos (as cores dos filtros de lente de sempre). */
export const FILTROS_DE_FOTOS: { nome: string; cor: string }[] = [
  { nome: "Aquecimento (85)", cor: "#ec8a00" },
  { nome: "Aquecimento (LBA)", cor: "#fa9600" },
  { nome: "Aquecimento (81)", cor: "#ebb113" },
  { nome: "Resfriamento (80)", cor: "#006dff" },
  { nome: "Resfriamento (LBB)", cor: "#005dff" },
  { nome: "Resfriamento (82)", cor: "#00b5ff" },
  { nome: "Vermelho", cor: "#ea1a1a" },
  { nome: "Laranja", cor: "#f38417" },
  { nome: "Amarelo", cor: "#f9e31c" },
  { nome: "Verde", cor: "#19c919" },
  { nome: "Ciano", cor: "#1dcbea" },
  { nome: "Azul", cor: "#1d35ea" },
  { nome: "Violeta", cor: "#9b1dea" },
  { nome: "Magenta", cor: "#e318e3" },
  { nome: "Sépia", cor: "#ac7a33" },
  { nome: "Subaquático", cor: "#00c1b1" },
];

export const NOMES_DOS_AJUSTES: Record<TipoDoAjuste, string> = {
  brilho_contraste: "Brilho/Contraste",
  niveis: "Níveis",
  curvas: "Curvas",
  exposicao: "Exposição",
  vibracao: "Vibração",
  matiz_saturacao: "Matiz/Saturação",
  equilibrio: "Equilíbrio de cores",
  preto_branco: "Preto e branco",
  filtro_de_fotos: "Filtro de fotos",
  mixer: "Mixer de canais",
  pesquisa: "Pesquisa de cores",
  inverter: "Inverter",
  posterizar: "Posterizar",
  limiar: "Limiar",
  mapa_degrade: "Mapa de degradê",
  cor_seletiva: "Cor seletiva",
};

export const NIVEIS_NEUTROS: NiveisDoCanal = { preto: 0, branco: 255, gama: 1, saida_preto: 0, saida_branco: 255 };
const TOM_NEUTRO: TomHsl = { matiz: 0, saturacao: 0, luminosidade: 0 };
const EQUILIBRIO_NEUTRO: TonsDoEquilibrio = { ciano_vermelho: 0, magenta_verde: 0, amarelo_azul: 0 };
const linha = (r: number, g: number, b: number): LinhaDoMixer => ({ r, g, b, constante: 0 });

/** Um ajuste novo com os valores de partida de lá. */
export function ajustePadrao(tipo: TipoDoAjuste, primeiroPlano = "#000000", fundo = "#ffffff"): AjusteDaImagem {
  switch (tipo) {
    case "brilho_contraste":
      return { tipo, brilho: 0, contraste: 0, antigo: false };
    case "niveis":
      return { tipo, canais: {} };
    case "curvas":
      return { tipo, canais: {} };
    case "exposicao":
      return { tipo, exposicao: 0, deslocamento: 0, gama: 1 };
    case "vibracao":
      return { tipo, vibracao: 0, saturacao: 0 };
    case "matiz_saturacao":
      return { tipo, mestre: { ...TOM_NEUTRO }, faixas: {}, colorir: false, cor_colorir: { matiz: 0, saturacao: 25, luminosidade: 0 } };
    case "equilibrio":
      return { tipo, sombras: { ...EQUILIBRIO_NEUTRO }, meios: { ...EQUILIBRIO_NEUTRO }, realces: { ...EQUILIBRIO_NEUTRO }, preservar: true };
    case "preto_branco":
      return { tipo, pesos: { vermelhos: 40, amarelos: 60, verdes: 40, cianos: 60, azuis: 20, magentas: 80 }, tonalizar: false, matiz: 42, saturacao: 20 };
    case "filtro_de_fotos":
      return { tipo, cor: FILTROS_DE_FOTOS[0].cor, densidade: 25, preservar: true };
    case "mixer":
      return { tipo, monocromatico: false, vermelho: linha(100, 0, 0), verde: linha(0, 100, 0), azul: linha(0, 0, 100), cinza: linha(40, 40, 20) };
    case "pesquisa":
      return { tipo, lut: null };
    case "inverter":
      return { tipo };
    case "posterizar":
      return { tipo, niveis: 4 };
    case "limiar":
      return { tipo, nivel: 128 };
    case "mapa_degrade":
      return { tipo, cores: [{ posicao: 0, cor: primeiroPlano }, { posicao: 1, cor: fundo }], inverter: false };
    case "cor_seletiva":
      return { tipo, absoluto: false, cores: {} };
  }
}

// ——— Contas de cor ———
const limitar = (v: number, minimo = 0, maximo = 1) => Math.min(maximo, Math.max(minimo, v));
/** A luminância das tabelas pela luminância e do preto e branco preservado (os pesos de sempre dos 8 bits). */
export const luma = ([r, g, b]: Rgb) => 0.299 * r + 0.587 * g + 0.114 * b;
const paraLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const paraTela = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

export function corEmRgb(cor: string): Rgb {
  const valor = Number.parseInt(cor.replace("#", "").slice(0, 6).padEnd(6, "0"), 16);
  return [((valor >> 16) & 255) / 255, ((valor >> 8) & 255) / 255, (valor & 255) / 255];
}

/** RGB para matiz (0 a 360), saturação e luminosidade (0 a 1), em HSL. */
export function emHsl([r, g, b]: Rgb): [number, number, number] {
  const maximo = Math.max(r, g, b);
  const minimo = Math.min(r, g, b);
  const l = (maximo + minimo) / 2;
  const d = maximo - minimo;
  if (d <= 1e-9) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - maximo - minimo) : d / (maximo + minimo);
  let h = maximo === r ? (g - b) / d + (g < b ? 6 : 0) : maximo === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

export function deHsl(h: number, s: number, l: number): Rgb {
  if (s <= 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const x = h / 360;
  return [canal(x + 1 / 3), canal(x), canal(x - 1 / 3)];
}

/** O peso de uma faixa do Matiz/Saturação no matiz h: sobe de a a b, fica em 1 até c e desce até d (com a volta do círculo). */
export function pesoDaFaixa(h: number, [a, b, c, d]: [number, number, number, number]): number {
  // Tudo contado a partir de a, para a faixa que passa do 360 (os vermelhos) virar uma reta
  const desde = (x: number) => (((x - a) % 360) + 360) % 360;
  const x = desde(h);
  const sb = desde(b);
  const sc = desde(c);
  const sd = desde(d);
  if (x > sd) return 0;
  if (x < sb) return sb > 0 ? x / sb : 1;
  if (x <= sc) return 1;
  return sd > sc ? (sd - x) / (sd - sc) : 0;
}

/** A curva de níveis de um canal (v de 0 a 1). */
export function valorDosNiveis(n: NiveisDoCanal, v: number): number {
  const alcance = Math.max(1, n.branco - n.preto);
  const x = limitar((v * 255 - n.preto) / alcance) ** (1 / Math.max(0.01, n.gama));
  return limitar((n.saida_preto + x * (n.saida_branco - n.saida_preto)) / 255);
}

/** A curva de um canal: o lápis (interpolado entre os 256 valores) ou a cúbica monótona pelos pontos. */
export function valorDaCurvaDoAjuste(curva: CurvaDoAjuste | undefined, v: number): number {
  if (!curva) return v;
  if (curva.lapis?.length === 256) {
    const x = limitar(v) * 255;
    const i = Math.min(254, Math.floor(x));
    return limitar(curva.lapis[i] + (curva.lapis[i + 1] - curva.lapis[i]) * (x - i));
  }
  return valorDaCurva(curva.pontos, v);
}

/** O brilho e o contraste num canal: o antigo (deslocar e esticar, como era) ou o de hoje, que guarda o preto e o branco. */
export function valorDoBrilhoContraste(a: Extract<AjusteDaImagem, { tipo: "brilho_contraste" }>, v: number): number {
  if (a.antigo) {
    const k = a.contraste >= 0 ? 1 / (1 - Math.min(a.contraste, 100) * 0.0099) : 1 + a.contraste / 100;
    return limitar((v + a.brilho / 255 - 0.5) * k + 0.5);
  }
  const e = 2 ** (Math.abs(a.brilho) / 100);
  let x = a.brilho >= 0 ? 1 - (1 - v) ** e : v ** e;
  // O contraste é uma curva em S em volta do meio (p > 1 aumenta, p < 1 diminui)
  const p = a.contraste >= 0 ? 1 + (a.contraste / 100) * 1.5 : 1 + a.contraste / 100;
  x = x < 0.5 ? 0.5 * (2 * x) ** p : 1 - 0.5 * (2 * (1 - x)) ** p;
  return limitar(x);
}

/** A exposição em luz linear: vezes 2 elevado à exposição, mais o deslocamento, e a gama por cima. */
export function valorDaExposicao(a: Extract<AjusteDaImagem, { tipo: "exposicao" }>, v: number): number {
  const linear = Math.max(0, paraLinear(v) * 2 ** a.exposicao + a.deslocamento);
  return limitar(paraTela(linear ** (1 / Math.max(0.01, a.gama))));
}

// ——— As funções da cor inteira (as que viram a LUT 3D) ———
function vibracao(a: Extract<AjusteDaImagem, { tipo: "vibracao" }>, c: Rgb): Rgb {
  const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const croma = Math.max(...c) - Math.min(...c);
  // A vibração pesa mais nas cores apagadas; a saturação vale igual em todas
  const fator = (1 + a.saturacao / 100) * (1 + (a.vibracao / 100) * (1 - croma));
  return c.map((v) => limitar(y + (v - y) * fator)) as Rgb;
}

const mudarSaturacao = (s: number, delta: number) => limitar(s * (delta < 0 ? 1 + delta / 100 : 1 + (2 * delta) / 100));
const mudarLuminosidade = (c: Rgb, delta: number): Rgb => c.map((v) => (delta >= 0 ? v + (1 - v) * (delta / 100) : v * (1 + delta / 100))) as Rgb;

function matizSaturacao(a: Extract<AjusteDaImagem, { tipo: "matiz_saturacao" }>, c: Rgb): Rgb {
  const [h, s, l] = emHsl(c);
  if (a.colorir) {
    const tom = a.cor_colorir;
    return mudarLuminosidade(deHsl(tom.matiz, limitar(tom.saturacao / 100), l), tom.luminosidade);
  }
  let dh = a.mestre.matiz;
  let ds = a.mestre.saturacao;
  let dl = a.mestre.luminosidade;
  // As faixas só valem nas cores (o cinza não tem matiz)
  if (s > 0) {
    for (const faixa of FAIXAS_DO_MATIZ) {
      const ajuste = a.faixas[faixa.id];
      if (!ajuste) continue;
      const peso = pesoDaFaixa(h, ajuste.limites);
      dh += peso * ajuste.matiz;
      ds += peso * ajuste.saturacao;
      dl += peso * ajuste.luminosidade;
    }
  }
  return mudarLuminosidade(deHsl(h + dh, mudarSaturacao(s, limitar(ds, -100, 100)), l), limitar(dl, -100, 100));
}

/** Os pesos de sombras, meios-tons e realces pela luminosidade (as rampas de sempre do equilíbrio de cores). */
export function pesosDosTons(l: number): [number, number, number] {
  const a = 0.25;
  const b = 0.333;
  const escala = 0.7;
  const sombras = limitar((l - b) / -a + 0.5) * escala;
  const meios = limitar((l - b) / a + 0.5) * limitar((l + b - 1) / -a + 0.5) * escala;
  const realces = limitar((l + b - 1) / a + 0.5) * escala;
  return [sombras, meios, realces];
}

function equilibrio(a: Extract<AjusteDaImagem, { tipo: "equilibrio" }>, c: Rgb): Rgb {
  const l0 = emHsl(c)[2];
  const [ps, pm, pr] = pesosDosTons(l0);
  const somar = (campo: keyof TonsDoEquilibrio) => (a.sombras[campo] * ps + a.meios[campo] * pm + a.realces[campo] * pr) / 100;
  const saida: Rgb = [limitar(c[0] + somar("ciano_vermelho")), limitar(c[1] + somar("magenta_verde")), limitar(c[2] + somar("amarelo_azul"))];
  if (!a.preservar) return saida;
  // Guarda a luminosidade: a cor nova com a luminosidade de antes
  const [h, s] = emHsl(saida);
  return s > 0 ? deHsl(h, s, l0) : [l0, l0, l0];
}

/** O cinza do preto e branco: o menor, mais a parte da cor primária e a da secundária, cada uma no peso dela. */
export function cinzaDoPretoBranco(pesos: Record<FaixaDoMatiz, number>, [r, g, b]: Rgb): number {
  const maximo = Math.max(r, g, b);
  const minimo = Math.min(r, g, b);
  const meio = r + g + b - maximo - minimo;
  const primaria: FaixaDoMatiz = maximo === r ? "vermelhos" : maximo === g ? "verdes" : "azuis";
  const secundaria: FaixaDoMatiz = minimo === b ? "amarelos" : minimo === r ? "cianos" : "magentas";
  return limitar(minimo + (maximo - meio) * (pesos[primaria] / 100) + (meio - minimo) * (pesos[secundaria] / 100));
}

function pretoBranco(a: Extract<AjusteDaImagem, { tipo: "preto_branco" }>, c: Rgb): Rgb {
  const cinza = cinzaDoPretoBranco(a.pesos, c);
  return a.tonalizar ? deHsl(a.matiz, limitar(a.saturacao / 100), cinza) : [cinza, cinza, cinza];
}

function filtroDeFotos(a: Extract<AjusteDaImagem, { tipo: "filtro_de_fotos" }>, c: Rgb): Rgb {
  const f = corEmRgb(a.cor);
  const d = limitar(a.densidade / 100);
  let saida = c.map((v, i) => v * (1 - d) + v * f[i] * d) as Rgb;
  if (a.preservar) {
    // De volta à luminância de antes, como a lente que não escurece
    const antes = luma(c);
    const depois = luma(saida);
    saida = depois > 1e-6 ? (saida.map((v) => v * (antes / depois)) as Rgb) : [antes, antes, antes];
  }
  return saida.map((v) => limitar(v)) as Rgb;
}

function mixer(a: Extract<AjusteDaImagem, { tipo: "mixer" }>, [r, g, b]: Rgb): Rgb {
  const aplicar = (l: LinhaDoMixer) => limitar((r * l.r + g * l.g + b * l.b + l.constante) / 100);
  if (a.monocromatico) {
    const cinza = aplicar(a.cinza);
    return [cinza, cinza, cinza];
  }
  return [aplicar(a.vermelho), aplicar(a.verde), aplicar(a.azul)];
}

/** Quanto de cada cor da cor seletiva há no pixel (de 0 a 1). */
export function quantidadesDaSeletiva([r, g, b]: Rgb): Record<CorDaSeletiva, number> {
  const maximo = Math.max(r, g, b);
  const minimo = Math.min(r, g, b);
  const meio = r + g + b - maximo - minimo;
  const q: Record<CorDaSeletiva, number> = { vermelhos: 0, amarelos: 0, verdes: 0, cianos: 0, azuis: 0, magentas: 0, brancos: 0, neutros: 0, pretos: 0 };
  // A primária é a do maior canal; a secundária, a dos dois maiores (o menor é o que falta nela)
  q[maximo === r ? "vermelhos" : maximo === g ? "verdes" : "azuis"] = maximo - meio;
  q[minimo === b ? "amarelos" : minimo === r ? "cianos" : "magentas"] = meio - minimo;
  q.brancos = minimo > 0.5 ? (minimo - 0.5) * 2 : 0;
  q.pretos = maximo < 0.5 ? (0.5 - maximo) * 2 : 0;
  q.neutros = Math.max(0, 1 - Math.abs(maximo - 0.5) - Math.abs(minimo - 0.5));
  return q;
}

function corSeletiva(a: Extract<AjusteDaImagem, { tipo: "cor_seletiva" }>, c: Rgb): Rgb {
  const q = quantidadesDaSeletiva(c);
  const tintas = ["ciano", "magenta", "amarelo"] as const;
  const saida: Rgb = [c[0], c[1], c[2]];
  for (const cor of CORES_DA_SELETIVA) {
    const t = a.cores[cor.id];
    if (!t || q[cor.id] <= 0) continue;
    for (let k = 0; k < 3; k++) {
      // A tinta que já há no canal (o ciano do vermelho, o magenta do verde, o amarelo do azul) e o preto em todos
      const tinta = 1 - c[k];
      const pedido = (t[tintas[k]] + t.preto) / 100;
      const delta = a.absoluto ? pedido : pedido * tinta;
      saida[k] -= q[cor.id] * delta;
    }
  }
  return saida.map((v) => limitar(v)) as Rgb;
}

// ——— O ajuste pronto para desenhar ———
/** A tabela de 256 tons em RGBA de ponto flutuante: "canais" (cada canal pela sua coluna) ou "luma" (a cor pela luminância). */
export type TabelaDoAjuste = { chave: string; modo: "canais" | "luma"; dados: Float32Array };
export type AjusteCompilado = { tipo: "nada" } | { tipo: "tabela"; tabela: TabelaDoAjuste } | { tipo: "funcao"; funcao: (c: Rgb) => Rgb };

function tabela(chave: string, modo: TabelaDoAjuste["modo"], valor: (i: number) => Rgb): TabelaDoAjuste {
  const dados = new Float32Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = valor(i);
    dados.set([r, g, b, 1], i * 4);
  }
  return { chave, modo, dados };
}

const porCanal = (chave: string, f: (v: number, canal: 0 | 1 | 2) => number) => tabela(chave, "canais", (i) => [f(i / 255, 0), f(i / 255, 1), f(i / 255, 2)]);
const CANAIS: ("r" | "g" | "b")[] = ["r", "g", "b"];

/** As cores de um mapa de degradê em 256 tons (as paradas em ordem, misturadas em linha reta). */
export function coresDoMapa(cores: { posicao: number; cor: string }[], i: number): Rgb {
  const ordem = [...cores].sort((a, b) => a.posicao - b.posicao);
  const t = i / 255;
  if (!ordem.length) return [t, t, t];
  if (t <= ordem[0].posicao) return corEmRgb(ordem[0].cor);
  for (let k = 0; k < ordem.length - 1; k++) {
    const a = ordem[k];
    const b = ordem[k + 1];
    if (t <= b.posicao) {
      const f = b.posicao > a.posicao ? (t - a.posicao) / (b.posicao - a.posicao) : 1;
      const ca = corEmRgb(a.cor);
      const cb = corEmRgb(b.cor);
      return [ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f];
    }
  }
  return corEmRgb(ordem[ordem.length - 1].cor);
}

/**
 * O ajuste pronto: a tabela (exata nos 8 bits) ou a função da cor (que vira a LUT 3D). `lutDaPesquisa` é a tabela
 * do .cube da Pesquisa de cores, quando ela já chegou; sem ela, o ajuste não muda nada.
 */
export function compilarAjuste(a: AjusteDaImagem, lutDaPesquisa: LutImportada | null = null): AjusteCompilado {
  const chave = JSON.stringify(a);
  switch (a.tipo) {
    case "brilho_contraste":
      return a.brilho === 0 && a.contraste === 0 ? { tipo: "nada" } : { tipo: "tabela", tabela: porCanal(chave, (v) => valorDoBrilhoContraste(a, v)) };
    case "niveis":
      return { tipo: "tabela", tabela: porCanal(chave, (v, k) => valorDosNiveis(a.canais[CANAIS[k]] ?? NIVEIS_NEUTROS, valorDosNiveis(a.canais.rgb ?? NIVEIS_NEUTROS, v))) };
    case "curvas":
      return { tipo: "tabela", tabela: porCanal(chave, (v, k) => valorDaCurvaDoAjuste(a.canais[CANAIS[k]], valorDaCurvaDoAjuste(a.canais.rgb, v))) };
    case "exposicao":
      return { tipo: "tabela", tabela: porCanal(chave, (v) => valorDaExposicao(a, v)) };
    case "inverter":
      return { tipo: "tabela", tabela: porCanal(chave, (v) => 1 - v) };
    case "posterizar": {
      const n = Math.round(limitar(a.niveis, 2, 255));
      return { tipo: "tabela", tabela: porCanal(chave, (v) => Math.min(n - 1, Math.floor((Math.round(v * 255) * n) / 256)) / (n - 1)) };
    }
    case "limiar":
      return { tipo: "tabela", tabela: tabela(chave, "luma", (i) => (i >= a.nivel ? [1, 1, 1] : [0, 0, 0])) };
    case "mapa_degrade":
      return { tipo: "tabela", tabela: tabela(chave, "luma", (i) => coresDoMapa(a.cores, a.inverter ? 255 - i : i)) };
    case "vibracao":
      return a.vibracao === 0 && a.saturacao === 0 ? { tipo: "nada" } : { tipo: "funcao", funcao: (c) => vibracao(a, c) };
    case "matiz_saturacao":
      return { tipo: "funcao", funcao: (c) => matizSaturacao(a, c) };
    case "equilibrio":
      return { tipo: "funcao", funcao: (c) => equilibrio(a, c) };
    case "preto_branco":
      return { tipo: "funcao", funcao: (c) => pretoBranco(a, c) };
    case "filtro_de_fotos":
      return a.densidade <= 0 ? { tipo: "nada" } : { tipo: "funcao", funcao: (c) => filtroDeFotos(a, c) };
    case "mixer":
      return { tipo: "funcao", funcao: (c) => mixer(a, c) };
    case "pesquisa":
      return a.lut && lutDaPesquisa && a.lut.intensidade > 0 ? { tipo: "funcao", funcao: (c) => aplicarLutImportada(c, lutDaPesquisa, a.lut!.intensidade) } : { tipo: "nada" };
    case "cor_seletiva":
      return { tipo: "funcao", funcao: (c) => corSeletiva(a, c) };
  }
}

/** A LUT 3D de uma função da cor, na ordem do compositor (o vermelho mais rápido), como a de lutDaCor. */
export function lutDaFuncao(funcao: (c: Rgb) => Rgb): Float32Array {
  const n = PONTOS_DA_LUT;
  const passo = n - 1;
  const dados = new Float32Array(n * n * n * 4);
  let i = 0;
  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        const [x, y, z] = funcao([r / passo, g / passo, b / passo]);
        dados[i] = x;
        dados[i + 1] = y;
        dados[i + 2] = z;
        dados[i + 3] = 1;
        i += 4;
      }
    }
  }
  return dados;
}

/**
 * A leitura tetraédrica de lerLut (cor.ts), sem criar listas: escreve em `saida`. As fotos inteiras passam por aqui
 * (Imagem › Ajustes), milhões de pixels, e a versão com listas levava segundos.
 */
export function lerLutRapido(dados: Float32Array, r: number, g: number, b: number, saida: Float64Array) {
  const n = PONTOS_DA_LUT;
  const sr = Math.min(Math.max(r, 0), 1) * (n - 1);
  const sg = Math.min(Math.max(g, 0), 1) * (n - 1);
  const sb = Math.min(Math.max(b, 0), 1) * (n - 1);
  const pr = Math.floor(sr);
  const pg = Math.floor(sg);
  const pb = Math.floor(sb);
  const qr = Math.min(pr + 1, n - 1);
  const qg = Math.min(pg + 1, n - 1);
  const qb = Math.min(pb + 1, n - 1);
  const dr = sr - pr;
  const dg = sg - pg;
  const db = sb - pb;
  const indice = (x: number, y: number, z: number) => ((z * n + y) * n + x) * 4;
  const c000 = indice(pr, pg, pb);
  const c111 = indice(qr, qg, qb);
  let p1: number;
  let p2: number;
  let w0: number;
  let w1: number;
  let w2: number;
  let w3: number;
  // As mesmas seis escolhas de lerLut, pela ordem das frações
  if (dr > dg) {
    if (dg > db) [w0, w1, w2, w3, p1, p2] = [1 - dr, dr - dg, dg - db, db, indice(qr, pg, pb), indice(qr, qg, pb)];
    else if (dr > db) [w0, w1, w2, w3, p1, p2] = [1 - dr, dr - db, db - dg, dg, indice(qr, pg, pb), indice(qr, pg, qb)];
    else [w0, w1, w2, w3, p1, p2] = [1 - db, db - dr, dr - dg, dg, indice(pr, pg, qb), indice(qr, pg, qb)];
  } else if (db > dg) [w0, w1, w2, w3, p1, p2] = [1 - db, db - dg, dg - dr, dr, indice(pr, pg, qb), indice(pr, qg, qb)];
  else if (db > dr) [w0, w1, w2, w3, p1, p2] = [1 - dg, dg - db, db - dr, dr, indice(pr, qg, pb), indice(pr, qg, qb)];
  else [w0, w1, w2, w3, p1, p2] = [1 - dg, dg - dr, dr - db, db, indice(pr, qg, pb), indice(qr, qg, pb)];
  for (let k = 0; k < 3; k++) saida[k] = w0 * dados[c000 + k] + w1 * dados[p1 + k] + w2 * dados[p2 + k] + w3 * dados[c111 + k];
}

/** O índice da tabela pela luminância, o mesmo do shader (o tom de 8 bits mais perto). */
export const indiceDaLuma = (c: Rgb) => Math.min(255, Math.max(0, Math.floor(luma(c) * 255 + 0.5)));

/**
 * Aplica o ajuste em pixels RGBA de 8 bits (sem pré-multiplicar), no lugar, como o compositor desenha a camada de
 * ajuste: a tabela tom a tom, ou a mesma LUT 3D lida pela leitura tetraédrica do shader. `cobertura` (0 a 1 por
 * pixel, a seleção) mistura com o de antes.
 */
export function aplicarAjusteNosPixels(dados: Uint8ClampedArray, compilado: AjusteCompilado, cobertura?: Float32Array | Uint8Array | Uint8ClampedArray | null) {
  if (compilado.tipo === "nada") return;
  const lut = compilado.tipo === "funcao" ? lutDaFuncao(compilado.funcao) : null;
  const t = compilado.tipo === "tabela" ? compilado.tabela : null;
  const escalaDaCobertura = cobertura instanceof Uint8Array || cobertura instanceof Uint8ClampedArray ? 1 / 255 : 1;
  const saida = new Float64Array(3);
  for (let p = 0, i = 0; i < dados.length; p++, i += 4) {
    const peso = cobertura ? cobertura[p] * escalaDaCobertura : 1;
    if (peso <= 0) continue;
    if (t?.modo === "canais") {
      saida[0] = t.dados[dados[i] * 4];
      saida[1] = t.dados[dados[i + 1] * 4 + 1];
      saida[2] = t.dados[dados[i + 2] * 4 + 2];
    } else if (t) {
      const j = Math.min(255, Math.floor((0.299 * dados[i] + 0.587 * dados[i + 1] + 0.114 * dados[i + 2]) / 255 * 255 + 0.5)) * 4;
      saida[0] = t.dados[j];
      saida[1] = t.dados[j + 1];
      saida[2] = t.dados[j + 2];
    } else lerLutRapido(lut!, dados[i] / 255, dados[i + 1] / 255, dados[i + 2] / 255, saida);
    for (let k = 0; k < 3; k++) dados[i + k] = Math.round((dados[i + k] / 255 + (saida[k] - dados[i + k] / 255) * peso) * 255);
  }
}
