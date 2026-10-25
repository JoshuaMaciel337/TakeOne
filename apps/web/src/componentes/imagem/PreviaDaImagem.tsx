"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";

import { ManipuladorNaPrevia } from "@/componentes/editor/ManipuladorNaPrevia";
import { arquivoDaMidia } from "@/lib/api";
import { arquivoDaMascaraDaImagem } from "@/lib/exportacao/imagem";
import { useBitmaps } from "@/lib/previa/bitmaps";
import { camadaDoCompositor, documentoDaCamada, camadasDaImagem, camadasEmArvore, textosParaImagens } from "@/lib/previa/camadas";
import { Compositor, FUNDO } from "@/lib/previa/compositor";
import { useImagensDeTexto } from "@/lib/previa/imagensDeTexto";
import { type CaixaNoQuadro, caixaNoQuadro, unidadesDaSelecao } from "@/lib/projeto/alinhar";
import { ancestrais, posicaoTravada } from "@/lib/projeto/arvore";
import { type Caixa, contemPonto, type Guias, limitesDaCaixa, type Tamanho } from "@/lib/projeto/geometria";
import { tamanhoDaImagem } from "@/lib/projeto/imagem";
import type { Clipe, Projeto, Transformacao } from "@/lib/projeto/modelo";
import type { FerramentaDePintura, OpcoesDoPincel, Simetria } from "@/lib/pintura/traco";
import { arquivoDaVersao } from "@/lib/pixels";
import { canaisDaPilha, filtrosQueValem, usaProfundidade } from "@/lib/imagem/filtros/pilha";
import { CHAVE_DA_PROFUNDIDADE } from "@/lib/previa/camadas";
import { vetorNoTamanho } from "@/lib/vetor/desenhar";
import { preenchimentoNoTamanho } from "@/lib/imagem/desenharPreenchimento";
import { aplicarModo } from "@/lib/imagem/modos";
import { alvosDoEncaixe, encaixarValor, fundoDoXadrez, type PreferenciasDaVista, type UnidadeDaRegua, VISTA_PADRAO } from "@/lib/imagem/vista";
import { type GuiaArrastada, GuiasEGrade, LADO_DA_REGUA, noDocumento, Reguas } from "./VistaDaImagem";
import { aplicarProva, type TipoDaProva } from "@/lib/imagem/prova";
import { mascaraFinal } from "@/lib/previa/mascaraCombinada";
import { textoNoTamanho } from "@/lib/texto/desenhar";
import { useVersaoDasFontes } from "@/lib/texto/fontes";
import { lutsDoProjeto } from "@/lib/projeto/lutImportada";
import { useTabelasDasLuts } from "@/lib/useLuts";
import { caminhosDaMascaraNoDocumento, caminhosNoEspacoDaMascara } from "@/lib/vetor/mascaraVetorial";
import { arrastoDaForma, type ArrastoDaForma } from "@/lib/vetor/arrasto";
import { svgDosCaminhos } from "@/lib/vetor/contorno";
import { PranchetasNaPrevia } from "./PranchetasNaPrevia";
import { EdicaoDeTextoNaPrevia, indiceNaTela } from "./EdicaoDeTextoNaPrevia";
import { ToqueNoTextoNaPrevia } from "./ToqueNoTextoNaPrevia";
import { intervalosNaAltura, pontoMaisPerto } from "@/lib/texto/caminho";
import { achatar } from "@/lib/vetor/contorno";
import { pranchetasDoProjeto } from "@/lib/exportacao/pranchetas";
import type { RetanguloDaImagem } from "@/lib/projeto/imagem";
import { CaminhosNaPrevia, type FerramentaDeCaminho, type OpcoesDosCaminhos } from "./CaminhosNaPrevia";
import type { Subcaminho } from "@/lib/vetor/modelo";
import type { MapaDeBordas } from "@/lib/selecao/magnetico";
import type { ImagemRgba } from "@/lib/selecao/varinha";
import type { ModoDaSelecao, Selecao } from "@/lib/selecao/mascara";
import type { Midia } from "@/lib/tipos";

import { FERRAMENTAS_DE_TEXTO, FORMA_VIVA_DA_FERRAMENTA, GERADOR_DA_FERRAMENTA, type IdFerramentaDaImagem, MODO_DA_SELECAO } from "./ferramentasDaImagem";
import { ObjetoNaPrevia } from "./ObjetoNaPrevia";
import { type AlvoDaPintura, PinturaNaPrevia } from "./PinturaNaPrevia";
import { RecorteNaPrevia } from "./RecorteNaPrevia";
import { CortePerspectivaNaPrevia } from "./CortePerspectivaNaPrevia";
import { GaleriaNaPrevia } from "./filtros/Galeria";
import { AmostradoresNaPrevia } from "./AmostradoresNaPrevia";
import { ContagemNaPrevia, NotasNaPrevia } from "./MedicaoNaPrevia";
import { FatiasNaPrevia } from "./FatiasNaPrevia";
import { ReguaNaPrevia } from "./ReguaNaPrevia";
import { mudarVistaAoVivo, registrarRolagem } from "./vistaAoVivo";
import { type FerramentaDeSelecao, FormigasDaSelecao, type OpcoesDaSelecao, SelecaoNaPrevia } from "./SelecaoNaPrevia";
import { VeuDaMascaraRapida } from "./MascaraRapida";
import { PontoNaPrevia } from "./PontoNaPrevia";
import { type DivisaoDaMalha, type EstadoDaTransformacao, type ModoDaTransformacao, TransformacaoNaPrevia } from "./TransformacaoNaPrevia";
import type { Malha } from "@/lib/transformar/deformar";
import type { CorDoCanal } from "./PainelCanais";
import type { FerramentaObjeto } from "./useObjeto";
import { ATRIBUTO_DO_ESPELHO, ATRIBUTO_DO_GIRO, pontoNoElemento } from "./pontoNaVista";

/** Densidade máxima de pixels do canvas, como na prévia do vídeo. */
const DENSIDADE_MAXIMA = 2;
/** O maior lado do canvas em pixels de tela (o zoom alto reduz a densidade para caber). */
const LADO_MAXIMO_DO_CANVAS = 8192;
/** O xadrez que aparece atrás da imagem sem fundo. */
/** A folga em volta da imagem ampliada (a "mesa" onde ela fica). */
const MESA = 48;
/** Os degraus do zoom, como nos programas de imagem. */
export const DEGRAUS_DO_ZOOM = [0.0625, 0.125, 0.25, 0.333, 0.5, 0.667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];

export function proximoZoom(atual: number, sentido: 1 | -1): number {
  if (sentido > 0) return DEGRAUS_DO_ZOOM.find((degrau) => degrau > atual * 1.001) ?? DEGRAUS_DO_ZOOM.at(-1)!;
  return [...DEGRAUS_DO_ZOOM].reverse().find((degrau) => degrau < atual * 0.999) ?? DEGRAUS_DO_ZOOM[0];
}

type Props = {
  projeto: Projeto;
  midias: ReadonlyMap<string, Midia>;
  selecao: string[];
  aoSelecionar: (ids: string[]) => void;
  aoPrever: (clipeId: string, mudanca: Partial<Transformacao> | null) => void;
  aoTransformar: (clipeId: string, mudanca: Partial<Transformacao>) => void;
  /** Várias camadas (ou uma pasta) arrastadas juntas: o deslocamento em frações do quadro; null desfaz a prévia. */
  aoPreverDeslocamento: (deslocamento: { dx: number; dy: number } | null) => void;
  aoDeslocar: (dx: number, dy: number) => void;
  /** As caixas das camadas na tela, em frações do quadro (para alinhar e distribuir). */
  caixasRef?: React.RefObject<Map<string, CaixaNoQuadro>>;
  ferramenta: IdFerramentaDaImagem;
  /** Pixels de tela por pixel da imagem; null ajusta a imagem à área. */
  zoom: number | null;
  aoMudarZoom: (zoom: number | null) => void;
  /** O Amostrador de cor (I): os pontos (pixels do documento) e se a ferramenta está ativa. */
  amostradores?: Omit<React.ComponentProps<typeof AmostradoresNaPrevia>, "escala"> | null;
  /** A Varinha mágica vetorial: o clique numa camada (ou no vazio) e o modo (Shift soma, Alt tira). */
  aoVarinhaVetorial?: (clipeId: string | null, modo: "nova" | "somar" | "subtrair") => void;
  /** A ferramenta Toque no texto: a letra mudada (final ao soltar) e o aviso. */
  toqueNoTexto?: Pick<React.ComponentProps<typeof ToqueNoTextoNaPrevia>, "aoMudar" | "aoAviso"> | null;
  /** As fatias (ferramentas Fatia e Seleção de fatia, C). */
  fatias?: Omit<React.ComponentProps<typeof FatiasNaPrevia>, "escala" | "documento"> | null;
  /** A Contagem e as notas (ferramentas Contagem e Nota, I). */
  contagem?: Omit<React.ComponentProps<typeof ContagemNaPrevia>, "escala"> | null;
  notas?: Omit<React.ComponentProps<typeof NotasNaPrevia>, "escala"> | null;
  /** O lado do quadrado que o conta-gotas lê (a média), em pixels do documento. */
  tamanhoDaAmostra?: number;
  /** Modo de tela cheia: a mesa em volta da imagem fica preta. */
  telaCheia?: boolean;
  /** Girar vista (R) e Exibir › Espelhar a vista: só a tela gira; a imagem não muda. */
  giroDaVista?: { angulo: number; espelhada: boolean };
  aoGirarVista?: (angulo: number) => void;
  /** Exibir › Ajustar a camada à tela: o retângulo (pixels do documento) que a vista enquadra, uma vez por pedido. */
  enquadrar?: { retangulo: { x: number; y: number; largura: number; altura: number }; vez: number } | null;
  /** O zoom de verdade (o de ajustar, quando `zoom` é null), para a barra de status. */
  aoMedirZoom?: (zoom: number) => void;
  /** Recortando a imagem: o retângulo por cima de tudo, no lugar das alças das camadas. */
  /** A Régua: a medida e quem a muda. */
  regua?: Omit<React.ComponentProps<typeof ReguaNaPrevia>, "escala"> | null;
  /** Os alfinetes da galeria de desfoque, enquanto a janela dela está aberta. */
  galeria?: Omit<React.ComponentProps<typeof GaleriaNaPrevia>, "escala" | "documento"> | null;
  /** O Corte de perspectiva em andamento (CortePerspectivaNaPrevia). */
  cortePerspectiva?: Omit<React.ComponentProps<typeof CortePerspectivaNaPrevia>, "imagem" | "escala"> | null;
  /** O Corte em andamento: a caixa e as opções dela (RecorteNaPrevia). */
  recorte?: Omit<React.ComponentProps<typeof RecorteNaPrevia>, "imagem" | "escala"> | null;
  /** As ferramentas de seleção: os cliques e os traços vão para a foto escolhida, no lugar das alças. */
  objeto?: { clipeId: string; ferramenta: FerramentaObjeto; localizador?: boolean } | null;
  aoTerminarTraco?: () => void;
  /** O Remover enche o que o traço cerca. */
  preencherCercado?: boolean;
  /**
   * Ferramenta Texto: o clique fora de um texto, no ponto da imagem (em pixels), ou o arrasto de uma caixa de parágrafo
   * (o canto de cima e o tamanho).
   */
  aoClicarTexto?: (x: number, y: number, caixa?: { largura: number; altura: number }) => void;
  /**
   * Ferramenta Texto: os caminhos (em pixels da imagem) em que um clique começa um texto no caminho; o clique perto de
   * um deles chama `aoClicarNoCaminho` com o caminho e a fração do comprimento.
   */
  caminhosDoTexto?: Subcaminho[] | null;
  aoClicarNoCaminho?: (caminho: Subcaminho, fracao: number) => void;
  /** Ferramenta Texto: o clique dentro de um desses caminhos (fechado) começa um texto que quebra dentro dele. */
  aoClicarNaArea?: (caminho: Subcaminho) => void;
  /** Ferramenta Texto: o clique num texto do navegador abre a edição, com o cursor no caractere do clique. */
  aoEditarTexto?: (clipeId: string, indice: number) => void;
  /** O texto em edição (a caixa vem da camada na prévia). */
  edicaoDeTexto?: (Omit<React.ComponentProps<typeof EdicaoDeTextoNaPrevia>, "texto" | "caixa" | "virar"> & { clipeId: string }) | null;
  /**
   * Ferramentas de forma: o arrasto (com Shift prendendo a proporção e Alt saindo do meio), em pixels da imagem;
   * `clique` quando a pessoa só clicou (sem arrastar), no ponto.
   */
  aoDesenharForma?: (arrasto: ArrastoDaForma, clique: boolean) => void;
  /** As ferramentas de caminho (canetas, pontos e seleções de caminho), com o caminho editado e o que fazer com ele. */
  caminhos?: {
    ferramenta: FerramentaDeCaminho;
    caminhos: Subcaminho[] | null;
    opcoes: OpcoesDosCaminhos;
    aoMudar: (caminhos: Subcaminho[], provisorio: boolean) => void;
    aoCriar: (sub: Subcaminho) => void;
    aoEscolherComponentes?: (indices: number[]) => void;
    /**
     * Editando a máscara vetorial desta camada: a prévia leva os caminhos do espaço da máscara ao documento (pela caixa
     * da camada) e de volta, e `aoMudar` e `aoCriar` recebem os caminhos no espaço da máscara.
     */
    mascaraDe?: string | null;
  } | null;
  /** As pranchetas: o nome em cima de cada uma e, com a ferramenta Prancheta, criar, escolher e mover. */
  pranchetas?: { ativa: boolean; aoCriar: (retangulo: RetanguloDaImagem) => void } | null;
  /** O contorno da forma que está sendo arrastada, em pixels da imagem (sem ele, um retângulo tracejado). */
  caminhoDoArrasto?: (arrasto: ArrastoDaForma) => Subcaminho[] | null;
  /** Conta-gotas: a cor do ponto (com Alt, vai para o fundo). */
  aoPegarCor?: (cor: string, paraOFundo: boolean) => void;
  /** Pincel, lápis e borracha: o traço por cima da prévia, numa camada de pixels. */
  pintura?: {
    ferramenta: FerramentaDePintura;
    opcoes: OpcoesDoPincel;
    cores: { primeiroPlano: string; fundo: string };
    /** A camada do traço (a caixa vem daqui, da prévia); null quando não dá para pintar. */
    aoPedirAlvo: (inicio: { x: number; y: number }) => Promise<Omit<AlvoDaPintura, "caixa"> | null>;
    aoAltClique?: (ponto: { x: number; y: number }) => void;
    aoQuadro: () => void;
    aoSoltar: (clipeId: string) => void;
    aoAjustar: (mudanca: Partial<OpcoesDoPincel>) => void;
    simetria: Simetria | null;
    emCinza: boolean;
  } | null;
  /** O canvas de uma camada de pixels sendo pintada; sem ele, a versão do servidor. */
  fonteDosPixels?: (clipe: Clipe) => HTMLCanvasElement | null;
  /** O canvas de uma máscara de camada sendo pintada; sem ele, a versão do servidor. */
  fonteDaMascara?: (clipe: Clipe) => HTMLCanvasElement | null;
  /** O canvas da máscara dos filtros inteligentes sendo pintada. */
  fonteDaMascaraDosFiltros?: (clipe: Clipe) => HTMLCanvasElement | null;
  /** Alt + clique na miniatura da máscara: a prévia mostra só a máscara desta camada (o clipe), em cinza. */
  mascaraAVista?: string | null;
  /** Exibir: as réguas, as guias, a grade, os extras e o encaixe (as guias são do documento). */
  vista?: PreferenciasDaVista;
  guiasDoDocumento?: Guias | null;
  aoMudarGuias?: (guias: Guias) => void;
  aoMudarUnidade?: (unidade: UnidadeDaRegua) => void;
  /** Exibir › Cores de prova (a prova ligada) e Alerta de gama: só na tela. */
  prova?: TipoDaProva | null;
  alertaDeGama?: boolean;
  /**
   * O véu por cima da prévia: a máscara rápida (Q, em vermelho) ou o canal alfa à vista (em cinza), com a imagem que
   * os pincéis pintam e o quadro do traço (o véu desenha de novo quando muda).
   */
  veu?: { fonte: CanvasImageSource; quadro: number; cinza: boolean } | null;
  /** Só um canal de cor, em cinza (painel Canais). */
  corAVista?: CorDoCanal | null;
  /**
   * A ferramenta Mover com uma seleção numa camada de pixels: arrastar dentro da caixa da seleção leva os pixels
   * selecionados (Alt leva uma cópia). Os deslocamentos vão em pixels do documento, desde o começo do arrasto.
   */
  moverPixels?: { caixa: { x0: number; y0: number; x1: number; y1: number }; aoComecar: (duplicar: boolean) => void; aoMover: (dx: number, dy: number) => void; aoSoltar: (dx: number, dy: number) => void } | null;
  /** A sobreposição da fonte de clonagem: a imagem que o carimbo pinta, meio transparente sobre o documento. */
  sobreposicao?: { imagem: HTMLCanvasElement; opacidade: number } | null;
  /** O ponto da fonte de clonagem (pixels do documento), marcado com uma cruz. */
  pontoDaFonte?: { x: number; y: number } | null;
  /** O Degradê, o Balde de tinta e a Borracha mágica: um clique ou um arrasto em pixels do documento. */
  ponto?: { modo: "clique" | "arrasto"; aoClicar?: (ponto: { x: number; y: number }, teclas: { shift: boolean; alt: boolean }) => void; aoArrastar?: (de: { x: number; y: number }, ate: { x: number; y: number }) => void; aoArrastando?: (de: { x: number; y: number }, ate: { x: number; y: number }) => void; alcas?: { de: { x: number; y: number }; ate: { x: number; y: number } } | null } | null;
  /** A transformação livre em andamento (a da seleção): a caixa com as alças, por cima de tudo. */
  transformacao?: {
    estado: EstadoDaTransformacao;
    modo: ModoDaTransformacao;
    origem: { imagem: CanvasImageSource; largura: number; altura: number } | null;
    /** O ponto de referência (pixels do documento) e a camada inteira (sem a transparência da seleção). */
    referencia?: { x: number; y: number } | null;
    opaco?: boolean;
    dividindo?: DivisaoDaMalha | null;
    aoDividir?: (malha: Malha) => void;
    aoMudar: (estado: EstadoDaTransformacao) => void;
    aoConfirmar: () => void;
  } | null;
  /** A seleção do documento: as formigas (com `bordas`) e, com uma ferramenta de seleção, o desenho dela. */
  selecaoDoDocumento?: {
    selecao: Selecao | null;
    bordas: boolean;
    ferramenta: FerramentaDeSelecao | null;
    opcoes: OpcoesDaSelecao;
    aoSelecionar: (selecao: Selecao | null) => void;
    mapaDeBordas: MapaDeBordas | null;
    imagem: ImagemRgba | null;
    aoVarinha: (ponto: { x: number; y: number }, modo: ModoDaSelecao) => void;
  } | null;
};

/** A imagem da fonte de clonagem sobre a prévia (do tamanho do documento, esticada para o quadro). */
function SobreposicaoDaFonte({ imagem, opacidade, tamanho }: { imagem: HTMLCanvasElement; opacidade: number; tamanho: Tamanho }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = Math.max(1, Math.round(tamanho.largura));
    canvas.height = Math.max(1, Math.round(tamanho.altura));
    canvas.getContext("2d")!.drawImage(imagem, 0, 0, canvas.width, canvas.height);
  }, [imagem, tamanho.largura, tamanho.altura]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 size-full" style={{ opacity: opacidade }} aria-hidden />;
}

/** O tamanho da área livre da prévia. */
function useArea() {
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<Tamanho>({ largura: 0, altura: 0 });
  useEffect(() => {
    const elemento = areaRef.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => setArea({ largura: entrada.contentRect.width, altura: entrada.contentRect.height }));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);
  return { areaRef, area };
}

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((valor) => valor.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A prévia do editor de imagem: o compositor da prévia do vídeo, num quadro só, com as alças para mover, girar
 * e redimensionar, o zoom e as ferramentas que agem na imagem. A conta é a da exportação (lib/exportacao/imagem.ts);
 * a prévia só lê as cópias leves.
 */
export function PreviaDaImagem({
  projeto,
  midias,
  selecao,
  aoSelecionar,
  aoPrever,
  aoTransformar,
  aoPreverDeslocamento,
  aoDeslocar,
  caixasRef,
  ferramenta,
  zoom,
  aoMudarZoom,
  aoMedirZoom,
  recorte = null,
  cortePerspectiva = null,
  regua = null,
  galeria = null,
  objeto = null,
  aoTerminarTraco,
  preencherCercado,
  aoClicarTexto,
  aoEditarTexto,
  edicaoDeTexto,
  caminhosDoTexto,
  aoClicarNoCaminho,
  aoClicarNaArea,
  aoDesenharForma,
  caminhos = null,
  pranchetas = null,
  caminhoDoArrasto,
  aoPegarCor,
  pintura = null,
  fonteDosPixels,
  fonteDaMascara,
  fonteDaMascaraDosFiltros,
  mascaraAVista = null,
  giroDaVista = { angulo: 0, espelhada: false },
  telaCheia = false,
  amostradores = null,
  contagem = null,
  notas = null,
  fatias = null,
  aoVarinhaVetorial,
  toqueNoTexto,
  tamanhoDaAmostra = 1,
  aoGirarVista,
  enquadrar = null,
  vista = VISTA_PADRAO,
  guiasDoDocumento = null,
  aoMudarGuias,
  aoMudarUnidade,
  prova = null,
  alertaDeGama = false,
  selecaoDoDocumento = null,
  veu = null,
  corAVista = null,
  transformacao = null,
  moverPixels = null,
  ponto = null,
  sobreposicao = null,
  pontoDaFonte = null,
}: Props) {
  const arrastandoPixels = useRef<{ x: number; y: number } | null>(null);
  const imagem = tamanhoDaImagem(projeto);
  const { areaRef, area } = useArea();
  const ajuste = area.largura > 0 ? Math.min((area.largura - MESA * 2) / imagem.largura, (area.altura - MESA * 2) / imagem.altura) : 0;
  const escala = Math.max(0.01, zoom ?? ajuste);
  const tamanho: Tamanho = { largura: Math.max(1, Math.round(imagem.largura * escala)), altura: Math.max(1, Math.round(imagem.altura * escala)) };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // A vista girada: a caixa em volta da imagem girada (a área de rolagem cabe ela)
  const girada = giroDaVista.angulo !== 0 || giroDaVista.espelhada;
  const radianos = (giroDaVista.angulo * Math.PI) / 180;
  const caixaGirada = {
    largura: Math.abs(tamanho.largura * Math.cos(radianos)) + Math.abs(tamanho.altura * Math.sin(radianos)),
    altura: Math.abs(tamanho.largura * Math.sin(radianos)) + Math.abs(tamanho.altura * Math.cos(radianos)),
  };
  const girandoVista = useRef<{ base: number; inicio: number; cx: number; cy: number } | null>(null);
  // O documento na tela (as réguas e as guias se medem por ele) e a guia que está sendo arrastada
  const imagemRef = useRef<HTMLDivElement>(null);
  const [guiaArrastada, setGuiaArrastada] = useState<GuiaArrastada | null>(null);
  // A camada do modo de cor: fora do RGB (e do Lab, que não muda a tela), a prévia mostra a imagem no modo
  const modoCanvasRef = useRef<HTMLCanvasElement>(null);
  const modoAtivo = Boolean(((projeto.modo && projeto.modo.tipo !== "rgb" && projeto.modo.tipo !== "lab") || prova || alertaDeGama) && !mascaraAVista);
  const compositor = useRef<Compositor | null>(null);
  const [guias, setGuias] = useState<Guias | null>(null);
  const [semWebgl, setSemWebgl] = useState(false);
  const [espaco, setEspaco] = useState(false);
  const [desenho, setDesenho] = useState<{ inicio: { x: number; y: number }; fim: { x: number; y: number }; shift: boolean; alt: boolean } | null>(null);
  const andando = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [arrastandoMao, setArrastandoMao] = useState(false);
  const ancora = useRef<{ fx: number; fy: number; px: number; py: number } | null>(null);
  const maoAtiva = ferramenta === "mao" || espaco;

  useEffect(() => {
    if (ajuste > 0) aoMedirZoom?.(escala);
  }, [escala, ajuste, aoMedirZoom]);

  // Espaço segura a Mão em qualquer ferramenta (fora dos campos de texto)
  useEffect(() => {
    const descer = (evento: KeyboardEvent) => {
      if (evento.key !== " " || (evento.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) return;
      evento.preventDefault();
      setEspaco(true);
    };
    const subir = (evento: KeyboardEvent) => evento.key === " " && setEspaco(false);
    window.addEventListener("keydown", descer);
    window.addEventListener("keyup", subir);
    return () => {
      window.removeEventListener("keydown", descer);
      window.removeEventListener("keyup", subir);
    };
  }, []);

  const imagensDeTexto = useImagensDeTexto(textosParaImagens(projeto));
  // Os textos desenhados no navegador redesenham quando uma fonte chega
  const versaoDasFontes = useVersaoDasFontes();
  // As tabelas das LUTs (a Pesquisa de cores e a LUT da aba Cor): a prévia redesenha quando chegam
  useTabelasDasLuts(lutsDoProjeto(projeto));
  const camadas = camadasDaImagem(projeto, midias, tamanho, imagensDeTexto);
  const fonteDa = (midiaId: string) => arquivoDaMidia(midiaId, "proxy.webp");
  // A camada de pixels lê a versão do clipe (a 0 é vazia), ou o canvas enquanto é pintada
  const versaoDosPixels = (clipe: Clipe) => (clipe.pixels && clipe.midia_id && clipe.pixels.versao > 0 ? arquivoDaMidia(clipe.midia_id, arquivoDaVersao(clipe.pixels.versao)) : null);
  // A máscara de camada: o canvas sendo pintado, ou a versão do servidor
  const versaoDaMascara = (clipe: Clipe) => (clipe.mascara_pixels ? arquivoDaMidia(clipe.mascara_pixels.midia_id, arquivoDaVersao(clipe.mascara_pixels.versao)) : null);
  // A máscara dos filtros inteligentes: a versão do servidor (a pintada vem pelo motor das pinturas)
  const versaoDaMascaraDosFiltros = (clipe: Clipe) => {
    const mascara = clipe.filtros_inteligentes?.mascara;
    return mascara ? arquivoDaMidia(mascara.midia_id, arquivoDaVersao(mascara.versao)) : null;
  };
  const enderecosDasMascaras = camadas.flatMap((camada) => {
    const endereco = !fonteDaMascara?.(camada.clipe) ? versaoDaMascara(camada.clipe) : null;
    const dosFiltros = !fonteDaMascaraDosFiltros?.(camada.clipe) ? versaoDaMascaraDosFiltros(camada.clipe) : null;
    return [...(endereco ? [endereco] : []), ...(dosFiltros ? [dosFiltros] : [])];
  });
  const enderecos = camadas.flatMap((camada) => {
    const tintaDoQuadro = camada.clipe.vetor?.preenchimento;
    if (tintaDoQuadro?.tipo === "imagem") return [fonteDa(tintaDoQuadro.midia_id)];
    if (camada.imagem || !camada.clipe.midia_id || camada.clipe.ajuste || camada.clipe.camada_de_preenchimento) return [];
    if (camada.clipe.pixels) {
      const versao = fonteDosPixels?.(camada.clipe) ? null : versaoDosPixels(camada.clipe);
      return versao ? [versao] : [];
    }
    const mascara = camada.clipe.remover_fundo ? arquivoDaMascaraDaImagem(midias.get(camada.clipe.midia_id)) : null;
    return mascara ? [fonteDa(camada.clipe.midia_id), mascara] : [fonteDa(camada.clipe.midia_id)];
  });
  // Os canais alfa que os filtros leem (o mapa de profundidade do desfoque de lente)
  const canaisDosFiltros = (clipe: Clipe) => [
    ...canaisDaPilha(filtrosQueValem(clipe.filtros_inteligentes)).flatMap((id) => {
      const canal = projeto.canais?.find((item) => item.id === id);
      return canal ? [{ id, endereco: arquivoDaMidia(canal.midia_id, arquivoDaVersao(canal.versao)) }] : [];
    }),
    // A profundidade da foto (o desfoque de profundidade), quando ela já foi medida
    ...(clipe.midia_id && usaProfundidade(filtrosQueValem(clipe.filtros_inteligentes)) && midias.get(clipe.midia_id)?.arquivos?.includes("profundidade.png")
      ? [{ id: CHAVE_DA_PROFUNDIDADE, endereco: arquivoDaMidia(clipe.midia_id, "profundidade.png") }]
      : []),
  ];
  const enderecosDosCanais = camadas.flatMap((camada) => canaisDosFiltros(camada.clipe).map((canal) => canal.endereco));
  const bitmaps = useBitmaps([...enderecos, ...enderecosDasMascaras, ...enderecosDosCanais]);
  const selecionada = selecao.length === 1 ? camadas.find((camada) => camada.clipe.id === selecao[0]) : undefined;
  // Uma pasta ou várias camadas: uma caixa só, em volta de tudo, que arrasta todas juntas
  const doGrupo = selecionada ? [] : unidadesDaSelecao(projeto, selecao).flatMap((unidade) => unidade.clipeIds);
  const caixasDoGrupo = camadas.filter((camada) => doGrupo.includes(camada.clipe.id)).map((camada) => caixaNoQuadro(camada.caixa, tamanho));
  const caixaDoGrupo = caixasDoGrupo.length
    ? {
        x0: Math.min(...caixasDoGrupo.map((c) => c.x0)) * tamanho.largura,
        y0: Math.min(...caixasDoGrupo.map((c) => c.y0)) * tamanho.altura,
        x1: Math.max(...caixasDoGrupo.map((c) => c.x1)) * tamanho.largura,
        y1: Math.max(...caixasDoGrupo.map((c) => c.y1)) * tamanho.altura,
      }
    : null;
  const arrastandoGrupo = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      compositor.current = new Compositor(canvas, { comAlfa: true });
    } catch {
      // Sem WebGL2: a mensagem aparece no lugar do desenho (o estado muda depois do efeito, numa promessa)
      void Promise.resolve().then(() => setSemWebgl(true));
    }
    return () => {
      compositor.current?.destruir();
      compositor.current = null;
    };
  }, []);

  // Editar › Preferências › Desempenho: a prévia econômica desenha um pixel do canvas por pixel da página
  const densidade = Math.min((typeof window === "undefined" ? 1 : window.devicePixelRatio) || 1, vista.prevaEconomica ? 1 : DENSIDADE_MAXIMA, LADO_MAXIMO_DO_CANVAS / Math.max(tamanho.largura, tamanho.altura));

  // Desenha a cada mudança (a imagem é parada: não há laço de quadros)
  useLayoutEffect(() => {
    const atual = compositor.current;
    if (!atual || tamanho.largura <= 1) return;
    // A máscara de camada de cada uma (null enquanto a imagem dela não chegou)
    const mascaraDosFiltrosDe = (camada: (typeof camadas)[number]) => {
      const endereco = versaoDaMascaraDosFiltros(camada.clipe);
      const fonte = fonteDaMascaraDosFiltros?.(camada.clipe) ?? (endereco ? bitmaps.get(endereco) : null);
      return fonte ? { fonte, quadro: tamanho } : null;
    };
    const canaisDosFiltrosDe = (camada: (typeof camadas)[number]) =>
      Object.fromEntries(
        canaisDosFiltros(camada.clipe).flatMap(({ id, endereco }) => {
          const fonte = bitmaps.get(endereco);
          return fonte ? [[id, { fonte, versao: endereco }]] : [];
        }),
      );
    const mascaraDe = (camada: (typeof camadas)[number]) => {
      const endereco = camada.clipe.mascara_pixels ? versaoDaMascara(camada.clipe) : null;
      const fonte = camada.clipe.mascara_pixels ? (fonteDaMascara?.(camada.clipe) ?? (endereco ? bitmaps.get(endereco) : null)) : null;
      // A vetorial (e as duas juntas) passam pela máscara combinada; só a de pixels vai como sempre
      return mascaraFinal(camada.clipe, camada.caixa, tamanho, imagem, fonte ?? null);
    };
    // Alt + clique na miniatura da máscara: só a máscara, em cinza, no lugar da imagem
    const avista = mascaraAVista ? camadas.find((camada) => camada.clipe.id === mascaraAVista) : undefined;
    const mascaraAVistaPronta = avista ? mascaraDe(avista) : null;
    if (avista && mascaraAVistaPronta) {
      const inteira = { ...avista, clipe: { ...avista.clipe, mascara_pixels: null }, caixa: { cx: tamanho.largura / 2, cy: tamanho.altura / 2, largura: tamanho.largura, altura: tamanho.altura, rotacao: 0, opacidade: 1 }, recorte: { x: 0, y: 0, largura: 1, altura: 1 } };
      const resolucaoDaMascara = { largura: Math.round(tamanho.largura * densidade), altura: Math.round(tamanho.altura * densidade) };
      atual.desenhar([camadaDoCompositor(inteira, mascaraAVistaPronta.fonte, null)], "#000000", tamanho, resolucaoDaMascara);
      return;
    }
    // As camadas de cada faixa, prontas para o compositor; a árvore junta as pastas e os recortes
    const porFaixa = new Map(
      camadas.flatMap((camada) => {
        if (camada.imagem) return [[camada.faixa.id, camadaDoCompositor(camada, camada.imagem, null, mascaraDe(camada), documentoDaCamada(projeto), mascaraDosFiltrosDe(camada), canaisDosFiltrosDe(camada))] as const];
        // A camada de ajuste lê o que já foi desenhado; a máscara dela escolhe onde o ajuste vale
        if (camada.clipe.ajuste) return [[camada.faixa.id, camadaDoCompositor(camada, FUNDO, null, mascaraDe(camada))] as const];
        if (camada.clipe.camada_de_preenchimento) {
          // A cor, o degradê ou o padrão no tamanho da tela
          const fonte = preenchimentoNoTamanho(camada.clipe.id, camada.clipe.camada_de_preenchimento, tamanho.largura * densidade, tamanho.altura * densidade, (tamanho.largura * densidade) / tamanhoDaImagem(projeto).largura);
          return [[camada.faixa.id, camadaDoCompositor(camada, fonte, null, mascaraDe(camada), documentoDaCamada(projeto), mascaraDosFiltrosDe(camada), canaisDosFiltrosDe(camada))] as const];
        }
        if (camada.clipe.texto_rico) {
          // O texto desenhado no tamanho da tela (some até as fontes chegarem)
          const { caixa, recorte } = camada;
          const fonte = textoNoTamanho(camada.clipe.id, camada.clipe.texto_rico, (caixa.largura * densidade) / recorte.largura, (caixa.altura * densidade) / recorte.altura, versaoDasFontes);
          return fonte ? [[camada.faixa.id, camadaDoCompositor(camada, fonte, null, mascaraDe(camada), documentoDaCamada(projeto), mascaraDosFiltrosDe(camada), canaisDosFiltrosDe(camada))] as const] : [];
        }
        if (camada.clipe.vetor) {
          // A forma desenhada no tamanho da tela, para ficar nítida em qualquer zoom
          const { caixa, recorte } = camada;
          const fonte = vetorNoTamanho(camada.clipe.id, camada.clipe.vetor, (caixa.largura * densidade) / recorte.largura, (caixa.altura * densidade) / recorte.altura, {
            imagem: (midiaId) => bitmaps.get(fonteDa(midiaId)) ?? null,
            marcador: true,
          });
          return [[camada.faixa.id, camadaDoCompositor(camada, fonte, null, mascaraDe(camada), documentoDaCamada(projeto), mascaraDosFiltrosDe(camada), canaisDosFiltrosDe(camada))] as const];
        }
        if (camada.clipe.pixels) {
          const endereco = versaoDosPixels(camada.clipe);
          const pixels = fonteDosPixels?.(camada.clipe) ?? (endereco ? bitmaps.get(endereco) : null);
          return pixels ? [[camada.faixa.id, camadaDoCompositor(camada, pixels, null, mascaraDe(camada), documentoDaCamada(projeto), mascaraDosFiltrosDe(camada), canaisDosFiltrosDe(camada))] as const] : [];
        }
        const fonte = bitmaps.get(fonteDa(camada.clipe.midia_id!));
        if (!fonte) return [];
        const enderecoDaMascara = camada.clipe.remover_fundo ? arquivoDaMascaraDaImagem(midias.get(camada.clipe.midia_id!)) : null;
        const mascara = enderecoDaMascara ? bitmaps.get(enderecoDaMascara) : null;
        if (enderecoDaMascara && !mascara) return [];
        return [[camada.faixa.id, camadaDoCompositor(camada, fonte, mascara ?? null, mascaraDe(camada), documentoDaCamada(projeto), mascaraDosFiltrosDe(camada), canaisDosFiltrosDe(camada))] as const];
      }),
    );
    if (caixasRef) caixasRef.current = new Map(camadas.map((camada) => [camada.clipe.id, { ...caixaNoQuadro(camada.caixa, tamanho), bruta: camada.caixa, quadro: tamanho }]));
    const resolucao = { largura: Math.round(tamanho.largura * densidade), altura: Math.round(tamanho.altura * densidade) };
    atual.desenhar(camadasEmArvore(projeto, porFaixa, tamanho), projeto.fundo.transparente ? null : projeto.fundo.cor, tamanho, resolucao);
    // O modo de cor (Imagem › Modo): a mesma conta da exportação, sobre o que o compositor acabou de desenhar (o canvas
    // do WebGL ainda tem o desenho nesta tarefa), numa camada 2D por cima
    const sobre = modoCanvasRef.current;
    const origem = canvasRef.current;
    if (modoAtivo && sobre && origem) {
      sobre.width = origem.width;
      sobre.height = origem.height;
      const contexto = sobre.getContext("2d", { willReadFrequently: true })!;
      contexto.clearRect(0, 0, sobre.width, sobre.height);
      contexto.drawImage(origem, 0, 0);
      const pixels = contexto.getImageData(0, 0, sobre.width, sobre.height);
      aplicarModo(pixels.data, sobre.width, sobre.height, projeto.modo, ((projeto.tamanho?.resolucao ?? 72) * sobre.width) / tamanhoDaImagem(projeto).largura);
      // A prova de cores e o alerta de gama, só na tela
      if (prova || alertaDeGama) aplicarProva(pixels.data, prova ?? null, Boolean(alertaDeGama), projeto.modo);
      contexto.putImageData(pixels, 0, 0);
    }
  });

  // O retângulo do documento que aparece na área (o Navegador desenha ele): os cantos da área levados à imagem, que
  // pode estar girada, e a caixa em volta deles
  function medirVisivel() {
    const area = areaRef.current;
    const alvo = imagemRef.current;
    if (!area || !alvo) return;
    const r = area.getBoundingClientRect();
    const cantos = [
      [r.left, r.top],
      [r.right, r.top],
      [r.left, r.bottom],
      [r.right, r.bottom],
    ].map(([clientX, clientY]) => pontoNoElemento({ clientX, clientY }, alvo));
    const xs = cantos.map((p) => p.x / escala);
    const ys = cantos.map((p) => p.y / escala);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    mudarVistaAoVivo({ visivel: { x: Math.round(x), y: Math.round(y), largura: Math.round(Math.max(...xs) - x), altura: Math.round(Math.max(...ys) - y) } });
  }
  useLayoutEffect(medirVisivel);
  // O Navegador põe um ponto do documento no meio da área: o deslocamento dele até o meio da imagem, girado como a
  // vista, a partir do meio da área de rolagem (a imagem fica no meio dela)
  useEffect(() => {
    registrarRolagem((x, y) => {
      const area = areaRef.current;
      if (!area) return;
      let vx = (x - imagem.largura / 2) * escala;
      const vy = (y - imagem.altura / 2) * escala;
      if (giroDaVista.espelhada) vx = -vx;
      const t = (giroDaVista.angulo * Math.PI) / 180;
      area.scrollLeft = area.scrollWidth / 2 + vx * Math.cos(t) - vy * Math.sin(t) - area.clientWidth / 2;
      area.scrollTop = area.scrollHeight / 2 + vx * Math.sin(t) + vy * Math.cos(t) - area.clientHeight / 2;
    });
    return () => registrarRolagem(null);
  });

  // A roda com Ctrl (ou Alt, ou sozinha com a preferência "zoom com a roda") aproxima e afasta. O ouvinte é do
  // navegador e não passivo: o do React é passivo, não segura a rolagem nem o zoom da página
  const rodar = useEffectEvent((evento: WheelEvent) => {
    if (!evento.ctrlKey && !evento.altKey && !vista.zoomComRoda) return;
    evento.preventDefault();
    aoMudarZoom(proximoZoom(escala, evento.deltaY < 0 ? 1 : -1));
  });
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const ouvir = (evento: WheelEvent) => rodar(evento);
    area.addEventListener("wheel", ouvir, { passive: false });
    return () => area.removeEventListener("wheel", ouvir);
  }, [areaRef]);

  // Exibir › Ajustar a camada à tela: o zoom em que o retângulo cabe na área, com o meio dele no meio dela
  const ultimoEnquadrar = useRef(0);
  useLayoutEffect(() => {
    const elemento = areaRef.current;
    if (!enquadrar || enquadrar.vez === ultimoEnquadrar.current || !elemento) return;
    ultimoEnquadrar.current = enquadrar.vez;
    const { retangulo } = enquadrar;
    const novo = Math.max(0.01, Math.min((elemento.clientWidth - MESA * 2) / Math.max(1, retangulo.largura), (elemento.clientHeight - MESA * 2) / Math.max(1, retangulo.altura)));
    ancora.current = { fx: (retangulo.x + retangulo.largura / 2) / imagem.largura, fy: (retangulo.y + retangulo.altura / 2) / imagem.altura, px: elemento.clientWidth / 2, py: elemento.clientHeight / 2 };
    aoMudarZoom(novo);
  });

  // Depois de um zoom pelo clique, o ponto clicado volta para baixo do mouse
  useLayoutEffect(() => {
    const pedido = ancora.current;
    const elemento = areaRef.current;
    if (!pedido || !elemento) return;
    ancora.current = null;
    elemento.scrollLeft = pedido.fx * tamanho.largura + MESA - pedido.px;
    elemento.scrollTop = pedido.fy * tamanho.altura + MESA - pedido.py;
  });

  /** O ponto do evento no quadro (pixels de tela, a partir do canto da imagem). */
  function noQuadro(evento: React.PointerEvent) {
    return pontoNoElemento(evento, evento.currentTarget);
  }

  function camadaNoPonto(ponto: { x: number; y: number }, filtro: (camada: (typeof camadas)[number]) => boolean = () => true) {
    return [...camadas].reverse().find((camada) => camada.caixa.opacidade > 0 && !camada.faixa.oculta && filtro(camada) && contemPonto(camada.caixa, ponto));
  }

  function pegarCor(ponto: { x: number; y: number }, paraOFundo: boolean) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // O quadrado da amostra em pixels do documento, levado ao canvas (a média de tudo o que cai nele)
    const raio = Math.floor(tamanhoDaAmostra / 2);
    const px = escala * densidade;
    const x0 = Math.max(0, Math.floor((Math.floor(ponto.x / escala) - raio) * px));
    const y0 = Math.max(0, Math.floor((Math.floor(ponto.y / escala) - raio) * px));
    const ladoNoCanvas = Math.max(1, Math.round((2 * raio + 1) * px));
    const w = Math.min(ladoNoCanvas, Math.max(1, canvas.width - x0));
    const h = Math.min(ladoNoCanvas, Math.max(1, canvas.height - y0));
    const leitor = document.createElement("canvas");
    leitor.width = w;
    leitor.height = h;
    const ctx = leitor.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.fillStyle = projeto.fundo.transparente ? "#ffffff" : projeto.fundo.cor;
    ctx.fillRect(0, 0, w, h);
    // Num modo de cor, a cor é a da imagem como aparece (no modo)
    ctx.drawImage(modoAtivo && modoCanvasRef.current ? modoCanvasRef.current : canvas, x0, y0, w, h, 0, 0, w, h);
    const dados = ctx.getImageData(0, 0, w, h).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < dados.length; i += 4) {
      r += dados[i];
      g += dados[i + 1];
      b += dados[i + 2];
    }
    const n = dados.length / 4;
    aoPegarCor?.(hex(Math.round(r / n), Math.round(g / n), Math.round(b / n)), paraOFundo);
  }

  function aoApertar(evento: React.PointerEvent<HTMLDivElement>) {
    if (evento.button !== 0 || recorte) return;
    const ponto = noQuadro(evento);
    if (maoAtiva) {
      const elemento = areaRef.current;
      if (!elemento) return;
      evento.currentTarget.setPointerCapture(evento.pointerId);
      andando.current = { x: evento.clientX, y: evento.clientY, left: elemento.scrollLeft, top: elemento.scrollTop };
      setArrastandoMao(true);
      return;
    }
    if (ferramenta === "zoom") {
      const elemento = areaRef.current;
      const caixa = elemento?.getBoundingClientRect();
      const novo = proximoZoom(escala, evento.altKey ? -1 : 1);
      if (caixa) ancora.current = { fx: ponto.x / tamanho.largura, fy: ponto.y / tamanho.altura, px: evento.clientX - caixa.left, py: evento.clientY - caixa.top };
      aoMudarZoom(novo);
      return;
    }
    if (ferramenta === "contaGotas") {
      pegarCor(ponto, evento.altKey);
      return;
    }
    if (FERRAMENTAS_DE_TEXTO.has(ferramenta)) {
      // As máscaras de texto não editam as camadas de texto: sempre começam uma seleção nova
      const mascara = ferramenta.startsWith("mascara");
      const rico = mascara ? undefined : camadaNoPonto(ponto, (camada) => Boolean(camada.clipe.texto_rico));
      if (rico?.clipe.texto_rico) {
        aoEditarTexto?.(rico.clipe.id, indiceNaTela(rico.clipe.texto_rico, rico.caixa, rico.clipe.virar, ponto));
        return;
      }
      const texto = mascara ? undefined : camadaNoPonto(ponto, (camada) => Boolean(camada.clipe.texto));
      if (texto) {
        aoSelecionar([texto.clipe.id]);
        return;
      }
      // Perto de um caminho (6 pixels da tela), o texto segue ele
      if (!mascara && caminhosDoTexto?.length && aoClicarNoCaminho) {
        const naImagem = { x: ponto.x / escala, y: ponto.y / escala };
        const perto = caminhosDoTexto
          .map((sub) => ({ sub, ...pontoMaisPerto({ tipo: "linha", nos: sub.nos, fechado: sub.fechado, inicio: 0, inverter: false }, naImagem) }))
          .sort((a, b) => a.distancia - b.distancia)[0];
        if (perto && perto.distancia * escala <= 6) {
          aoClicarNoCaminho(perto.sub, perto.fracao);
          return;
        }
        // Dentro de um caminho fechado, o texto quebra dentro dele
        const dentro = caminhosDoTexto.find((sub) => sub.fechado && intervalosNaAltura(achatar(sub, 0.5), naImagem.y).some(([x0, x1]) => naImagem.x >= x0 && naImagem.x <= x1));
        if (dentro && aoClicarNaArea) {
          aoClicarNaArea(dentro);
          return;
        }
      }
      // O clique faz um texto de ponto; o arrasto, uma caixa de parágrafo
      evento.currentTarget.setPointerCapture(evento.pointerId);
      setDesenho({ inicio: ponto, fim: ponto, shift: evento.shiftKey, alt: evento.altKey });
      return;
    }
    if (FORMA_VIVA_DA_FERRAMENTA[ferramenta] || GERADOR_DA_FERRAMENTA[ferramenta] || ferramenta === "reflexo" || ferramenta === "formaPersonalizada" || ferramenta === "quadro") {
      evento.currentTarget.setPointerCapture(evento.pointerId);
      setDesenho({ inicio: ponto, fim: ponto, shift: evento.shiftKey, alt: evento.altKey });
      return;
    }
    if (MODO_DA_SELECAO[ferramenta]) {
      // As ferramentas de seleção trabalham numa foto: a de cima no ponto passa a ser a escolhida
      const foto = camadaNoPonto(ponto, (camada) => {
        const midia = camada.clipe.midia_id ? midias.get(camada.clipe.midia_id) : undefined;
        return Boolean(midia?.imagem && !midia.elemento && !midia.camada_pixels && !midia.animacao);
      });
      if (foto) aoSelecionar([foto.clipe.id]);
      return;
    }
    if (ferramenta === "selecaoDeGrupo") {
      // A camada do ponto, mesmo dentro de um grupo; clicar de novo sobe para o grupo em volta, e o de fora dele
      const acima = camadaNoPonto(ponto);
      if (!acima) return aoSelecionar(evento.shiftKey ? selecao : []);
      const cadeia = [acima.faixa, ...ancestrais(projeto, acima.faixa)].flatMap((faixa) => (faixa.clipes[0] ? [faixa.clipes[0].id] : []));
      // Com a própria camada fora da seleção, o clique a escolhe; com ela escolhida, sobe a partir do grupo mais de fora
      const nivel = selecao.includes(cadeia[0]) ? cadeia.reduce((mais, id, i) => (selecao.includes(id) ? i : mais), 0) + 1 : 0;
      const proximo = cadeia[Math.min(cadeia.length - 1, nivel)];
      aoSelecionar(evento.shiftKey ? [...new Set([...selecao.filter((id) => !cadeia.includes(id)), proximo])] : [proximo]);
      return;
    }
    if (ferramenta === "varinhaVetorial" && aoVarinhaVetorial) {
      aoVarinhaVetorial(camadaNoPonto(ponto)?.clipe.id ?? null, evento.shiftKey ? "somar" : evento.altKey ? "subtrair" : "nova");
      return;
    }
    const acima = camadaNoPonto(ponto);
    // Shift junta à seleção (ou tira), como nos editores de imagem
    if (evento.shiftKey && acima) aoSelecionar(selecao.includes(acima.clipe.id) ? selecao.filter((id) => id !== acima.clipe.id) : [...selecao, acima.clipe.id]);
    else aoSelecionar(acima ? [acima.clipe.id] : []);
  }

  function aoMover(evento: React.PointerEvent<HTMLDivElement>) {
    if (andando.current && areaRef.current) {
      areaRef.current.scrollLeft = andando.current.left - (evento.clientX - andando.current.x);
      areaRef.current.scrollTop = andando.current.top - (evento.clientY - andando.current.y);
      return;
    }
    if (desenho) setDesenho({ ...desenho, fim: noQuadro(evento), shift: evento.shiftKey, alt: evento.altKey });
  }

  function aoSoltar() {
    andando.current = null;
    setArrastandoMao(false);
    if (!desenho) return;
    setDesenho(null);
    if (FERRAMENTAS_DE_TEXTO.has(ferramenta)) {
      const x0 = Math.min(desenho.inicio.x, desenho.fim.x) / escala;
      const y0 = Math.min(desenho.inicio.y, desenho.fim.y) / escala;
      const largura = Math.abs(desenho.fim.x - desenho.inicio.x) / escala;
      const altura = Math.abs(desenho.fim.y - desenho.inicio.y) / escala;
      if (Math.hypot(desenho.fim.x - desenho.inicio.x, desenho.fim.y - desenho.inicio.y) < 6) aoClicarTexto?.(desenho.inicio.x / escala, desenho.inicio.y / escala);
      else aoClicarTexto?.(x0, y0, { largura: Math.max(8, largura), altura: Math.max(8, altura) });
      return;
    }
    const arrasto = arrastoNaImagem(desenho);
    // Um clique sem arrastar: quem desenha pergunta as medidas, com o ponto
    const clique = Math.hypot(desenho.fim.x - desenho.inicio.x, desenho.fim.y - desenho.inicio.y) < 4;
    aoDesenharForma?.(clique ? arrastoDaForma(arrasto.de, arrasto.de) : arrasto, clique);
  }
  function arrastoNaImagem(atual: NonNullable<typeof desenho>) {
    const naImagem = (p: { x: number; y: number }) => ({ x: p.x / escala, y: p.y / escala });
    // A linha, o segmento e a espiral (do meio para fora) prendem o ângulo; a espiral já começa no meio
    const deLinha = ferramenta === "linha" || ferramenta === "segmento" || ferramenta === "espiral" || ferramenta === "reflexo";
    return arrastoDaForma(naImagem(atual.inicio), naImagem(atual.fim), { proporcional: atual.shift, doMeio: atual.alt && ferramenta !== "espiral" && ferramenta !== "reflexo", linha: deLinha });
  }

  /**
   * Arrastar uma guia (nova, da régua, ou uma que já existe): ela segue o ponteiro, encosta nos alvos do encaixe e, ao
   * soltar, fica (dentro da área) ou some (de volta às réguas).
   */
  function arrastarGuia(inicial: GuiaArrastada, evento: React.PointerEvent) {
    const imagem = imagemRef.current;
    const area = areaRef.current;
    if (!imagem || !area || !aoMudarGuias) return;
    evento.preventDefault();
    const documento = tamanhoDaImagem(projeto);
    const alvos = vista.encaixar ? alvosDoEncaixe({ ...vista.encaixarEm, guias: false }, { guias: null, espacoDaGrade: vista.grade ? vista.espacoDaGrade : 0, outras: limitesDasOutras(null), documento }) : { verticais: [], horizontais: [] };
    let atual = inicial;
    const posicao = (e: PointerEvent | React.PointerEvent) => {
      const p = noDocumento(e, imagem, escala);
      const bruto = inicial.tipo === "v" ? p.x : p.y;
      const encaixe = encaixarValor(bruto, inicial.tipo === "v" ? alvos.verticais : alvos.horizontais, 6 / escala);
      return encaixe.alvo !== null ? encaixe.valor : Math.round(bruto);
    };
    const mover = (e: PointerEvent) => {
      atual = { ...inicial, pos: posicao(e) };
      setGuiaArrastada(atual);
    };
    const soltar = (e: PointerEvent) => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      setGuiaArrastada(null);
      const r = area.getBoundingClientRect();
      const dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      const base = { verticais: [...(guiasDoDocumento?.verticais ?? [])], horizontais: [...(guiasDoDocumento?.horizontais ?? [])] };
      const lista = inicial.tipo === "v" ? base.verticais : base.horizontais;
      if (inicial.indice !== null) lista.splice(inicial.indice, 1);
      if (dentro) lista.push(atual.pos);
      if (inicial.indice !== null || dentro) aoMudarGuias(base);
    };
    setGuiaArrastada({ ...inicial, pos: inicial.indice === null ? posicao(evento) : inicial.pos });
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }
  /** As bordas das outras camadas visíveis, em pixels do documento (o encaixe nas camadas). */
  function limitesDasOutras(clipeId: string | null) {
    return camadas
      .filter((camada) => camada.clipe.id !== clipeId && !camada.faixa.oculta && camada.caixa.opacidade > 0)
      .map((camada) => {
        const l = limitesDaCaixa(caixaNoDocumento(camada.caixa));
        return { esquerda: l.esquerda, topo: l.topo, direita: l.direita, base: l.base };
      });
  }
  /** A caixa da camada (pixels da tela) em pixels do documento. */
  function caixaNoDocumento(caixa: Caixa): Caixa {
    return { ...caixa, cx: caixa.cx / escala, cy: caixa.cy / escala, largura: caixa.largura / escala, altura: caixa.altura / escala };
  }
  /** Os alvos do encaixe da camada que anda, em pixels da tela. */
  function alvosNaTela(clipeId: string): Guias {
    if (!vista.encaixar) return { verticais: [], horizontais: [] };
    const documento = tamanhoDaImagem(projeto);
    const alvos = alvosDoEncaixe(vista.encaixarEm, { guias: vista.extras && vista.guias ? guiasDoDocumento : null, espacoDaGrade: vista.extras && vista.grade ? vista.espacoDaGrade : 0, outras: limitesDasOutras(clipeId), documento });
    return { verticais: alvos.verticais.map((v) => v * escala), horizontais: alvos.horizontais.map((v) => v * escala) };
  }

  const ajustada = zoom === null;
  const cursor = maoAtiva ? (arrastandoMao ? "grabbing" : "grab") : ferramenta === "zoom" ? "zoom-in" : ferramenta === "contaGotas" || FERRAMENTAS_DE_TEXTO.has(ferramenta) || FORMA_VIVA_DA_FERRAMENTA[ferramenta] || GERADOR_DA_FERRAMENTA[ferramenta] || ferramenta === "reflexo" || ferramenta === "formaPersonalizada" || ferramenta === "quadro" ? "crosshair" : undefined;
  const mostrarAlcas = ferramenta === "mover" && !espaco;
  const arrastoDoDesenho = desenho ? arrastoNaImagem(desenho) : null;
  const caminhoDoDesenho = arrastoDoDesenho ? (caminhoDoArrasto?.(arrastoDoDesenho) ?? null) : null;
  const retanguloDoDesenho = desenho && !caminhoDoDesenho
    ? {
        left: Math.min(desenho.inicio.x, desenho.fim.x),
        top: Math.min(desenho.inicio.y, desenho.fim.y),
        width: Math.abs(desenho.fim.x - desenho.inicio.x),
        height: Math.abs(desenho.fim.y - desenho.inicio.y),
      }
    : null;

  return (
    <section aria-label="Prévia da imagem" className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${telaCheia ? "bg-black" : "bg-fundo"}`}>
      {vista.reguas && !girada ? (
        <Reguas
          imagemRef={imagemRef}
          areaRef={areaRef}
          escala={escala}
          documento={tamanhoDaImagem(projeto)}
          ppi={projeto.tamanho?.resolucao ?? 72}
          unidade={vista.unidade}
          aoComecar={(tipo, evento) => (vista.travarGuias ? undefined : arrastarGuia({ tipo, pos: 0, indice: null }, evento))}
          aoMudarUnidade={(unidade) => aoMudarUnidade?.(unidade)}
        />
      ) : null}
      <div
        ref={areaRef}
        className={`min-h-0 flex-1 ${ajustada ? "overflow-hidden" : "overflow-auto"}`}
        style={vista.reguas && !girada ? { marginTop: LADO_DA_REGUA, marginLeft: LADO_DA_REGUA } : undefined}
        onPointerDown={(evento) => {
          // Girar vista: o ângulo segue o ponteiro em volta do meio da imagem
          if (ferramenta !== "girarVista" || evento.button !== 0 || !aoGirarVista || !imagemRef.current) return;
          evento.preventDefault();
          evento.stopPropagation();
          evento.currentTarget.setPointerCapture(evento.pointerId);
          const r = imagemRef.current.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          girandoVista.current = { base: giroDaVista.angulo, inicio: Math.atan2(evento.clientY - cy, evento.clientX - cx), cx, cy };
        }}
        onPointerMoveCapture={(evento) => {
          // O ponto do ponteiro no documento, para o painel Informações
          if (imagemRef.current) {
            const p = pontoNoElemento(evento, imagemRef.current);
            mudarVistaAoVivo({ ponteiro: { x: p.x / escala, y: p.y / escala } });
          }
          const giro = girandoVista.current;
          if (!giro || !aoGirarVista) return;
          const agora = Math.atan2(evento.clientY - giro.cy, evento.clientX - giro.cx);
          let angulo = giro.base + ((agora - giro.inicio) * 180) / Math.PI;
          angulo = ((((angulo + 180) % 360) + 360) % 360) - 180;
          aoGirarVista(evento.shiftKey ? Math.round(angulo / 15) * 15 : Math.round(angulo * 10) / 10);
        }}
        onPointerUp={() => {
          girandoVista.current = null;
        }}
        onPointerLeave={() => mudarVistaAoVivo({ ponteiro: null })}
        onScroll={medirVisivel}
      >
        <div
          className="flex items-center justify-center"
          style={{
            minWidth: "100%",
            minHeight: "100%",
            width: (girada ? caixaGirada.largura : tamanho.largura) + MESA * 2,
            height: (girada ? caixaGirada.altura : tamanho.altura) + MESA * 2,
          }}
        >
          <div
            ref={imagemRef}
            className="relative shrink-0 select-none shadow-lg shadow-black/40"
            {...(girada ? { [ATRIBUTO_DO_GIRO]: String(giroDaVista.angulo), [ATRIBUTO_DO_ESPELHO]: giroDaVista.espelhada ? "1" : "0" } : {})}
            style={{
              ...(girada ? { transform: `rotate(${giroDaVista.angulo}deg)${giroDaVista.espelhada ? " scaleX(-1)" : ""}` } : {}),
              width: tamanho.largura,
              height: tamanho.altura,
              background: projeto.fundo.transparente ? fundoDoXadrez(vista) : projeto.fundo.cor,
              cursor,
            }}
            onPointerDown={aoApertar}
            onPointerMove={aoMover}
            onPointerUp={aoSoltar}
          >
            <canvas ref={canvasRef} className="absolute inset-0 size-full" style={{ ...(corAVista ? { filter: `url(#to-canal-${corAVista})` } : {}), ...(modoAtivo ? { visibility: "hidden" } : {}) }} />
            <canvas ref={modoCanvasRef} className="pointer-events-none absolute inset-0 size-full" hidden={!modoAtivo} aria-hidden data-modo-de-cor />
            <GuiasEGrade
              guias={guiasDoDocumento}
              arrastada={guiaArrastada}
              vista={vista}
              escala={escala}
              tamanho={tamanho}
              mesa={MESA}
              caixas={camadas.filter((camada) => !camada.faixa.oculta).map((camada) => camada.caixa)}
              podeArrastar={ferramenta === "mover" && !vista.travarGuias && Boolean(aoMudarGuias)}
              aoComecar={arrastarGuia}
            />
            {corAVista ? (
              <svg width="0" height="0" className="absolute" aria-hidden>
                {/* Um canal de cor nos três, para a imagem aparecer em cinza por ele */}
                <filter id="to-canal-r" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
                  <feColorMatrix type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 1 0" />
                </filter>
                <filter id="to-canal-g" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
                  <feColorMatrix type="matrix" values="0 1 0 0 0  0 1 0 0 0  0 1 0 0 0  0 0 0 1 0" />
                </filter>
                <filter id="to-canal-b" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
                  <feColorMatrix type="matrix" values="0 0 1 0 0  0 0 1 0 0  0 0 1 0 0  0 0 0 1 0" />
                </filter>
              </svg>
            ) : null}
            {semWebgl ? (
              <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-black/70">
                Este navegador não tem WebGL2, que o editor usa para desenhar. Use o Chrome ou o Edge atualizados.
              </p>
            ) : null}
            {guias ? (
              <>
                {guias.verticais.map((x) => (
                  <div key={`v${x}`} className="pointer-events-none absolute inset-y-0 w-px bg-aviso" style={{ left: x }} aria-hidden />
                ))}
                {guias.horizontais.map((y) => (
                  <div key={`h${y}`} className="pointer-events-none absolute inset-x-0 h-px bg-aviso" style={{ top: y }} aria-hidden />
                ))}
              </>
            ) : null}
            {recorte && tamanho.largura > 1 ? <RecorteNaPrevia {...recorte} imagem={imagem} escala={tamanho.largura / imagem.largura} /> : null}
            {cortePerspectiva && tamanho.largura > 1 ? <CortePerspectivaNaPrevia {...cortePerspectiva} imagem={imagem} escala={tamanho.largura / imagem.largura} /> : null}
            {regua && tamanho.largura > 1 ? <ReguaNaPrevia {...regua} escala={tamanho.largura / imagem.largura} /> : null}
            {fatias && (fatias.ferramenta || (vista.extras && vista.fatias && fatias.fatias.length)) && tamanho.largura > 1 ? (
              <FatiasNaPrevia {...fatias} escala={tamanho.largura / imagem.largura} documento={imagem} />
            ) : null}
            {contagem && (contagem.ativo || (vista.extras && vista.contagem && contagem.contagem?.grupos.length)) && tamanho.largura > 1 ? (
              <ContagemNaPrevia {...contagem} escala={tamanho.largura / imagem.largura} />
            ) : null}
            {notas && (notas.ativo || (vista.extras && vista.notas && notas.notas.length)) && tamanho.largura > 1 ? <NotasNaPrevia {...notas} escala={tamanho.largura / imagem.largura} /> : null}
            {amostradores && (amostradores.ativo || (amostradores.pontos.length && vista.extras)) && tamanho.largura > 1 ? (
              <AmostradoresNaPrevia {...amostradores} escala={tamanho.largura / imagem.largura} />
            ) : null}
            {galeria && tamanho.largura > 1 ? <GaleriaNaPrevia {...galeria} escala={tamanho.largura / imagem.largura} documento={imagem} /> : null}
            {objeto && !maoAtiva && selecionada?.clipe.id === objeto.clipeId ? (
              <ObjetoNaPrevia caixa={selecionada.caixa} recorte={selecionada.clipe.recorte} virar={selecionada.clipe.virar} objeto={objeto.ferramenta} aoTerminarTraco={aoTerminarTraco} localizador={objeto.localizador} preencherCercado={preencherCercado} />
            ) : null}
            {selecionada && !recorte && !objeto && mostrarAlcas ? (
              <ManipuladorNaPrevia
                key={selecionada.clipe.id}
                caixa={selecionada.caixaBase}
                quadro={tamanho}
                transformacao={selecionada.clipe.transformacao}
                travado={posicaoTravada(projeto, selecionada.faixa)}
                alvos={alvosNaTela(selecionada.clipe.id)}
                aoMudar={(mudanca, novasGuias) => {
                  aoPrever(selecionada.clipe.id, mudanca);
                  // As guias inteligentes (as linhas onde a camada encostou) só aparecem com elas e os extras ligados
                  const mostrar = vista.extras && vista.guiasInteligentes;
                  setGuias(mostrar && (novasGuias.verticais.length || novasGuias.horizontais.length) ? novasGuias : null);
                }}
                aoSoltar={(mudanca) => {
                  setGuias(null);
                  aoPrever(selecionada.clipe.id, null);
                  if (mudanca) aoTransformar(selecionada.clipe.id, mudanca);
                }}
              />
            ) : null}
            {caixaDoGrupo && !recorte && !objeto && mostrarAlcas ? (
              <div
                role="group"
                aria-label="Camadas escolhidas"
                className="absolute cursor-move border border-dashed border-destaque outline outline-1 outline-black/40"
                style={{ left: caixaDoGrupo.x0, top: caixaDoGrupo.y0, width: caixaDoGrupo.x1 - caixaDoGrupo.x0, height: caixaDoGrupo.y1 - caixaDoGrupo.y0 }}
                onPointerDown={(evento) => {
                  if (evento.button !== 0) return;
                  evento.stopPropagation();
                  evento.currentTarget.setPointerCapture(evento.pointerId);
                  arrastandoGrupo.current = { x: evento.clientX, y: evento.clientY, dx: 0, dy: 0 };
                }}
                onPointerMove={(evento) => {
                  const arrasto = arrastandoGrupo.current;
                  if (!arrasto) return;
                  evento.stopPropagation();
                  // Shift prende a um eixo
                  let dx = evento.clientX - arrasto.x;
                  let dy = evento.clientY - arrasto.y;
                  if (evento.shiftKey) {
                    if (Math.abs(dx) > Math.abs(dy)) dy = 0;
                    else dx = 0;
                  }
                  arrasto.dx = dx / tamanho.largura;
                  arrasto.dy = dy / tamanho.altura;
                  aoPreverDeslocamento({ dx: arrasto.dx, dy: arrasto.dy });
                }}
                onPointerUp={(evento) => {
                  const arrasto = arrastandoGrupo.current;
                  arrastandoGrupo.current = null;
                  if (!arrasto) return;
                  evento.stopPropagation();
                  aoPreverDeslocamento(null);
                  if (arrasto.dx || arrasto.dy) aoDeslocar(arrasto.dx, arrasto.dy);
                  else {
                    // Um clique sem arrastar escolhe a camada do ponto, como fora da caixa
                    const acima = camadaNoPonto(pontoNoElemento(evento, evento.currentTarget.parentElement!));
                    if (evento.shiftKey && acima) aoSelecionar(selecao.includes(acima.clipe.id) ? selecao.filter((id) => id !== acima.clipe.id) : [...selecao, acima.clipe.id]);
                    else aoSelecionar(acima ? [acima.clipe.id] : []);
                  }
                }}
              />
            ) : null}
            {caminhosDoTexto?.length && FERRAMENTAS_DE_TEXTO.has(ferramenta) && tamanho.largura > 1 ? (
              // Os caminhos em que o clique da ferramenta Texto começa um texto no caminho
              <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
                <path d={svgDosCaminhos(caminhosDoTexto)} transform={`scale(${escala})`} fill="none" stroke="#2f80ff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              </svg>
            ) : null}
            {toqueNoTexto && ferramenta === "toqueNoTexto" && tamanho.largura > 1 ? (
              <ToqueNoTextoNaPrevia
                textos={[...camadas]
                  .reverse()
                  .filter((camada) => camada.clipe.texto_rico && !camada.faixa.oculta && camada.caixa.opacidade > 0)
                  .map((camada) => ({ clipeId: camada.clipe.id, texto: camada.clipe.texto_rico!, caixa: camada.caixa, virar: camada.clipe.virar }))}
                aoMudar={toqueNoTexto.aoMudar}
                aoAviso={toqueNoTexto.aoAviso}
                aoSelecionarCamada={(clipeId) => aoSelecionar([clipeId])}
              />
            ) : null}
            {edicaoDeTexto && tamanho.largura > 1
              ? (() => {
                  const editada = camadas.find((camada) => camada.clipe.id === edicaoDeTexto.clipeId);
                  if (!editada?.clipe.texto_rico) return null;
                  const { clipeId, ...resto } = edicaoDeTexto;
                  return <EdicaoDeTextoNaPrevia key={clipeId} texto={editada.clipe.texto_rico} caixa={editada.caixa} virar={editada.clipe.virar} {...resto} />;
                })()
              : null}
            {selecionada && !mostrarAlcas && !objeto && !recorte && selecionada.clipe.id !== edicaoDeTexto?.clipeId ? (
              // Nas outras ferramentas, a camada escolhida só ganha o contorno
              <div
                className="pointer-events-none absolute border border-destaque/80"
                style={{
                  left: selecionada.caixa.cx - selecionada.caixa.largura / 2,
                  top: selecionada.caixa.cy - selecionada.caixa.altura / 2,
                  width: selecionada.caixa.largura,
                  height: selecionada.caixa.altura,
                  transform: `rotate(${selecionada.caixa.rotacao}deg)`,
                }}
                aria-hidden
              />
            ) : null}
            {veu && tamanho.largura > 1 ? <VeuDaMascaraRapida fonte={veu.fonte} tamanho={tamanho} quadro={veu.quadro} cinza={veu.cinza} /> : null}
            {sobreposicao && tamanho.largura > 1 ? <SobreposicaoDaFonte imagem={sobreposicao.imagem} opacidade={sobreposicao.opacidade} tamanho={tamanho} /> : null}
            {pontoDaFonte && tamanho.largura > 1 ? (
              <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
                {(() => {
                  const x = (pontoDaFonte.x * tamanho.largura) / imagem.largura;
                  const y = (pontoDaFonte.y * tamanho.altura) / imagem.altura;
                  return (
                    <g stroke="#fff" strokeWidth={1} style={{ filter: "drop-shadow(0 0 1px #000)" }}>
                      <line x1={x - 8} y1={y} x2={x + 8} y2={y} />
                      <line x1={x} y1={y - 8} x2={x} y2={y + 8} />
                    </g>
                  );
                })()}
              </svg>
            ) : null}
            {ponto && !transformacao && !maoAtiva && !recorte && tamanho.largura > 1 ? <PontoNaPrevia modo={ponto.modo} quadro={tamanho} documento={imagem} aoClicar={ponto.aoClicar} aoArrastar={ponto.aoArrastar} aoArrastando={ponto.aoArrastando} alcas={ponto.alcas} /> : null}
            {moverPixels && !transformacao && !maoAtiva && tamanho.largura > 1 ? (
              <div
                className="absolute z-20 cursor-move touch-none"
                style={{
                  left: (moverPixels.caixa.x0 * tamanho.largura) / imagem.largura,
                  top: (moverPixels.caixa.y0 * tamanho.altura) / imagem.altura,
                  width: ((moverPixels.caixa.x1 - moverPixels.caixa.x0) * tamanho.largura) / imagem.largura,
                  height: ((moverPixels.caixa.y1 - moverPixels.caixa.y0) * tamanho.altura) / imagem.altura,
                }}
                aria-label="Mover a seleção"
                onPointerDown={(evento) => {
                  if (evento.button !== 0) return;
                  evento.stopPropagation();
                  evento.currentTarget.setPointerCapture(evento.pointerId);
                  arrastandoPixels.current = { x: evento.clientX, y: evento.clientY };
                  moverPixels.aoComecar(evento.altKey);
                }}
                onPointerMove={(evento) => {
                  const inicio = arrastandoPixels.current;
                  if (!inicio) return;
                  const escalaDaTela = imagem.largura / tamanho.largura;
                  let dx = (evento.clientX - inicio.x) * escalaDaTela;
                  let dy = (evento.clientY - inicio.y) * escalaDaTela;
                  // Shift prende a um eixo
                  if (evento.shiftKey) {
                    if (Math.abs(dx) > Math.abs(dy)) dy = 0;
                    else dx = 0;
                  }
                  moverPixels.aoMover(Math.round(dx), Math.round(dy));
                }}
                onPointerUp={(evento) => {
                  const inicio = arrastandoPixels.current;
                  arrastandoPixels.current = null;
                  if (!inicio) return;
                  const escalaDaTela = imagem.largura / tamanho.largura;
                  let dx = (evento.clientX - inicio.x) * escalaDaTela;
                  let dy = (evento.clientY - inicio.y) * escalaDaTela;
                  if (evento.shiftKey) {
                    if (Math.abs(dx) > Math.abs(dy)) dy = 0;
                    else dx = 0;
                  }
                  moverPixels.aoSoltar(Math.round(dx), Math.round(dy));
                }}
              />
            ) : null}
            {transformacao && tamanho.largura > 1 ? (
              <TransformacaoNaPrevia
                estado={transformacao.estado}
                modo={transformacao.modo}
                quadro={tamanho}
                documento={imagem}
                origem={transformacao.origem}
                referencia={transformacao.referencia}
                opaco={transformacao.opaco}
                dividindo={transformacao.dividindo}
                aoDividir={transformacao.aoDividir}
                aoMudar={transformacao.aoMudar}
                aoConfirmar={transformacao.aoConfirmar}
              />
            ) : null}
            {selecaoDoDocumento?.bordas && !transformacao && !(veu && !veu.cinza) && tamanho.largura > 1 ? <FormigasDaSelecao selecao={selecaoDoDocumento.selecao} quadro={tamanho} /> : null}
            {selecaoDoDocumento?.ferramenta && !recorte && !transformacao && tamanho.largura > 1 ? (
              <SelecaoNaPrevia
                ferramenta={selecaoDoDocumento.ferramenta}
                selecao={selecaoDoDocumento.selecao}
                quadro={tamanho}
                documento={imagem}
                opcoes={selecaoDoDocumento.opcoes}
                aoSelecionar={selecaoDoDocumento.aoSelecionar}
                mao={maoAtiva}
                bordas={selecaoDoDocumento.mapaDeBordas}
                aoVarinha={selecaoDoDocumento.aoVarinha}
                imagem={selecaoDoDocumento.imagem}
              />
            ) : null}
            {pintura && !maoAtiva && !recorte && tamanho.largura > 1 ? (
              <PinturaNaPrevia
                preciso={vista.cursorDePintura === "preciso"}
                ferramenta={pintura.ferramenta}
                opcoes={pintura.opcoes}
                cores={pintura.cores}
                quadro={tamanho}
                escalaDaImagem={tamanho.largura / imagem.largura}
                aoAltClique={pintura.aoAltClique}
                aoPedirAlvo={(inicio) =>
                  pintura.aoPedirAlvo(inicio).then((alvo) => (alvo ? { ...alvo, caixa: camadas.find((camada) => camada.clipe.id === alvo.clipeId)?.caixa ?? null } : null))
                }
                aoQuadro={pintura.aoQuadro}
                aoSoltar={pintura.aoSoltar}
                aoAjustar={pintura.aoAjustar}
                simetria={pintura.simetria}
                emCinza={pintura.emCinza}
                selecao={veu ? null : selecaoDoDocumento?.selecao}
              />
            ) : null}
            {pranchetas && !transformacao && !recorte && tamanho.largura > 1 ? (
              <PranchetasNaPrevia
                pranchetas={pranchetasDoProjeto(projeto).map((item) => ({ ...item, escolhida: selecao.includes(item.clipeId) }))}
                escala={escala}
                ativa={pranchetas.ativa && !maoAtiva}
                quadro={tamanho}
                aoEscolher={(clipeId) => aoSelecionar([clipeId])}
                aoCriar={pranchetas.aoCriar}
                aoPreverDeslocamento={aoPreverDeslocamento}
                aoDeslocar={aoDeslocar}
              />
            ) : null}
            {caminhos && !maoAtiva && !transformacao && !recorte && tamanho.largura > 1
              ? (() => {
                  // A máscara vetorial: os caminhos vão do espaço dela ao documento e voltam
                  const daMascara = caminhos.mascaraDe ? camadas.find((camada) => camada.clipe.id === caminhos.mascaraDe) : undefined;
                  const mascara = daMascara?.clipe.mascara_vetorial;
                  if (caminhos.mascaraDe && (!daMascara || !mascara)) return null;
                  const noDocumento = mascara && daMascara ? caminhosDaMascaraNoDocumento(mascara, daMascara.caixa, tamanho, imagem) : caminhos.caminhos;
                  const paraMascara = (subs: Subcaminho[]) => (mascara && daMascara ? caminhosNoEspacoDaMascara(subs, mascara, daMascara.caixa, tamanho, imagem) : subs);
                  return (
                    <CaminhosNaPrevia
                      ferramenta={caminhos.ferramenta}
                      caminhos={noDocumento}
                      quadro={tamanho}
                      documento={imagem}
                      opcoes={caminhos.opcoes}
                      aoMudar={(subs, provisorio) => caminhos.aoMudar(paraMascara(subs), provisorio)}
                      aoCriar={(sub) => caminhos.aoCriar(paraMascara([sub])[0])}
                      aoEscolherComponentes={caminhos.aoEscolherComponentes}
                    />
                  );
                })()
              : null}
            {retanguloDoDesenho ? <div className="pointer-events-none absolute border border-dashed border-white outline outline-1 outline-black/60" style={retanguloDoDesenho} aria-hidden /> : null}
            {caminhoDoDesenho ? (
              <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
                <g transform={`scale(${escala})`}>
                  <path d={svgDosCaminhos(caminhoDoDesenho)} fill="none" stroke="#000000" strokeOpacity={0.6} strokeWidth={3} vectorEffect="non-scaling-stroke" />
                  <path d={svgDosCaminhos(caminhoDoDesenho)} fill="none" stroke="#2f80ff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                </g>
              </svg>
            ) : null}
            {camadas.length === 0 ? (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-[10%] text-center text-xs text-black/50 mix-blend-difference">
                Ponha uma imagem pelo painel Biblioteca, ou use as ferramentas Texto e Forma.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
