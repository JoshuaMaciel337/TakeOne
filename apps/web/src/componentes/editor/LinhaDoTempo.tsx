"use client";

import {
  ArrowLeftRight,
  Bookmark,
  Captions,
  Copy,
  Diamond,
  Eye,
  EyeOff,
  Film,
  Layers,
  Lock,
  LockOpen,
  Magnet,
  Maximize2,
  MousePointer2,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  Rows3,
  ScanLine,
  Scissors,
  Snowflake,
  Trash2,
  Type,
  Undo2,
  Unlink,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { materialNoArrasto, midiaNoArrasto } from "@/lib/arrasto";
import { DURACAO_TRANSICAO_S } from "@/lib/projeto/edicao";
import { INTENSIDADE_PADRAO, SO_EM_MIDIA, type TipoEfeito } from "@/lib/projeto/efeitos";
import type { TipoTransicao } from "@/lib/projeto/transicao";
import { formatarTempo } from "@/lib/formatar";
import { type Comando, executarComando } from "@/lib/projeto/comandos";
import type { Contexto, DestinoClipe } from "@/lib/projeto/edicao";
import { encaixarIntervalo, pontoMaisProximo, pontosDeEncaixe } from "@/lib/projeto/ima";
import { corNeutra } from "@/lib/projeto/cor";
import { CHAVES_DE_KEYFRAME } from "@/lib/projeto/keyframes";
import { acharClipe, type Clipe, CORES_DOS_MARCADORES, type Faixa, faixaDeTexto, fimDoClipe, type Marcador, type Projeto, type TipoFaixa } from "@/lib/projeto/modelo";
import { resumoDoTexto } from "@/lib/projeto/texto";
import { TIPOS_TRANSICAO } from "@/lib/projeto/transicao";
import { alturaDoVolume, fadeArrastado, textoDoVolume, volumeDaAltura } from "@/lib/projeto/linhaDeVolume";
import { duracaoDoQuadro, formatarTimecodeLongo, type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import { useTamanhoSalvo } from "@/lib/useTamanhoSalvo";

import type { IdFerramentaDaLinha } from "./ferramentasDaLinha";
import type { Midia } from "@/lib/tipos";

import { type ItemDoContexto, MenuDeContexto } from "./MenuDeContexto";
import { MarcasDoRitmo } from "./NoRitmo";
import { FormaDeOndaDoClipe, MiniaturasDoClipe } from "./VisualDoClipe";

type Props = {
  projeto: Projeto;
  midias: ReadonlyMap<string, Midia>;
  ctx: Contexto;
  tempo: Tick;
  tocando: boolean;
  selecao: string[];
  ima: boolean;
  aoAlternarIma: () => void;
  aoBuscar: (tempo: Tick) => void;
  aoSelecionar: (ids: string[]) => void;
  aoExecutar: (comando: Comando) => void;
  /** Congela o quadro do cursor no vídeo escolhido da principal (sem ele, o botão fica desligado). */
  aoCongelar?: () => void;
  /** O layout dos editores profissionais: o código de tempo azul na barra e as faixas V1, V2… e A1, A2… */
  profissional?: boolean;
  /** O zoom pedido de fora (os menus): multiplica o atual; `vez` muda a cada pedido. */
  pedidoDeZoom?: { fator: number; vez: number };
  /** A ferramenta da coluna de ferramentas (só no layout profissional); sem ela, a Seleção. */
  ferramenta?: IdFerramentaDaLinha;
  /** A entrada e a saída da sequência (I e O), marcadas na régua. */
  entradaSaida?: { entrada: Tick | null; saida: Tick | null };
  /** Desfazer e refazer na barra (o Takecut, que não tem a barra de menus do layout profissional). */
  nomeDesfazer?: string | null;
  nomeRefazer?: string | null;
  aoDesfazer?: () => void;
  aoRefazer?: () => void;
  /** Copiar e colar no cursor (o menu do botão direito). */
  aoCopiar?: () => void;
  aoColar?: () => void;
  /** A prévia mostra o instante sob o ponteiro (null: volta ao cursor). */
  aoPrevisualizar?: (tempo: Tick | null) => void;
  /** O clique na principal vazia: importar mídias. */
  aoImportar?: () => void;
  /** Shift+Z: ver o projeto inteiro (muda a cada pedido). */
  pedidoDeAjuste?: number;
  /** A IA no botão direito de um clipe (a mesma conta do "Melhorar o projeto"). */
  aoMelhorarClipes?: (tipo: "cor" | "volume" | "voz" | "cenas", clipeIds: string[]) => void;
  className?: string;
  style?: React.CSSProperties;
};

const ZOOM_MINIMO = 4; // pixels por segundo
const ZOOM_MAXIMO = 400;
const LARGURA_ROTULOS = 156;
const LARGURA_ROTULOS_COMPACTA = 88;
const LARGURA_TELA_ESTREITA = 640;
const ALTURA_REGUA = 24;
const ALTURA_ZONA_NOVA = 18;
const ALTURAS: Record<TipoFaixa, number> = { principal: 64, video: 48, audio: 40, texto: 36, legenda: 32 };
const TOLERANCIA_IMA_PX = 8;
const LIMIAR_ARRASTO_PX = 4;
const INTERVALOS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];
const DISTANCIA_MINIMA_MARCAS = 70;

type Linha = { faixa: Faixa; topo: number; altura: number };

/** As alturas das faixas: compactas, normais e altas (o botão da barra passa de uma à outra). */
const ESCALAS_DAS_FAIXAS = [75, 100, 145];

function montarLinhas(projeto: Projeto, escala = 1): { linhas: Linha[]; altura: number } {
  let topo = ALTURA_ZONA_NOVA;
  const linhas = projeto.faixas.map((faixa) => {
    const linha = { faixa, topo, altura: Math.round(ALTURAS[faixa.tipo] * escala) };
    topo += linha.altura;
    return linha;
  });
  return { linhas, altura: topo + ALTURA_ZONA_NOVA };
}

/** Faixa sob a altura `y`; acima ou abaixo de todas, pede uma faixa nova. */
function destinoNaAltura(linhas: Linha[], y: number): { faixa?: Faixa; novaFaixa?: true } {
  const linha = linhas.find((item) => y >= item.topo && y < item.topo + item.altura);
  return linha ? { faixa: linha.faixa } : { novaFaixa: true };
}

/** Se a faixa recebe o clipe: texto só na de texto; mídia com imagem nas de vídeo; som na de áudio. */
function aceita(tipo: TipoFaixa, midia: Midia | undefined, texto = false): boolean {
  if (texto) return faixaDeTexto(tipo);
  if (faixaDeTexto(tipo)) return false;
  if (!midia) return true;
  return tipo === "audio" ? !midia.video : Boolean(midia.video);
}

function midiaDoClipe(midias: ReadonlyMap<string, Midia>, clipe: Clipe): Midia | undefined {
  return clipe.midia_id ? midias.get(clipe.midia_id) : undefined;
}

type Arrasto =
  | {
      tipo: "mover";
      clipe: Clipe;
      faixaId: string;
      x0: number;
      y0: number;
      ativo: boolean;
      comando: Comando | null;
      guia: Tick | null;
    }
  | { tipo: "aparar"; clipe: Clipe; borda: "inicio" | "fim"; jeito: "aparar" | "ondulacao" | "esticar"; x0: number; ativo: boolean; comando: Comando | null; guia: Tick | null }
  // Alt + arrastar: o conteúdo do clipe (slip) ou o corte entre dois clipes encostados (roll), com o da esquerda
  | { tipo: "deslizar"; clipe: Clipe; x0: number; ativo: boolean; comando: Comando | null; guia: Tick | null }
  | { tipo: "corte"; clipe: Clipe; x0: number; ativo: boolean; comando: Comando | null; guia: Tick | null }
  | { tipo: "soltar"; comando: Comando; guia: Tick | null; alvo?: string }
  // As alças de fade e a linha de volume do clipe escolhido
  | { tipo: "fade"; clipe: Clipe; lado: "entrada" | "saida"; x0: number; ativo: boolean; comando: Comando | null; guia: null }
  | { tipo: "volume"; clipe: Clipe; y0: number; alturaInterna: number; ativo: boolean; comando: Comando | null; guia: null }
  // A seleção em caixa, arrastando no vazio (em pixels da área das faixas)
  | { tipo: "caixa"; x0: number; y0: number; x1: number; y1: number; aditivo: boolean; ativo: boolean; comando: null; guia: null };

/** O código da faixa nos editores profissionais: as de imagem são V1 (a principal), V2… de baixo para cima; as de som, A1, A2… */
export function codigoDaFaixa(faixa: Faixa, projeto: Projeto): string {
  if (faixa.tipo === "audio") return `A${projeto.faixas.filter((item) => item.tipo === "audio").indexOf(faixa) + 1}`;
  const imagem = projeto.faixas.filter((item) => item.tipo !== "audio");
  return `V${imagem.length - imagem.indexOf(faixa)}`;
}

/** O ponteiro de cada ferramenta (a Seleção usa o de cada parte do clipe). */
const CURSOR_DA_FERRAMENTA: Record<IdFerramentaDaLinha, string | undefined> = {
  selecao: undefined,
  faixaAdiante: "e-resize",
  faixaAtras: "w-resize",
  ondulacao: undefined,
  continua: undefined,
  velocidade: undefined,
  navalha: "crosshair",
  deslizar: "ew-resize",
  mao: "grab",
  zoom: "zoom-in",
  texto: undefined,
};

export function nomeDaFaixa(faixa: Faixa, projeto: Projeto): string {
  if (faixa.tipo === "principal") return "Principal";
  const iguais = projeto.faixas.filter((item) => item.tipo === faixa.tipo);
  // As faixas de imagem contam de baixo para cima; as de áudio, de cima para baixo
  const numero = faixa.tipo === "audio" ? iguais.indexOf(faixa) + 1 : iguais.length - iguais.indexOf(faixa);
  const nomes = { video: "Sobreposição", audio: "Áudio", texto: "Texto", legenda: "Legendas" } as const;
  return `${nomes[faixa.tipo]} ${numero}`;
}

export function LinhaDoTempo({
  projeto,
  midias,
  ctx,
  tempo,
  tocando,
  selecao,
  ima,
  aoAlternarIma,
  aoBuscar,
  aoSelecionar,
  aoExecutar,
  aoCongelar,
  profissional = false,
  pedidoDeZoom,
  ferramenta = "selecao",
  entradaSaida,
  nomeDesfazer,
  nomeRefazer,
  aoDesfazer,
  aoRefazer,
  aoCopiar,
  aoColar,
  aoPrevisualizar,
  aoImportar,
  aoMelhorarClipes,
  pedidoDeAjuste = 0,
  className = "",
  style,
}: Props) {
  const [zoom, setZoom] = useState(40);
  // O pedido de fora vale uma vez (o estado muda durante a renderização, sem efeito)
  const [zoomVisto, setZoomVisto] = useState(0);
  if (pedidoDeZoom && pedidoDeZoom.vez !== zoomVisto) {
    setZoomVisto(pedidoDeZoom.vez);
    setZoom((valor) => Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, valor * pedidoDeZoom.fator)));
  }
  const rolagem = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [larguraVisivel, setLarguraVisivel] = useState(0);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const arrastoAtual = useRef<Arrasto | null>(null);
  const buscandoNaRegua = useRef(false);
  const [marcadorAberto, setMarcadorAberto] = useState<string | null>(null);
  const andandoComAMao = useRef<{ x: number; rolagem: number } | null>(null);
  // No Takecut, o modo do mouse (seleção ou navalha) fica na barra; no layout profissional, na coluna de ferramentas
  const [modoDoMouse, setModoDoMouse] = useState<"selecao" | "navalha">("selecao");
  const ferramentaEfetiva: IdFerramentaDaLinha = profissional ? ferramenta : modoDoMouse;
  // As preferências da linha guardadas no navegador: a altura das faixas, o cabeçalho recolhido e a prévia no mouse
  const [escalaDasFaixas, setEscalaDasFaixas] = useTamanhoSalvo("linha-altura-faixas", 100, 75, 145);
  const [cabecalhoRecolhido, setCabecalhoRecolhido] = useTamanhoSalvo("linha-cabecalho-recolhido", 0, 0, 1);
  const [seguirMouse, setSeguirMouse] = useTamanhoSalvo("linha-previa-no-mouse", 1, 0, 1);
  const [contexto, setContexto] = useState<{ x: number; y: number; tempo: Tick; clipeId: string | null } | null>(null);
  const [xDoMouse, setXDoMouse] = useState<number | null>(null);
  const previsto = useRef<Tick | null>(null);
  // "Ver o projeto inteiro" também leva a rolagem ao começo, depois do zoom novo
  const [voltarAoInicio, setVoltarAoInicio] = useState(0);
  useEffect(() => {
    if (voltarAoInicio && rolagem.current) rolagem.current.scrollLeft = 0;
  }, [voltarAoInicio]);

  function trocarArrasto(novo: Arrasto | null) {
    arrastoAtual.current = novo;
    setArrasto(novo);
  }

  useEffect(() => {
    const elemento = rolagem.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => setLarguraVisivel(entrada.contentRect.width));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  // Ctrl + roda do mouse muda o zoom mantendo parado o ponto sob o ponteiro
  useEffect(() => {
    const elemento = rolagem.current;
    if (!elemento) return;
    function aoRolar(evento: WheelEvent) {
      if (!evento.ctrlKey && !evento.metaKey) return;
      evento.preventDefault();
      const x = evento.clientX - area.current!.getBoundingClientRect().left;
      setZoom((atual) => {
        const novo = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, atual * (evento.deltaY < 0 ? 1.15 : 1 / 1.15)));
        requestAnimationFrame(() => {
          elemento!.scrollLeft += (x / atual) * novo - x;
        });
        return novo;
      });
    }
    elemento.addEventListener("wheel", aoRolar, { passive: false });
    return () => elemento.removeEventListener("wheel", aoRolar);
  }, []);

  // Em tela estreita (ou com o cabeçalho recolhido), o cabeçalho da faixa fica só com os botões
  const compacto = (larguraVisivel > 0 && larguraVisivel < LARGURA_TELA_ESTREITA) || cabecalhoRecolhido === 1;
  const larguraRotulos = compacto ? LARGURA_ROTULOS_COMPACTA : LARGURA_ROTULOS;

  // Tocando, a rolagem acompanha o cursor
  const xCursor = (tempo / TICKS_POR_SEGUNDO) * zoom;
  useEffect(() => {
    const elemento = rolagem.current;
    if (!tocando || !elemento) return;
    const visivel = elemento.clientWidth - larguraRotulos;
    if (xCursor < elemento.scrollLeft || xCursor > elemento.scrollLeft + visivel - 24) elemento.scrollLeft = Math.max(0, xCursor - 48);
  }, [tocando, xCursor, larguraRotulos]);

  // Durante o arrasto, a linha do tempo mostra o resultado do comando como se ele já tivesse sido feito
  const comandoEmCurso = arrasto?.comando ?? null;
  const exibido = useMemo(() => {
    if (!comandoEmCurso) return projeto;
    try {
      return executarComando(projeto, comandoEmCurso, ctx).projeto;
    } catch {
      return projeto;
    }
  }, [projeto, comandoEmCurso, ctx]);

  const layoutOriginal = useMemo(() => montarLinhas(projeto, escalaDasFaixas / 100), [projeto, escalaDasFaixas]);
  const layout = useMemo(() => montarLinhas(exibido, escalaDasFaixas / 100), [exibido, escalaDasFaixas]);

  const px = (t: Tick) => (t / TICKS_POR_SEGUNDO) * zoom;
  // Ticks são inteiros: com o zoom mudado (Ctrl+roda, deslizante) ou com escala de tela fracionária, a conta
  // dava frações, que quebravam as contas de quadro e a API recusaria
  const ticks = (pixels: number) => Math.round((pixels / zoom) * TICKS_POR_SEGUNDO);
  const tolerancia = ticks(TOLERANCIA_IMA_PX);

  const duracaoSegundos = exibido.duracao / TICKS_POR_SEGUNDO;
  const totalSegundos = Math.max(duracaoSegundos + 10, (larguraVisivel - larguraRotulos) / zoom, 10);
  const largura = totalSegundos * zoom;
  const intervalo = INTERVALOS.find((valor) => valor * zoom >= DISTANCIA_MINIMA_MARCAS) ?? INTERVALOS.at(-1)!;
  const marcas = Array.from({ length: Math.floor(totalSegundos / intervalo) + 1 }, (_, i) => i * intervalo);

  function pontoNaArea(evento: { clientX: number; clientY: number }) {
    const caixa = area.current!.getBoundingClientRect();
    return { x: evento.clientX - caixa.left, y: evento.clientY - caixa.top };
  }

  function tempoNoPonteiro(evento: { clientX: number }): Tick {
    const caixa = area.current!.getBoundingClientRect();
    return Math.max(0, ticks(evento.clientX - caixa.left));
  }

  /** Para onde vai um clipe da mídia `midia`, começando em `inicio`, com o ponteiro na altura `y`. */
  function destinoDoClipe(
    midia: Midia | undefined,
    inicio: Tick,
    ponteiro: Tick,
    y: number,
    faixaAtual?: string,
    texto = false,
  ): DestinoClipe & { inicio: Tick } {
    const alvo = destinoNaAltura(layoutOriginal.linhas, y);
    if (alvo.novaFaixa) return { inicio, novaFaixa: true };
    const faixa = alvo.faixa!;
    if (!aceita(faixa.tipo, midia, texto)) return { inicio, faixaId: faixaAtual };
    // Na principal o lugar é decidido pelo ponteiro, entre os clipes que já estão lá
    if (faixa.tipo === "principal") return { inicio: ponteiro, faixaId: faixa.id };
    return { inicio, faixaId: faixa.id };
  }

  function encaixar(inicio: Tick, duracao: Tick, ignorar: string[]): { inicio: Tick; guia: Tick | null } {
    if (!ima) return { inicio: Math.max(0, inicio), guia: null };
    const encaixe = encaixarIntervalo(inicio, duracao, pontosDeEncaixe(projeto, tempo, new Set(ignorar)), tolerancia);
    return { inicio: Math.max(0, encaixe.inicio), guia: encaixe.guia };
  }

  // -----------------------------------------------
  // Arrastar clipes (mover e aparar)
  // -----------------------------------------------
  function aoApertarClipe(evento: React.PointerEvent, clipe: Clipe, faixa: Faixa, borda?: "inicio" | "fim") {
    if (evento.button !== 0) return;
    // A Mão e o Zoom agem na linha do tempo inteira, também em cima dos clipes
    if (ferramentaEfetiva === "mao" || ferramentaEfetiva === "zoom") return;
    evento.stopPropagation();
    previsto.current = null;
    aoPrevisualizar?.(null);
    if (ferramentaEfetiva === "navalha") {
      const t = Math.min(Math.max(tempoNoPonteiro(evento), clipe.inicio), fimDoClipe(clipe));
      const ids = evento.shiftKey
        ? exibido.faixas.filter((item) => !item.travada).flatMap((item) => item.clipes.filter((c) => c.inicio < t && t < fimDoClipe(c)).map((c) => c.id))
        : [clipe.id];
      aoExecutar({ comando: "linha.dividir", parametros: { tempo: t, clipeIds: ids } });
      return;
    }
    if (ferramenta === "faixaAdiante" || ferramenta === "faixaAtras") {
      const faixas = evento.shiftKey ? exibido.faixas : [faixa];
      const escolhido = (c: Clipe) => (ferramenta === "faixaAdiante" ? c.inicio >= clipe.inicio : fimDoClipe(c) <= fimDoClipe(clipe));
      aoSelecionar(faixas.flatMap((item) => item.clipes.filter(escolhido).map((c) => c.id)));
      return;
    }
    const multiplo = evento.shiftKey || evento.ctrlKey || evento.metaKey;
    if (multiplo) {
      aoSelecionar(selecao.includes(clipe.id) ? selecao.filter((id) => id !== clipe.id) : [...selecao, clipe.id]);
      return;
    }
    if (!selecao.includes(clipe.id) || borda) aoSelecionar([clipe.id]);
    if (faixa.travada) return;
    evento.preventDefault();
    // A Edição contínua (N) e o Deslizar (Y) são o Alt + arrastar da Seleção
    const alt = evento.altKey || (ferramenta === "continua" && Boolean(borda)) || (ferramenta === "deslizar" && !borda);
    if (alt) {
      // O vizinho encostado do lado da borda: o corte entre os dois anda (o da esquerda guarda o corte)
      const vizinho = borda === "fim" ? faixa.clipes.find((item) => item.inicio === fimDoClipe(clipe)) : borda === "inicio" ? faixa.clipes.find((item) => fimDoClipe(item) === clipe.inicio) : undefined;
      if (vizinho) {
        trocarArrasto({ tipo: "corte", clipe: borda === "fim" ? clipe : vizinho, x0: evento.clientX, ativo: false, comando: null, guia: null });
        return;
      }
      const midia = midiaDoClipe(midias, clipe);
      if (!borda && midia && !midia.imagem) {
        trocarArrasto({ tipo: "deslizar", clipe, x0: evento.clientX, ativo: false, comando: null, guia: null });
        return;
      }
    }
    trocarArrasto(
      borda
        ? { tipo: "aparar", clipe, borda, jeito: ferramenta === "ondulacao" ? "ondulacao" : ferramenta === "velocidade" ? "esticar" : "aparar", x0: evento.clientX, ativo: false, comando: null, guia: null }
        : { tipo: "mover", clipe, faixaId: faixa.id, x0: evento.clientX, y0: evento.clientY, ativo: false, comando: null, guia: null },
    );
  }

  const arrastando = arrasto !== null && arrasto.tipo !== "soltar";

  const tratarMovimento = useEffectEvent((evento: PointerEvent) => {
    const atual = arrastoAtual.current;
    if (!atual || atual.tipo === "soltar") return;
    if (atual.tipo === "caixa") {
      const { x, y } = pontoNaArea(evento);
      if (!atual.ativo && Math.hypot(x - atual.x0, y - atual.y0) < LIMIAR_ARRASTO_PX) return;
      trocarArrasto({ ...atual, x1: x, y1: y, ativo: true });
      return;
    }
    if (atual.tipo === "volume") {
      const dyVolume = evento.clientY - atual.y0;
      if (!atual.ativo && Math.abs(dyVolume) < 2) return;
      const altura = alturaDoVolume(atual.clipe.volume) - dyVolume / Math.max(10, atual.alturaInterna);
      trocarArrasto({ ...atual, ativo: true, comando: { comando: "clipe.audio", parametros: { clipeIds: [atual.clipe.id], volume: volumeDaAltura(Math.min(1, Math.max(0, altura))) } } });
      return;
    }
    const dx = evento.clientX - atual.x0;
    const dy = atual.tipo === "mover" ? evento.clientY - atual.y0 : 0;
    if (!atual.ativo && Math.hypot(dx, dy) < LIMIAR_ARRASTO_PX) return;

    if (atual.tipo === "fade") {
      const { clipe } = atual;
      const quadro = duracaoDoQuadro(projeto.taxa);
      const campos =
        atual.lado === "entrada"
          ? { fade_entrada: fadeArrastado(clipe.fade_entrada, ticks(dx), clipe.duracao, clipe.fade_saida, quadro) }
          : { fade_saida: fadeArrastado(clipe.fade_saida, -ticks(dx), clipe.duracao, clipe.fade_entrada, quadro) };
      trocarArrasto({ ...atual, ativo: true, comando: { comando: "clipe.audio", parametros: { clipeIds: [clipe.id], ...campos } } });
    } else if (atual.tipo === "deslizar") {
      trocarArrasto({ ...atual, ativo: true, comando: { comando: "clipe.deslizar", parametros: { clipeId: atual.clipe.id, deslocamento: ticks(dx) } } });
    } else if (atual.tipo === "corte") {
      let alvo = Math.max(0, fimDoClipe(atual.clipe) + ticks(dx));
      let guia: Tick | null = null;
      if (ima) {
        const ponto = pontoMaisProximo(alvo, pontosDeEncaixe(projeto, tempo, new Set([atual.clipe.id])), tolerancia);
        if (ponto !== null) alvo = guia = ponto;
      }
      trocarArrasto({ ...atual, ativo: true, guia, comando: { comando: "clipe.moverCorte", parametros: { clipeId: atual.clipe.id, tempo: alvo } } });
    } else if (atual.tipo === "mover") {
      const { clipe } = atual;
      const { inicio, guia } = encaixar(clipe.inicio + ticks(dx), clipe.duracao, [clipe.id]);
      const destino = destinoDoClipe(midiaDoClipe(midias, clipe), inicio, tempoNoPonteiro(evento), pontoNaArea(evento).y, atual.faixaId, Boolean(clipe.texto));
      trocarArrasto({ ...atual, ativo: true, guia, comando: { comando: "clipe.mover", parametros: { clipeId: clipe.id, ...destino } } });
    } else {
      const { clipe, borda } = atual;
      const original = borda === "inicio" ? clipe.inicio : fimDoClipe(clipe);
      let alvo = Math.max(0, original + ticks(dx));
      let guia: Tick | null = null;
      if (ima) {
        const ponto = pontoMaisProximo(alvo, pontosDeEncaixe(projeto, tempo, new Set([clipe.id])), tolerancia);
        if (ponto !== null) alvo = guia = ponto;
      }
      const nome = atual.jeito === "ondulacao" ? "clipe.apararEmOndulacao" : atual.jeito === "esticar" ? "clipe.esticar" : "clipe.aparar";
      trocarArrasto({ ...atual, ativo: true, guia, comando: { comando: nome, parametros: { clipeId: clipe.id, borda, tempo: alvo } } });
    }
  });

  const tratarSoltura = useEffectEvent(() => {
    const atual = arrastoAtual.current;
    trocarArrasto(null);
    if (atual?.tipo === "caixa") {
      if (!atual.ativo) {
        // Um clique no vazio: tira a seleção e leva o cursor
        if (!atual.aditivo) aoSelecionar([]);
        aoBuscar(Math.min(Math.max(0, ticks(atual.x0)), exibido.duracao));
        return;
      }
      const [x0, x1] = [Math.min(atual.x0, atual.x1), Math.max(atual.x0, atual.x1)];
      const [y0, y1] = [Math.min(atual.y0, atual.y1), Math.max(atual.y0, atual.y1)];
      const dentro = layoutOriginal.linhas
        .filter((linha) => linha.topo < y1 && linha.topo + linha.altura > y0 && !linha.faixa.travada)
        .flatMap((linha) => linha.faixa.clipes.filter((c) => px(c.inicio) < x1 && px(fimDoClipe(c)) > x0).map((c) => c.id));
      aoSelecionar(atual.aditivo ? [...new Set([...selecao, ...dentro])] : dentro);
      return;
    }
    if (atual && atual.tipo !== "soltar" && atual.ativo && atual.comando) aoExecutar(atual.comando);
  });

  /** A alça de fade ou a linha de volume do clipe escolhido. */
  function aoApertarAudio(evento: React.PointerEvent, clipe: Clipe, alvo: "entrada" | "saida" | "volume", alturaInterna: number) {
    if (evento.button !== 0) return;
    evento.stopPropagation();
    evento.preventDefault();
    trocarArrasto(
      alvo === "volume"
        ? { tipo: "volume", clipe, y0: evento.clientY, alturaInterna, ativo: false, comando: null, guia: null }
        : { tipo: "fade", clipe, lado: alvo, x0: evento.clientX, ativo: false, comando: null, guia: null },
    );
  }

  /** A prévia segue o ponteiro sobre a linha do tempo (um pedido por quadro da tela). */
  function previsualizar(evento: { clientX: number } | null) {
    if (!evento) {
      setXDoMouse(null);
      if (previsto.current !== null) {
        previsto.current = null;
        aoPrevisualizar?.(null);
      }
      return;
    }
    const x = evento.clientX - area.current!.getBoundingClientRect().left;
    setXDoMouse(x);
    if (!seguirMouse || tocando || arrastoAtual.current || !aoPrevisualizar) return;
    const t = Math.min(Math.max(0, ticks(x)), exibido.duracao);
    if (previsto.current === t) return;
    previsto.current = t;
    aoPrevisualizar(t);
  }

  /** O menu do botão direito: num clipe (que fica escolhido) ou no vazio. */
  function abrirContexto(evento: React.MouseEvent, clipe: Clipe | null) {
    evento.preventDefault();
    evento.stopPropagation();
    previsualizar(null);
    if (clipe && !selecao.includes(clipe.id)) aoSelecionar([clipe.id]);
    setContexto({ x: evento.clientX, y: evento.clientY, tempo: Math.min(tempoNoPonteiro(evento), exibido.duracao), clipeId: clipe?.id ?? null });
  }

  // Os eventos ficam na janela: durante o arrasto o clipe pode trocar de faixa e ser recriado
  useEffect(() => {
    if (!arrastando) return;
    const mover = (evento: PointerEvent) => tratarMovimento(evento);
    const soltar = () => tratarSoltura();
    const cancelar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") trocarArrasto(null);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    window.addEventListener("keydown", cancelar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      window.removeEventListener("keydown", cancelar);
    };
  }, [arrastando]);

  // -----------------------------------------------
  // Soltar mídias da biblioteca
  // -----------------------------------------------
  /** O filtro, o efeito ou a transição arrastados do painel: o clipe sob o ponteiro (ou o corte mais perto) e o comando. */
  function comandoDoMaterial(evento: React.DragEvent): { comando: Comando; alvo: string } | null {
    const material = materialNoArrasto(evento.dataTransfer);
    if (!material) return null;
    const t = tempoNoPonteiro(evento);
    if (material.tipo === "transicao") {
      // O corte da principal mais perto do ponteiro, até 40 pixels
      const principal = exibido.faixas.find((faixa) => faixa.tipo === "principal");
      if (!principal || principal.travada) return null;
      let melhor: Clipe | null = null;
      for (const clipe of principal.clipes.slice(0, -1)) {
        if (Math.abs(px(fimDoClipe(clipe)) - px(t)) <= 40 && (!melhor || Math.abs(fimDoClipe(clipe) - t) < Math.abs(fimDoClipe(melhor) - t))) melhor = clipe;
      }
      if (!melhor) return null;
      const duracao = melhor.transicao?.duracao ?? Math.round(DURACAO_TRANSICAO_S * TICKS_POR_SEGUNDO);
      return { alvo: melhor.id, comando: { comando: "clipe.transicao", parametros: { clipeId: melhor.id, transicao: { tipo: material.id as TipoTransicao, duracao, misturar_som: Boolean(melhor.transicao?.misturar_som) } } } };
    }
    const linha = layoutOriginal.linhas.find((item) => { const y = pontoNaArea(evento).y; return y >= item.topo && y < item.topo + item.altura; });
    if (!linha || linha.faixa.travada || linha.faixa.tipo === "audio") return null;
    const clipe = linha.faixa.clipes.find((item) => item.inicio <= t && t < fimDoClipe(item));
    if (!clipe) return null;
    if (material.tipo === "filtro") return { alvo: clipe.id, comando: { comando: "clipe.cor", parametros: { clipeIds: [clipe.id], cor: { filtro: material.id } } } };
    if (clipe.texto && SO_EM_MIDIA.includes(material.id as TipoEfeito)) return null;
    return { alvo: clipe.id, comando: { comando: "clipe.efeito", parametros: { clipeIds: [clipe.id], efeito: { tipo: material.id as TipoEfeito, intensidade: clipe.efeito?.intensidade ?? INTENSIDADE_PADRAO } } } };
  }

  function aoPassarArrastando(evento: React.DragEvent) {
    if (materialNoArrasto(evento.dataTransfer)) {
      evento.preventDefault();
      const achado = comandoDoMaterial(evento);
      evento.dataTransfer.dropEffect = achado ? "copy" : "none";
      const atual = arrastoAtual.current;
      if (!achado) {
        if (atual?.tipo === "soltar") trocarArrasto(null);
        return;
      }
      if (atual?.tipo === "soltar" && atual.alvo === achado.alvo && JSON.stringify(atual.comando) === JSON.stringify(achado.comando)) return;
      trocarArrasto({ tipo: "soltar", comando: achado.comando, guia: null, alvo: achado.alvo });
      return;
    }
    const midiaId = midiaNoArrasto(evento.dataTransfer);
    if (!midiaId) return;
    evento.preventDefault();
    evento.dataTransfer.dropEffect = "copy";
    const info = ctx.midia(midiaId);
    if (!info) return;
    const ponteiro = tempoNoPonteiro(evento);
    const { inicio, guia } = encaixar(ponteiro, info.duracao, []);
    const destino = destinoDoClipe(midias.get(midiaId), inicio, ponteiro, pontoNaArea(evento).y);
    const comando: Comando = { comando: "clipe.adicionar", parametros: { midiaId, ...destino } };
    const atual = arrastoAtual.current;
    if (atual?.tipo === "soltar" && atual.guia === guia && JSON.stringify(atual.comando) === JSON.stringify(comando)) return;
    trocarArrasto({ tipo: "soltar", comando, guia });
  }

  function aoSairArrastando(evento: React.DragEvent) {
    if (area.current?.contains(evento.relatedTarget as Node | null)) return;
    if (arrastoAtual.current?.tipo === "soltar") trocarArrasto(null);
  }

  function aoSoltar(evento: React.DragEvent) {
    const atual = arrastoAtual.current;
    if (!midiaNoArrasto(evento.dataTransfer) && !materialNoArrasto(evento.dataTransfer)) return;
    evento.preventDefault();
    trocarArrasto(null);
    if (atual?.tipo === "soltar") aoExecutar(atual.comando);
  }

  // -----------------------------------------------
  // Régua e cursor
  // -----------------------------------------------
  function buscarNaRegua(evento: React.PointerEvent<HTMLDivElement>) {
    const caixa = evento.currentTarget.getBoundingClientRect();
    aoBuscar(Math.min(Math.max(0, ticks(evento.clientX - caixa.left)), Math.max(exibido.duracao, 0)));
  }

  const clipeSobCursor = exibido.faixas.some((faixa) =>
    faixa.clipes.some((clipe) => (selecao.length ? selecao.includes(clipe.id) : faixa.tipo === "principal") && tempo > clipe.inicio && tempo < fimDoClipe(clipe)),
  );
  const algumSelecionado = selecao.some((id) => acharClipe(exibido, id));
  const marcadorEditado = (exibido.marcadores ?? []).find((m) => m.id === marcadorAberto) ?? null;
  // Os vídeos escolhidos com som ainda junto da imagem
  const separaveis = selecao.filter((id) => {
    const achado = acharClipe(exibido, id);
    const midia = achado ? midiaDoClipe(midias, achado.clipe) : undefined;
    return achado && achado.faixa.tipo !== "audio" && !achado.clipe.som_separado && midia?.audio && midia.video && !midia.imagem;
  });
  const guia = arrasto && "guia" in arrasto ? arrasto.guia : null;

  /** O zoom que mostra o projeto inteiro na largura da linha do tempo. */
  function ajustarZoom() {
    const disponivel = Math.max(80, larguraVisivel - larguraRotulos - 32);
    setZoom(Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, disponivel / Math.max(1, exibido.duracao / TICKS_POR_SEGUNDO))));
    setVoltarAoInicio((vez) => vez + 1);
  }

  // O pedido de fora (Shift+Z) vale uma vez, depois das medidas da linha (o estado muda durante a renderização)
  const [ajusteVisto, setAjusteVisto] = useState(pedidoDeAjuste);
  if (pedidoDeAjuste !== ajusteVisto) {
    setAjusteVisto(pedidoDeAjuste);
    ajustarZoom();
  }

  function itensDoContexto(alvo: { tempo: Tick; clipeId: string | null }): ItemDoContexto[] {
    const comCopiar = aoCopiar ? [{ nome: "Copiar", atalho: "Ctrl+C", aoEscolher: aoCopiar }] : [];
    const comColar = aoColar ? [{ nome: "Colar no cursor", atalho: "Ctrl+V", aoEscolher: aoColar }] : [];
    if (!alvo.clipeId) {
      return [
        ...comColar,
        { nome: "Pôr um marcador aqui", atalho: "M", aoEscolher: () => aoExecutar({ comando: "marcador.adicionar", parametros: { tempo: alvo.tempo } }) },
        { nome: "Levar o cursor até aqui", aoEscolher: () => aoBuscar(alvo.tempo) },
        "-",
        { nome: "Escolher todos os clipes", aoEscolher: () => aoSelecionar(exibido.faixas.filter((f) => !f.travada).flatMap((f) => f.clipes.map((c) => c.id))) },
        { nome: "Ver o projeto inteiro", aoEscolher: ajustarZoom },
      ];
    }
    const achado = acharClipe(exibido, alvo.clipeId);
    if (!achado) return [];
    const { clipe, faixa } = achado;
    const midia = midiaDoClipe(midias, clipe);
    const ids = selecao.includes(clipe.id) ? selecao : [clipe.id];
    const temCursorDentro = tempo > clipe.inicio && tempo < fimDoClipe(clipe);
    const itens: ItemDoContexto[] = [
      ...comCopiar,
      ...comColar,
      { nome: "Duplicar", atalho: "Ctrl+Shift+/", aoEscolher: () => aoExecutar({ comando: "clipe.duplicar", parametros: { clipeIds: ids } }) },
      { nome: "Dividir no cursor", atalho: "Ctrl+K", desativado: !temCursorDentro, aoEscolher: () => aoExecutar({ comando: "linha.dividir", parametros: { tempo, clipeIds: [clipe.id] } }) },
      { nome: "Dividir aqui", aoEscolher: () => aoExecutar({ comando: "linha.dividir", parametros: { tempo: Math.min(Math.max(alvo.tempo, clipe.inicio), fimDoClipe(clipe)), clipeIds: [clipe.id] } }) },
      { nome: ids.length > 1 ? `Apagar os ${ids.length} clipes` : "Apagar", atalho: "Delete", aoEscolher: () => aoExecutar({ comando: "clipe.apagar", parametros: { clipeIds: ids } }) },
      "-",
    ];
    if (faixa.tipo !== "audio" && midia?.audio && midia.video && !midia.imagem) {
      itens.push(
        clipe.som_separado
          ? { nome: "Devolver o som ao vídeo", aoEscolher: () => aoExecutar({ comando: "clipe.devolverSom", parametros: { clipeIds: [clipe.id] } }) }
          : { nome: "Separar o som", aoEscolher: () => aoExecutar({ comando: "clipe.separarSom", parametros: { clipeIds: [clipe.id] } }) },
      );
    }
    if (aoCongelar && faixa.tipo === "principal" && temCursorDentro) itens.push({ nome: "Congelar o quadro do cursor", aoEscolher: aoCongelar });
    if (aoMelhorarClipes && midia) {
      // A IA no clipe (ou nos escolhidos): as melhorias que fazem sentido para ele
      const ehImagem = faixa.tipo !== "audio" && Boolean(midia.video) && !clipe.texto;
      const temSom = Boolean(midia.audio);
      if (ehImagem) itens.push({ nome: "IA: melhorar a cor", aoEscolher: () => aoMelhorarClipes("cor", ids) });
      if (temSom) itens.push({ nome: "IA: igualar o volume", aoEscolher: () => aoMelhorarClipes("volume", ids) });
      if (temSom && !midia.imagem) itens.push({ nome: "IA: limpar a voz", aoEscolher: () => aoMelhorarClipes("voz", ids) });
      if (faixa.tipo === "principal" && midia.video && !midia.imagem) itens.push({ nome: "IA: dividir nas trocas de cena", aoEscolher: () => aoMelhorarClipes("cenas", [clipe.id]) });
    }
    itens.push(
      { nome: "Ir ao começo do clipe", aoEscolher: () => aoBuscar(clipe.inicio) },
      { nome: "Ir ao fim do clipe", aoEscolher: () => aoBuscar(fimDoClipe(clipe)) },
      { nome: "Escolher todos da faixa", aoEscolher: () => aoSelecionar(faixa.clipes.map((c) => c.id)) },
      "-",
      { nome: faixa.travada ? "Destravar a faixa" : "Travar a faixa", aoEscolher: () => aoExecutar({ comando: "faixa.alternar", parametros: { faixaId: faixa.id, propriedade: "travada" } }) },
    );
    return itens;
  }

  return (
    <section aria-label="Linha do tempo" style={style} className={`isolate flex min-h-0 shrink-0 flex-col bg-painel ${className}`}>
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-borda px-2">
        {profissional ? (
          <span className="mr-2 font-mono text-lg font-medium tabular-nums text-codigo" title="O cursor da linha do tempo" aria-label="Código de tempo do cursor">
            {formatarTimecodeLongo(tempo, exibido.taxa)}
          </span>
        ) : null}
        {aoDesfazer && aoRefazer ? (
          <>
            <button type="button" className="botao-icone" disabled={!nomeDesfazer} onClick={aoDesfazer} title={nomeDesfazer ? `Desfazer ${nomeDesfazer} (Ctrl+Z)` : "Nada para desfazer"} aria-label="Desfazer">
              <Undo2 className="size-4" aria-hidden />
            </button>
            <button type="button" className="botao-icone" disabled={!nomeRefazer} onClick={aoRefazer} title={nomeRefazer ? `Refazer ${nomeRefazer} (Ctrl+Shift+Z)` : "Nada para refazer"} aria-label="Refazer">
              <Redo2 className="size-4" aria-hidden />
            </button>
            <span className="mx-1 h-5 w-px bg-borda" aria-hidden />
          </>
        ) : null}
        {profissional ? null : (
          <div className="mr-1 flex rounded-md bg-painel-2 p-0.5" role="group" aria-label="Modo do mouse">
            <button type="button" className={`grid size-7 place-items-center rounded ${modoDoMouse === "selecao" ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`} aria-pressed={modoDoMouse === "selecao"} onClick={() => setModoDoMouse("selecao")} title="Seleção: escolher, mover e aparar" aria-label="Seleção">
              <MousePointer2 className="size-4" aria-hidden />
            </button>
            <button type="button" className={`grid size-7 place-items-center rounded ${modoDoMouse === "navalha" ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`} aria-pressed={modoDoMouse === "navalha"} onClick={() => setModoDoMouse("navalha")} title="Dividir: o clique corta o clipe ali (Shift: todas as faixas)" aria-label="Dividir com o clique">
              <Scissors className="size-4" aria-hidden />
            </button>
          </div>
        )}
        <button
          type="button"
          className="botao-icone"
          disabled={!clipeSobCursor}
          onClick={() => aoExecutar({ comando: "linha.dividir", parametros: { tempo, clipeIds: selecao } })}
          title="Dividir no cursor (Ctrl+K)"
          aria-label="Dividir no cursor"
        >
          <Scissors className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="botao-icone"
          disabled={!algumSelecionado}
          onClick={() => aoExecutar({ comando: "clipe.apagar", parametros: { clipeIds: selecao } })}
          title="Apagar (Delete)"
          aria-label="Apagar os clipes escolhidos"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="botao-icone"
          disabled={!algumSelecionado}
          onClick={() => aoExecutar({ comando: "clipe.duplicar", parametros: { clipeIds: selecao } })}
          title="Duplicar (Ctrl+Shift+/)"
          aria-label="Duplicar os clipes escolhidos"
        >
          <Copy className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="botao-icone"
          disabled={!separaveis.length}
          onClick={() => aoExecutar({ comando: "clipe.separarSom", parametros: { clipeIds: separaveis } })}
          title="Separar o som do vídeo: ele vai para uma faixa de áudio, para cortes em J e em L"
          aria-label="Separar o som"
        >
          <Unlink className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="botao-icone"
          disabled={!aoCongelar}
          onClick={aoCongelar}
          title="Congelar o quadro do cursor (o vídeo para ali por 3 s)"
          aria-label="Congelar o quadro"
        >
          <Snowflake className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="botao-icone"
          onClick={() => aoExecutar({ comando: "marcador.adicionar", parametros: { tempo } })}
          title="Pôr um marcador no cursor (M)"
          aria-label="Pôr um marcador"
        >
          <Bookmark className="size-4" aria-hidden />
        </button>
        {marcadorEditado ? (
          <EditorDeMarcador
            key={marcadorEditado.id}
            marcador={marcadorEditado}
            aoMudar={(mudanca) => aoExecutar({ comando: "marcador.mudar", parametros: { id: marcadorEditado.id, ...mudanca } })}
            aoApagar={() => {
              aoExecutar({ comando: "marcador.apagar", parametros: { id: marcadorEditado.id } });
              setMarcadorAberto(null);
            }}
            aoFechar={() => setMarcadorAberto(null)}
          />
        ) : null}
        <button
          type="button"
          className={`botao-icone ${ima ? "text-destaque" : ""}`}
          onClick={aoAlternarIma}
          aria-pressed={ima}
          title={ima ? "Ímã ligado: os clipes grudam uns nos outros (S)" : "Ímã desligado (S)"}
          aria-label="Ímã"
        >
          <Magnet className="size-4" aria-hidden />
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          {aoPrevisualizar ? (
            <button
              type="button"
              className={`botao-icone ${seguirMouse ? "text-destaque" : ""}`}
              aria-pressed={seguirMouse === 1}
              onClick={() => setSeguirMouse(seguirMouse ? 0 : 1)}
              title={seguirMouse ? "A prévia segue o mouse sobre a linha do tempo (clique para desligar)" : "A prévia não segue o mouse (clique para ligar)"}
              aria-label="Prévia seguindo o mouse"
            >
              <ScanLine className="size-4" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            className="botao-icone"
            onClick={() => setEscalaDasFaixas(ESCALAS_DAS_FAIXAS[(ESCALAS_DAS_FAIXAS.indexOf(escalaDasFaixas) + 1) % ESCALAS_DAS_FAIXAS.length] ?? 100)}
            title={`Altura das faixas: ${escalaDasFaixas < 100 ? "compacta" : escalaDasFaixas > 100 ? "alta" : "normal"} (clique para trocar)`}
            aria-label="Altura das faixas"
          >
            <Rows3 className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            className="botao-icone"
            onClick={() => setCabecalhoRecolhido(cabecalhoRecolhido ? 0 : 1)}
            title={cabecalhoRecolhido ? "Mostrar os nomes das faixas" : "Recolher o cabeçalho das faixas"}
            aria-label={cabecalhoRecolhido ? "Mostrar os nomes das faixas" : "Recolher o cabeçalho das faixas"}
          >
            {cabecalhoRecolhido ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
          </button>
          <button type="button" className="botao-icone" onClick={ajustarZoom} title="Ver o projeto inteiro" aria-label="Ajustar o zoom ao projeto">
            <Maximize2 className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            className="botao-icone"
            onClick={() => setZoom((valor) => Math.max(ZOOM_MINIMO, valor / 1.5))}
            aria-label="Diminuir o zoom"
          >
            <ZoomOut className="size-4" aria-hidden />
          </button>
          <input
            type="range"
            min={Math.log(ZOOM_MINIMO)}
            max={Math.log(ZOOM_MAXIMO)}
            step={0.01}
            value={Math.log(zoom)}
            onChange={(evento) => setZoom(Math.exp(Number(evento.target.value)))}
            className="hidden w-24 accent-[var(--to-destaque)] sm:block"
            aria-label="Zoom da linha do tempo"
          />
          <button
            type="button"
            className="botao-icone"
            onClick={() => setZoom((valor) => Math.min(ZOOM_MAXIMO, valor * 1.5))}
            aria-label="Aumentar o zoom"
          >
            <ZoomIn className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div ref={rolagem} className="min-h-0 flex-1 overflow-auto">
        <div className="relative flex min-h-full" style={{ width: largura + larguraRotulos }}>
          <div className="sticky left-0 z-30 flex shrink-0 flex-col border-r border-borda bg-painel" style={{ width: larguraRotulos }}>
            <div className="sticky top-0 z-10 shrink-0 border-b border-borda bg-painel" style={{ height: ALTURA_REGUA }} />
            <div className="relative" style={{ height: layout.altura }}>
              {layout.linhas.map(({ faixa, topo, altura }) => (
                <CabecalhoDaFaixa
                  key={faixa.id}
                  faixa={faixa}
                  nome={nomeDaFaixa(faixa, exibido)}
                  codigo={profissional ? codigoDaFaixa(faixa, exibido) : undefined}
                  compacto={compacto}
                  topo={topo}
                  altura={altura}
                  aoAlternar={(propriedade) => aoExecutar({ comando: "faixa.alternar", parametros: { faixaId: faixa.id, propriedade } })}
                />
              ))}
            </div>
          </div>

          <div className="relative flex-1" style={{ width: largura }}>
            <div
              className="sticky top-0 z-20 cursor-pointer touch-none select-none border-b border-borda bg-painel"
              style={{ height: ALTURA_REGUA }}
              onPointerDown={(evento) => {
                evento.currentTarget.setPointerCapture(evento.pointerId);
                buscandoNaRegua.current = true;
                buscarNaRegua(evento);
              }}
              onPointerMove={(evento) => {
                if (buscandoNaRegua.current) buscarNaRegua(evento);
                else previsualizar(evento);
              }}
              onPointerLeave={() => previsualizar(null)}
              onPointerUp={() => {
                buscandoNaRegua.current = false;
              }}
              title="Clique ou arraste para mover o cursor"
            >
              {entradaSaida && (entradaSaida.entrada !== null || entradaSaida.saida !== null) ? (
                <span
                  className="pointer-events-none absolute inset-y-0 border-x-2 border-codigo bg-codigo/20"
                  style={{ left: px(entradaSaida.entrada ?? 0), width: Math.max(2, px((entradaSaida.saida ?? exibido.duracao) - (entradaSaida.entrada ?? 0))) }}
                  title="Entre a entrada e a saída"
                  aria-hidden
                />
              ) : null}
              {marcas.map((segundo) => (
                <span
                  key={segundo}
                  className="absolute top-0 flex h-full flex-col justify-end border-l border-borda pl-1 text-[10px] tabular-nums text-suave"
                  style={{ left: segundo * zoom }}
                >
                  {formatarTempo(segundo)}
                </span>
              ))}
              {(exibido.marcadores ?? []).map((marcador) => (
                <button
                  key={marcador.id}
                  type="button"
                  className="absolute top-0 z-20 -ml-[5px] h-3 w-[11px] rounded-b-sm"
                  style={{ left: px(marcador.t), backgroundColor: marcador.cor }}
                  title={`${marcador.nome} (clique para editar)`}
                  aria-label={`Marcador ${marcador.nome}`}
                  onPointerDown={(evento) => evento.stopPropagation()}
                  onClick={() => {
                    aoBuscar(marcador.t);
                    setMarcadorAberto(marcador.id);
                  }}
                />
              ))}
              <span className="absolute top-0 z-10 h-full w-px bg-texto" style={{ left: xCursor }} aria-hidden>
                <span className="absolute -left-[5px] top-0 size-[11px] rounded-sm bg-texto" />
              </span>
            </div>

            <div
              ref={area}
              className="relative"
              onPointerDown={(evento) => {
                if (evento.button !== 0) return;
                if (ferramentaEfetiva === "mao" && rolagem.current) {
                  evento.currentTarget.setPointerCapture(evento.pointerId);
                  andandoComAMao.current = { x: evento.clientX, rolagem: rolagem.current.scrollLeft };
                  return;
                }
                if (ferramentaEfetiva === "zoom" && rolagem.current) {
                  // O instante sob o ponteiro fica no mesmo lugar da tela
                  const t = tempoNoPonteiro(evento);
                  const naTela = evento.clientX - rolagem.current.getBoundingClientRect().left - larguraRotulos;
                  const novo = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, evento.altKey ? zoom / 1.5 : zoom * 1.5));
                  setZoom(novo);
                  const elemento = rolagem.current;
                  requestAnimationFrame(() => {
                    elemento.scrollLeft = (t / TICKS_POR_SEGUNDO) * novo - naTela;
                  });
                  return;
                }
                // Arrastar no vazio escolhe os clipes da caixa; o clique sem arrastar leva o cursor
                previsualizar(null);
                const ponto = pontoNaArea(evento);
                trocarArrasto({ tipo: "caixa", x0: ponto.x, y0: ponto.y, x1: ponto.x, y1: ponto.y, aditivo: evento.shiftKey || evento.ctrlKey || evento.metaKey, ativo: false, comando: null, guia: null });
              }}
              onPointerMove={(evento) => {
                const mao = andandoComAMao.current;
                if (mao && rolagem.current) rolagem.current.scrollLeft = mao.rolagem - (evento.clientX - mao.x);
                else if (!arrastoAtual.current) previsualizar(evento);
              }}
              onPointerLeave={() => previsualizar(null)}
              onContextMenu={(evento) => abrirContexto(evento, null)}
              onPointerUp={() => {
                andandoComAMao.current = null;
              }}
              style={{ height: layout.altura, cursor: CURSOR_DA_FERRAMENTA[ferramentaEfetiva] }}
              onDragOver={aoPassarArrastando}
              onDragLeave={aoSairArrastando}
              onDrop={aoSoltar}
            >
              {layout.linhas.map(({ faixa, topo, altura }) => (
                <div
                  key={faixa.id}
                  className={`absolute inset-x-0 border-b border-borda/60 ${faixa.tipo === "principal" ? "bg-texto/[0.03]" : ""}`}
                  style={{ top: topo, height: altura }}
                >
                  {faixa.tipo === "principal" && faixa.clipes.length === 0 ? (
                    aoImportar ? (
                      <button
                        type="button"
                        onPointerDown={(evento) => evento.stopPropagation()}
                        onClick={aoImportar}
                        className="absolute inset-y-1.5 left-1.5 flex items-center gap-2 rounded-md border border-dashed border-borda px-3 text-left text-[11px] text-suave transition hover:border-destaque hover:text-texto"
                        style={{ width: 320 }}
                      >
                        <Film className="size-4 shrink-0" aria-hidden />
                        Arraste uma mídia para cá ou clique para importar do computador
                      </button>
                    ) : (
                      <div className="pointer-events-none absolute inset-y-1.5 left-1.5 flex items-center rounded-md border border-dashed border-borda px-3 text-[11px] text-suave" style={{ width: 260 }}>
                        Arraste uma mídia da biblioteca para cá
                      </div>
                    )
                  ) : null}
                  {faixa.clipes.map((clipe) => (
                    <BlocoDoClipe
                      key={clipe.id}
                      clipe={clipe}
                      faixa={faixa}
                      midia={midiaDoClipe(midias, clipe)}
                      zoom={zoom}
                      esquerda={px(clipe.inicio)}
                      largura={Math.max(2, px(clipe.duracao))}
                      altura={altura}
                      selecionado={selecao.includes(clipe.id) || (arrasto?.tipo === "soltar" && arrasto.alvo === clipe.id)}
                      cursor={CURSOR_DA_FERRAMENTA[ferramentaEfetiva]}
                      aoApertar={(evento, borda) => aoApertarClipe(evento, clipe, faixa, borda)}
                      aoMenu={(evento) => abrirContexto(evento, clipe)}
                      aoApertarAudio={(evento, alvo, alturaInterna) => aoApertarAudio(evento, clipe, alvo, alturaInterna)}
                    />
                  ))}
                  {/* Batidas da música, depois de achadas na aba Áudio */}
                  {faixa.tipo === "audio" ? faixa.clipes.map((clipe) => <MarcasDoRitmo key={`r-${clipe.id}`} clipe={clipe} px={px} />) : null}
                  {/* Keyframes do clipe (de qualquer propriedade): clicar leva o cursor até o ponto */}
                  {faixa.clipes.flatMap((clipe) =>
                    [...new Set(CHAVES_DE_KEYFRAME.flatMap((p) => clipe.keyframes?.[p] ?? []).map((k) => k.t))]
                      .filter((t) => t >= 0 && t <= clipe.duracao)
                      .map((t) => (
                        <button
                          key={`k-${clipe.id}-${t}`}
                          type="button"
                          title="Keyframe"
                          aria-label="Ir para o keyframe"
                          onPointerDown={(evento) => evento.stopPropagation()}
                          onClick={() => {
                            aoSelecionar([clipe.id]);
                            aoBuscar(clipe.inicio + t);
                          }}
                          className="absolute bottom-0.5 z-10 grid size-3 -translate-x-1/2 place-items-center text-white drop-shadow"
                          style={{ left: px(clipe.inicio + t) }}
                        >
                          <Diamond className="size-2.5" fill="currentColor" aria-hidden />
                        </button>
                      )),
                  )}
                  {/* Marca de transição no corte: cobre metade antes e metade depois */}
                  {faixa.tipo === "principal"
                    ? faixa.clipes.map((clipe) =>
                        clipe.transicao ? (
                          <button
                            key={`t-${clipe.id}`}
                            type="button"
                            title={`Transição: ${TIPOS_TRANSICAO.find((tipo) => tipo.id === clipe.transicao!.tipo)?.nome ?? clipe.transicao.tipo}`}
                            aria-label="Transição para o próximo clipe"
                            onPointerDown={(evento) => evento.stopPropagation()}
                            onClick={() => aoSelecionar([clipe.id])}
                            className="absolute top-1/2 z-10 flex h-5 -translate-y-1/2 items-center justify-center rounded border border-white/70 bg-destaque/80 text-white shadow"
                            style={{ left: px(fimDoClipe(clipe) - clipe.transicao.duracao / 2), width: Math.max(10, px(clipe.transicao.duracao)) }}
                          >
                            <ArrowLeftRight className="size-3" aria-hidden />
                          </button>
                        ) : null,
                      )
                    : null}
                </div>
              ))}

              {guia !== null ? (
                <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-amber-300" style={{ left: px(guia) }} aria-hidden>
                  {/* O cursor avisa o encaixe: o ímã no alto da guia */}
                  <span className="absolute -left-2 top-0.5 grid size-4 place-items-center rounded-full bg-amber-300 text-black">
                    <Magnet className="size-2.5" aria-hidden />
                  </span>
                </div>
              ) : null}
              {arrasto?.tipo === "caixa" && arrasto.ativo ? (
                <div
                  className="pointer-events-none absolute z-20 rounded-sm border border-destaque bg-destaque/15"
                  style={{ left: Math.min(arrasto.x0, arrasto.x1), top: Math.min(arrasto.y0, arrasto.y1), width: Math.abs(arrasto.x1 - arrasto.x0), height: Math.abs(arrasto.y1 - arrasto.y0) }}
                  aria-hidden
                />
              ) : null}
              {xDoMouse !== null && seguirMouse && aoPrevisualizar && !tocando && !arrasto ? (
                <div className="pointer-events-none absolute inset-y-0 z-10 w-px border-l border-dashed border-texto/50" style={{ left: xDoMouse }} aria-hidden />
              ) : null}
              <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-texto" style={{ left: xCursor }} aria-hidden />
            </div>
          </div>
        </div>
      </div>
      {contexto ? <MenuDeContexto x={contexto.x} y={contexto.y} itens={itensDoContexto(contexto)} aoFechar={() => setContexto(null)} /> : null}
    </section>
  );
}

function CabecalhoDaFaixa({
  faixa,
  nome,
  codigo,
  compacto,
  topo,
  altura,
  aoAlternar,
}: {
  faixa: Faixa;
  nome: string;
  codigo?: string;
  compacto: boolean;
  topo: number;
  altura: number;
  aoAlternar: (propriedade: "oculta" | "muda" | "travada") => void;
}) {
  const Icone = { principal: Film, video: Layers, audio: Music, texto: Type, legenda: Captions }[faixa.tipo];
  const botao = "grid size-5 place-items-center rounded text-suave hover:bg-texto/10 hover:text-texto";
  return (
    <div
      className={`absolute inset-x-0 flex items-center gap-1 border-b border-borda/60 px-2 text-[11px] text-suave ${compacto ? "justify-end" : ""}`}
      style={{ top: topo, height: altura }}
      title={codigo ? `${codigo} · ${nome}` : nome}
    >
      {codigo ? (
        // Como nos editores profissionais: o cadeado primeiro, o código da faixa e depois os botões
        <>
          <button type="button" className={botao} onClick={() => aoAlternar("travada")} aria-pressed={faixa.travada} aria-label={faixa.travada ? `Destravar ${nome}` : `Travar ${nome}`} title={faixa.travada ? "Destravar a faixa" : "Travar a faixa"}>
            {faixa.travada ? <Lock className="size-3.5" aria-hidden /> : <LockOpen className="size-3.5" aria-hidden />}
          </button>
          <span className={`grid h-5 min-w-7 place-items-center rounded px-1 text-[11px] font-semibold ${faixa.tipo === "audio" ? "bg-sucesso/20 text-texto" : "bg-codigo/25 text-texto"}`}>{codigo}</span>
          {/* O nome fica na dica: a coluna estreita só mostra o tipo da faixa */}
          <Icone className="size-3 shrink-0 opacity-70" aria-hidden />
          <span className="flex-1" />
        </>
      ) : compacto ? null : (
        <>
          <Icone className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{nome}</span>
        </>
      )}
      {faixa.tipo !== "audio" ? (
        <button type="button" className={botao} onClick={() => aoAlternar("oculta")} aria-pressed={faixa.oculta} aria-label={faixa.oculta ? `Mostrar ${nome}` : `Esconder ${nome}`} title={faixa.oculta ? "Mostrar" : "Esconder"}>
          {faixa.oculta ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
        </button>
      ) : null}
      {/* Texto e legenda não têm som: o botão não fazia nada */}
      {faixa.tipo !== "texto" && faixa.tipo !== "legenda" ? (
        <button type="button" className={botao} onClick={() => aoAlternar("muda")} aria-pressed={faixa.muda} aria-label={faixa.muda ? `Ligar o som de ${nome}` : `Silenciar ${nome}`} title={faixa.muda ? "Ligar o som" : "Silenciar"}>
          {faixa.muda ? <VolumeX className="size-3.5" aria-hidden /> : <Volume2 className="size-3.5" aria-hidden />}
        </button>
      ) : null}
      {codigo ? null : (
        <button type="button" className={botao} onClick={() => aoAlternar("travada")} aria-pressed={faixa.travada} aria-label={faixa.travada ? `Destravar ${nome}` : `Travar ${nome}`} title={faixa.travada ? "Destravar" : "Travar"}>
          {faixa.travada ? <Lock className="size-3.5" aria-hidden /> : <LockOpen className="size-3.5" aria-hidden />}
        </button>
      )}
    </div>
  );
}

function BlocoDoClipe({
  clipe,
  faixa,
  midia,
  zoom,
  esquerda,
  largura,
  altura,
  selecionado,
  cursor,
  aoApertar,
  aoMenu,
  aoApertarAudio,
}: {
  clipe: Clipe;
  faixa: Faixa;
  midia: Midia | undefined;
  zoom: number;
  esquerda: number;
  largura: number;
  altura: number;
  selecionado: boolean;
  cursor?: string;
  aoApertar: (evento: React.PointerEvent, borda?: "inicio" | "fim") => void;
  aoMenu?: (evento: React.MouseEvent) => void;
  aoApertarAudio?: (evento: React.PointerEvent, alvo: "entrada" | "saida" | "volume", alturaInterna: number) => void;
}) {
  const audio = faixa.tipo === "audio";
  const texto = clipe.texto ?? null;
  const alturaInterna = altura - 6;
  // O som do clipe se mexe na própria linha do tempo quando ele está escolhido: as alças de fade e a linha de volume
  const temSom = audio ? Boolean(midia) : Boolean(midia?.audio && midia.video && !midia.imagem && !clipe.som_separado);
  const comAudio = Boolean(aoApertarAudio) && selecionado && temSom && !faixa.travada && alturaInterna >= 26 && largura > 40;
  const volumeFixo = !clipe.keyframes?.volume?.length;
  const larguraFadeEntrada = (clipe.fade_entrada / TICKS_POR_SEGUNDO) * zoom;
  const larguraFadeSaida = (clipe.fade_saida / TICKS_POR_SEGUNDO) * zoom;
  // Os selos do que o clipe tem: a velocidade, o efeito, a cor, as animações e os keyframes
  const selos: { texto: string; dica: string }[] = [];
  if (clipe.curva_velocidade?.length) selos.push({ texto: "curva", dica: "Velocidade em curva" });
  else if (Math.abs(clipe.velocidade - 1) > 0.001) selos.push({ texto: `${clipe.velocidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}×`, dica: `Velocidade ${clipe.velocidade.toLocaleString("pt-BR")}×` });
  if (clipe.inverter) selos.push({ texto: "◀", dica: "Ao contrário" });
  if (clipe.efeito) selos.push({ texto: "fx", dica: "Efeito" });
  if (clipe.cor && (!corNeutra(clipe.cor) || clipe.cor.filtro || clipe.cor.lut || clipe.cor.curvas || clipe.cor.hsl)) selos.push({ texto: "cor", dica: "Cor ajustada" });
  if (clipe.animacao && (clipe.animacao.entrada.tipo !== "nenhuma" || clipe.animacao.saida.tipo !== "nenhuma" || (clipe.animacao.loop && clipe.animacao.loop.tipo !== "nenhum"))) selos.push({ texto: "anim", dica: "Animação" });
  if (CHAVES_DE_KEYFRAME.some((chave) => clipe.keyframes?.[chave]?.length)) selos.push({ texto: "◆", dica: "Keyframes" });
  const nome = texto ? resumoDoTexto(texto) : clipe.ajuste ? "Camada de ajuste" : (midia?.nome ?? "Mídia não encontrada");
  const cores = faixa.tipo === "legenda"
    ? "border-violet-400/50 bg-violet-900/60 text-violet-100"
    : clipe.ajuste
    ? "border-fuchsia-400/50 bg-fuchsia-900/50 text-fuchsia-100"
    : texto
    ? "border-amber-400/50 bg-amber-900/60 text-amber-100"
    : audio
      ? "border-emerald-500/40 bg-emerald-900/50 text-emerald-300/70"
      : "border-sky-500/30 bg-sky-950";
  return (
    <div
      className={`absolute top-[3px] touch-none select-none overflow-hidden rounded-md border ${
        cores
      } ${selecionado ? "z-10 outline outline-2 -outline-offset-1 outline-white" : ""} ${faixa.travada ? "cursor-not-allowed opacity-70" : "cursor-grab active:cursor-grabbing"} ${
        faixa.oculta || faixa.muda ? "opacity-50" : ""
      }`}
      style={{ left: esquerda, width: largura, height: alturaInterna, cursor }}
      onPointerDown={(evento) => aoApertar(evento)}
      onContextMenu={aoMenu}
      title={nome}
    >
      {midia ? (
        audio ? (
          <FormaDeOndaDoClipe midia={midia} clipe={clipe} zoom={zoom} largura={largura} altura={alturaInterna - 12} />
        ) : (
          <>
            <MiniaturasDoClipe midia={midia} clipe={clipe} zoom={zoom} largura={largura} altura={alturaInterna} />
            {midia.audio && !clipe.som_separado ? <FormaDeOndaDoClipe midia={midia} clipe={clipe} zoom={zoom} largura={largura} altura={Math.round(alturaInterna / 3)} className="text-white/45" /> : null}
          </>
        )
      ) : null}
      <span className="pointer-events-none absolute left-1.5 top-0.5 max-w-[calc(100%-12px)] truncate rounded bg-black/50 px-1 text-[10px] leading-4 text-white/90">
        {nome}
      </span>
      {selos.length && largura > 60 ? (
        <span className="pointer-events-none absolute bottom-0.5 right-1 flex gap-0.5" aria-label={`Ajustes: ${selos.map((selo) => selo.dica).join(", ")}`}>
          {selos.map((selo) => (
            <span key={selo.dica} className="rounded bg-black/60 px-1 text-[9px] font-semibold leading-[14px] text-white/90" title={selo.dica}>
              {selo.texto}
            </span>
          ))}
        </span>
      ) : null}
      {comAudio ? (
        <>
          {/* As rampas dos fades e as alças no alto, para arrastar */}
          <svg className="pointer-events-none absolute inset-0 size-full" preserveAspectRatio="none" viewBox={`0 0 ${Math.max(1, largura)} ${alturaInterna}`} aria-hidden>
            {larguraFadeEntrada > 0 ? <polygon points={`0,0 ${larguraFadeEntrada},0 0,${alturaInterna}`} fill="rgb(0 0 0 / 0.45)" /> : null}
            {larguraFadeSaida > 0 ? <polygon points={`${largura},0 ${largura - larguraFadeSaida},0 ${largura},${alturaInterna}`} fill="rgb(0 0 0 / 0.45)" /> : null}
          </svg>
          <span
            className="absolute top-0.5 z-20 size-2.5 -translate-x-1/2 cursor-ew-resize rounded-full border border-black/40 bg-white"
            style={{ left: Math.max(6, larguraFadeEntrada) }}
            onPointerDown={(evento) => aoApertarAudio!(evento, "entrada", alturaInterna)}
            title={`Fade de entrada: ${(clipe.fade_entrada / TICKS_POR_SEGUNDO).toFixed(2).replace(".", ",")} s (arraste)`}
            aria-label="Fade de entrada"
          />
          <span
            className="absolute top-0.5 z-20 size-2.5 translate-x-1/2 cursor-ew-resize rounded-full border border-black/40 bg-white"
            style={{ right: Math.max(6, larguraFadeSaida) }}
            onPointerDown={(evento) => aoApertarAudio!(evento, "saida", alturaInterna)}
            title={`Fade de saída: ${(clipe.fade_saida / TICKS_POR_SEGUNDO).toFixed(2).replace(".", ",")} s (arraste)`}
            aria-label="Fade de saída"
          />
          {volumeFixo ? (
            <span
              className="group/vol absolute inset-x-2 z-10 h-2 -translate-y-1/2 cursor-ns-resize"
              style={{ top: (1 - alturaDoVolume(clipe.volume)) * alturaInterna }}
              onPointerDown={(evento) => aoApertarAudio!(evento, "volume", alturaInterna)}
              title={`Volume: ${textoDoVolume(clipe.volume)} (arraste para cima ou para baixo)`}
              aria-label="Volume do clipe"
            >
              <span className="absolute inset-x-0 top-1/2 h-px bg-amber-300 group-hover/vol:h-0.5" />
              <span className="absolute -top-3.5 right-0 hidden rounded bg-black/70 px-1 text-[9px] leading-[14px] text-white group-hover/vol:block">{textoDoVolume(clipe.volume)}</span>
            </span>
          ) : null}
        </>
      ) : null}
      {selecionado && !faixa.travada && largura > 14 ? (
        <>
          <span
            className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize rounded-l-md bg-white"
            onPointerDown={(evento) => aoApertar(evento, "inicio")}
            aria-label="Aparar o começo"
          />
          <span
            className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize rounded-r-md bg-white"
            onPointerDown={(evento) => aoApertar(evento, "fim")}
            aria-label="Aparar o fim"
          />
        </>
      ) : null}
    </div>
  );
}

/** O nome e a cor de um marcador, na barra da linha do tempo. */
function EditorDeMarcador({
  marcador,
  aoMudar,
  aoApagar,
  aoFechar,
}: {
  marcador: Marcador;
  aoMudar: (mudanca: { nome?: string; cor?: string }) => void;
  aoApagar: () => void;
  aoFechar: () => void;
}) {
  const [nome, setNome] = useState(marcador.nome);
  return (
    <div className="flex items-center gap-1 rounded-md border border-borda bg-painel-2 px-1.5 py-0.5" role="group" aria-label="Marcador">
      <input
        value={nome}
        maxLength={60}
        onChange={(evento) => setNome(evento.currentTarget.value)}
        onBlur={() => nome.trim() !== marcador.nome && aoMudar({ nome })}
        onKeyDown={(evento) => {
          evento.stopPropagation();
          if (evento.key === "Enter") evento.currentTarget.blur();
          if (evento.key === "Escape") aoFechar();
        }}
        aria-label="Nome do marcador"
        className="w-28 rounded border border-borda bg-painel px-1.5 py-0.5 text-xs outline-none focus:border-destaque"
      />
      {CORES_DOS_MARCADORES.map((cor) => (
        <button
          key={cor}
          type="button"
          className={`size-3.5 rounded-full ${marcador.cor === cor ? "ring-2 ring-texto" : ""}`}
          style={{ backgroundColor: cor }}
          onClick={() => aoMudar({ cor })}
          aria-label={`Cor ${cor}`}
          aria-pressed={marcador.cor === cor}
        />
      ))}
      <button type="button" className="botao-icone size-6" onClick={aoApagar} aria-label="Apagar o marcador" title="Apagar o marcador">
        <Trash2 className="size-3.5" aria-hidden />
      </button>
      <button type="button" className="botao-icone size-6 text-xs" onClick={aoFechar} aria-label="Fechar">
        ✓
      </button>
    </div>
  );
}
