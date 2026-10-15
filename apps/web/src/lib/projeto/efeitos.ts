// Efeitos de vídeo do clipe. Espelha core/utils/efeitos.py: os mesmos números para o compositor da
// prévia e o render. Um efeito por clipe, com intensidade de 0 a 1.
//   - desfoque: o mesmo desfoque gaussiano das transições (sigma em frações da altura do clipe);
//   - brilho: o clipe desfocado somado a ele mesmo em "tela" (a luz se espalha em volta dos claros);
//   - distorção: lente de olho de peixe (a do lenscorrection do FFmpeg), com zoom para não sobrar canto vazio.

export type TipoEfeito = "desfoque" | "brilho" | "distorcao";
export type Efeito = { tipo: TipoEfeito; intensidade: number };

export const EFEITOS: { id: TipoEfeito; nome: string; descricao: string }[] = [
  { id: "desfoque", nome: "Desfoque", descricao: "Deixa a imagem toda fora de foco" },
  { id: "brilho", nome: "Brilho", descricao: "A luz dos claros se espalha em volta deles" },
  { id: "distorcao", nome: "Olho de peixe", descricao: "Estufa o meio da imagem como uma lente grande-angular" },
];

/** Com intensidade 1. */
export const DESFOQUE_MAXIMO = 0.025;
export const BRILHO_SIGMA = 0.02;
export const DISTORCAO_MAXIMA = 0.5;
export const INTENSIDADE_PADRAO = 0.6;

export function efeitoAtivo(efeito: Efeito | null | undefined): efeito is Efeito {
  return !!efeito && EFEITOS.some((item) => item.id === efeito.tipo) && efeito.intensidade > 0;
}

/** Sigma do desfoque do efeito, em frações da altura do clipe (0 sem ele). */
export function desfoqueDoEfeito(efeito: Efeito | null | undefined): number {
  return efeitoAtivo(efeito) && efeito.tipo === "desfoque" ? DESFOQUE_MAXIMO * efeito.intensidade : 0;
}

/** Quanto da luz desfocada soma ao clipe (0 sem brilho). */
export function brilhoDoEfeito(efeito: Efeito | null | undefined): number {
  return efeitoAtivo(efeito) && efeito.tipo === "brilho" ? efeito.intensidade : 0;
}

/** O k1 da lente (0 sem distorção). */
export function distorcaoDoEfeito(efeito: Efeito | null | undefined): number {
  return efeitoAtivo(efeito) && efeito.tipo === "distorcao" ? DISTORCAO_MAXIMA * efeito.intensidade : 0;
}
