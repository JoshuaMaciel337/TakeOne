"use client";

import {
  Captions,
  Copy,
  Eye,
  EyeOff,
  Film,
  Layers,
  Lock,
  LockOpen,
  Magnet,
  Music,
  Scissors,
  Type,
  Trash2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { midiaNoArrasto } from "@/lib/arrasto";
import { formatarTempo } from "@/lib/formatar";
import { type Comando, executarComando } from "@/lib/projeto/comandos";
import type { Contexto, DestinoClipe } from "@/lib/projeto/edicao";
import { encaixarIntervalo, pontoMaisProximo, pontosDeEncaixe } from "@/lib/projeto/ima";
import { acharClipe, type Clipe, type Faixa, faixaDeTexto, fimDoClipe, type Projeto, type TipoFaixa } from "@/lib/projeto/modelo";
import { resumoDoTexto } from "@/lib/projeto/texto";
import { type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

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

function montarLinhas(projeto: Projeto): { linhas: Linha[]; altura: number } {
  let topo = ALTURA_ZONA_NOVA;
  const linhas = projeto.faixas.map((faixa) => {
    const linha = { faixa, topo, altura: ALTURAS[faixa.tipo] };
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
  | { tipo: "aparar"; clipe: Clipe; borda: "inicio" | "fim"; x0: number; ativo: boolean; comando: Comando | null; guia: Tick | null }
  | { tipo: "soltar"; comando: Comando; guia: Tick | null };

function nomeDaFaixa(faixa: Faixa, projeto: Projeto): string {
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
  className = "",
  style,
}: Props) {
  const [zoom, setZoom] = useState(40);
  const rolagem = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [larguraVisivel, setLarguraVisivel] = useState(0);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const arrastoAtual = useRef<Arrasto | null>(null);
  const buscandoNaRegua = useRef(false);

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

  // Em tela estreita, o cabeçalho da faixa fica só com os botões
  const compacto = larguraVisivel > 0 && larguraVisivel < LARGURA_TELA_ESTREITA;
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

  const layoutOriginal = useMemo(() => montarLinhas(projeto), [projeto]);
  const layout = useMemo(() => montarLinhas(exibido), [exibido]);

  const px = (t: Tick) => (t / TICKS_POR_SEGUNDO) * zoom;
  const ticks = (pixels: number) => (pixels / zoom) * TICKS_POR_SEGUNDO;
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
    evento.stopPropagation();
    const multiplo = evento.shiftKey || evento.ctrlKey || evento.metaKey;
    if (multiplo) {
      aoSelecionar(selecao.includes(clipe.id) ? selecao.filter((id) => id !== clipe.id) : [...selecao, clipe.id]);
      return;
    }
    if (!selecao.includes(clipe.id) || borda) aoSelecionar([clipe.id]);
    if (faixa.travada) return;
    evento.preventDefault();
    trocarArrasto(
      borda
        ? { tipo: "aparar", clipe, borda, x0: evento.clientX, ativo: false, comando: null, guia: null }
        : { tipo: "mover", clipe, faixaId: faixa.id, x0: evento.clientX, y0: evento.clientY, ativo: false, comando: null, guia: null },
    );
  }

  const arrastando = arrasto !== null && arrasto.tipo !== "soltar";

  const tratarMovimento = useEffectEvent((evento: PointerEvent) => {
    const atual = arrastoAtual.current;
    if (!atual || atual.tipo === "soltar") return;
    const dx = evento.clientX - atual.x0;
    const dy = atual.tipo === "mover" ? evento.clientY - atual.y0 : 0;
    if (!atual.ativo && Math.hypot(dx, dy) < LIMIAR_ARRASTO_PX) return;

    if (atual.tipo === "mover") {
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
      trocarArrasto({ ...atual, ativo: true, guia, comando: { comando: "clipe.aparar", parametros: { clipeId: clipe.id, borda, tempo: alvo } } });
    }
  });

  const tratarSoltura = useEffectEvent(() => {
    const atual = arrastoAtual.current;
    trocarArrasto(null);
    if (atual && atual.tipo !== "soltar" && atual.ativo && atual.comando) aoExecutar(atual.comando);
  });

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
  function aoPassarArrastando(evento: React.DragEvent) {
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
    if (!midiaNoArrasto(evento.dataTransfer)) return;
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
  const guia = arrasto && "guia" in arrasto ? arrasto.guia : null;

  return (
    <section aria-label="Linha do tempo" style={style} className={`flex min-h-0 shrink-0 flex-col bg-painel ${className}`}>
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-borda px-2">
        <button
          type="button"
          className="botao-icone"
          disabled={!clipeSobCursor}
          onClick={() => aoExecutar({ comando: "linha.dividir", parametros: { tempo, clipeIds: selecao } })}
          title="Dividir no cursor (S ou Ctrl+B)"
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
          title="Duplicar (Ctrl+D)"
          aria-label="Duplicar os clipes escolhidos"
        >
          <Copy className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className={`botao-icone ${ima ? "text-destaque" : ""}`}
          onClick={aoAlternarIma}
          aria-pressed={ima}
          title={ima ? "Ímã ligado: os clipes grudam uns nos outros (N)" : "Ímã desligado (N)"}
          aria-label="Ímã"
        >
          <Magnet className="size-4" aria-hidden />
        </button>
        <div className="ml-auto flex items-center gap-1.5">
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
              }}
              onPointerUp={() => {
                buscandoNaRegua.current = false;
              }}
              title="Clique ou arraste para mover o cursor"
            >
              {marcas.map((segundo) => (
                <span
                  key={segundo}
                  className="absolute top-0 flex h-full flex-col justify-end border-l border-borda pl-1 text-[10px] tabular-nums text-suave"
                  style={{ left: segundo * zoom }}
                >
                  {formatarTempo(segundo)}
                </span>
              ))}
              <span className="absolute top-0 z-10 h-full w-px bg-white" style={{ left: xCursor }} aria-hidden>
                <span className="absolute -left-[5px] top-0 size-[11px] rounded-sm bg-white" />
              </span>
            </div>

            <div
              ref={area}
              className="relative"
              style={{ height: layout.altura }}
              onPointerDown={(evento) => {
                if (evento.button !== 0) return;
                aoSelecionar([]);
                aoBuscar(Math.min(tempoNoPonteiro(evento), exibido.duracao));
              }}
              onDragOver={aoPassarArrastando}
              onDragLeave={aoSairArrastando}
              onDrop={aoSoltar}
            >
              {layout.linhas.map(({ faixa, topo, altura }) => (
                <div
                  key={faixa.id}
                  className={`absolute inset-x-0 border-b border-borda/60 ${faixa.tipo === "principal" ? "bg-white/[0.03]" : ""}`}
                  style={{ top: topo, height: altura }}
                >
                  {faixa.tipo === "principal" && faixa.clipes.length === 0 ? (
                    <div className="pointer-events-none absolute inset-y-1.5 left-1.5 flex items-center rounded-md border border-dashed border-borda px-3 text-[11px] text-suave" style={{ width: 260 }}>
                      Arraste uma mídia da biblioteca para cá
                    </div>
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
                      selecionado={selecao.includes(clipe.id)}
                      aoApertar={(evento, borda) => aoApertarClipe(evento, clipe, faixa, borda)}
                    />
                  ))}
                </div>
              ))}

              {guia !== null ? <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-amber-300" style={{ left: px(guia) }} aria-hidden /> : null}
              <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white" style={{ left: xCursor }} aria-hidden />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CabecalhoDaFaixa({
  faixa,
  nome,
  compacto,
  topo,
  altura,
  aoAlternar,
}: {
  faixa: Faixa;
  nome: string;
  compacto: boolean;
  topo: number;
  altura: number;
  aoAlternar: (propriedade: "oculta" | "muda" | "travada") => void;
}) {
  const Icone = { principal: Film, video: Layers, audio: Music, texto: Type, legenda: Captions }[faixa.tipo];
  const botao = "grid size-5 place-items-center rounded text-suave hover:bg-white/10 hover:text-texto";
  return (
    <div
      className={`absolute inset-x-0 flex items-center gap-1 border-b border-borda/60 px-2 text-[11px] text-suave ${compacto ? "justify-end" : ""}`}
      style={{ top: topo, height: altura }}
      title={nome}
    >
      {compacto ? null : (
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
      <button type="button" className={botao} onClick={() => aoAlternar("muda")} aria-pressed={faixa.muda} aria-label={faixa.muda ? `Ligar o som de ${nome}` : `Silenciar ${nome}`} title={faixa.muda ? "Ligar o som" : "Silenciar"}>
        {faixa.muda ? <VolumeX className="size-3.5" aria-hidden /> : <Volume2 className="size-3.5" aria-hidden />}
      </button>
      <button type="button" className={botao} onClick={() => aoAlternar("travada")} aria-pressed={faixa.travada} aria-label={faixa.travada ? `Destravar ${nome}` : `Travar ${nome}`} title={faixa.travada ? "Destravar" : "Travar"}>
        {faixa.travada ? <Lock className="size-3.5" aria-hidden /> : <LockOpen className="size-3.5" aria-hidden />}
      </button>
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
  aoApertar,
}: {
  clipe: Clipe;
  faixa: Faixa;
  midia: Midia | undefined;
  zoom: number;
  esquerda: number;
  largura: number;
  altura: number;
  selecionado: boolean;
  aoApertar: (evento: React.PointerEvent, borda?: "inicio" | "fim") => void;
}) {
  const audio = faixa.tipo === "audio";
  const texto = clipe.texto ?? null;
  const alturaInterna = altura - 6;
  const nome = texto ? resumoDoTexto(texto) : (midia?.nome ?? "Mídia não encontrada");
  const cores = faixa.tipo === "legenda"
    ? "border-violet-400/50 bg-violet-900/60 text-violet-100"
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
      style={{ left: esquerda, width: largura, height: alturaInterna }}
      onPointerDown={(evento) => aoApertar(evento)}
      title={nome}
    >
      {midia ? (
        audio ? (
          <FormaDeOndaDoClipe midia={midia} clipe={clipe} zoom={zoom} largura={largura} altura={alturaInterna - 12} />
        ) : (
          <>
            <MiniaturasDoClipe midia={midia} clipe={clipe} zoom={zoom} largura={largura} altura={alturaInterna} />
            {midia.audio ? <FormaDeOndaDoClipe midia={midia} clipe={clipe} zoom={zoom} largura={largura} altura={Math.round(alturaInterna / 3)} className="text-white/45" /> : null}
          </>
        )
      ) : null}
      <span className="pointer-events-none absolute left-1.5 top-0.5 max-w-[calc(100%-12px)] truncate rounded bg-black/50 px-1 text-[10px] leading-4 text-white/90">
        {nome}
      </span>
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
