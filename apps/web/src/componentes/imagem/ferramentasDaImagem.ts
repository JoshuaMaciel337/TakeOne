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
  Slash,
  SquareRoundCorner,
  Star,
  SunDim,
  Highlighter,
  Droplets,
  PencilLine,
  Hexagon,
  Rainbow,
  Delete,
  Link2,
  PencilOff,
  Axe,
  RotateCcwSquare,
  SquareSplitHorizontal,
  Scaling,
  Italic,
  Waypoints,
  Wind,
  RefreshCcwDot,
  Shrink,
  Expand,
  Cloudy,
  Activity,
  Diameter,
  Grid2x2Check,
  RulerDimensionLine,
  Grip,
  Tornado,
  Target,
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
  CaseSensitive,
  TypeOutline,
  Wand,
  WandSparkles,
  ZoomIn,
  Crosshair,
  BoxSelect,
  LassoSelect,
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

import type { TipoDaFormaViva, VarianteDaForma } from "@/lib/vetor/arrasto";
import type { GeradorDeCaminhos } from "@/lib/vetor/geradores";
import type { FerramentaDeLiquefazer } from "@/lib/vetor/liquefazer";


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
  | "selecaoDeGrupo"
  | "lacoVetorial"
  | "varinhaVetorial"
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
  | "toqueNoTexto"
  | "segmento"
  | "arco"
  | "espiral"
  | "gradeRetangular"
  | "gradePolar"
  | "retanguloArredondado"
  | "estrela"
  | "reflexo"
  | "pincelDeTraco"
  | "pincelDeBolha"
  | "lapisVetorial"
  | "modelador"
  | "suavizar"
  | "borrachaDeCaminho"
  | "unir"
  | "borrachaVetorial"
  | "tesoura"
  | "faca"
  | "girar"
  | "refletir"
  | "escalar"
  | "inclinar"
  | "remodelar"
  | "deformarVetor"
  | "torcer"
  | "franzir"
  | "inflar"
  | "recortar"
  | "cristalizar"
  | "enrugar"
  | "larguraDoTraco"
  | "construtorDeFormas"
  | "pinturaViva"
  | "gradeDePerspectiva"
  | "selecaoDePerspectiva"
  | "cota"
  | "malhaDeDegrade"
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
    F("selecaoDeGrupo", "Ferramenta Seleção de grupo", "V", BoxSelect, "Clique numa camada para escolhê-la mesmo dentro de um grupo; clicar de novo escolhe o grupo em volta, e o de fora dele. Shift soma."),
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
    F("tesoura", "Ferramenta Tesoura", "C", Scissors, "Clique no caminho escolhido para cortá-lo ali: o fechado abre, o aberto vira dois."),
    F("faca", "Ferramenta Faca", "C", Axe, "Passe através das formas para cortá-las em pedaços (cada pedaço vira uma camada); Alt corta em linha reta."),
    F("selecaoDeFatia", "Ferramenta Seleção de fatia", "C", SquareMousePointer, "Clique para escolher uma fatia; arraste para mover, os cantos mudam o tamanho, Delete exclui e o duplo clique abre as opções."),
  ],
  [F("quadro", "Ferramenta Quadro", "K", Frame, "Arraste para desenhar um quadro (retangular ou elíptico) e ponha uma foto nele: com o quadro escolhido, clique numa foto da biblioteca.")],
  [
    F("contaGotas", "Ferramenta Conta-gotas", "I", Pipette, "Clique na imagem para pegar a cor do primeiro plano; com Alt, a do fundo."),
    F("contagem", "Ferramenta Contagem", "I", Hash, "Clique para contar (os pontos ganham números, por grupo); arraste um ponto para mover e Alt + clique para tirar."),
    F("nota", "Ferramenta Nota", "I", StickyNote, "Clique para pôr uma nota na imagem; o painel Notas mostra o texto dela."),
    F("amostradorDeCor", "Ferramenta Amostrador de cor", "I", Crosshair, "Clique para pôr um ponto (até 10) cuja cor o painel Informações mostra; arraste para mover e Alt + clique para tirar."),
    F("regua", "Ferramenta Régua", "I", Ruler, "Arraste para medir a distância e o ângulo; Endireitar camada deixa a linha medida reta."),
    F("cota", "Ferramenta Cota", "I", RulerDimensionLine, "Arraste entre dois pontos para pôr a cota: a linha com as setas e a distância, na escala de medida (Shift de 45°)."),
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
    F("pincelDeTraco", "Ferramenta Pincel de traço", "B", Highlighter, "Pinte um traço vetorial (um caminho com o traço na cor de primeiro plano); começando na ponta de um caminho aberto escolhido, ele continua."),
    F("pincelDeBolha", "Ferramenta Pincel de bolha", "B", Droplets, "Pinte uma forma preenchida que segue o pincel; tocando a forma escolhida da mesma cor, as duas viram uma."),
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
    F("borrachaVetorial", "Ferramenta Borracha vetorial", "E", PencilOff, "Apague das formas (a escolhida, ou todas debaixo do pincel) a área por onde passa; Alt apaga um retângulo."),
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
    F("toqueNoTexto", "Ferramenta Toque no texto", "T", CaseSensitive, "Clique numa letra de um texto e arraste para movê-la; os cantos mudam o tamanho e a alça de cima gira (Shift de 15°). O texto continua editável."),
  ],
  [
    F("selecaoDeCaminho", "Ferramenta Seleção de caminho", "A", MousePointer2, "Clique num componente do caminho para escolhê-lo e arraste para mover; Shift soma, Alt arrastando duplica, Delete apaga."),
    F("selecaoDireta", "Ferramenta Seleção direta", "A", MousePointer, "Clique nos pontos (ou arraste em volta) e arraste para mover; as alças mudam a curva (Alt quebra). Delete apaga, as setas empurram."),
    F("lacoVetorial", "Ferramenta Laço vetorial", "A", LassoSelect, "Arraste em volta dos pontos do caminho para escolhê-los (Shift soma); depois, arraste um deles para mover os escolhidos."),
    F("varinhaVetorial", "Ferramenta Varinha mágica vetorial", "A", Sparkle, "Clique numa camada para escolher as parecidas com ela (a cor do preenchimento, por padrão; as outras medidas na barra). Shift soma, Alt tira."),
  ],
  [
    F("retangulo", "Ferramenta Retângulo", "U", Square, "Arraste para desenhar um retângulo na cor do primeiro plano."),
    F("retanguloArredondado", "Ferramenta Retângulo arredondado", "U", SquareRoundCorner, "Arraste para desenhar um retângulo de cantos redondos; o raio fica na barra."),
    F("elipse", "Ferramenta Elipse", "U", Circle, "Arraste para desenhar uma elipse na cor do primeiro plano."),
    F("triangulo", "Ferramenta Triângulo", "U", Triangle, "Arraste para desenhar um triângulo na cor do primeiro plano."),
    F("poligono", "Ferramenta Polígono", "U", Pentagon, "Arraste para desenhar um polígono (ou uma estrela) na cor do primeiro plano."),
    F("estrela", "Ferramenta Estrela", "U", Star, "Arraste para desenhar uma estrela; as pontas e o quanto elas entram ficam na barra."),
    F("reflexo", "Ferramenta Reflexo", "U", SunDim, "Arraste do meio do brilho até onde vão os anéis: o halo, os raios, o centro e os anéis entram num grupo de formas em tela."),
    F("linha", "Ferramenta Linha", "U", Minus, "Arraste para desenhar uma linha na cor do primeiro plano."),
    F("formaPersonalizada", "Ferramenta Forma personalizada", "U", Shapes, "Escolha a forma na barra de opções e arraste para desenhar."),
  ],
  [
    F("girar", "Ferramenta Girar", "", RotateCcwSquare, "Arraste para girar as camadas escolhidas em volta da origem (o clique muda a origem; Shift de 45°; Alt solta uma cópia; Alt + clique, os números)."),
    F("refletir", "Ferramenta Refletir", "", SquareSplitHorizontal, "Arraste da origem na direção do eixo do espelho (Shift de 45°; Alt solta uma cópia; Alt + clique, os números)."),
    F("escalar", "Ferramenta Escalar", "", Scaling, "Arraste para mudar o tamanho em volta da origem (Shift por igual; Alt solta uma cópia; Alt + clique, os números)."),
    F("inclinar", "Ferramenta Inclinar", "", Italic, "Arraste para o lado (ou para cima e para baixo) para inclinar em volta da origem (Alt solta uma cópia; Alt + clique, os números)."),
    F("construtorDeFormas", "Ferramenta Construtor de formas", "", Combine, "Com várias formas escolhidas, arraste pelas faces para juntá-las numa forma só (Alt: apaga as faces); cada face vira uma forma."),
    F("pinturaViva", "Ferramenta Pintura viva", "", PaintBucket, "Com várias formas escolhidas, clique numa face (o pedaço entre as sobreposições) para enchê-la com a cor de primeiro plano."),
    F("malhaDeDegrade", "Ferramenta Malha de degradê", "", Grip, "Na forma escolhida, o clique cria a malha de degradê; depois, o clique num ponto o pinta com a cor de primeiro plano e o arrasto o leva para outro lugar."),
    F("gradeDePerspectiva", "Ferramenta Grade de perspectiva", "", Grid2x2Check, "Mostra a grade de perspectiva: arraste os pontos de fuga, o horizonte e o pé dela. Com a grade à vista, as formas desenhadas vão para o plano ativo."),
    F("selecaoDePerspectiva", "Ferramenta Seleção de perspectiva", "", Move3d, "Arraste para levar a camada escolhida ao plano ativo da grade, com o ponteiro no canto de baixo dela."),
    F("larguraDoTraco", "Ferramenta Largura do traço", "", Diameter, "Arraste a partir do caminho da forma escolhida para engrossar ou afinar o traço ali (Alt: um lado só); clique duplo num ponto o tira."),
    F("deformarVetor", "Ferramenta Deformar", "", Wind, "Arraste sobre a forma escolhida para empurrar o contorno com o pincel."),
    F("torcer", "Ferramenta Torcer", "", RefreshCcwDot, "Segure ou arraste sobre a forma escolhida para torcer o contorno debaixo do pincel."),
    F("franzir", "Ferramenta Franzir", "", Shrink, "Segure ou arraste sobre a forma escolhida para puxar o contorno para o meio do pincel."),
    F("inflar", "Ferramenta Inflar", "", Expand, "Segure ou arraste sobre a forma escolhida para empurrar o contorno para fora do meio do pincel."),
    F("recortar", "Ferramenta Recortar", "", Cloudy, "Segure ou arraste sobre a forma escolhida para recortar o contorno em ondas."),
    F("cristalizar", "Ferramenta Cristalizar", "", Sparkles, "Segure ou arraste sobre a forma escolhida para tirar pontas finas do contorno."),
    F("enrugar", "Ferramenta Enrugar", "", Activity, "Segure ou arraste sobre a forma escolhida para enrugar o contorno."),
    F("remodelar", "Ferramenta Remodelar", "", Waypoints, "Arraste um ponto do caminho escolhido: os vizinhos vão junto, menos quanto mais longe."),
  ],
  [
    F("lapisVetorial", "Ferramenta Lápis vetorial", "N", PencilLine, "Desenhe um caminho à mão livre; começando na ponta de um caminho aberto escolhido, ele continua, e perto do começo, fecha."),
    F("modelador", "Ferramenta Modelador", "N", Hexagon, "Desenhe a forma à mão: vira linha, retângulo, elipse, triângulo ou polígono. Um rabisco sobre uma forma a apaga; sobre várias, as junta."),
    F("suavizar", "Ferramenta Suavizar", "N", Rainbow, "Passe sobre o caminho escolhido para alisá-lo onde o pincel passa."),
    F("borrachaDeCaminho", "Ferramenta Borracha de caminho", "N", Delete, "Passe sobre o caminho escolhido para apagar o pedaço por onde o pincel passa."),
    F("unir", "Ferramenta Unir", "N", Link2, "Passe sobre duas pontas abertas do caminho escolhido para juntá-las (as duas de um mesmo caminho o fecham)."),
    F("segmento", "Ferramenta Segmento de linha", "N", Slash, "Arraste para traçar um segmento na cor do primeiro plano (Shift de 45°, Alt a partir do meio)."),
    F("arco", "Ferramenta Arco", "N", Spline, "Arraste do começo ao fim do arco; a barra muda a base, a inclinação (côncavo ou convexo) e o fechado."),
    F("espiral", "Ferramenta Espiral", "N", Tornado, "Arraste do meio para fora: o ponto de fora é o começo da espiral. A barra muda o decaimento, os segmentos e o sentido."),
    F("gradeRetangular", "Ferramenta Grade retangular", "N", Grid3x3, "Arraste para desenhar uma grade; a barra muda as divisões e a inclinação delas (Shift: quadrada, Alt: do meio)."),
    F("gradePolar", "Ferramenta Grade polar", "N", Target, "Arraste para desenhar elipses concêntricas com os raios; a barra muda as divisões e a inclinação delas."),
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
export const FERRAMENTAS_DE_CAMINHO: ReadonlySet<IdFerramentaDaImagem> = new Set(["caneta", "canetaLivre", "canetaDeCurvatura", "adicionarPonto", "excluirPonto", "converterPonto", "selecaoDeCaminho", "selecaoDireta", "lacoVetorial"]);

/** As ferramentas que desenham uma forma vetorial viva, e o tipo dela (lib/vetor/arrasto.ts). */
export const FORMA_VIVA_DA_FERRAMENTA: Partial<Record<IdFerramentaDaImagem, TipoDaFormaViva>> = {
  retangulo: "retangulo",
  elipse: "elipse",
  triangulo: "triangulo",
  poligono: "poligono",
  linha: "linha",
  retanguloArredondado: "retangulo",
  estrela: "poligono",
};

/** As ferramentas que desenham uma forma viva com as medidas delas (lib/vetor/arrasto.ts). */
export const VARIANTE_DA_FERRAMENTA: Partial<Record<IdFerramentaDaImagem, VarianteDaForma>> = { retanguloArredondado: "retanguloArredondado", estrela: "estrela" };

/** Os pincéis e o lápis do editor vetorial (componentes/imagem/TracoLivreNaPrevia.tsx e lib/vetor/pincelVetorial.ts). */
export const FERRAMENTAS_DE_TRACO_LIVRE: ReadonlySet<IdFerramentaDaImagem> = new Set(["pincelDeTraco", "pincelDeBolha", "lapisVetorial", "modelador", "suavizar", "borrachaDeCaminho", "unir", "borrachaVetorial", "tesoura", "faca", "remodelar", "deformarVetor", "torcer", "franzir", "inflar", "recortar", "cristalizar", "enrugar"]);

/** As ferramentas que levam as camadas escolhidas por uma afim (componentes/imagem/TransformarNaPrevia.tsx). */
export const FERRAMENTAS_DE_TRANSFORMAR: ReadonlySet<IdFerramentaDaImagem> = new Set(["girar", "refletir", "escalar", "inclinar"]);

/** As ferramentas de deformar do editor vetorial e o nome de cada uma na conta (lib/vetor/liquefazer.ts). */
export const LIQUEFAZER_DA_FERRAMENTA: Partial<Record<IdFerramentaDaImagem, FerramentaDeLiquefazer>> = {
  deformarVetor: "deformar",
  torcer: "torcer",
  franzir: "franzir",
  inflar: "inflar",
  recortar: "recortar",
  cristalizar: "cristalizar",
  enrugar: "enrugar",
};

/** As ferramentas de linha (lib/vetor/geradores.ts): caminhos comuns, com o traço na cor de primeiro plano. */
export const GERADOR_DA_FERRAMENTA: Partial<Record<IdFerramentaDaImagem, GeradorDeCaminhos>> = {
  segmento: "segmento",
  arco: "arco",
  espiral: "espiral",
  gradeRetangular: "gradeRetangular",
  gradePolar: "gradePolar",
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
