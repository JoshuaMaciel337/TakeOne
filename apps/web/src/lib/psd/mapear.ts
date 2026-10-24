// O PSD e as camadas do editor de imagem (ADR 0003, onda 13.13): as contas puras do caminho de ida e de volta. O
// arquivo é lido e escrito no navegador pelo ag-psd (MIT); aqui ficam os modos de mesclagem, os rótulos, as travas,
// os ajustes e os efeitos que têm par dos dois lados, e a montagem das faixas a partir da árvore do arquivo.
// O que não tem par (os ajustes e efeitos que o TakeOne não lê, os textos editáveis) entra como pixels ou fica de fora
// com um aviso.
import type { AjusteDaImagem, CanalDoAjuste, NiveisDoCanal } from "../imagem/ajustes.ts";
import type { Efeito, EstiloDeCamada, TipoDoEfeito } from "../imagem/estiloDeCamada.ts";
import type { CamadaDePreenchimento } from "../imagem/camadaDePreenchimento.ts";
import type { MascaraDePixels } from "../projeto/mascaraDePixels.ts";
import type { Clipe, CorDoRotulo, Faixa, Mesclagem, TravasDaCamada } from "../projeto/modelo.ts";

// Os tipos do ag-psd que as contas usam, escritos aqui para o teste rodar sem a biblioteca
export type ModoDoPsd =
  | "pass through"
  | "normal"
  | "dissolve"
  | "darken"
  | "multiply"
  | "color burn"
  | "linear burn"
  | "darker color"
  | "lighten"
  | "screen"
  | "color dodge"
  | "linear dodge"
  | "lighter color"
  | "overlay"
  | "soft light"
  | "hard light"
  | "vivid light"
  | "linear light"
  | "pin light"
  | "hard mix"
  | "difference"
  | "exclusion"
  | "subtract"
  | "divide"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity"
  | "linear height"
  | "height"
  | "subtraction";
export type RotuloDoPsd = "none" | "red" | "orange" | "yellow" | "green" | "blue" | "violet" | "gray";
export type CorDoPsd = { r: number; g: number; b: number; a?: number } | { fr: number; fg: number; fb: number } | { k: number } | Record<string, number>;
type Unidades = { units: string; value: number };

const PARES: [ModoDoPsd, Mesclagem][] = [
  ["pass through", "passagem"],
  ["normal", "normal"],
  ["dissolve", "dissolver"],
  ["darken", "escurecer"],
  ["multiply", "multiplicar"],
  ["color burn", "superexposicao_cores"],
  ["linear burn", "superexposicao_linear"],
  ["darker color", "cor_mais_escura"],
  ["lighten", "clarear"],
  ["screen", "tela"],
  ["color dodge", "subexposicao_cores"],
  ["linear dodge", "somar"],
  ["lighter color", "cor_mais_clara"],
  ["overlay", "sobrepor"],
  ["soft light", "luz_suave"],
  ["hard light", "luz_forte"],
  ["vivid light", "luz_brilhante"],
  ["linear light", "luz_linear"],
  ["pin light", "luz_do_pino"],
  ["hard mix", "mistura_solida"],
  ["difference", "diferenca"],
  ["exclusion", "exclusao"],
  ["subtract", "subtrair"],
  ["divide", "dividir"],
  ["hue", "matiz"],
  ["saturation", "saturacao"],
  ["color", "cor"],
  ["luminosity", "luminosidade"],
];

/** O modo do arquivo no TakeOne; os que não existem aqui (os de altura do 3D) ficam normais. */
export function mesclagemDoPsd(modo: ModoDoPsd | undefined, pasta: boolean): Mesclagem {
  if (modo === "subtraction") return "subtrair";
  const achado = PARES.find(([psd]) => psd === modo)?.[1] ?? (pasta ? "passagem" : "normal");
  // Passagem só existe nos grupos
  return achado === "passagem" && !pasta ? "normal" : achado;
}

export function mesclagemParaPsd(modo: Mesclagem | undefined, pasta: boolean): ModoDoPsd {
  return PARES.find(([, nosso]) => nosso === (modo ?? (pasta ? "passagem" : "normal")))?.[0] ?? "normal";
}

const ROTULOS: [RotuloDoPsd, CorDoRotulo][] = [
  ["red", "vermelho"],
  ["orange", "laranja"],
  ["yellow", "amarelo"],
  ["green", "verde"],
  ["blue", "azul"],
  ["violet", "violeta"],
  ["gray", "cinza"],
];

export function rotuloDoPsd(cor: RotuloDoPsd | undefined): CorDoRotulo | null {
  return ROTULOS.find(([psd]) => psd === cor)?.[1] ?? null;
}

/** As cores que o arquivo não tem vão para a mais perto. */
export function rotuloParaPsd(rotulo: CorDoRotulo | null | undefined): RotuloDoPsd {
  if (!rotulo) return "none";
  const perto: Partial<Record<CorDoRotulo, RotuloDoPsd>> = { verde_agua: "green", anil: "blue", magenta: "violet", fucsia: "violet" };
  return perto[rotulo] ?? ROTULOS.find(([, nosso]) => nosso === rotulo)?.[0] ?? "none";
}

export type TravasDoPsd = { transparency?: boolean; composite?: boolean; position?: boolean; artboards?: boolean };

export function travasDoPsd(travas: TravasDoPsd | undefined): TravasDaCamada | null {
  if (!travas?.transparency && !travas?.composite && !travas?.position) return null;
  return { ...(travas.transparency ? { transparencia: true } : {}), ...(travas.composite ? { pixels: true } : {}), ...(travas.position ? { posicao: true } : {}) };
}

export function travasParaPsd(faixa: Pick<Faixa, "travas" | "travada">): TravasDoPsd | undefined {
  const travas = faixa.travas ?? {};
  const todas = Boolean(faixa.travada);
  if (!todas && !travas.transparencia && !travas.pixels && !travas.posicao) return undefined;
  return { transparency: todas || Boolean(travas.transparencia), composite: todas || Boolean(travas.pixels), position: todas || Boolean(travas.posicao) };
}

const hex2 = (v: number) =>
  Math.round(Math.min(255, Math.max(0, v)))
    .toString(16)
    .padStart(2, "0");

/** A cor do arquivo em hexadecimal (RGB de 0 a 255, RGB de 0 a 1 ou cinza de 0 a 100); o resto vira preto. */
export function corDoPsd(cor: CorDoPsd | undefined, padrao = "#000000"): string {
  if (!cor) return padrao;
  if ("r" in cor && "g" in cor && "b" in cor) return `#${hex2(cor.r)}${hex2(cor.g)}${hex2(cor.b)}`;
  if ("fr" in cor) return `#${hex2(cor.fr * 255)}${hex2(cor.fg * 255)}${hex2(cor.fb * 255)}`;
  if ("k" in cor && Object.keys(cor).length === 1) return `#${hex2(255 - cor.k * 2.55).repeat(3)}`;
  return padrao;
}

export function corParaPsd(cor: string): { r: number; g: number; b: number } {
  const limpo = /^#?([0-9a-f]{6})$/i.exec(cor)?.[1] ?? "000000";
  return { r: parseInt(limpo.slice(0, 2), 16), g: parseInt(limpo.slice(2, 4), 16), b: parseInt(limpo.slice(4, 6), 16) };
}

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const pixels = (u: Unidades | undefined, padrao = 0) => (u && Number.isFinite(u.value) ? u.value : padrao);
const emPixels = (value: number): Unidades => ({ units: "Pixels", value });

// ——— Ajustes ———
type CanalDosNiveis = { shadowInput: number; highlightInput: number; shadowOutput: number; highlightOutput: number; midtoneInput: number };
type PontosDaCurva = { input: number; output: number }[];
export type AjusteDoPsd =
  | { type: "brightness/contrast"; brightness?: number; contrast?: number; useLegacy?: boolean }
  | { type: "levels"; rgb?: CanalDosNiveis; red?: CanalDosNiveis; green?: CanalDosNiveis; blue?: CanalDosNiveis }
  | { type: "curves"; rgb?: PontosDaCurva; red?: PontosDaCurva; green?: PontosDaCurva; blue?: PontosDaCurva }
  | { type: "exposure"; exposure?: number; offset?: number; gamma?: number }
  | { type: "vibrance"; vibrance?: number; saturation?: number }
  | { type: "hue/saturation"; master?: { hue: number; saturation: number; lightness: number } }
  | { type: "invert" }
  | { type: "posterize"; levels?: number }
  | { type: "threshold"; level?: number }
  | { type: string };

const CANAIS: [CanalDoAjuste, "rgb" | "red" | "green" | "blue"][] = [
  ["rgb", "rgb"],
  ["r", "red"],
  ["g", "green"],
  ["b", "blue"],
];

/** O ajuste do arquivo no TakeOne; null nos que não têm par (o painel avisa e a camada fica de fora). */
export function ajusteDoPsd(ajuste: AjusteDoPsd): AjusteDaImagem | null {
  switch (ajuste.type) {
    case "brightness/contrast": {
      const a = ajuste as Extract<AjusteDoPsd, { type: "brightness/contrast" }>;
      return { tipo: "brilho_contraste", brilho: limitar(a.brightness ?? 0, -150, 150), contraste: limitar(a.contrast ?? 0, -100, 100), antigo: Boolean(a.useLegacy) };
    }
    case "levels": {
      const a = ajuste as Extract<AjusteDoPsd, { type: "levels" }>;
      const canais: Partial<Record<CanalDoAjuste, NiveisDoCanal>> = {};
      for (const [nosso, psd] of CANAIS) {
        const c = a[psd];
        if (c) canais[nosso] = { preto: c.shadowInput, branco: c.highlightInput, gama: c.midtoneInput, saida_preto: c.shadowOutput, saida_branco: c.highlightOutput };
      }
      return { tipo: "niveis", canais };
    }
    case "curves": {
      const a = ajuste as Extract<AjusteDoPsd, { type: "curves" }>;
      const canais: Extract<AjusteDaImagem, { tipo: "curvas" }>["canais"] = {};
      for (const [nosso, psd] of CANAIS) {
        const c = a[psd];
        if (c?.length) canais[nosso] = { pontos: [...c].sort((p, q) => p.input - q.input).map((p) => [p.input / 255, p.output / 255]) };
      }
      return { tipo: "curvas", canais };
    }
    case "exposure": {
      const a = ajuste as Extract<AjusteDoPsd, { type: "exposure" }>;
      return { tipo: "exposicao", exposicao: a.exposure ?? 0, deslocamento: a.offset ?? 0, gama: a.gamma ?? 1 };
    }
    case "vibrance": {
      const a = ajuste as Extract<AjusteDoPsd, { type: "vibrance" }>;
      return { tipo: "vibracao", vibracao: a.vibrance ?? 0, saturacao: a.saturation ?? 0 };
    }
    case "hue/saturation": {
      const m = (ajuste as Extract<AjusteDoPsd, { type: "hue/saturation" }>).master;
      return { tipo: "matiz_saturacao", mestre: { matiz: m?.hue ?? 0, saturacao: m?.saturation ?? 0, luminosidade: m?.lightness ?? 0 }, faixas: {}, colorir: false, cor_colorir: { matiz: 0, saturacao: 25, luminosidade: 0 } };
    }
    case "invert":
      return { tipo: "inverter" };
    case "posterize":
      return { tipo: "posterizar", niveis: limitar((ajuste as { levels?: number }).levels ?? 4, 2, 255) };
    case "threshold":
      return { tipo: "limiar", nivel: limitar((ajuste as { level?: number }).level ?? 128, 1, 255) };
    default:
      return null;
  }
}

/** O ajuste do TakeOne no arquivo; null nos que o arquivo não guardaria igual (a camada vai como pixels). */
export function ajusteParaPsd(ajuste: AjusteDaImagem): AjusteDoPsd | null {
  switch (ajuste.tipo) {
    case "brilho_contraste":
      return { type: "brightness/contrast", brightness: Math.round(ajuste.brilho), contrast: Math.round(ajuste.contraste), useLegacy: ajuste.antigo };
    case "niveis": {
      const saida: Record<string, CanalDosNiveis> = {};
      for (const [nosso, psd] of CANAIS) {
        const c = ajuste.canais[nosso];
        if (c) saida[psd] = { shadowInput: c.preto, highlightInput: c.branco, midtoneInput: c.gama, shadowOutput: c.saida_preto, highlightOutput: c.saida_branco };
      }
      return { type: "levels", ...saida };
    }
    case "curvas": {
      const saida: Record<string, PontosDaCurva> = {};
      for (const [nosso, psd] of CANAIS) {
        const c = ajuste.canais[nosso];
        // A curva a lápis não tem pontos: o arquivo ficaria diferente
        if (c?.lapis?.length) return null;
        if (c?.pontos.length) saida[psd] = c.pontos.map(([x, y]) => ({ input: Math.round(x * 255), output: Math.round(y * 255) }));
      }
      return { type: "curves", ...saida };
    }
    case "exposicao":
      return { type: "exposure", exposure: ajuste.exposicao, offset: ajuste.deslocamento, gamma: ajuste.gama };
    case "vibracao":
      return { type: "vibrance", vibrance: Math.round(ajuste.vibracao), saturation: Math.round(ajuste.saturacao) };
    case "matiz_saturacao":
      // Só o principal: as faixas e o colorir têm limites e cores que o arquivo guarda de outro jeito
      if (ajuste.colorir || Object.keys(ajuste.faixas).length) return null;
      return { type: "hue/saturation", master: { hue: Math.round(ajuste.mestre.matiz), saturation: Math.round(ajuste.mestre.saturacao), lightness: Math.round(ajuste.mestre.luminosidade) } };
    case "inverter":
      return { type: "invert" };
    case "posterizar":
      return { type: "posterize", levels: ajuste.niveis };
    case "limiar":
      return { type: "threshold", level: ajuste.nivel };
    default:
      return null;
  }
}

// ——— Efeitos (estilo de camada) ———
type EfeitoDoPsd = {
  enabled?: boolean;
  blendMode?: ModoDoPsd;
  opacity?: number;
  color?: CorDoPsd;
  size?: Unidades;
  distance?: Unidades;
  angle?: number;
  choke?: Unidades;
  useGlobalLight?: boolean;
  layerConceals?: boolean;
  position?: "inside" | "center" | "outside";
  fillType?: "color" | "gradient" | "pattern";
  source?: "center" | "edge";
};
export type EfeitosDoPsd = {
  disabled?: boolean;
  scale?: number;
  dropShadow?: EfeitoDoPsd[];
  innerShadow?: EfeitoDoPsd[];
  outerGlow?: EfeitoDoPsd;
  innerGlow?: EfeitoDoPsd;
  solidFill?: EfeitoDoPsd[];
  stroke?: EfeitoDoPsd[];
  bevel?: unknown;
  satin?: unknown;
  gradientOverlay?: unknown[];
  patternOverlay?: unknown;
};

const modoDoEfeito = (modo: ModoDoPsd | undefined, padrao: Exclude<Mesclagem, "passagem">) => {
  const nosso = modo ? mesclagemDoPsd(modo, false) : padrao;
  return (nosso === "passagem" ? "normal" : nosso) as Exclude<Mesclagem, "passagem">;
};

/** Os efeitos que têm par (sombras, brilhos, sobreposição de cor e traçado de cor); `faltaram` diz quantos ficaram de fora. */
export function estiloDoPsd(efeitos: EfeitosDoPsd | undefined, novoId: () => string): { estilo: EstiloDeCamada | null; faltaram: number } {
  if (!efeitos) return { estilo: null, faltaram: 0 };
  const lista: Efeito[] = [];
  const base = (tipo: TipoDoEfeito, e: EfeitoDoPsd, modo: Exclude<Mesclagem, "passagem">, cor: string): Efeito => ({
    tipo,
    id: novoId(),
    ligado: e.enabled !== false,
    modo: modoDoEfeito(e.blendMode, modo),
    opacidade: limitar(e.opacity ?? 0.75, 0, 1),
    cor: corDoPsd(e.color, cor),
  });
  for (const e of efeitos.dropShadow ?? [])
    lista.push({ ...base("sombra", e, "multiplicar", "#000000"), angulo: e.angle ?? 120, luz_global: Boolean(e.useGlobalLight), distancia: pixels(e.distance, 5), espalhar: pixels(e.choke) / 100, tamanho: pixels(e.size, 5), ruido: 0, vazar: e.layerConceals !== false });
  for (const e of efeitos.innerShadow ?? [])
    lista.push({ ...base("sombra_interna", e, "multiplicar", "#000000"), angulo: e.angle ?? 120, luz_global: Boolean(e.useGlobalLight), distancia: pixels(e.distance, 5), espalhar: pixels(e.choke) / 100, tamanho: pixels(e.size, 5), ruido: 0 });
  if (efeitos.outerGlow) {
    const e = efeitos.outerGlow;
    lista.push({ ...base("brilho_externo", e, "tela", "#ffffbe"), tecnica: "suave", espalhar: pixels(e.choke) / 100, tamanho: pixels(e.size, 5), ruido: 0, intervalo: 0.5, variacao: 0 });
  }
  if (efeitos.innerGlow) {
    const e = efeitos.innerGlow;
    lista.push({ ...base("brilho_interno", e, "tela", "#ffffbe"), tecnica: "suave", origem: e.source === "center" ? "centro" : "borda", espalhar: pixels(e.choke) / 100, tamanho: pixels(e.size, 5), ruido: 0, intervalo: 0.5, variacao: 0 });
  }
  for (const e of efeitos.solidFill ?? []) lista.push(base("sobreposicao_cor", e, "normal", "#ff0000"));
  let faltaram = 0;
  for (const e of efeitos.stroke ?? []) {
    if (e.fillType && e.fillType !== "color") {
      faltaram++;
      continue;
    }
    const posicao = e.position === "inside" ? "dentro" : e.position === "center" ? "centro" : "fora";
    lista.push({ ...base("tracado", e, "normal", "#000000"), tamanho: pixels(e.size, 3), posicao });
  }
  faltaram += (efeitos.bevel ? 1 : 0) + (efeitos.satin ? 1 : 0) + (efeitos.gradientOverlay?.length ?? 0) + (efeitos.patternOverlay ? 1 : 0);
  if (!lista.length) return { estilo: null, faltaram };
  return { estilo: { efeitos: lista, ligado: !efeitos.disabled, ...(efeitos.scale && efeitos.scale !== 1 ? { escala: efeitos.scale } : {}) }, faltaram };
}

const EFEITOS_COM_PAR = new Set<TipoDoEfeito>(["sombra", "sombra_interna", "brilho_externo", "brilho_interno", "sobreposicao_cor", "tracado"]);

/**
 * O estilo no arquivo, editável lá; null quando algum efeito não tem par ou usa o que o arquivo não guarda (a tinta
 * do traçado, o contorno da borda, os ajustes da janela): aí a camada vai com o estilo desenhado nos pixels.
 */
export function estiloParaPsd(estilo: EstiloDeCamada): EfeitosDoPsd | null {
  const efeitos = estilo.efeitos;
  if (!efeitos.length) return null;
  if (estilo.vazamento && estilo.vazamento !== "nenhum") return null;
  if (estilo.mesclar_se || (estilo.canais && !(estilo.canais.vermelho && estilo.canais.verde && estilo.canais.azul))) return null;
  for (const e of efeitos) {
    if (!EFEITOS_COM_PAR.has(e.tipo)) return null;
    if (e.tinta && e.tinta.tipo !== "cor") return null;
    if (e.contorno && e.contorno.pontos.length !== 2) return null;
    if ((e.ruido ?? 0) > 0 || (e.tecnica && e.tecnica !== "suave")) return null;
    const exemplo = efeitos.filter((outro) => outro.tipo === e.tipo);
    // Os brilhos são um só no arquivo
    if ((e.tipo === "brilho_externo" || e.tipo === "brilho_interno") && exemplo.length > 1) return null;
  }
  const comum = (e: Efeito): EfeitoDoPsd => ({
    enabled: e.ligado,
    blendMode: mesclagemParaPsd(e.modo, false),
    opacity: e.opacidade,
    color: corParaPsd(e.tinta?.tipo === "cor" ? e.tinta.cor : (e.cor ?? "#000000")),
  });
  const sombra = (e: Efeito): EfeitoDoPsd => ({ ...comum(e), angle: e.angulo ?? 120, useGlobalLight: Boolean(e.luz_global), distance: emPixels(e.distancia ?? 5), choke: emPixels(Math.round((e.espalhar ?? 0) * 100)), size: emPixels(e.tamanho ?? 5) });
  const brilho = (e: Efeito): EfeitoDoPsd => ({ ...comum(e), choke: emPixels(Math.round((e.espalhar ?? 0) * 100)), size: emPixels(e.tamanho ?? 5) });
  const saida: EfeitosDoPsd = { disabled: estilo.ligado === false, ...(estilo.escala && estilo.escala !== 1 ? { scale: estilo.escala } : {}) };
  const deTipo = (tipo: TipoDoEfeito) => efeitos.filter((e) => e.tipo === tipo);
  if (deTipo("sombra").length) saida.dropShadow = deTipo("sombra").map((e) => ({ ...sombra(e), layerConceals: e.vazar !== false }));
  if (deTipo("sombra_interna").length) saida.innerShadow = deTipo("sombra_interna").map(sombra);
  if (deTipo("brilho_externo").length) saida.outerGlow = brilho(deTipo("brilho_externo")[0]);
  if (deTipo("brilho_interno").length) saida.innerGlow = { ...brilho(deTipo("brilho_interno")[0]), source: deTipo("brilho_interno")[0].origem === "centro" ? "center" : "edge" };
  if (deTipo("sobreposicao_cor").length) saida.solidFill = deTipo("sobreposicao_cor").map(comum);
  if (deTipo("tracado").length)
    saida.stroke = deTipo("tracado").map((e) => ({ ...comum(e), fillType: "color", size: emPixels(e.tamanho ?? 3), position: e.posicao === "dentro" ? "inside" : e.posicao === "centro" ? "center" : "outside" }));
  return saida;
}

// ——— A árvore do arquivo nas faixas ———
type Comum = {
  nome: string;
  oculta: boolean;
  opacidade: number;
  mesclagem: Mesclagem;
  recortada: boolean;
  travas: TravasDaCamada | null;
  rotulo: CorDoRotulo | null;
  estilo: EstiloDeCamada | null;
  preenchimento: number;
};
/** Uma camada do arquivo já subida: as mídias e versões das camadas de pixels e das máscaras já existem. */
export type ItemDoPsd = Comum &
  (
    | { tipo: "pasta"; aberta: boolean; filhos: ItemDoPsd[] }
    | { tipo: "pixels"; midiaId: string; versao: number; mascara: Omit<MascaraDePixels, "matriz" | "vinculada"> | null }
    | { tipo: "ajuste"; ajuste: AjusteDaImagem; mascara: Omit<MascaraDePixels, "matriz" | "vinculada"> | null }
    | { tipo: "preenchimento"; preenchimento_camada: CamadaDePreenchimento; mascara: Omit<MascaraDePixels, "matriz" | "vinculada"> | null }
  );

/** A máscara do arquivo cobre o documento: a matriz da caixa que cobre o quadro é a identidade. */
const IDENTIDADE: MascaraDePixels["matriz"] = [1, 0, 0, 1, 0, 0];

/**
 * As faixas (de cima para baixo, sem a principal) das camadas do arquivo (também de cima para baixo). Cada pasta vem
 * logo antes das de dentro, como o Agrupar faz; a camada de pixels cobre o documento.
 */
export function faixasDoPsd(itens: ItemDoPsd[], novoId: () => string, duracao: number, pai: string | null = null): Faixa[] {
  return itens.flatMap((item): Faixa[] => {
    const clipe: Clipe = {
      id: novoId(),
      midia_id: null,
      inicio: 0,
      duracao,
      entrada: 0,
      velocidade: 1,
      volume: 1,
      fade_entrada: 0,
      fade_saida: 0,
      transformacao: { x: 0, y: 0, escala: 1, rotacao: 0, opacidade: limitar(item.opacidade, 0, 1) },
      recorte: { x: 0, y: 0, largura: 1, altura: 1 },
      ...(item.mesclagem !== "normal" || item.tipo === "pasta" ? { mesclagem: item.mesclagem } : {}),
      ...(item.estilo ? { estilo_camada: item.estilo } : {}),
      ...(item.preenchimento < 1 ? { preenchimento: limitar(item.preenchimento, 0, 1) } : {}),
    };
    if (item.tipo === "pasta") clipe.pasta = true;
    else if (item.tipo === "pixels") Object.assign(clipe, { midia_id: item.midiaId, pixels: { versao: item.versao } });
    else if (item.tipo === "ajuste") Object.assign(clipe, { ajuste: true, ajuste_imagem: item.ajuste });
    else Object.assign(clipe, { camada_de_preenchimento: item.preenchimento_camada });
    if (item.tipo !== "pasta" && item.mascara) clipe.mascara_pixels = { ...item.mascara, vinculada: true, matriz: IDENTIDADE };
    const faixa: Faixa = {
      id: novoId(),
      tipo: "video",
      oculta: item.oculta,
      muda: false,
      travada: false,
      clipes: [clipe],
      nome: item.nome,
      pai,
      ...(item.recortada ? { recortada: true } : {}),
      ...(item.travas ? { travas: item.travas } : {}),
      ...(item.rotulo ? { rotulo: item.rotulo } : {}),
      ...(item.tipo === "pasta" ? { aberta: item.aberta } : {}),
    };
    return item.tipo === "pasta" ? [faixa, ...faixasDoPsd(item.filhos, novoId, duracao, faixa.id)] : [faixa];
  });
}

/** Quantas camadas a árvore tem (as pastas contam: cada uma é uma faixa). */
export function contarItens(itens: ItemDoPsd[]): number {
  return itens.reduce((soma, item) => soma + 1 + (item.tipo === "pasta" ? contarItens(item.filhos) : 0), 0);
}
