// Os estilos das fotos do álbum (onda 16.6): a cor base (de um arquivo XMP de outro programa, de uma LUT, de um
// filtro ou feita à mão), a intensidade, o "Melhorar" por foto, as três perguntas de gosto e o modo de cada
// controle. Tudo vira a `cor` da aba Cor de cada foto (a mesma LUT 3D da prévia e do render). Contas puras.
import { AJUSTES_NEUTROS, type AjustesCor, type Cor, type Curvas, type FaixaDeMatiz, FILTROS, type Hsl, LIMITES_COR, type PontoDaCurva } from "../projeto/cor.ts";

export type ModoDoControle = "somar" | "fixo" | "desligado";
export type Luz = "clara" | "natural" | "escura";
export type Contraste = "suave" | "medio" | "forte";
export type Temperatura = "quente" | "neutra" | "fria";

export type EstiloDaFoto = {
  /** A cor base do estilo (os ajustes, o filtro, a cor por matiz, as curvas e a LUT). */
  cor: Partial<Cor>;
  /** De 0 a 1,5: quanto da cor base entra. */
  intensidade: number;
  /** O "Melhorar" de cada foto por baixo do estilo (a luz e o branco corrigidos foto a foto). */
  melhorar: boolean;
  /** As três perguntas de gosto. */
  gosto: { luz: Luz; contraste: Contraste; temperatura: Temperatura };
  /** Por controle: somar (o padrão), fixo (o valor, sem o resto) ou desligado (fica em zero). */
  controles: Partial<Record<keyof AjustesCor, { modo: ModoDoControle; valor: number }>>;
};

export const ESTILO_NEUTRO: EstiloDaFoto = { cor: {}, intensidade: 1, melhorar: true, gosto: { luz: "natural", contraste: "medio", temperatura: "neutra" }, controles: {} };

/** O que cada resposta soma aos ajustes. */
const GOSTO: { luz: Record<Luz, Partial<AjustesCor>>; contraste: Record<Contraste, Partial<AjustesCor>>; temperatura: Record<Temperatura, Partial<AjustesCor>> } = {
  luz: { clara: { exposicao: 0.3, sombras: 0.15, pretos: 0.1 }, natural: {}, escura: { exposicao: -0.25, realces: -0.15, pretos: -0.1 } },
  contraste: { suave: { contraste: -0.15, realces: -0.1, sombras: 0.1 }, medio: {}, forte: { contraste: 0.2, brancos: 0.1, pretos: -0.1 } },
  temperatura: { quente: { temperatura: 0.15 }, neutra: {}, fria: { temperatura: -0.15 } },
};

export const PERGUNTAS_DO_GOSTO: { id: keyof EstiloDaFoto["gosto"]; pergunta: string; opcoes: { id: string; nome: string }[] }[] = [
  { id: "luz", pergunta: "Como você gosta da luz?", opcoes: [{ id: "clara", nome: "Clara e arejada" }, { id: "natural", nome: "Natural" }, { id: "escura", nome: "Escura e densa" }] },
  { id: "contraste", pergunta: "E o contraste?", opcoes: [{ id: "suave", nome: "Suave" }, { id: "medio", nome: "Médio" }, { id: "forte", nome: "Forte" }] },
  { id: "temperatura", pergunta: "E a cor?", opcoes: [{ id: "quente", nome: "Quente" }, { id: "neutra", nome: "Neutra" }, { id: "fria", nome: "Fria" }] },
];

/** Os controles que o ajuste controle a controle mostra, na ordem da aba Cor. */
export const CONTROLES_DO_ESTILO: { id: keyof AjustesCor; nome: string }[] = [
  { id: "exposicao", nome: "Exposição" },
  { id: "contraste", nome: "Contraste" },
  { id: "realces", nome: "Realces" },
  { id: "sombras", nome: "Sombras" },
  { id: "brancos", nome: "Brancos" },
  { id: "pretos", nome: "Pretos" },
  { id: "temperatura", nome: "Temperatura" },
  { id: "tom", nome: "Tom" },
  { id: "vibracao", nome: "Vibração" },
  { id: "saturacao", nome: "Saturação" },
  { id: "nevoa", nome: "Névoa" },
  { id: "vinheta", nome: "Vinheta" },
];

/** Estilos prontos, desenhados aqui (sem nada de outros programas). */
export const ESTILOS_PRONTOS: { id: string; nome: string; estilo: EstiloDaFoto }[] = [
  { id: "natural", nome: "Natural", estilo: { ...ESTILO_NEUTRO } },
  { id: "arejado", nome: "Claro e arejado", estilo: { ...ESTILO_NEUTRO, cor: { exposicao: 0.25, contraste: -0.1, sombras: 0.25, realces: -0.15, saturacao: -0.1, temperatura: 0.05, pretos: 0.15 } } },
  { id: "dourado", nome: "Fim de tarde", estilo: { ...ESTILO_NEUTRO, cor: { temperatura: 0.3, tom: 0.05, contraste: 0.1, vibracao: 0.2, matiz_claros: 40, forca_claros: 0.25, vinheta: 0.15 } } },
  { id: "moody", nome: "Escuro e dramático", estilo: { ...ESTILO_NEUTRO, cor: { exposicao: -0.2, contraste: 0.25, realces: -0.3, sombras: -0.1, saturacao: -0.2, matiz_escuros: 200, forca_escuros: 0.3, vinheta: 0.3 } } },
  {
    id: "filme",
    nome: "Filme",
    estilo: {
      ...ESTILO_NEUTRO,
      cor: {
        contraste: -0.05,
        saturacao: -0.1,
        matiz_escuros: 190,
        forca_escuros: 0.2,
        matiz_claros: 35,
        forca_claros: 0.2,
        curvas: { rgb: [[0, 0.06], [0.25, 0.24], [0.75, 0.78], [1, 0.96]], r: [[0, 0], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]] },
      },
    },
  },
  { id: "pb_suave", nome: "Preto e branco suave", estilo: { ...ESTILO_NEUTRO, cor: { saturacao: -1, contraste: 0.05, sombras: 0.15, realces: -0.1 } } },
  { id: "pb_forte", nome: "Preto e branco forte", estilo: { ...ESTILO_NEUTRO, cor: { saturacao: -1, contraste: 0.35, brancos: 0.15, pretos: -0.2, vinheta: 0.2 } } },
  { id: "vivo", nome: "Cores vivas", estilo: { ...ESTILO_NEUTRO, cor: { vibracao: 0.35, saturacao: 0.1, contraste: 0.15, nevoa: 0.15 } } },
];

/** Um estilo a partir de um filtro pronto da aba Cor. */
export function estiloDoFiltro(filtro: string): EstiloDaFoto {
  return { ...ESTILO_NEUTRO, cor: { filtro, intensidade: 1 } };
}

/** Um estilo a partir de uma LUT do espaço. */
export function estiloDaLut(id: string): EstiloDaFoto {
  return { ...ESTILO_NEUTRO, cor: { lut: { id, intensidade: 1 } } };
}

const limitar = (chave: keyof AjustesCor, valor: number) => Math.min(LIMITES_COR[chave].maximo, Math.max(LIMITES_COR[chave].minimo, valor));
const arredondar = (valor: number) => Math.round(valor * 1000) / 1000;
const MATIZES = new Set<keyof AjustesCor>(["matiz_escuros", "matiz_medios", "matiz_claros"]);

/** As curvas levadas em direção à reta pela intensidade (0: reta, 1: como estão). */
function curvasComIntensidade(curvas: Curvas, k: number): Curvas {
  const levar = (pontos: PontoDaCurva[]): PontoDaCurva[] => pontos.map(([x, y]) => [x, arredondar(Math.min(1, Math.max(0, x + (y - x) * k)))]);
  return { rgb: levar(curvas.rgb), r: levar(curvas.r), g: levar(curvas.g), b: levar(curvas.b) };
}

/**
 * A cor de uma foto com o estilo: a cor base vezes a intensidade, mais o gosto, mais o "Melhorar" da foto (se o
 * estilo pede), e cada controle somado, fixo ou desligado. O filtro, a LUT, a cor por matiz e as curvas da base
 * entram com a intensidade.
 */
export function corDoEstilo(estilo: EstiloDaFoto, melhorado: Partial<AjustesCor> = {}): Partial<Cor> {
  const k = estilo.intensidade;
  const base = estilo.cor;
  const saida: Partial<Cor> = {};
  for (const chave of Object.keys(AJUSTES_NEUTROS) as (keyof AjustesCor)[]) {
    const controle = estilo.controles[chave];
    if (controle?.modo === "desligado") continue;
    if (controle?.modo === "fixo") {
      if (controle.valor) saida[chave] = limitar(chave, controle.valor);
      continue;
    }
    // O matiz das rodas não se multiplica: só a força
    let valor = MATIZES.has(chave) ? (base[chave] ?? 0) : (base[chave] ?? 0) * k;
    if (!MATIZES.has(chave)) {
      for (const pergunta of ["luz", "contraste", "temperatura"] as const) {
        const respostas = GOSTO[pergunta] as Record<string, Partial<AjustesCor>>;
        valor += respostas[estilo.gosto[pergunta]]?.[chave] ?? 0;
      }
      if (estilo.melhorar) valor += melhorado[chave] ?? 0;
      valor += controle?.valor ?? 0;
    }
    if (valor) saida[chave] = arredondar(limitar(chave, valor));
  }
  if (base.filtro && FILTROS.some((f) => f.id === base.filtro)) {
    saida.filtro = base.filtro;
    saida.intensidade = arredondar(Math.min(2, (base.intensidade ?? 1) * k));
  }
  if (base.lut) saida.lut = { id: base.lut.id, intensidade: arredondar(Math.min(1, base.lut.intensidade * k)) };
  if (base.hsl) {
    const hsl: Hsl = {};
    for (const [faixa, ajuste] of Object.entries(base.hsl) as [FaixaDeMatiz, NonNullable<Hsl[FaixaDeMatiz]>][]) {
      hsl[faixa] = { matiz: arredondar(Math.max(-1, Math.min(1, ajuste.matiz * k))), saturacao: arredondar(Math.max(-1, Math.min(1, ajuste.saturacao * k))), luminancia: arredondar(Math.max(-1, Math.min(1, ajuste.luminancia * k))) };
    }
    saida.hsl = hsl;
  }
  if (base.curvas) saida.curvas = curvasComIntensidade(base.curvas, Math.min(1, k));
  return saida;
}

/**
 * A consistência entre parecidas: o "Melhorar" de cada foto vira a média do grupo dela (com um pouco do dela), para
 * as fotos de uma rajada não saírem cada uma com uma luz.
 */
export function melhoradosConsistentes(grupos: Map<string, string[]>, melhorados: Map<string, Partial<AjustesCor>>, propria = 0.25): Map<string, Partial<AjustesCor>> {
  const saida = new Map<string, Partial<AjustesCor>>();
  for (const ids of grupos.values()) {
    const membros = ids.filter((id) => melhorados.has(id));
    const chaves = new Set(membros.flatMap((id) => Object.keys(melhorados.get(id)!))) as Set<keyof AjustesCor>;
    const media: Partial<AjustesCor> = {};
    for (const chave of chaves) media[chave] = membros.reduce((soma, id) => soma + (melhorados.get(id)![chave] ?? 0), 0) / membros.length;
    for (const id of membros) {
      const dela = melhorados.get(id)!;
      const junta: Partial<AjustesCor> = {};
      for (const chave of chaves) junta[chave] = arredondar((media[chave] ?? 0) * (1 - propria) + (dela[chave] ?? 0) * propria);
      saida.set(id, junta);
    }
  }
  return saida;
}

// -----------------------------------------------
// XMP: as predefinições de outros programas de fotos. Lê os campos de revelação que têm par na aba Cor; o resto
// (máscaras, nitidez, ruído, perfis de câmera) fica de fora.
// -----------------------------------------------
const FAIXAS_DO_XMP: [string, FaixaDeMatiz][] = [
  ["Red", "vermelho"],
  ["Orange", "laranja"],
  ["Yellow", "amarelo"],
  ["Green", "verde"],
  ["Aqua", "ciano"],
  ["Blue", "azul"],
  ["Purple", "roxo"],
  ["Magenta", "magenta"],
];

/** O valor de um campo do XMP, como atributo (crs:Campo="+0.50") ou elemento (<crs:Campo>0.5</crs:Campo>). */
function campoDoXmp(texto: string, nome: string): number | null {
  const atributo = new RegExp(`crs:${nome}\\s*=\\s*"([^"]*)"`).exec(texto);
  const elemento = new RegExp(`<crs:${nome}>([^<]*)</crs:${nome}>`).exec(texto);
  const bruto = atributo?.[1] ?? elemento?.[1];
  if (bruto === undefined) return null;
  const valor = Number(bruto.trim().replace(/^\+/, ""));
  return Number.isFinite(valor) ? valor : null;
}

/** Uma curva do XMP (pontos "x, y" de 0 a 255 numa lista), com no máximo 16 pontos. */
function curvaDoXmp(texto: string, nome: string): PontoDaCurva[] | null {
  const bloco = new RegExp(`<crs:${nome}>([\\s\\S]*?)</crs:${nome}>`).exec(texto);
  if (!bloco) return null;
  const pontos = [...bloco[1].matchAll(/<rdf:li>\s*([\d.]+)\s*,\s*([\d.]+)\s*<\/rdf:li>/g)].map((m) => [Number(m[1]) / 255, Number(m[2]) / 255] as PontoDaCurva);
  if (pontos.length < 2) return null;
  const reta = pontos.every(([x, y]) => Math.abs(x - y) < 1e-3);
  if (reta) return null;
  // Mais de 16 pontos: guarda as pontas e uma amostra igual do meio
  const escolhidos = pontos.length <= 16 ? pontos : Array.from({ length: 16 }, (_, i) => pontos[Math.round((i * (pontos.length - 1)) / 15)]);
  return escolhidos.map(([x, y]) => [arredondar(x), arredondar(y)] as PontoDaCurva);
}

/**
 * A cor de uma predefinição XMP: exposição, contraste, realces, sombras, brancos, pretos, névoa, vibração,
 * saturação, o branco (incremental), a cor por matiz, a gradação de cor (rodas), a vinheta e as curvas de tom.
 * As escalas foram escolhidas para o mesmo número dar um efeito parecido aqui (o contraste daqui é mais forte).
 */
export function corDoXmp(texto: string): Partial<Cor> {
  if (!/crs:|camera-raw-settings/i.test(texto)) throw new Error("O arquivo não tem os ajustes de revelação de uma predefinição XMP.");
  const cor: Partial<Cor> = {};
  const por = (campo: string, chave: keyof AjustesCor, escala: number) => {
    const valor = campoDoXmp(texto, campo);
    if (valor !== null && valor !== 0) cor[chave] = arredondar(limitar(chave, valor * escala));
  };
  por("Exposure2012", "exposicao", 1);
  por("Contrast2012", "contraste", 0.005);
  por("Highlights2012", "realces", 0.01);
  por("Shadows2012", "sombras", 0.01);
  por("Whites2012", "brancos", 0.01);
  por("Blacks2012", "pretos", 0.01);
  por("Dehaze", "nevoa", 0.01);
  por("Vibrance", "vibracao", 0.01);
  por("Saturation", "saturacao", 0.01);
  por("IncrementalTemperature", "temperatura", 0.01);
  por("IncrementalTint", "tom", 0.01);
  const vinheta = campoDoXmp(texto, "PostCropVignetteAmount");
  if (vinheta !== null && vinheta < 0) cor.vinheta = arredondar(Math.min(1, -vinheta / 100));
  const hsl: Hsl = {};
  for (const [nome, faixa] of FAIXAS_DO_XMP) {
    const matiz = (campoDoXmp(texto, `HueAdjustment${nome}`) ?? 0) / 100;
    const saturacao = (campoDoXmp(texto, `SaturationAdjustment${nome}`) ?? 0) / 100;
    const luminancia = (campoDoXmp(texto, `LuminanceAdjustment${nome}`) ?? 0) / 100;
    if (matiz || saturacao || luminancia) hsl[faixa] = { matiz: arredondar(matiz), saturacao: arredondar(saturacao), luminancia: arredondar(luminancia) };
  }
  if (Object.keys(hsl).length) cor.hsl = hsl;
  // A gradação de cor (ou a divisão de tons, das versões antigas): o matiz e a força das sombras, meios e realces
  const rodas: [string[], keyof AjustesCor, keyof AjustesCor][] = [
    [["ColorGradeShadowHue", "SplitToningShadowHue"], "matiz_escuros", "forca_escuros"],
    [["ColorGradeMidtoneHue"], "matiz_medios", "forca_medios"],
    [["ColorGradeHighlightHue", "SplitToningHighlightHue"], "matiz_claros", "forca_claros"],
  ];
  for (const [campos, matiz, forca] of rodas) {
    for (const campo of campos) {
      const h = campoDoXmp(texto, campo);
      const s = campoDoXmp(texto, campo.replace("Hue", campo.startsWith("ColorGrade") ? "Sat" : "Saturation"));
      if (h !== null && s) {
        cor[matiz] = arredondar(((h % 360) + 360) % 360);
        cor[forca] = arredondar(Math.min(1, s / 100));
        break;
      }
    }
  }
  const curvas = { rgb: curvaDoXmp(texto, "ToneCurvePV2012"), r: curvaDoXmp(texto, "ToneCurvePV2012Red"), g: curvaDoXmp(texto, "ToneCurvePV2012Green"), b: curvaDoXmp(texto, "ToneCurvePV2012Blue") };
  if (curvas.rgb || curvas.r || curvas.g || curvas.b) {
    const reta: PontoDaCurva[] = [
      [0, 0],
      [1, 1],
    ];
    cor.curvas = { rgb: curvas.rgb ?? reta, r: curvas.r ?? reta, g: curvas.g ?? reta, b: curvas.b ?? reta };
  }
  return cor;
}

/** O nome que o XMP dá à predefinição (crs:Name ou dc:title), se tiver. */
export function nomeDoXmp(texto: string): string | null {
  const m = /<rdf:Alt>\s*<rdf:li[^>]*>([^<]+)<\/rdf:li>/.exec(/<crs:Name>[\s\S]*?<\/crs:Name>/.exec(texto)?.[0] ?? "") ?? /<dc:title>[\s\S]*?<rdf:li[^>]*>([^<]+)<\/rdf:li>/.exec(texto);
  return m ? m[1].trim().slice(0, 80) : null;
}
