// Exibir do editor de imagem (ADR 0003, onda 13.14): as réguas (as marcas em cada unidade), as guias (do documento:
// arrastadas das réguas, Nova guia, Novo layout de guias e a partir da forma), a grade e o encaixe (onde a camada que
// anda encosta: guias, grade, as outras camadas e os limites do documento). Tudo em pixels do documento.
import type { Guias } from "../projeto/geometria.ts";

export type UnidadeDaRegua = "px" | "pol" | "cm" | "mm" | "pt" | "pica" | "pct";

export const UNIDADES_DA_REGUA: { id: UnidadeDaRegua; nome: string; sigla: string }[] = [
  { id: "px", nome: "Pixels", sigla: "px" },
  { id: "pol", nome: "Polegadas", sigla: "pol" },
  { id: "cm", nome: "Centímetros", sigla: "cm" },
  { id: "mm", nome: "Milímetros", sigla: "mm" },
  { id: "pt", nome: "Pontos", sigla: "pt" },
  { id: "pica", nome: "Paicas", sigla: "pc" },
  { id: "pct", nome: "Porcentagem", sigla: "%" },
];

/** Quantos pixels do documento tem uma unidade (a porcentagem é do lado do documento). */
export function pixelsDaUnidade(unidade: UnidadeDaRegua, ppi: number, lado: number): number {
  switch (unidade) {
    case "px":
      return 1;
    case "pol":
      return ppi;
    case "cm":
      return ppi / 2.54;
    case "mm":
      return ppi / 25.4;
    case "pt":
      return ppi / 72;
    case "pica":
      return ppi / 6;
    case "pct":
      return lado / 100;
  }
}

export type MarcaDaRegua = { pos: number; nivel: 0 | 1 | 2; rotulo?: string };

const PASSOS = [1, 2, 5];

/** O menor passo "redondo" (1, 2 ou 5 vezes uma potência de 10) que fica com pelo menos `minimo`. */
function passoRedondo(minimo: number): number {
  let potencia = 10 ** Math.floor(Math.log10(Math.max(minimo, 1e-9)));
  for (;;) {
    for (const p of PASSOS) if (p * potencia >= minimo) return p * potencia;
    potencia *= 10;
  }
}

const formatar = (v: number) => (Math.abs(v) < 1e-9 ? "0" : Number(v.toFixed(3)).toLocaleString("pt-BR"));

/**
 * As marcas da régua entre `inicio` e `fim` (pixels do documento): as grandes com o número, a cada pelo menos 60 pixels
 * da tela; as médias e as pequenas no meio delas. `escala` é quantos pixels da tela vale um do documento.
 */
export function marcasDaRegua(inicio: number, fim: number, escala: number, unidade: UnidadeDaRegua, ppi: number, lado: number): MarcaDaRegua[] {
  const porUnidade = pixelsDaUnidade(unidade, ppi, lado);
  const naTela = porUnidade * escala;
  if (!(naTela > 0)) return [];
  const grande = passoRedondo(60 / naTela);
  // As divisões: 10, 5 ou 2, a que deixar as pequenas com pelo menos 5 pixels
  const divisoes = [10, 5, 2, 1].find((d) => (grande / d) * naTela >= 5) ?? 1;
  const pequeno = grande / divisoes;
  const marcas: MarcaDaRegua[] = [];
  const primeiro = Math.floor(inicio / porUnidade / pequeno);
  const ultimo = Math.ceil(fim / porUnidade / pequeno);
  for (let i = primeiro; i <= ultimo && marcas.length < 4000; i++) {
    const valor = i * pequeno;
    const pos = valor * porUnidade;
    if (i % divisoes === 0) marcas.push({ pos, nivel: 0, rotulo: formatar(valor) });
    else marcas.push({ pos, nivel: divisoes % 2 === 0 && i % (divisoes / 2) === 0 ? 1 : 2 });
  }
  return marcas;
}

export type LayoutDeGuias = {
  colunas: number;
  /** A largura de cada coluna (sem ela, as colunas dividem o espaço). */
  largura: number | null;
  medianiz: number;
  linhas: number;
  altura: number | null;
  medianizDasLinhas: number;
  margens: { topo: number; esquerda: number; base: number; direita: number };
  /** Com a largura (ou a altura) fixa, as colunas ficam no meio do espaço. */
  centralizar: boolean;
};

export const LAYOUT_PADRAO: LayoutDeGuias = { colunas: 8, largura: null, medianiz: 20, linhas: 0, altura: null, medianizDasLinhas: 20, margens: { topo: 0, esquerda: 0, base: 0, direita: 0 }, centralizar: true };

/** As bordas de n faixas num espaço, com o espaço entre elas. */
function faixas(n: number, inicio: number, espaco: number, tamanho: number | null, medianiz: number, centralizar: boolean): number[] {
  if (n <= 0) return [];
  const cada = tamanho ?? (espaco - (n - 1) * medianiz) / n;
  if (!(cada > 0)) return [];
  const total = n * cada + (n - 1) * medianiz;
  const comeco = inicio + (tamanho !== null && centralizar ? (espaco - total) / 2 : 0);
  const bordas: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = comeco + i * (cada + medianiz);
    bordas.push(x, x + cada);
  }
  return bordas;
}

/** Exibir › Novo layout de guias: as margens e as bordas das colunas e das linhas. */
export function guiasDoLayout(layout: LayoutDeGuias, documento: { largura: number; altura: number }): Guias {
  const { margens } = layout;
  const larguraUtil = documento.largura - margens.esquerda - margens.direita;
  const alturaUtil = documento.altura - margens.topo - margens.base;
  const verticais = [...faixas(layout.colunas, margens.esquerda, larguraUtil, layout.largura, layout.medianiz, layout.centralizar)];
  const horizontais = [...faixas(layout.linhas, margens.topo, alturaUtil, layout.altura, layout.medianizDasLinhas, layout.centralizar)];
  if (margens.esquerda) verticais.push(margens.esquerda);
  if (margens.direita) verticais.push(documento.largura - margens.direita);
  if (margens.topo) horizontais.push(margens.topo);
  if (margens.base) horizontais.push(documento.altura - margens.base);
  const unicas = (lista: number[]) => [...new Set(lista.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
  return { verticais: unicas(verticais), horizontais: unicas(horizontais) };
}

export type Limites = { esquerda: number; topo: number; direita: number; base: number };

/** Exibir › Novas guias a partir da forma: as bordas e o meio da camada. */
export const guiasDaForma = (l: Limites): Guias => ({ verticais: [l.esquerda, (l.esquerda + l.direita) / 2, l.direita], horizontais: [l.topo, (l.topo + l.base) / 2, l.base] });

/** Junta guias sem repetir (as que caem no mesmo lugar ficam uma). */
export function juntarGuias(a: Guias, b: Guias): Guias {
  const unir = (x: number[], y: number[]) => [...new Set([...x, ...y].map((v) => Math.round(v * 1000) / 1000))].sort((p, q) => p - q);
  return { verticais: unir(a.verticais, b.verticais), horizontais: unir(a.horizontais, b.horizontais) };
}

export type EncaixarEm = { guias: boolean; grade: boolean; camadas: boolean; limites: boolean };
export const ENCAIXAR_EM_TUDO: EncaixarEm = { guias: true, grade: true, camadas: true, limites: true };

/**
 * Onde a camada que anda pode encostar (pixels do documento): as guias, as linhas da grade (as de dentro do
 * documento, quando o espaço não é pequeno demais), as bordas e o meio das outras camadas e as bordas e o meio do
 * documento, conforme o "Encaixar em".
 */
export function alvosDoEncaixe(
  em: EncaixarEm,
  { guias, espacoDaGrade, outras, documento }: { guias: Guias | null; espacoDaGrade: number; outras: Limites[]; documento: { largura: number; altura: number } },
): Guias {
  const verticais: number[] = [];
  const horizontais: number[] = [];
  if (em.guias && guias) {
    verticais.push(...guias.verticais);
    horizontais.push(...guias.horizontais);
  }
  if (em.grade && espacoDaGrade > 0 && documento.largura / espacoDaGrade <= 400 && documento.altura / espacoDaGrade <= 400) {
    for (let x = 0; x <= documento.largura + 1e-6; x += espacoDaGrade) verticais.push(x);
    for (let y = 0; y <= documento.altura + 1e-6; y += espacoDaGrade) horizontais.push(y);
  }
  if (em.camadas)
    for (const l of outras) {
      verticais.push(l.esquerda, (l.esquerda + l.direita) / 2, l.direita);
      horizontais.push(l.topo, (l.topo + l.base) / 2, l.base);
    }
  if (em.limites) {
    verticais.push(0, documento.largura / 2, documento.largura);
    horizontais.push(0, documento.altura / 2, documento.altura);
  }
  return { verticais: [...new Set(verticais)], horizontais: [...new Set(horizontais)] };
}

/** O valor encostado no alvo mais perto, se ele estiver a até `tolerancia`. */
export function encaixarValor(valor: number, alvos: number[], tolerancia: number): { valor: number; alvo: number | null } {
  let melhor: number | null = null;
  for (const alvo of alvos) if (Math.abs(alvo - valor) <= tolerancia && (melhor === null || Math.abs(alvo - valor) < Math.abs(melhor - valor))) melhor = alvo;
  return { valor: melhor ?? valor, alvo: melhor };
}

// ——— As preferências de exibição (por navegador: são da tela de quem edita) ———
export type PreferenciasDaVista = {
  reguas: boolean;
  unidade: UnidadeDaRegua;
  extras: boolean;
  guias: boolean;
  travarGuias: boolean;
  grade: boolean;
  espacoDaGrade: number;
  subdivisoes: number;
  guiasInteligentes: boolean;
  bordasDaCamada: boolean;
  malhaDePixels: boolean;
  /** Exibir › Mostrar › Notas e Contagem. */
  notas: boolean;
  contagem: boolean;
  encaixar: boolean;
  encaixarEm: EncaixarEm;
};

export const VISTA_PADRAO: PreferenciasDaVista = {
  reguas: false,
  unidade: "px",
  extras: true,
  guias: true,
  travarGuias: false,
  grade: false,
  espacoDaGrade: 100,
  subdivisoes: 4,
  guiasInteligentes: true,
  bordasDaCamada: false,
  malhaDePixels: true,
  notas: true,
  contagem: true,
  encaixar: true,
  encaixarEm: ENCAIXAR_EM_TUDO,
};

const CHAVE_DA_VISTA = "takeone-vista-imagem";

export function lerVista(): PreferenciasDaVista {
  try {
    const lidas = JSON.parse(localStorage.getItem(CHAVE_DA_VISTA) ?? "null") as Partial<PreferenciasDaVista> | null;
    if (!lidas || typeof lidas !== "object") return VISTA_PADRAO;
    const vista = { ...VISTA_PADRAO, ...lidas, encaixarEm: { ...ENCAIXAR_EM_TUDO, ...(lidas.encaixarEm ?? {}) } };
    if (!UNIDADES_DA_REGUA.some((u) => u.id === vista.unidade)) vista.unidade = "px";
    if (!(vista.espacoDaGrade >= 1 && vista.espacoDaGrade <= 4096)) vista.espacoDaGrade = VISTA_PADRAO.espacoDaGrade;
    if (!(vista.subdivisoes >= 1 && vista.subdivisoes <= 32)) vista.subdivisoes = VISTA_PADRAO.subdivisoes;
    return vista;
  } catch {
    return VISTA_PADRAO;
  }
}

export function guardarVista(vista: PreferenciasDaVista) {
  try {
    localStorage.setItem(CHAVE_DA_VISTA, JSON.stringify(vista));
  } catch {
    // Sem armazenamento, a vista volta ao padrão na próxima vez
  }
}
