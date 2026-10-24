"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ManipuladorNaPrevia } from "@/componentes/editor/ManipuladorNaPrevia";
import { arquivoDaMidia } from "@/lib/api";
import { arquivoDaMascaraDaImagem } from "@/lib/exportacao/imagem";
import { useBitmaps } from "@/lib/previa/bitmaps";
import { camadaDoCompositor, camadasDaImagem, camadasEmArvore, textosParaImagens } from "@/lib/previa/camadas";
import { Compositor, FUNDO } from "@/lib/previa/compositor";
import { useImagensDeTexto } from "@/lib/previa/imagensDeTexto";
import { type CaixaNoQuadro, caixaNoQuadro, unidadesDaSelecao } from "@/lib/projeto/alinhar";
import { posicaoTravada } from "@/lib/projeto/arvore";
import { contemPonto, type Guias, type Tamanho } from "@/lib/projeto/geometria";
import { tamanhoDaImagem } from "@/lib/projeto/imagem";
import type { Clipe, Projeto, Transformacao } from "@/lib/projeto/modelo";
import type { FerramentaDePintura, OpcoesDoPincel, Simetria } from "@/lib/pintura/traco";
import { arquivoDaVersao } from "@/lib/pixels";
import { vetorNoTamanho } from "@/lib/vetor/desenhar";
import { mascaraFinal } from "@/lib/previa/mascaraCombinada";
import { caminhosDaMascaraNoDocumento, caminhosNoEspacoDaMascara } from "@/lib/vetor/mascaraVetorial";
import { arrastoDaForma, type ArrastoDaForma } from "@/lib/vetor/arrasto";
import { svgDosCaminhos } from "@/lib/vetor/contorno";
import { CaminhosNaPrevia, type FerramentaDeCaminho, type OpcoesDosCaminhos } from "./CaminhosNaPrevia";
import type { Subcaminho } from "@/lib/vetor/modelo";
import type { MapaDeBordas } from "@/lib/selecao/magnetico";
import type { ImagemRgba } from "@/lib/selecao/varinha";
import type { ModoDaSelecao, Selecao } from "@/lib/selecao/mascara";
import type { Midia } from "@/lib/tipos";

import { FORMA_VIVA_DA_FERRAMENTA, type IdFerramentaDaImagem, MODO_DA_SELECAO } from "./ferramentasDaImagem";
import { ObjetoNaPrevia } from "./ObjetoNaPrevia";
import { type AlvoDaPintura, PinturaNaPrevia } from "./PinturaNaPrevia";
import { RecorteNaPrevia } from "./RecorteNaPrevia";
import { CortePerspectivaNaPrevia } from "./CortePerspectivaNaPrevia";
import { ReguaNaPrevia } from "./ReguaNaPrevia";
import { type FerramentaDeSelecao, FormigasDaSelecao, type OpcoesDaSelecao, SelecaoNaPrevia } from "./SelecaoNaPrevia";
import { VeuDaMascaraRapida } from "./MascaraRapida";
import { PontoNaPrevia } from "./PontoNaPrevia";
import { type DivisaoDaMalha, type EstadoDaTransformacao, type ModoDaTransformacao, TransformacaoNaPrevia } from "./TransformacaoNaPrevia";
import type { Malha } from "@/lib/transformar/deformar";
import type { CorDoCanal } from "./PainelCanais";
import type { FerramentaObjeto } from "./useObjeto";

/** Densidade máxima de pixels do canvas, como na prévia do vídeo. */
const DENSIDADE_MAXIMA = 2;
/** O maior lado do canvas em pixels de tela (o zoom alto reduz a densidade para caber). */
const LADO_MAXIMO_DO_CANVAS = 8192;
/** O xadrez que aparece atrás da imagem sem fundo. */
const XADREZ = "repeating-conic-gradient(#d6d8de 0% 25%, #ffffff 0% 50%) 50% / 20px 20px";
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
  /** O zoom de verdade (o de ajustar, quando `zoom` é null), para a barra de status. */
  aoMedirZoom?: (zoom: number) => void;
  /** Recortando a imagem: o retângulo por cima de tudo, no lugar das alças das camadas. */
  /** A Régua: a medida e quem a muda. */
  regua?: Omit<React.ComponentProps<typeof ReguaNaPrevia>, "escala"> | null;
  /** O Corte de perspectiva em andamento (CortePerspectivaNaPrevia). */
  cortePerspectiva?: Omit<React.ComponentProps<typeof CortePerspectivaNaPrevia>, "imagem" | "escala"> | null;
  /** O Corte em andamento: a caixa e as opções dela (RecorteNaPrevia). */
  recorte?: Omit<React.ComponentProps<typeof RecorteNaPrevia>, "imagem" | "escala"> | null;
  /** As ferramentas de seleção: os cliques e os traços vão para a foto escolhida, no lugar das alças. */
  objeto?: { clipeId: string; ferramenta: FerramentaObjeto; localizador?: boolean } | null;
  aoTerminarTraco?: () => void;
  /** O Remover enche o que o traço cerca. */
  preencherCercado?: boolean;
  /** Ferramenta Texto: o clique fora de um texto, no ponto da imagem (em pixels). */
  aoClicarTexto?: (x: number, y: number) => void;
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
  /** Alt + clique na miniatura da máscara: a prévia mostra só a máscara desta camada (o clipe), em cinza. */
  mascaraAVista?: string | null;
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
  ponto?: { modo: "clique" | "arrasto"; aoClicar?: (ponto: { x: number; y: number }, teclas: { shift: boolean; alt: boolean }) => void; aoArrastar?: (de: { x: number; y: number }, ate: { x: number; y: number }) => void } | null;
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
  objeto = null,
  aoTerminarTraco,
  preencherCercado,
  aoClicarTexto,
  aoDesenharForma,
  caminhos = null,
  caminhoDoArrasto,
  aoPegarCor,
  pintura = null,
  fonteDosPixels,
  fonteDaMascara,
  mascaraAVista = null,
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
  const camadas = camadasDaImagem(projeto, midias, tamanho, imagensDeTexto);
  const fonteDa = (midiaId: string) => arquivoDaMidia(midiaId, "proxy.webp");
  // A camada de pixels lê a versão do clipe (a 0 é vazia), ou o canvas enquanto é pintada
  const versaoDosPixels = (clipe: Clipe) => (clipe.pixels && clipe.midia_id && clipe.pixels.versao > 0 ? arquivoDaMidia(clipe.midia_id, arquivoDaVersao(clipe.pixels.versao)) : null);
  // A máscara de camada: o canvas sendo pintado, ou a versão do servidor
  const versaoDaMascara = (clipe: Clipe) => (clipe.mascara_pixels ? arquivoDaMidia(clipe.mascara_pixels.midia_id, arquivoDaVersao(clipe.mascara_pixels.versao)) : null);
  const enderecosDasMascaras = camadas.flatMap((camada) => {
    const endereco = !fonteDaMascara?.(camada.clipe) ? versaoDaMascara(camada.clipe) : null;
    return endereco ? [endereco] : [];
  });
  const enderecos = camadas.flatMap((camada) => {
    if (camada.imagem || !camada.clipe.midia_id || camada.clipe.ajuste) return [];
    if (camada.clipe.pixels) {
      const versao = fonteDosPixels?.(camada.clipe) ? null : versaoDosPixels(camada.clipe);
      return versao ? [versao] : [];
    }
    const mascara = camada.clipe.remover_fundo ? arquivoDaMascaraDaImagem(midias.get(camada.clipe.midia_id)) : null;
    return mascara ? [fonteDa(camada.clipe.midia_id), mascara] : [fonteDa(camada.clipe.midia_id)];
  });
  const bitmaps = useBitmaps([...enderecos, ...enderecosDasMascaras]);
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

  const densidade = Math.min((typeof window === "undefined" ? 1 : window.devicePixelRatio) || 1, DENSIDADE_MAXIMA, LADO_MAXIMO_DO_CANVAS / Math.max(tamanho.largura, tamanho.altura));

  // Desenha a cada mudança (a imagem é parada: não há laço de quadros)
  useLayoutEffect(() => {
    const atual = compositor.current;
    if (!atual || tamanho.largura <= 1) return;
    // A máscara de camada de cada uma (null enquanto a imagem dela não chegou)
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
        if (camada.imagem) return [[camada.faixa.id, camadaDoCompositor(camada, camada.imagem, null, mascaraDe(camada))] as const];
        if (camada.clipe.ajuste) return [[camada.faixa.id, camadaDoCompositor(camada, FUNDO, null)] as const];
        if (camada.clipe.vetor) {
          // A forma desenhada no tamanho da tela, para ficar nítida em qualquer zoom
          const { caixa, recorte } = camada;
          const fonte = vetorNoTamanho(camada.clipe.id, camada.clipe.vetor, (caixa.largura * densidade) / recorte.largura, (caixa.altura * densidade) / recorte.altura);
          return [[camada.faixa.id, camadaDoCompositor(camada, fonte, null, mascaraDe(camada))] as const];
        }
        if (camada.clipe.pixels) {
          const endereco = versaoDosPixels(camada.clipe);
          const pixels = fonteDosPixels?.(camada.clipe) ?? (endereco ? bitmaps.get(endereco) : null);
          return pixels ? [[camada.faixa.id, camadaDoCompositor(camada, pixels, null, mascaraDe(camada))] as const] : [];
        }
        const fonte = bitmaps.get(fonteDa(camada.clipe.midia_id!));
        if (!fonte) return [];
        const enderecoDaMascara = camada.clipe.remover_fundo ? arquivoDaMascaraDaImagem(midias.get(camada.clipe.midia_id!)) : null;
        const mascara = enderecoDaMascara ? bitmaps.get(enderecoDaMascara) : null;
        if (enderecoDaMascara && !mascara) return [];
        return [[camada.faixa.id, camadaDoCompositor(camada, fonte, mascara ?? null, mascaraDe(camada))] as const];
      }),
    );
    if (caixasRef) caixasRef.current = new Map(camadas.map((camada) => [camada.clipe.id, { ...caixaNoQuadro(camada.caixa, tamanho), bruta: camada.caixa, quadro: tamanho }]));
    const resolucao = { largura: Math.round(tamanho.largura * densidade), altura: Math.round(tamanho.altura * densidade) };
    atual.desenhar(camadasEmArvore(projeto, porFaixa, tamanho), projeto.fundo.transparente ? null : projeto.fundo.cor, tamanho, resolucao);
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
    const retangulo = evento.currentTarget.getBoundingClientRect();
    return { x: evento.clientX - retangulo.left, y: evento.clientY - retangulo.top };
  }

  function camadaNoPonto(ponto: { x: number; y: number }, filtro: (camada: (typeof camadas)[number]) => boolean = () => true) {
    return [...camadas].reverse().find((camada) => camada.caixa.opacidade > 0 && !camada.faixa.oculta && filtro(camada) && contemPonto(camada.caixa, ponto));
  }

  function pegarCor(ponto: { x: number; y: number }, paraOFundo: boolean) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const leitor = document.createElement("canvas");
    leitor.width = 1;
    leitor.height = 1;
    const ctx = leitor.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = projeto.fundo.transparente ? "#ffffff" : projeto.fundo.cor;
    ctx.fillRect(0, 0, 1, 1);
    ctx.drawImage(canvas, Math.floor(ponto.x * densidade), Math.floor(ponto.y * densidade), 1, 1, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    aoPegarCor?.(hex(r, g, b), paraOFundo);
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
    if (ferramenta === "texto") {
      const texto = camadaNoPonto(ponto, (camada) => Boolean(camada.clipe.texto));
      if (texto) aoSelecionar([texto.clipe.id]);
      else aoClicarTexto?.(ponto.x / escala, ponto.y / escala);
      return;
    }
    if (FORMA_VIVA_DA_FERRAMENTA[ferramenta] || ferramenta === "formaPersonalizada") {
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
    const arrasto = arrastoNaImagem(desenho);
    // Um clique sem arrastar: quem desenha pergunta as medidas, com o ponto
    const clique = Math.hypot(desenho.fim.x - desenho.inicio.x, desenho.fim.y - desenho.inicio.y) < 4;
    aoDesenharForma?.(clique ? arrastoDaForma(arrasto.de, arrasto.de) : arrasto, clique);
  }
  function arrastoNaImagem(atual: NonNullable<typeof desenho>) {
    const naImagem = (p: { x: number; y: number }) => ({ x: p.x / escala, y: p.y / escala });
    return arrastoDaForma(naImagem(atual.inicio), naImagem(atual.fim), { proporcional: atual.shift, doMeio: atual.alt, linha: ferramenta === "linha" });
  }

  const ajustada = zoom === null;
  const cursor = maoAtiva ? (arrastandoMao ? "grabbing" : "grab") : ferramenta === "zoom" ? "zoom-in" : ferramenta === "contaGotas" || ferramenta === "texto" || FORMA_VIVA_DA_FERRAMENTA[ferramenta] || ferramenta === "formaPersonalizada" ? "crosshair" : undefined;
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
    <section aria-label="Prévia da imagem" className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-fundo">
      <div
        ref={areaRef}
        className={`min-h-0 flex-1 ${ajustada ? "overflow-hidden" : "overflow-auto"}`}
        onWheel={(evento) => {
          if (!evento.ctrlKey && !evento.altKey) return;
          evento.preventDefault();
          aoMudarZoom(proximoZoom(escala, evento.deltaY < 0 ? 1 : -1));
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            minWidth: "100%",
            minHeight: "100%",
            width: tamanho.largura + MESA * 2,
            height: tamanho.altura + MESA * 2,
          }}
        >
          <div
            className="relative shrink-0 select-none shadow-lg shadow-black/40"
            style={{
              width: tamanho.largura,
              height: tamanho.altura,
              background: projeto.fundo.transparente ? XADREZ : projeto.fundo.cor,
              cursor,
            }}
            onPointerDown={aoApertar}
            onPointerMove={aoMover}
            onPointerUp={aoSoltar}
          >
            <canvas ref={canvasRef} className="absolute inset-0 size-full" style={corAVista ? { filter: `url(#to-canal-${corAVista})` } : undefined} />
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
                aoMudar={(mudanca, novasGuias) => {
                  aoPrever(selecionada.clipe.id, mudanca);
                  setGuias(novasGuias.verticais.length || novasGuias.horizontais.length ? novasGuias : null);
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
                    const quadro = evento.currentTarget.parentElement!.getBoundingClientRect();
                    const acima = camadaNoPonto({ x: evento.clientX - quadro.left, y: evento.clientY - quadro.top });
                    if (evento.shiftKey && acima) aoSelecionar(selecao.includes(acima.clipe.id) ? selecao.filter((id) => id !== acima.clipe.id) : [...selecao, acima.clipe.id]);
                    else aoSelecionar(acima ? [acima.clipe.id] : []);
                  }
                }}
              />
            ) : null}
            {selecionada && !mostrarAlcas && !objeto && !recorte ? (
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
            {ponto && !transformacao && !maoAtiva && !recorte && tamanho.largura > 1 ? <PontoNaPrevia modo={ponto.modo} quadro={tamanho} documento={imagem} aoClicar={ponto.aoClicar} aoArrastar={ponto.aoArrastar} /> : null}
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
