// As ferramentas do editor de imagem, na ordem e com as teclas do editor de imagem profissional (ADR 0002). Cada
// posição da caixa de ferramentas é um grupo: o botão mostra a última usada do grupo e o botão direito abre as outras.
import {
  Bandage,
  Ruler,
  Scan,
  Cloud,
  Diamond,
  Droplet,
  Flame,
  Palette,
  Pointer,
  Replace,
  Scissors,
  Sun,
  Combine,
  HeartPulse,
  Move3d,
  Sparkle,
  Blend,
  Brush,
  Circle,
  Crop,
  Eraser,
  Feather,
  Hand,
  History,
  Lasso,
  Magnet,
  type LucideIcon,
  Minus,
  Move,
  Pencil,
  PaintBucket,
  Pentagon,
  Pipette,
  Sparkles,
  SeparatorHorizontal,
  SeparatorVertical,
  Shapes,
  Square,
  SquareDashed,
  SquareDashedMousePointer,
  Triangle,
  Type,
  AArrowDown,
  SquareDashedText,
  TypeOutline,
  Wand,
  WandSparkles,
  ZoomIn,
  Crosshair,
  Slice,
  SquareMousePointer,
  Hash,
  StickyNote,
  RotateCw,
  CircleDashed,
  Spline,
  Stamp,
  Grid3x3,
  PenTool,
  Signature,
  SplinePointer,
  DiamondPlus,
  DiamondMinus,
  ChevronUp,
  MousePointer2,
  MousePointer,
  Frame,
  LayoutTemplate,
} from "lucide-react";

import type { TipoDaFormaViva } from "@/lib/vetor/arrasto";


/** As ferramentas que escrevem: o texto e as máscaras de texto, horizontais e verticais. */
export const FERRAMENTAS_DE_TEXTO: ReadonlySet<string> = new Set(["texto", "textoVertical", "mascaraDeTexto", "mascaraDeTextoVertical"]);

export type IdFerramentaDaImagem =
  | "corteDePerspectiva"
  | "quadro"
  | "regua"
  | "substituicaoDeCor"
  | "misturador"
  | "borrachaDeFundo"
  | "desfoque"
  | "nitidez"
  | "borrar"
  | "subexposicao"
  | "superexposicao"
  | "esponja"
  | "mover"
  | "prancheta"
  | "letreiro"
  | "letreiroEliptico"
  | "linhaUnica"
  | "colunaUnica"
  | "laco"
  | "lacoPoligonal"
  | "lacoMagnetico"
  | "varinha"
  | "selecaoRapida"
  | "objeto"
  | "corte"
  | "contaGotas"
  | "amostradorDeCor"
  | "contagem"
  | "fatia"
  | "selecaoDeFatia"
  | "nota"
  | "remover"
  | "recuperacaoParaManchas"
  | "recuperacao"
  | "correcao"
  | "moverSensivel"
  | "pincel"
  | "lapis"
  | "borracha"
  | "borrachaMagica"
  | "degrade"
  | "balde"
  | "historico"
  | "carimbo"
  | "carimboDePadrao"
  | "historicoArtistico"
  | "texto"
  | "textoVertical"
  | "mascaraDeTexto"
  | "mascaraDeTextoVertical"
  | "caneta"
  | "canetaLivre"
  | "canetaDeCurvatura"
  | "adicionarPonto"
  | "excluirPonto"
  | "converterPonto"
  | "selecaoDeCaminho"
  | "selecaoDireta"
  | "retangulo"
  | "elipse"
  | "triangulo"
  | "poligono"
  | "linha"
  | "formaPersonalizada"
  | "mao"
  | "girarVista"
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
  [
    F("mover", "Ferramenta Mover", "V", Move, "Clique para escolher a camada; arraste para mover, as alças mudam o tamanho e o giro."),
    F("prancheta", "Ferramenta Prancheta", "V", LayoutTemplate, "Arraste no vazio para pôr uma prancheta; clique numa para escolher e arraste para movê-la com o que está nela."),
  ],
  [
    F("letreiro", "Ferramenta Letreiro retangular", "M", SquareDashed, "Arraste para selecionar um retângulo. Shift soma, Alt subtrai; no arrasto, Shift faz um quadrado e Alt parte do centro."),
    F("letreiroEliptico", "Ferramenta Letreiro elíptico", "M", CircleDashed, "Arraste para selecionar uma elipse. Shift soma, Alt subtrai; no arrasto, Shift faz um círculo e Alt parte do centro."),
    F("linhaUnica", "Ferramenta Letreiro de linha única", "", SeparatorHorizontal, "Clique para selecionar uma linha de 1 pixel da imagem inteira."),
    F("colunaUnica", "Ferramenta Letreiro de coluna única", "", SeparatorVertical, "Clique para selecionar uma coluna de 1 pixel da imagem inteira."),
  ],
  [
    F("laco", "Ferramenta Laço", "L", Lasso, "Arraste contornando o que quer selecionar. Shift soma, Alt subtrai."),
    F("lacoPoligonal", "Ferramenta Laço poligonal", "L", Spline, "Clique os cantos; clique duplo, Enter ou o primeiro ponto fecham. Shift prende a 45°, Backspace tira o último."),
    F("lacoMagnetico", "Ferramenta Laço magnético", "L", Magnet, "Clique na borda e ande junto dela: o laço gruda nas bordas. Clique põe um ponto, Backspace tira, Enter ou clique duplo fecham."),
  ],
  [
    F("objeto", "Ferramenta Seleção de objeto", "W", SquareDashedMousePointer, "Clique no objeto (ou arraste um retângulo em volta) para a IA achar o contorno; Shift soma, Alt tira. Parado, o azul mostra o que o clique pega."),
    F("selecaoRapida", "Ferramenta Seleção rápida", "W", Sparkles, "Pinte sobre o que quer: a seleção cresce até as bordas. Depois da primeira, soma; Alt tira. [ e ] mudam o tamanho."),
    F("varinha", "Ferramenta Varinha mágica", "W", WandSparkles, "Clique numa cor para selecionar os pixels parecidos. Shift soma, Alt subtrai."),
  ],
  [
    F("corte", "Ferramenta Corte", "C", Crop, "Arraste a caixa e os cantos; fora dela gira. Enter corta, Esc cancela."),
    F("corteDePerspectiva", "Ferramenta Corte de perspectiva", "C", Scan, "Arraste um retângulo e leve os cantos aos do que deveria ser reto; Enter endireita e corta."),
    F("fatia", "Ferramenta Fatia", "C", Slice, "Arraste para desenhar uma fatia; cada fatia sai num arquivo (Arquivo › Exportar › Fatias em arquivos)."),
    F("selecaoDeFatia", "Ferramenta Seleção de fatia", "C", SquareMousePointer, "Clique para escolher uma fatia; arraste para mover, os cantos mudam o tamanho, Delete exclui e o duplo clique abre as opções."),
  ],
  [F("quadro", "Ferramenta Quadro", "K", Frame, "Arraste para desenhar um quadro (retangular ou elíptico) e ponha uma foto nele: com o quadro escolhido, clique numa foto da biblioteca.")],
  [
    F("contaGotas", "Ferramenta Conta-gotas", "I", Pipette, "Clique na imagem para pegar a cor do primeiro plano; com Alt, a do fundo."),
    F("contagem", "Ferramenta Contagem", "I", Hash, "Clique para contar (os pontos ganham números, por grupo); arraste um ponto para mover e Alt + clique para tirar."),
    F("nota", "Ferramenta Nota", "I", StickyNote, "Clique para pôr uma nota na imagem; o painel Notas mostra o texto dela."),
    F("amostradorDeCor", "Ferramenta Amostrador de cor", "I", Crosshair, "Clique para pôr um ponto (até 10) cuja cor o painel Informações mostra; arraste para mover e Alt + clique para tirar."),
    F("regua", "Ferramenta Régua", "I", Ruler, "Arraste para medir a distância e o ângulo; Endireitar camada deixa a linha medida reta."),
  ],
  [
    F("recuperacaoParaManchas", "Ferramenta Pincel de recuperação para manchas", "J", Sparkle, "Pinte por cima da mancha: ela é refeita com o que está em volta."),
    F("recuperacao", "Ferramenta Pincel de recuperação", "J", HeartPulse, "Alt + clique marca de onde copiar; pinte para copiar a textura de lá com a luz e a cor daqui."),
    F("correcao", "Ferramenta Correção", "J", Combine, "Com uma seleção, arraste-a até a área boa: a selecionada é refeita com a textura de lá."),
    F("moverSensivel", "Ferramenta Mover sensível ao conteúdo", "J", Move3d, "Com uma seleção numa camada de pixels, arraste: o pedaço vai e o buraco é preenchido."),
    F("remover", "Ferramenta Remover", "J", Bandage, "Pinte por cima do que quer tirar da foto; a IA refaz o que estava atrás."),
  ],
  [
    F("pincel", "Ferramenta Pincel", "B", Brush, "Pinte na camada de pixels (sem uma, ela é criada). [ e ] mudam o tamanho; Shift + [ e ], a dureza."),
    F("lapis", "Ferramenta Lápis", "B", Pencil, "Pinte com a borda dura, pixel a pixel. [ e ] mudam o tamanho."),
    F("substituicaoDeCor", "Ferramenta Substituição de cor", "B", Replace, "Pinte sobre uma cor: ela vira a do primeiro plano (pela tolerância), com a luz de cada pixel."),
    F("misturador", "Ferramenta Pincel misturador", "B", Palette, "Pinte misturando o primeiro plano com as cores da tela, como tinta molhada."),
  ],
  [
    F("carimbo", "Ferramenta Carimbo", "S", Stamp, "Alt + clique marca de onde copiar; pinte para copiar dali (painel Fonte de clonagem)."),
    F("carimboDePadrao", "Ferramenta Carimbo de padrão", "S", Grid3x3, "Pinte com o padrão escolhido na barra."),
  ],
  [
    F("historico", "Ferramenta Pincel do histórico", "Y", History, "Pinte para voltar a camada ao estado marcado como fonte no Histórico."),
    F("historicoArtistico", "Ferramenta Pincel do histórico artístico", "Y", Feather, "Pinte traços soltos com as cores do estado marcado como fonte no Histórico."),
  ],
  [
    F("borracha", "Ferramenta Borracha", "E", Eraser, "Apague pintando na camada de pixels; com a transparência travada, pinta a cor de fundo."),
    F("borrachaDeFundo", "Ferramenta Borracha de fundo", "E", Scissors, "Pinte em volta do que quer guardar: a cor do meio do pincel (e as parecidas) é apagada."),
    F("borrachaMagica", "Ferramenta Borracha mágica", "E", Wand, "Clique numa cor da camada de pixels para apagar os pixels parecidos (pela tolerância)."),
  ],
  [
    F("degrade", "Ferramenta Degradê", "G", Blend, "Arraste do começo ao fim do degradê (Shift prende a 45°); clique na amostra da barra para editar."),
    F("balde", "Ferramenta Balde de tinta", "G", PaintBucket, "Clique para encher a área de cor parecida com o primeiro plano ou um padrão."),
  ],
  [
    F("desfoque", "Ferramenta Desfoque", "", Droplet, "Pinte para suavizar as bordas e o detalhe; passe de novo para desfocar mais."),
    F("nitidez", "Ferramenta Nitidez", "", Diamond, "Pinte para realçar as bordas; com Proteger detalhes, sem halo nem chuvisco."),
    F("borrar", "Ferramenta Borrar", "", Pointer, "Arraste para puxar a tinta, como o dedo na tinta molhada."),
  ],
  [
    F("subexposicao", "Ferramenta Subexposição", "O", Sun, "Pinte para clarear as sombras, os meios-tons ou os realces."),
    F("superexposicao", "Ferramenta Superexposição", "O", Flame, "Pinte para escurecer as sombras, os meios-tons ou os realces."),
    F("esponja", "Ferramenta Esponja", "O", Cloud, "Pinte para tirar ou pôr saturação."),
  ],
  [
    F("caneta", "Ferramenta Caneta", "P", PenTool, "Clique para pôr cantos e arraste para curvas; o primeiro ponto fecha, Enter ou Esc terminam. Shift prende a 45°, Alt quebra a alça e converte o ponto."),
    F("canetaLivre", "Ferramenta Caneta de forma livre", "P", Signature, "Arraste para desenhar à mão: o traço vira curvas pelo ajuste de curva da barra. Terminar perto do começo fecha."),
    F("canetaDeCurvatura", "Ferramenta Caneta de curvatura", "P", SplinePointer, "Clique os pontos e o caminho passa por eles, curvo. Clique duplo num ponto vira canto; arraste um ponto para mudar."),
    F("adicionarPonto", "Ferramenta Adicionar ponto de ancoragem", "", DiamondPlus, "Clique num trecho do caminho para pôr um ponto, sem mudar a curva."),
    F("excluirPonto", "Ferramenta Excluir ponto de ancoragem", "", DiamondMinus, "Clique num ponto do caminho para tirá-lo."),
    F("converterPonto", "Ferramenta Converter ponto", "", ChevronUp, "Clique num ponto liso para virar canto; arraste de um canto para puxar alças. Arrastar uma alça move só ela."),
  ],
  [
    F("texto", "Ferramenta Texto horizontal", "T", Type, "Clique para escrever um texto ali, ou arraste uma caixa de parágrafo. Clique num texto para editá-lo."),
    F("textoVertical", "Ferramenta Texto vertical", "T", AArrowDown, "Clique para escrever em coluna, de cima para baixo, ou arraste uma caixa."),
    F("mascaraDeTexto", "Ferramenta Máscara de texto horizontal", "T", SquareDashedText, "Escreva e o texto vira uma seleção no formato das letras (Ctrl+Enter termina)."),
    F("mascaraDeTextoVertical", "Ferramenta Máscara de texto vertical", "T", TypeOutline, "Escreva em coluna e o texto vira uma seleção no formato das letras."),
  ],
  [
    F("selecaoDeCaminho", "Ferramenta Seleção de caminho", "A", MousePointer2, "Clique num componente do caminho para escolhê-lo e arraste para mover; Shift soma, Alt arrastando duplica, Delete apaga."),
    F("selecaoDireta", "Ferramenta Seleção direta", "A", MousePointer, "Clique nos pontos (ou arraste em volta) e arraste para mover; as alças mudam a curva (Alt quebra). Delete apaga, as setas empurram."),
  ],
  [
    F("retangulo", "Ferramenta Retângulo", "U", Square, "Arraste para desenhar um retângulo na cor do primeiro plano."),
    F("elipse", "Ferramenta Elipse", "U", Circle, "Arraste para desenhar uma elipse na cor do primeiro plano."),
    F("triangulo", "Ferramenta Triângulo", "U", Triangle, "Arraste para desenhar um triângulo na cor do primeiro plano."),
    F("poligono", "Ferramenta Polígono", "U", Pentagon, "Arraste para desenhar uma estrela na cor do primeiro plano."),
    F("linha", "Ferramenta Linha", "U", Minus, "Arraste para desenhar uma linha na cor do primeiro plano."),
    F("formaPersonalizada", "Ferramenta Forma personalizada", "U", Shapes, "Escolha a forma na barra de opções e arraste para desenhar."),
  ],
  [
    F("mao", "Ferramenta Mão", "H", Hand, "Arraste para andar pela imagem ampliada. Espaço segura a Mão em qualquer ferramenta."),
    F("girarVista", "Ferramenta Girar vista", "R", RotateCw, "Arraste para girar a vista (a imagem não muda); Shift vai de 15° em 15°. Redefinir a vista volta ao normal."),
  ],
  [F("zoom", "Ferramenta Zoom", "Z", ZoomIn, "Clique para aproximar; com Alt, afasta. Clique duplo na ferramenta volta a 100%.")],
];

export const TODAS_AS_FERRAMENTAS = GRUPOS_DE_FERRAMENTAS.flat();

export function ferramenta(id: IdFerramentaDaImagem): FerramentaDaImagem {
  return TODAS_AS_FERRAMENTAS.find((item) => item.id === id)!;
}

/** As ferramentas de caminho (componentes/imagem/CaminhosNaPrevia.tsx). */
export const FERRAMENTAS_DE_CAMINHO: ReadonlySet<IdFerramentaDaImagem> = new Set(["caneta", "canetaLivre", "canetaDeCurvatura", "adicionarPonto", "excluirPonto", "converterPonto", "selecaoDeCaminho", "selecaoDireta"]);

/** As ferramentas que desenham uma forma vetorial viva, e o tipo dela (lib/vetor/arrasto.ts). */
export const FORMA_VIVA_DA_FERRAMENTA: Partial<Record<IdFerramentaDaImagem, TipoDaFormaViva>> = {
  retangulo: "retangulo",
  elipse: "elipse",
  triangulo: "triangulo",
  poligono: "poligono",
  linha: "linha",
};

/** As ferramentas que marcam na foto escolhida (e o jeito de marcar de cada uma). */
export const MODO_DA_SELECAO: Partial<Record<IdFerramentaDaImagem, "clique" | "pincel">> = {
  objeto: "clique",
  remover: "pincel",
};

/** As ferramentas que desenham a seleção do documento (lib/selecao). */
export const FERRAMENTAS_DA_SELECAO: ReadonlySet<IdFerramentaDaImagem> = new Set(["letreiro", "letreiroEliptico", "linhaUnica", "colunaUnica", "laco", "lacoPoligonal", "lacoMagnetico", "varinha", "selecaoRapida"]);

/** As ferramentas que agem num clique ou num arrasto da imagem (PontoNaPrevia). */
export const FERRAMENTAS_DE_PONTO: ReadonlySet<IdFerramentaDaImagem> = new Set(["degrade", "balde", "borrachaMagica"]);

/** As ferramentas que pintam numa camada de pixels (lib/pintura). */
export const FERRAMENTAS_DE_PINTURA: ReadonlySet<IdFerramentaDaImagem> = new Set([
  "pincel",
  "lapis",
  "borracha",
  "historico",
  "historicoArtistico",
  "carimbo",
  "carimboDePadrao",
  "recuperacao",
  "recuperacaoParaManchas",
  "desfoque",
  "nitidez",
  "borrar",
  "subexposicao",
  "superexposicao",
  "esponja",
  "misturador",
  "substituicaoDeCor",
  "borrachaDeFundo",
]);

/** As de pintura com opções próprias no lugar do modo, da opacidade e do fluxo do pincel (lib/pintura/retoque.ts). */
export const FERRAMENTAS_DE_RETOQUE: ReadonlySet<IdFerramentaDaImagem> = new Set(["desfoque", "nitidez", "borrar", "subexposicao", "superexposicao", "esponja", "misturador", "substituicaoDeCor", "borrachaDeFundo"]);

/** O grupo de uma ferramenta (as do mesmo grupo dividem a tecla; Shift + tecla passa à seguinte). */
export function grupoDa(id: IdFerramentaDaImagem): FerramentaDaImagem[] {
  return GRUPOS_DE_FERRAMENTAS.find((grupo) => grupo.some((item) => item.id === id))!;
}
