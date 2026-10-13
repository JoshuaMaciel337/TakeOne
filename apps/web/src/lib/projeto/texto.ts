// Clipes de texto: o que a pessoa escolhe e os estilos prontos. A imagem do texto é desenhada pela
// API (core/utils/texto.py), a mesma que o render usa. Os limites são os de apps/api/esquemas.py.

export type FonteTexto = "display" | "texto" | "manuscrita";
export type Alinhamento = "esquerda" | "centro" | "direita";

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
};

/** Estilos prontos do painel de texto. Os nomes e os valores são do TakeOne. */
export const ESTILOS_DE_TEXTO: { id: string; nome: string; texto: Texto }[] = [
  { id: "titulo", nome: "Título", texto: { ...TEXTO_PADRAO, conteudo: "Título", caixa_alta: true, tamanho: 0.09, sombra: 0.5 } },
  { id: "simples", nome: "Texto simples", texto: { ...TEXTO_PADRAO, conteudo: "Seu texto aqui", fonte: "texto", negrito: false, tamanho: 0.055, sombra: 0.4 } },
  { id: "destaque", nome: "Destaque", texto: { ...TEXTO_PADRAO, conteudo: "Destaque", tamanho: 0.07, fundo_cor: "#ff3d77", fundo_opacidade: 1 } },
  { id: "contorno", nome: "Contorno", texto: { ...TEXTO_PADRAO, conteudo: "Contorno", caixa_alta: true, tamanho: 0.08, contorno_espessura: 0.12 } },
  { id: "caixa", nome: "Caixa escura", texto: { ...TEXTO_PADRAO, conteudo: "Legenda em caixa", fonte: "texto", tamanho: 0.05, fundo_opacidade: 0.6 } },
  { id: "manuscrito", nome: "À mão", texto: { ...TEXTO_PADRAO, conteudo: "Escrito à mão", fonte: "manuscrita", tamanho: 0.1, sombra: 0.5 } },
];

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

const COR = /^#[0-9a-f]{6}$/i;

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
    cor: cor(texto.cor, atual.cor),
    contorno_cor: cor(texto.contorno_cor, atual.contorno_cor),
    fundo_cor: cor(texto.fundo_cor, atual.fundo_cor),
  };
}

/** A primeira linha, para o nome do clipe na linha do tempo. */
export function resumoDoTexto(texto: Texto): string {
  return texto.conteudo.split("\n").find((linha) => linha.trim())?.trim() || "Texto vazio";
}
