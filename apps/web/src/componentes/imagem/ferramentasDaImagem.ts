// As ferramentas do editor de imagem, na ordem e com as teclas do editor de imagem profissional (ADR 0002). Cada
// posição da caixa de ferramentas é um grupo: o botão mostra a última usada do grupo e o botão direito abre as outras.
import {
  Bandage,
  Brush,
  Circle,
  Crop,
  Eraser,
  Feather,
  Hand,
  History,
  Lasso,
  type LucideIcon,
  Minus,
  Move,
  Pencil,
  Pentagon,
  Pipette,
  SeparatorHorizontal,
  SeparatorVertical,
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
  | "linhaUnica"
  | "colunaUnica"
  | "laco"
  | "lacoPoligonal"
  | "objeto"
  | "corte"
  | "contaGotas"
  | "remover"
  | "pincel"
  | "lapis"
  | "borracha"
  | "historico"
  | "historicoArtistico"
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
    F("letreiro", "Ferramenta Letreiro retangular", "M", SquareDashed, "Arraste para selecionar um retângulo. Shift soma, Alt subtrai; no arrasto, Shift faz um quadrado e Alt parte do centro."),
    F("letreiroEliptico", "Ferramenta Letreiro elíptico", "M", CircleDashed, "Arraste para selecionar uma elipse. Shift soma, Alt subtrai; no arrasto, Shift faz um círculo e Alt parte do centro."),
    F("linhaUnica", "Ferramenta Letreiro de linha única", "", SeparatorHorizontal, "Clique para selecionar uma linha de 1 pixel da imagem inteira."),
    F("colunaUnica", "Ferramenta Letreiro de coluna única", "", SeparatorVertical, "Clique para selecionar uma coluna de 1 pixel da imagem inteira."),
  ],
  [
    F("laco", "Ferramenta Laço", "L", Lasso, "Arraste contornando o que quer selecionar. Shift soma, Alt subtrai."),
    F("lacoPoligonal", "Ferramenta Laço poligonal", "L", Spline, "Clique os cantos; clique duplo, Enter ou o primeiro ponto fecham. Shift prende a 45°, Backspace tira o último."),
  ],
  [F("objeto", "Ferramenta Seleção de objeto", "W", SquareDashedMousePointer, "Clique no objeto para a IA achar o contorno; Shift + clique tira uma parte.")],
  [F("corte", "Ferramenta Corte", "C", Crop, "Arraste o retângulo e os cantos; Enter recorta, Esc cancela.")],
  [F("contaGotas", "Ferramenta Conta-gotas", "I", Pipette, "Clique na imagem para pegar a cor do primeiro plano; com Alt, a do fundo.")],
  [F("remover", "Ferramenta Remover", "J", Bandage, "Pinte por cima do que quer tirar da foto; a IA refaz o que estava atrás.")],
  [
    F("pincel", "Ferramenta Pincel", "B", Brush, "Pinte na camada de pixels (sem uma, ela é criada). [ e ] mudam o tamanho; Shift + [ e ], a dureza."),
    F("lapis", "Ferramenta Lápis", "B", Pencil, "Pinte com a borda dura, pixel a pixel. [ e ] mudam o tamanho."),
  ],
  [
    F("historico", "Ferramenta Pincel do histórico", "Y", History, "Pinte para voltar a camada ao estado marcado como fonte no Histórico."),
    F("historicoArtistico", "Ferramenta Pincel do histórico artístico", "Y", Feather, "Pinte traços soltos com as cores do estado marcado como fonte no Histórico."),
  ],
  [F("borracha", "Ferramenta Borracha", "E", Eraser, "Apague pintando na camada de pixels; com a transparência travada, pinta a cor de fundo.")],
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

/** As ferramentas que marcam na foto escolhida (e o jeito de marcar de cada uma). */
export const MODO_DA_SELECAO: Partial<Record<IdFerramentaDaImagem, "clique" | "pincel">> = {
  objeto: "clique",
  remover: "pincel",
};

/** As ferramentas que desenham a seleção do documento (lib/selecao). */
export const FERRAMENTAS_DA_SELECAO: ReadonlySet<IdFerramentaDaImagem> = new Set(["letreiro", "letreiroEliptico", "linhaUnica", "colunaUnica", "laco", "lacoPoligonal"]);

/** As ferramentas que pintam numa camada de pixels (lib/pintura). */
export const FERRAMENTAS_DE_PINTURA: ReadonlySet<IdFerramentaDaImagem> = new Set(["pincel", "lapis", "borracha", "historico", "historicoArtistico"]);

/** O grupo de uma ferramenta (as do mesmo grupo dividem a tecla; Shift + tecla passa à seguinte). */
export function grupoDa(id: IdFerramentaDaImagem): FerramentaDaImagem[] {
  return GRUPOS_DE_FERRAMENTAS.find((grupo) => grupo.some((item) => item.id === id))!;
}
