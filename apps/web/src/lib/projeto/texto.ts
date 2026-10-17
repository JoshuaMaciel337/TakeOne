// Clipes de texto: o que a pessoa escolhe e os estilos prontos. A imagem do texto é desenhada pela
// API (core/utils/texto.py), a mesma que o render usa. Os limites são os de apps/api/esquemas.py.

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
};

export const FONTES_TEXTO: { id: FonteTexto; nome: string }[] = [
  { id: "display", nome: "Montserrat" },
  { id: "texto", nome: "Inter" },
  { id: "manuscrita", nome: "Caveat (à mão)" },
];

export const LIMITES_TEXTO = {
  conteudo: 500,
  tamanho: { minimo: 0.02, maximo: 0.3 },
  contorno: { minimo: 0, maximo: 0.25 },
} as const;

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
