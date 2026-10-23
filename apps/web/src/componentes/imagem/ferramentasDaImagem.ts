// As ferramentas do editor de imagem, na ordem e com as teclas do editor de imagem profissional (ADR 0002). Cada
// posição da caixa de ferramentas é um grupo: o botão mostra a última usada do grupo e o botão direito abre as outras.
import {
  Circle,
  Crop,
  Eraser,
  Hand,
  Lasso,
  type LucideIcon,
  Minus,
  Move,
  Pentagon,
  Pipette,
  Shapes,
  Square,
  SquareDashed,
  SquareDashedMousePointer,
  Triangle,
  Type,
  ZoomIn,
  CircleDashed,
  Spline,
} from "lucide-react";

import type { TipoDeForma } from "@/lib/elementos";

export type IdFerramentaDaImagem =
  | "mover"
  | "letreiro"
  | "letreiroEliptico"
  | "laco"
  | "lacoPoligonal"
  | "objeto"
  | "corte"
  | "contaGotas"
  | "remover"
  | "texto"
  | "retangulo"
  | "elipse"
  | "triangulo"
  | "poligono"
  | "linha"
  | "formaPersonalizada"
  | "mao"
  | "zoom";

export type FerramentaDaImagem = {
  id: IdFerramentaDaImagem;
  nome: string;
  tecla: string;
  icone: LucideIcon;
  /** A frase da barra de status enquanto a ferramenta está escolhida. */
  dica: string;
};

const F = (id: IdFerramentaDaImagem, nome: string, tecla: string, icone: LucideIcon, dica: string): FerramentaDaImagem => ({ id, nome, tecla, icone, dica });

/** Os grupos da caixa de ferramentas, de cima para baixo. */
export const GRUPOS_DE_FERRAMENTAS: FerramentaDaImagem[][] = [
  [F("mover", "Ferramenta Mover", "V", Move, "Clique para escolher a camada; arraste para mover, as alças mudam o tamanho e o giro.")],
  [
    F("letreiro", "Ferramenta Letreiro retangular", "M", SquareDashed, "Arraste na foto para selecionar um retângulo. Shift soma à seleção, Alt subtrai."),
    F("letreiroEliptico", "Ferramenta Letreiro elíptico", "M", CircleDashed, "Arraste na foto para selecionar uma elipse. Shift soma à seleção, Alt subtrai."),
  ],
  [
    F("laco", "Ferramenta Laço", "L", Lasso, "Arraste na foto contornando o que quer selecionar. Shift soma, Alt subtrai."),
    F("lacoPoligonal", "Ferramenta Laço poligonal", "L", Spline, "Clique os cantos em volta do que quer selecionar; clique duplo fecha."),
  ],
  [F("objeto", "Ferramenta Seleção de objeto", "W", SquareDashedMousePointer, "Clique no objeto para a IA achar o contorno; Shift + clique tira uma parte.")],
  [F("corte", "Ferramenta Corte", "C", Crop, "Arraste o retângulo e os cantos; Enter recorta, Esc cancela.")],
  [F("contaGotas", "Ferramenta Conta-gotas", "I", Pipette, "Clique na imagem para pegar a cor do primeiro plano; com Alt, a do fundo.")],
  [F("remover", "Ferramenta Remover", "J", Eraser, "Pinte por cima do que quer tirar da foto; a IA refaz o que estava atrás.")],
  [F("texto", "Ferramenta Texto horizontal", "T", Type, "Clique na imagem para escrever um texto ali.")],
  [
    F("retangulo", "Ferramenta Retângulo", "U", Square, "Arraste para desenhar um retângulo na cor do primeiro plano."),
    F("elipse", "Ferramenta Elipse", "U", Circle, "Arraste para desenhar uma elipse na cor do primeiro plano."),
    F("triangulo", "Ferramenta Triângulo", "U", Triangle, "Arraste para desenhar um triângulo na cor do primeiro plano."),
    F("poligono", "Ferramenta Polígono", "U", Pentagon, "Arraste para desenhar uma estrela na cor do primeiro plano."),
    F("linha", "Ferramenta Linha", "U", Minus, "Arraste para desenhar uma linha na cor do primeiro plano."),
    F("formaPersonalizada", "Ferramenta Forma personalizada", "U", Shapes, "Escolha a forma na barra de opções e arraste para desenhar."),
  ],
  [F("mao", "Ferramenta Mão", "H", Hand, "Arraste para andar pela imagem ampliada. Espaço segura a Mão em qualquer ferramenta.")],
  [F("zoom", "Ferramenta Zoom", "Z", ZoomIn, "Clique para aproximar; com Alt, afasta. Clique duplo na ferramenta volta a 100%.")],
];

export const TODAS_AS_FERRAMENTAS = GRUPOS_DE_FERRAMENTAS.flat();

export function ferramenta(id: IdFerramentaDaImagem): FerramentaDaImagem {
  return TODAS_AS_FERRAMENTAS.find((item) => item.id === id)!;
}

/** As ferramentas que desenham uma forma, e a forma do servidor de cada uma. */
export const FORMA_DA_FERRAMENTA: Partial<Record<IdFerramentaDaImagem, TipoDeForma>> = {
  retangulo: "retangulo",
  elipse: "elipse",
  triangulo: "triangulo",
  poligono: "estrela",
  linha: "linha",
};

/** As formas da Forma personalizada. */
export const FORMAS_PERSONALIZADAS: { tipo: TipoDeForma; nome: string }[] = [
  { tipo: "seta", nome: "Seta" },
  { tipo: "balao", nome: "Balão de fala" },
  { tipo: "coracao", nome: "Coração" },
];

/** As ferramentas que marcam uma seleção na foto escolhida (e o jeito de marcar de cada uma). */
export const MODO_DA_SELECAO: Partial<Record<IdFerramentaDaImagem, "retangulo" | "elipse" | "laco" | "poligonal" | "clique" | "pincel">> = {
  letreiro: "retangulo",
  letreiroEliptico: "elipse",
  laco: "laco",
  lacoPoligonal: "poligonal",
  objeto: "clique",
  remover: "pincel",
};

/** O grupo de uma ferramenta (as do mesmo grupo dividem a tecla; Shift + tecla passa à seguinte). */
export function grupoDa(id: IdFerramentaDaImagem): FerramentaDaImagem[] {
  return GRUPOS_DE_FERRAMENTAS.find((grupo) => grupo.some((item) => item.id === id))!;
}
