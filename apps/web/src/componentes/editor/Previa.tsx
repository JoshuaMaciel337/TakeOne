"use client";

import { Maximize, Pause, Play, TriangleAlert } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { type Caixa, caixaDoClipe, caixaDoTexto, contemPonto, type Guias, type Tamanho } from "@/lib/projeto/geometria";
import { type Clipe, type Faixa, faixaDeTexto, fimDoClipe, type Projeto, type Recorte, tempoNaMidia, type Transformacao } from "@/lib/projeto/modelo";
import { Compositor } from "@/lib/previa/compositor";
import { transformacaoAnimada } from "@/lib/projeto/animacao";
import { useImagensDeTexto } from "@/lib/previa/imagensDeTexto";
import { formatarTimecode, type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

import { type FonteDeQuadros, FonteDoClipe, type ItemDaPrevia, SomDoClipe } from "./FontesDaPrevia";
import { ManipuladorNaPrevia } from "./ManipuladorNaPrevia";
import { razao } from "./proporcoes";

type Props = {
  /** O projeto como deve aparecer, já com a mudança em curso (arrasto na prévia ou no painel). */
  projeto: Projeto;
  midias: ReadonlyMap<string, Midia>;
  tempo: Tick;
  tocando: boolean;
  aoAlternar: () => void;
  selecao: string[];
  aoSelecionar: (ids: string[]) => void;
  /** Mudança provisória durante um gesto na prévia; `null` quando o gesto termina. */
  aoPrever: (clipeId: string, mudanca: Partial<Transformacao> | null) => void;
  aoTransformar: (clipeId: string, mudanca: Partial<Transformacao>) => void;
  className?: string;
};

/** O próximo clipe da faixa começa a carregar quando falta isto para ele entrar. */
const ANTECEDENCIA = 2 * TICKS_POR_SEGUNDO;
/** Quanto a prévia espera um vídeo carregar o quadro antes de desenhar sem ele. */
const ESPERA_QUADRO_MS = 400;
/** Densidade máxima de pixels do canvas: acima disso o custo cresce e a diferença não aparece. */
const DENSIDADE_MAXIMA = 2;

/** Mede a área livre e calcula o maior quadro na proporção do projeto que cabe nela. */
function useQuadro(proporcao: Projeto["proporcao"]) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [tamanho, setTamanho] = useState<Tamanho>({ largura: 0, altura: 0 });

  useEffect(() => {
    const elemento = areaRef.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => {
      const { width, height } = entrada.contentRect;
      const largura = Math.min(width, height * razao(proporcao));
      setTamanho({ largura: Math.floor(largura), altura: Math.floor(largura / razao(proporcao)) });
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [proporcao]);

  return { areaRef, tamanho };
}

type Item = ItemDaPrevia;

/**
 * Clipes que precisam de um elemento agora: o que está sob o cursor e o próximo da mesma faixa, para
 * ele já estar carregado quando entrar. A chave é faixa + mídia: depois de dividir um clipe, as duas
 * metades usam o mesmo elemento e o vídeo segue sem engasgar.
 */
function itensNoTempo(faixas: Faixa[], midias: ReadonlyMap<string, Midia>, tempo: Tick): Item[] {
  const itens: Item[] = [];
  for (const faixa of faixas) {
    const chaves = new Set<string>();
    const atual = faixa.clipes.find((clipe) => clipe.inicio <= tempo && tempo < fimDoClipe(clipe));
    const proximo = faixa.clipes.find((clipe) => clipe.inicio > tempo && clipe.inicio - tempo <= ANTECEDENCIA && clipe.midia_id !== atual?.midia_id);
    for (const [clipe, ativo] of [
      [atual, true],
      [proximo, false],
    ] as const) {
      const midia = clipe?.midia_id ? midias.get(clipe.midia_id) : undefined;
      if (!clipe || midia?.status !== "pronta") continue;
      const chave = `${faixa.id}:${clipe.midia_id}`;
      if (chaves.has(chave)) continue;
      chaves.add(chave);
      itens.push({ chave, clipe, faixa, midia, ativo });
    }
  }
  return itens;
}

/** Tamanho da imagem da mídia, já com a rotação do celular aplicada (a ingestão guarda assim). */
function tamanhoDaMidia(midia: Midia): Tamanho | null {
  return midia.video && midia.video.largura > 0 && midia.video.altura > 0 ? { largura: midia.video.largura, altura: midia.video.altura } : null;
}

/** Uma camada do quadro atual, de baixo para cima. */
/** `segundos` é o instante da mídia que aparece agora. */
type CamadaNaTela = {
  chave: string;
  clipe: Clipe;
  faixa: Faixa;
  recorte: Recorte;
  /** Onde a camada aparece agora, com a animação. */
  caixa: Caixa;
  /** Sem a animação: é nela que as alças da prévia mexem. */
  caixaBase: Caixa;
  segundos: number;
  /** Clipes de texto já trazem a imagem; os de vídeo pegam o quadro da fonte deles. */
  imagem?: ImageBitmap;
};

type EstadoDoDesenho = {
  camadas: CamadaNaTela[];
  fundo: string;
  quadro: Tamanho;
  tocando: boolean;
  /** Algo mudou desde o último desenho. */
  sujo: boolean;
};

function webgl2Disponivel(): boolean {
  try {
    return typeof document !== "undefined" && Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

export function Previa({ projeto, midias, tempo, tocando, aoAlternar, selecao, aoSelecionar, aoPrever, aoTransformar, className = "" }: Props) {
  const { areaRef, tamanho } = useQuadro(projeto.proporcao);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [suportado] = useState(webgl2Disponivel);
  const [guias, setGuias] = useState<Guias | null>(null);
  const fontes = useRef(new Map<string, FonteDeQuadros>());
  const desenho = useRef<EstadoDoDesenho>({ camadas: [], fundo: "#000000", quadro: tamanho, tocando: false, sujo: true });

  // A primeira faixa da lista é a de cima; no quadro ela tem que ser desenhada por último
  const visuais = itensNoTempo(
    projeto.faixas.filter((faixa) => faixa.tipo !== "audio" && !faixa.oculta).reverse(),
    midias,
    tempo,
  );
  // O som vem de todas as faixas com áudio: as de áudio e as de vídeo visíveis
  const sons = itensNoTempo(
    projeto.faixas.filter((faixa) => !faixa.muda && (faixa.tipo === "audio" || !faixa.oculta)),
    midias,
    tempo,
  ).filter((item) => item.midia.audio);
  const camadas: CamadaNaTela[] = [];
  for (const item of visuais) {
    const tamanhoMidia = tamanhoDaMidia(item.midia);
    if (!item.ativo || !tamanhoMidia || tamanho.largura <= 0) continue;
    const { clipe, faixa, chave } = item;
    camadas.push({
      chave,
      clipe,
      faixa,
      recorte: clipe.recorte,
      caixa: caixaDoClipe(transformacaoAnimada(clipe, tempo), clipe.recorte, tamanhoMidia, tamanho),
      caixaBase: caixaDoClipe(clipe.transformacao, clipe.recorte, tamanhoMidia, tamanho),
      segundos: tempoNaMidia(clipe, tempo) / TICKS_POR_SEGUNDO,
    });
  }
  // Os textos ficam por cima de todas as faixas de vídeo (a faixa de texto é sempre a de cima)
  const faixasDeTexto = projeto.faixas.filter((faixa) => faixaDeTexto(faixa.tipo) && !faixa.oculta);
  const imagensDeTexto = useImagensDeTexto(
    faixasDeTexto.flatMap((faixa) => faixa.clipes.flatMap((clipe) => (clipe.texto ? [{ id: clipe.id, texto: clipe.texto }] : []))),
  );
  for (const faixa of [...faixasDeTexto].reverse()) {
    const clipe = faixa.clipes.find((item) => item.inicio <= tempo && tempo < fimDoClipe(item));
    const imagem = clipe ? imagensDeTexto.get(clipe.id) : undefined;
    if (!clipe || !imagem || tamanho.largura <= 0) continue;
    camadas.push({
      chave: `texto:${clipe.id}`,
      clipe,
      faixa,
      recorte: clipe.recorte,
      caixa: caixaDoTexto(transformacaoAnimada(clipe, tempo), imagem, tamanho),
      caixaBase: caixaDoTexto(clipe.transformacao, imagem, tamanho),
      segundos: 0,
      imagem: imagem.bitmap,
    });
  }
  const vazio = projeto.faixas.every((faixa) => faixa.clipes.length === 0);
  const selecionada = selecao.length === 1 ? camadas.find((camada) => camada.clipe.id === selecao[0]) : undefined;

  useLayoutEffect(() => {
    desenho.current = { camadas, fundo: projeto.fundo.cor, quadro: tamanho, tocando, sujo: true };
  });

  // Laço de desenho: a cada quadro da tela enquanto toca; parado, só quando algo muda
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !suportado) return;
    const compositor = new Compositor(canvas);
    let pedido = 0;
    let incompletoDesde = 0;

    const desenhar = () => {
      pedido = requestAnimationFrame(desenhar);
      const estado = desenho.current;
      if (!estado.sujo && !estado.tocando) return;
      const prontas = [];
      let faltando = false;
      for (const camada of estado.camadas) {
        const quadro = camada.imagem ?? fontes.current.get(camada.chave)?.quadro(camada.segundos);
        if (!quadro) {
          faltando = true;
          continue;
        }
        prontas.push({ fonte: quadro, recorte: camada.recorte, caixa: camada.caixa });
      }
      // Enquanto um vídeo carrega, fica o quadro anterior em vez de piscar sem ele
      const agora = performance.now();
      if (faltando) {
        incompletoDesde ||= agora;
        if (agora - incompletoDesde < ESPERA_QUADRO_MS) return;
      }
      incompletoDesde = 0;
      estado.sujo = false;
      const densidade = Math.min(window.devicePixelRatio || 1, DENSIDADE_MAXIMA);
      const resolucao = { largura: Math.round(estado.quadro.largura * densidade), altura: Math.round(estado.quadro.altura * densidade) };
      if (resolucao.largura > 0 && resolucao.altura > 0) compositor.desenhar(prontas, estado.fundo, estado.quadro, resolucao);
    };
    pedido = requestAnimationFrame(desenhar);
    return () => {
      cancelAnimationFrame(pedido);
      compositor.destruir();
    };
  }, [suportado]);

  const marcarSujo = () => {
    desenho.current.sujo = true;
  };

  /** Clique na prévia: seleciona o clipe de cima que está sob o ponteiro. */
  function selecionarNoPonto(evento: React.PointerEvent<HTMLDivElement>) {
    if (evento.button !== 0) return;
    const retangulo = evento.currentTarget.getBoundingClientRect();
    const ponto = { x: evento.clientX - retangulo.left, y: evento.clientY - retangulo.top };
    const acima = [...camadas].reverse().find((camada) => camada.caixa.opacidade > 0 && contemPonto(camada.caixa, ponto));
    aoSelecionar(acima ? [acima.clipe.id] : []);
  }

  return (
    <section aria-label="Prévia" className={`flex min-h-0 min-w-0 flex-col bg-fundo ${className}`}>
      <div ref={areaRef} className="relative min-h-0 flex-1 p-4">
        <div className="absolute inset-4 flex items-center justify-center">
          <div
            className="relative select-none shadow-lg shadow-black/40"
            style={{ width: tamanho.largura, height: tamanho.altura, backgroundColor: projeto.fundo.cor }}
            onPointerDown={selecionarNoPonto}
          >
            {/* Os vídeos só fornecem os quadros: quem aparece é o canvas, por cima deles */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-0" aria-hidden>
              {visuais.map((item) => (
                <FonteDoClipe
                  key={item.chave}
                  item={item}
                  tempo={tempo}
                  tocando={tocando}
                  aoRegistrar={(fonte) => {
                    if (fonte) fontes.current.set(item.chave, fonte);
                    else fontes.current.delete(item.chave);
                    marcarSujo();
                  }}
                  aoTerQuadro={marcarSujo}
                />
              ))}
              {sons.map((item) => (
                <SomDoClipe key={`som:${item.chave}`} item={item} tempo={tempo} tocando={tocando} />
              ))}
            </div>

            {suportado ? (
              <canvas ref={canvasRef} className="absolute inset-0 size-full bg-black object-contain" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-suave">
                <TriangleAlert className="size-5 text-aviso" aria-hidden />
                Este navegador não tem WebGL2, que a prévia usa para desenhar o vídeo. Use o Chrome ou o Edge atualizados.
              </div>
            )}

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

            {selecionada && !tocando ? (
              <ManipuladorNaPrevia
                key={selecionada.clipe.id}
                caixa={selecionada.caixaBase}
                quadro={tamanho}
                transformacao={selecionada.clipe.transformacao}
                travado={selecionada.faixa.travada}
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

            {vazio ? (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-[10%] text-center text-xs text-suave">
                Arraste mídias da biblioteca para a linha do tempo para ver aqui.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex h-11 shrink-0 items-center gap-3 border-t border-borda px-3">
        <span className="w-40 text-xs tabular-nums text-suave">
          <span className="text-texto">{formatarTimecode(tempo, projeto.taxa)}</span> / {formatarTimecode(projeto.duracao, projeto.taxa)}
        </span>
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            className="botao-icone size-9"
            disabled={vazio}
            onClick={aoAlternar}
            aria-label={tocando ? "Pausar" : "Reproduzir"}
            title={tocando ? "Pausar (espaço)" : "Reproduzir (espaço)"}
          >
            {tocando ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
          </button>
        </div>
        <div className="flex w-40 justify-end">
          <button
            type="button"
            className="botao-icone"
            disabled={!suportado}
            onClick={() => void canvasRef.current?.requestFullscreen()}
            aria-label="Tela cheia"
            title="Tela cheia"
          >
            <Maximize className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}
