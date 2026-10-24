"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ManipuladorNaPrevia } from "@/componentes/editor/ManipuladorNaPrevia";
import type { RetanguloDaImagem } from "@/lib/projeto/imagem";
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
import type { MapaDeBordas } from "@/lib/selecao/magnetico";
import type { ImagemRgba } from "@/lib/selecao/varinha";
import type { ModoDaSelecao, Selecao } from "@/lib/selecao/mascara";
import type { Midia } from "@/lib/tipos";

import { FORMA_DA_FERRAMENTA, type IdFerramentaDaImagem, MODO_DA_SELECAO } from "./ferramentasDaImagem";
import { ObjetoNaPrevia } from "./ObjetoNaPrevia";
import { type AlvoDaPintura, PinturaNaPrevia } from "./PinturaNaPrevia";
import { RecorteNaPrevia } from "./RecorteNaPrevia";
import { type FerramentaDeSelecao, FormigasDaSelecao, type OpcoesDaSelecao, SelecaoNaPrevia } from "./SelecaoNaPrevia";
import { VeuDaMascaraRapida } from "./MascaraRapida";
import { type EstadoDaTransformacao, type ModoDaTransformacao, TransformacaoNaPrevia } from "./TransformacaoNaPrevia";
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
  recorte?: { retangulo: RetanguloDaImagem; proporcao: number | null; aoMudar: (retangulo: RetanguloDaImagem) => void } | null;
  /** As ferramentas de seleção: os cliques e os traços vão para a foto escolhida, no lugar das alças. */
  objeto?: { clipeId: string; ferramenta: FerramentaObjeto; localizador?: boolean } | null;
  aoTerminarTraco?: () => void;
  /** Ferramenta Texto: o clique fora de um texto, no ponto da imagem (em pixels). */
  aoClicarTexto?: (x: number, y: number) => void;
  /** Ferramentas de forma: o retângulo arrastado, em pixels da imagem. */
  aoDesenharForma?: (retangulo: RetanguloDaImagem) => void;
  /** Conta-gotas: a cor do ponto (com Alt, vai para o fundo). */
  aoPegarCor?: (cor: string, paraOFundo: boolean) => void;
  /** Pincel, lápis e borracha: o traço por cima da prévia, numa camada de pixels. */
  pintura?: {
    ferramenta: FerramentaDePintura;
    opcoes: OpcoesDoPincel;
    cores: { primeiroPlano: string; fundo: string };
    /** A camada do traço (a caixa vem daqui, da prévia); null quando não dá para pintar. */
    aoPedirAlvo: () => Promise<Omit<AlvoDaPintura, "caixa"> | null>;
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
  /** A transformação livre em andamento (a da seleção): a caixa com as alças, por cima de tudo. */
  transformacao?: {
    estado: EstadoDaTransformacao;
    modo: ModoDaTransformacao;
    origem: { imagem: CanvasImageSource; largura: number; altura: number } | null;
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
  objeto = null,
  aoTerminarTraco,
  aoClicarTexto,
  aoDesenharForma,
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
  const [desenho, setDesenho] = useState<{ inicio: { x: number; y: number }; fim: { x: number; y: number } } | null>(null);
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
      if (!camada.clipe.mascara_pixels) return null;
      const endereco = versaoDaMascara(camada.clipe);
      const fonte = fonteDaMascara?.(camada.clipe) ?? (endereco ? bitmaps.get(endereco) : null);
      return fonte ? { fonte, quadro: tamanho } : null;
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
    if (FORMA_DA_FERRAMENTA[ferramenta] || ferramenta === "formaPersonalizada") {
      evento.currentTarget.setPointerCapture(evento.pointerId);
      setDesenho({ inicio: ponto, fim: ponto });
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
    if (desenho) setDesenho({ ...desenho, fim: noQuadro(evento) });
  }

  function aoSoltar() {
    andando.current = null;
    setArrastandoMao(false);
    if (!desenho) return;
    setDesenho(null);
    const x = Math.min(desenho.inicio.x, desenho.fim.x) / escala;
    const y = Math.min(desenho.inicio.y, desenho.fim.y) / escala;
    const largura = Math.abs(desenho.fim.x - desenho.inicio.x) / escala;
    const altura = Math.abs(desenho.fim.y - desenho.inicio.y) / escala;
    // Um clique sem arrastar desenha uma forma de um quarto do lado menor da imagem, no ponto
    const lado = Math.min(imagem.largura, imagem.altura) / 4;
    aoDesenharForma?.(largura < 4 && altura < 4 ? { x: x - lado / 2, y: y - lado / 2, largura: lado, altura: lado } : { x, y, largura: Math.max(1, largura), altura: Math.max(1, altura) });
  }

  const ajustada = zoom === null;
  const cursor = maoAtiva ? (arrastandoMao ? "grabbing" : "grab") : ferramenta === "zoom" ? "zoom-in" : ferramenta === "contaGotas" || ferramenta === "texto" || FORMA_DA_FERRAMENTA[ferramenta] || ferramenta === "formaPersonalizada" ? "crosshair" : undefined;
  const mostrarAlcas = ferramenta === "mover" && !espaco;
  const retanguloDoDesenho = desenho
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
            {recorte && tamanho.largura > 1 ? <RecorteNaPrevia retangulo={recorte.retangulo} imagem={imagem} escala={tamanho.largura / imagem.largura} proporcao={recorte.proporcao} aoMudar={recorte.aoMudar} /> : null}
            {objeto && !maoAtiva && selecionada?.clipe.id === objeto.clipeId ? (
              <ObjetoNaPrevia caixa={selecionada.caixa} recorte={selecionada.clipe.recorte} virar={selecionada.clipe.virar} objeto={objeto.ferramenta} aoTerminarTraco={aoTerminarTraco} localizador={objeto.localizador} />
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
                aoPedirAlvo={() =>
                  pintura.aoPedirAlvo().then((alvo) => (alvo ? { ...alvo, caixa: camadas.find((camada) => camada.clipe.id === alvo.clipeId)?.caixa ?? null } : null))
                }
                aoQuadro={pintura.aoQuadro}
                aoSoltar={pintura.aoSoltar}
                aoAjustar={pintura.aoAjustar}
                simetria={pintura.simetria}
                emCinza={pintura.emCinza}
                selecao={veu ? null : selecaoDoDocumento?.selecao}
              />
            ) : null}
            {retanguloDoDesenho ? <div className="pointer-events-none absolute border border-dashed border-white outline outline-1 outline-black/60" style={retanguloDoDesenho} aria-hidden /> : null}
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
