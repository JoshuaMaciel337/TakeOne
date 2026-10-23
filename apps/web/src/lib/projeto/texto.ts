// Clipes de texto: o que a pessoa escolhe e os estilos prontos. A imagem do texto é desenhada pela
// API (core/utils/texto.py), a mesma que o render usa. Os limites são os de apps/api/esquemas.py.

import { CORES_DO_DEGRADE, type Degrade, MEIO_DO_DEGRADE } from "./gradiente.ts";

export type FonteTexto = "display" | "texto" | "manuscrita";
export type Alinhamento = "esquerda" | "centro" | "direita";

/**
 * Palavra falada em outra cor (lib/projeto/letras.ts): "karaoke" pinta até a palavra atual,
 * "palavra" pinta só ela.
 */
export type Destaque = { modo: "karaoke" | "palavra"; cor: string };

export type Texto = {
  conteudo: string;
  fonte: FonteTexto;
  negrito: boolean;
  caixa_alta: boolean;
  /** Altura da letra, em fração do lado menor do quadro. */
  tamanho: number;
  cor: string;
  alinhamento: Alinhamento;
  contorno_cor: string;
  /** Em fração do tamanho da letra; 0 é sem contorno. */
  contorno_espessura: number;
  /** Opacidade da sombra; 0 é sem sombra. */
  sombra: number;
  fundo_cor: string;
  /** 0 é sem fundo. */
  fundo_opacidade: number;
  /** Luz em volta das letras; 0 é sem brilho. */
  brilho: number;
  brilho_cor: string;
  destaque?: Destaque | null;
  /** Quando cada palavra começa, em ticks desde o começo do clipe (legendas da fala). */
  tempos?: number[] | null;
  /** Números das palavras pintadas na cor_chave (contadas por palavrasDoTexto), desenhadas no próprio PNG. */
  palavras_chave?: number[] | null;
  cor_chave?: string;
  /** Espaço a mais entre as letras, em fração do tamanho (negativo aperta). */
  espacamento?: number;
  /** Altura de cada linha, em vezes o tamanho da letra (1,15 é o normal). */
  entrelinha?: number;
  sublinhado?: boolean;
  tachado?: boolean;
  /** Sombra completa: cor, direção em graus (0 para a direita, 90 para baixo) e medidas em fração do tamanho. */
  sombra_cor?: string;
  sombra_angulo?: number;
  sombra_distancia?: number;
  sombra_desfoque?: number;
  /** De 0 a 1: engrossa a sombra antes do desfoque. */
  sombra_espalhar?: number;
  /** O raio do brilho, em vezes o de sempre. */
  brilho_tamanho?: number;
  /** Até dois contornos por fora do principal. */
  contornos?: ContornoExtra[] | null;
  /** A opacidade das letras: 0 deixa só o contorno (texto vazado). */
  preenchimento?: number;
  /** As letras em degradê no lugar da cor (lib/projeto/gradiente.ts). */
  degrade?: Degrade | null;
};

export type ContornoExtra = { cor: string; espessura: number };
/** Os padrões da sombra e do brilho, os de core/utils/texto.py: a sombra de sempre, para baixo e para a direita. */
export const SOMBRA_PADRAO = { cor: "#000000", angulo: 45, distancia: 0.06 * Math.SQRT2, desfoque: 0.08, espalhar: 0 };
export const CONTORNOS_EXTRAS = 2;

export const FONTES_TEXTO: { id: FonteTexto; nome: string }[] = [
  { id: "display", nome: "Montserrat" },
  { id: "texto", nome: "Inter" },
  { id: "manuscrita", nome: "Caveat (à mão)" },
];

export const LIMITES_TEXTO = {
  conteudo: 500,
  tamanho: { minimo: 0.02, maximo: 0.3 },
  contorno: { minimo: 0, maximo: 0.25 },
  espacamento: { minimo: -0.1, maximo: 1 },
  entrelinha: { minimo: 0.7, maximo: 3 },
  sombraDistancia: { minimo: 0, maximo: 0.5 },
  sombraDesfoque: { minimo: 0, maximo: 0.5 },
  brilhoTamanho: { minimo: 0.3, maximo: 3 },
} as const;

/** A entrelinha de sempre (core/utils/texto.py, ENTRELINHA). */
export const ENTRELINHA_PADRAO = 1.15;

export const TEXTO_PADRAO: Texto = {
  conteudo: "Texto",
  fonte: "display",
  negrito: true,
  caixa_alta: false,
  tamanho: 0.07,
  cor: "#ffffff",
  alinhamento: "centro",
  contorno_cor: "#000000",
  contorno_espessura: 0,
  sombra: 0,
  fundo_cor: "#000000",
  fundo_opacidade: 0,
  brilho: 0,
  brilho_cor: "#ffffff",
};

/** Estilos prontos do painel de texto. Os nomes e os valores são do TakeOne. */
export const ESTILOS_DE_TEXTO: { id: string; nome: string; texto: Texto }[] = [
  { id: "titulo", nome: "Título", texto: { ...TEXTO_PADRAO, conteudo: "Título", caixa_alta: true, tamanho: 0.09, sombra: 0.5 } },
  { id: "simples", nome: "Texto simples", texto: { ...TEXTO_PADRAO, conteudo: "Seu texto aqui", fonte: "texto", negrito: false, tamanho: 0.055, sombra: 0.4 } },
  { id: "destaque", nome: "Destaque", texto: { ...TEXTO_PADRAO, conteudo: "Destaque", tamanho: 0.07, fundo_cor: "#ff3d77", fundo_opacidade: 1 } },
  { id: "contorno", nome: "Contorno", texto: { ...TEXTO_PADRAO, conteudo: "Contorno", caixa_alta: true, tamanho: 0.08, contorno_espessura: 0.12 } },
  { id: "caixa", nome: "Caixa escura", texto: { ...TEXTO_PADRAO, conteudo: "Legenda em caixa", fonte: "texto", tamanho: 0.05, fundo_opacidade: 0.6 } },
  { id: "manuscrito", nome: "À mão", texto: { ...TEXTO_PADRAO, conteudo: "Escrito à mão", fonte: "manuscrita", tamanho: 0.1, sombra: 0.5 } },
  { id: "neon", nome: "Neon", texto: { ...TEXTO_PADRAO, conteudo: "Neon", fonte: "manuscrita", tamanho: 0.1, cor: "#fff4fb", brilho: 0.8, brilho_cor: "#ff2bd6" } },
  {
    id: "dourado",
    nome: "Dourado",
    texto: {
      ...TEXTO_PADRAO,
      conteudo: "DOURADO",
      tamanho: 0.09,
      cor: "#ffcf3a",
      degrade: { tipo: "linear", cores: ["#fff4b0", "#ffcf3a", "#a8730a", "#ffe680"], angulo: 90, meio: 0.55 },
      contorno_espessura: 0.035,
      contorno_cor: "#4a2f00",
      sombra: 0.7,
      sombra_desfoque: 0.05,
    },
  },
  {
    id: "cromado",
    nome: "Cromado",
    texto: {
      ...TEXTO_PADRAO,
      conteudo: "CROMADO",
      tamanho: 0.09,
      cor: "#d9dee4",
      degrade: { tipo: "linear", cores: ["#ffffff", "#c9d1d9", "#4f5862", "#e9eef3"], angulo: 90, meio: 0.5 },
      contorno_espessura: 0.03,
      contorno_cor: "#1f252b",
      sombra: 0.6,
    },
  },
  {
    id: "quadrinhos",
    nome: "Quadrinhos",
    texto: {
      ...TEXTO_PADRAO,
      conteudo: "POW!",
      tamanho: 0.11,
      cor: "#ffe14d",
      contorno_espessura: 0.09,
      contorno_cor: "#111111",
      contornos: [{ cor: "#ffffff", espessura: 0.05 }],
      sombra: 1,
      sombra_distancia: 0.14,
      sombra_desfoque: 0,
    },
  },
  {
    id: "relevo",
    nome: "Baixo relevo",
    texto: {
      ...TEXTO_PADRAO,
      conteudo: "Relevo",
      tamanho: 0.09,
      cor: "#e6e6e6",
      degrade: { tipo: "linear", cores: ["#ffffff", "#9a9a9a"], angulo: 90, meio: 0.5 },
      contorno_espessura: 0.015,
      contorno_cor: "#6b6b6b",
      sombra: 0.8,
      sombra_distancia: 0.035,
      sombra_desfoque: 0.015,
    },
  },
  {
    id: "vazado",
    nome: "Vazado",
    texto: { ...TEXTO_PADRAO, conteudo: "VAZADO", tamanho: 0.1, contorno_espessura: 0.045, contorno_cor: "#ffffff", preenchimento: 0, espacamento: 0.06 },
  },
  {
    id: "por-do-sol",
    nome: "Pôr do sol",
    texto: {
      ...TEXTO_PADRAO,
      conteudo: "Pôr do sol",
      tamanho: 0.09,
      cor: "#ff6a3d",
      degrade: { tipo: "linear", cores: ["#ffd36e", "#ff6a3d", "#c2185b"], angulo: 90, meio: 0.45 },
      sombra: 0.45,
    },
  },
];

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

const COR = /^#[0-9a-f]{6}$/i;
export const COR_CHAVE = "#ffd400";

/** Números inteiros, sem repetir, em ordem e no máximo 60, como a API aceita; vazio vira null. */
function limparPalavrasChave(numeros: number[] | null | undefined): number[] | null {
  const limpos = [...new Set((numeros ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n <= 500))].sort((a, b) => a - b).slice(0, 60);
  return limpos.length ? limpos : null;
}

/** O degradê dentro dos limites da API (de 2 a 5 cores válidas), ou null. */
export function limparDegrade(degrade: Degrade | null | undefined): Degrade | null {
  if (!degrade) return null;
  const cores = degrade.cores.filter((c) => COR.test(c)).map((c) => c.toLowerCase()).slice(0, CORES_DO_DEGRADE.maximo);
  if (cores.length < CORES_DO_DEGRADE.minimo) return null;
  return {
    tipo: degrade.tipo === "radial" ? "radial" : "linear",
    cores,
    angulo: limitar(degrade.angulo ?? 0, -360, 360),
    meio: limitar(degrade.meio ?? 0.5, MEIO_DO_DEGRADE.minimo, MEIO_DO_DEGRADE.maximo),
  };
}

/** Aplica a mudança e mantém tudo dentro dos limites que a API aceita. */
export function ajustarTexto(atual: Texto, mudanca: Partial<Texto>): Texto {
  const texto = { ...TEXTO_PADRAO, ...atual, ...mudanca };
  const cor = (valor: string, reserva: string) => (COR.test(valor) ? valor.toLowerCase() : reserva);
  return {
    ...texto,
    conteudo: texto.conteudo.slice(0, LIMITES_TEXTO.conteudo),
    tamanho: limitar(texto.tamanho, LIMITES_TEXTO.tamanho.minimo, LIMITES_TEXTO.tamanho.maximo),
    contorno_espessura: limitar(texto.contorno_espessura, LIMITES_TEXTO.contorno.minimo, LIMITES_TEXTO.contorno.maximo),
    sombra: limitar(texto.sombra, 0, 1),
    fundo_opacidade: limitar(texto.fundo_opacidade, 0, 1),
    brilho: limitar(texto.brilho, 0, 1),
    espacamento: limitar(texto.espacamento ?? 0, LIMITES_TEXTO.espacamento.minimo, LIMITES_TEXTO.espacamento.maximo),
    entrelinha: limitar(texto.entrelinha ?? ENTRELINHA_PADRAO, LIMITES_TEXTO.entrelinha.minimo, LIMITES_TEXTO.entrelinha.maximo),
    sublinhado: Boolean(texto.sublinhado),
    tachado: Boolean(texto.tachado),
    sombra_cor: cor(texto.sombra_cor ?? SOMBRA_PADRAO.cor, atual.sombra_cor ?? SOMBRA_PADRAO.cor),
    sombra_angulo: limitar(texto.sombra_angulo ?? SOMBRA_PADRAO.angulo, -180, 360),
    sombra_distancia: limitar(texto.sombra_distancia ?? SOMBRA_PADRAO.distancia, LIMITES_TEXTO.sombraDistancia.minimo, LIMITES_TEXTO.sombraDistancia.maximo),
    sombra_desfoque: limitar(texto.sombra_desfoque ?? SOMBRA_PADRAO.desfoque, LIMITES_TEXTO.sombraDesfoque.minimo, LIMITES_TEXTO.sombraDesfoque.maximo),
    sombra_espalhar: limitar(texto.sombra_espalhar ?? 0, 0, 1),
    brilho_tamanho: limitar(texto.brilho_tamanho ?? 1, LIMITES_TEXTO.brilhoTamanho.minimo, LIMITES_TEXTO.brilhoTamanho.maximo),
    contornos: texto.contornos?.length
      ? texto.contornos.slice(0, CONTORNOS_EXTRAS).map((extra) => ({ cor: cor(extra.cor, "#000000"), espessura: limitar(extra.espessura, 0, LIMITES_TEXTO.contorno.maximo) }))
      : null,
    preenchimento: limitar(texto.preenchimento ?? 1, 0, 1),
    degrade: limparDegrade(texto.degrade),
    brilho_cor: cor(texto.brilho_cor, atual.brilho_cor ?? TEXTO_PADRAO.brilho_cor),
    cor: cor(texto.cor, atual.cor),
    contorno_cor: cor(texto.contorno_cor, atual.contorno_cor),
    fundo_cor: cor(texto.fundo_cor, atual.fundo_cor),
    destaque: texto.destaque ? { ...texto.destaque, cor: cor(texto.destaque.cor, atual.destaque?.cor ?? "#ffd60a") } : null,
    palavras_chave: limparPalavrasChave(texto.palavras_chave),
    cor_chave: cor(texto.cor_chave ?? COR_CHAVE, atual.cor_chave ?? COR_CHAVE),
  };
}

/** As palavras na ordem do desenho: sequências sem espaço, linha a linha (core/modelos/palavras_chave.py). */
export function palavrasDoTexto(conteudo: string): string[] {
  return conteudo
    .replace(/\r\n/g, "\n")
    .split("\n")
    .flatMap((linha) => linha.split(/\s+/).filter(Boolean));
}

/** Liga ou desliga a palavra `numero` entre as palavras-chave. */
export function alternarPalavraChave(texto: Texto, numero: number): number[] | null {
  const atuais = texto.palavras_chave ?? [];
  const novas = atuais.includes(numero) ? atuais.filter((n) => n !== numero) : [...atuais, numero];
  return novas.length ? novas.sort((a, b) => a - b) : null;
}

/** A primeira linha, para o nome do clipe na linha do tempo. */
export function resumoDoTexto(texto: Texto): string {
  return texto.conteudo.split("\n").find((linha) => linha.trim())?.trim() || "Texto vazio";
}
