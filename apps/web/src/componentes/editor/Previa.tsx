"use client";

import { Maximize, Pause, Play, SquareDashed, TriangleAlert } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { type CamadaNaTela, camadaDoCompositor, camadasNoTempo, itensNoTempo, textosParaImagens, visuaisNoTempo } from "@/lib/previa/camadas";
import { Compositor, FUNDO } from "@/lib/previa/compositor";
import { useImagensDeTexto } from "@/lib/previa/imagensDeTexto";
import { contemPonto, type Guias, pontoNaCaixa, type Tamanho } from "@/lib/projeto/geometria";
import { MODOS_DAS_GUIAS, type ModoDasGuias, modoValido, proximoModo } from "@/lib/projeto/margens";
import type { Projeto, Transformacao } from "@/lib/projeto/modelo";
import { retanguloNaImagem } from "@/lib/projeto/seguirObjeto";
import { duracaoDoQuadro, formatarTimecode, type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

import { arquivoDoTom, FonteDaMascara, type FonteDeQuadros, FonteDoClipe, SomDoClipe, usaVozLimpa } from "./FontesDaPrevia";
import { arquivoDaMascara, ehCopiaDesenhada, expandirParaDesenhar } from "@/lib/projeto/fundoDesfocado";
import { lutsDoProjeto } from "@/lib/projeto/lutImportada";
import { useTabelasDasLuts } from "@/lib/useLuts";
import { DesenhoDaMascara } from "./DesenhoDaMascara";
import { GuiasDaPrevia } from "./GuiasDaPrevia";
import { ManipuladorNaPrevia } from "./ManipuladorNaPrevia";
import { MedidorDeLoudness } from "./MedidorDeLoudness";
import { MarcadorDeObjeto, type ObjetoMarcado } from "./SeguirObjeto";
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
  /** Marcando o objeto que um clipe vai seguir: a prévia mostra o marcador no lugar das alças. */
  /** O desenho da máscara de um clipe: os pontos voltam em frações do clipe. */
  desenhoDaMascara?: { clipeId: string; aoConcluir: (pontos: [number, number][]) => void; aoCancelar: () => void } | null;
  /** `proprio`: o objeto é marcado no próprio clipe (esconder uma placa), não num vídeo embaixo dele. */
  marcacao?: { seguidorId: string; proprio?: boolean; aoConfirmar: (marcado: ObjetoMarcado) => void; aoCancelar: () => void } | null;
  className?: string;
};

/** Quanto a prévia espera um vídeo carregar o quadro antes de desenhar sem ele. */
const ESPERA_QUADRO_MS = 400;
/** Os textos com a imagem pedida: de 2 s antes do degrau do cursor até 12 s depois, em degraus de 4 s. */
const JANELA_DOS_TEXTOS = { degrau: 4 * TICKS_POR_SEGUNDO, antes: 2 * TICKS_POR_SEGUNDO, depois: 12 * TICKS_POR_SEGUNDO };
/** Densidade máxima de pixels do canvas: acima disso o custo cresce e a diferença não aparece. */
const DENSIDADE_MAXIMA = 2;

/** Onde o navegador guarda as guias escolhidas (vale para todos os projetos). */
const CHAVE_GUIAS = "takeone-guias-da-previa";

function guiasGuardadas(): ModoDasGuias {
  try {
    return modoValido(localStorage.getItem(CHAVE_GUIAS));
  } catch {
    return "desligadas";
  }
}

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

export function Previa({ projeto: projetoDaEdicao, midias, tempo, tocando, aoAlternar, selecao, aoSelecionar, aoPrever, aoTransformar, marcacao, desenhoDaMascara, className = "" }: Props) {
  // O projeto como é desenhado: o fundo desfocado vira duas cópias do clipe (lib/projeto/fundoDesfocado.ts)
  const projeto = useMemo(() => expandirParaDesenhar(projetoDaEdicao), [projetoDaEdicao]);
  const { areaRef, tamanho } = useQuadro(projeto.proporcao);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [suportado] = useState(webgl2Disponivel);
  const [guias, setGuias] = useState<Guias | null>(null);
  // A prévia só existe no navegador (o editor abre depois de carregar o projeto), então dá para ler aqui
  const [modoDasGuias, setModoDasGuias] = useState<ModoDasGuias>(guiasGuardadas);
  const fontes = useRef(new Map<string, FonteDeQuadros>());
  const desenho = useRef<EstadoDoDesenho>({ camadas: [], fundo: "#000000", quadro: tamanho, tocando: false, sujo: true });

  // A primeira faixa da lista é a de cima; no quadro ela tem que ser desenhada por último
  const visuais = visuaisNoTempo(projeto, midias, tempo);
  // O som vem de todas as faixas com áudio: as de áudio e as de vídeo visíveis (na principal, com as transições que misturam o som)
  const sons = itensNoTempo(
    projeto.faixas.filter((faixa) => !faixa.muda && (faixa.tipo === "audio" || !faixa.oculta)),
    midias,
    tempo,
    duracaoDoQuadro(projeto.taxa),
    true,
  ).filter((item) => item.midia.audio && !item.clipe.som_separado);
  // O texto com destaque pede também a imagem na cor do destaque, que vai por cima
  // Só os textos perto do cursor, numa janela que anda em degraus (para não mudar a cada quadro): o que vem pela
  // frente chega antes de aparecer, tocando ou não
  const degrau = Math.floor(tempo / JANELA_DOS_TEXTOS.degrau) * JANELA_DOS_TEXTOS.degrau;
  const imagensDeTexto = useImagensDeTexto(textosParaImagens(projeto, { de: degrau - JANELA_DOS_TEXTOS.antes, ate: degrau + JANELA_DOS_TEXTOS.depois }));
  // As tabelas das LUTs importadas: quando uma chega, a prévia volta a montar as camadas com ela
  useTabelasDasLuts(lutsDoProjeto(projeto));
  const camadas = camadasNoTempo(projeto, visuais, tempo, tamanho, imagensDeTexto);
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
        if (camada.clipe.ajuste) {
          prontas.push(camadaDoCompositor(camada, FUNDO, null));
          continue;
        }
        const quadro = camada.imagem ?? fontes.current.get(camada.chave)?.quadro(camada.segundos);
        // Recorte do fundo: a máscara do mesmo instante; sem ela ainda, espera como espera o quadro
        const fonteDaMascara = camada.clipe.remover_fundo && !camada.imagem ? fontes.current.get(`${camada.chave}:mascara`) : undefined;
        const mascaraDoFundo = fonteDaMascara?.quadro(camada.segundos) ?? null;
        if (fonteDaMascara && !mascaraDoFundo) {
          faltando = true;
          continue;
        }
        if (!quadro) {
          faltando = true;
          continue;
        }
        prontas.push(camadaDoCompositor(camada, quadro, mascaraDoFundo));
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

  /** O retângulo marcado em volta do objeto: no vídeo de cima que está embaixo do meio dele (que não seja quem segue). */
  function marcarObjeto(retangulo: { esquerda: number; topo: number; largura: number; altura: number }): string | null {
    if (!marcacao) return null;
    const meio = { x: retangulo.esquerda + retangulo.largura / 2, y: retangulo.topo + retangulo.altura / 2 };
    const alvo = [...camadas].reverse().find((camada) => {
      const midia = camada.clipe.midia_id ? midias.get(camada.clipe.midia_id) : undefined;
      const certo = marcacao.proprio ? camada.clipe.id === marcacao.seguidorId : camada.clipe.id !== marcacao.seguidorId;
      return certo && !ehCopiaDesenhada(camada.clipe.id) && midia?.video && !midia.imagem && !midia.animacao && contemPonto(camada.caixa, meio);
    });
    if (!alvo) return marcacao.proprio ? "Marque em cima do vídeo do clipe escolhido." : "Marque em cima de um vídeo (não do próprio clipe que vai seguir).";
    const caixa = retanguloNaImagem(alvo.caixa, alvo.recorte, retangulo, alvo.clipe.virar);
    if (!caixa) return "O retângulo ficou fora da imagem do vídeo.";
    marcacao.aoConfirmar({ alvoId: alvo.clipe.id, caixa });
    return null;
  }

  /** Clique na prévia: seleciona o clipe de cima que está sob o ponteiro. */
  function selecionarNoPonto(evento: React.PointerEvent<HTMLDivElement>) {
    if (evento.button !== 0) return;
    const retangulo = evento.currentTarget.getBoundingClientRect();
    const ponto = { x: evento.clientX - retangulo.left, y: evento.clientY - retangulo.top };
    const acima = [...camadas].reverse().find((camada) => !ehCopiaDesenhada(camada.clipe.id) && camada.caixa.opacidade > 0 && contemPonto(camada.caixa, ponto));
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
              {visuais
                .filter((item) => item.clipe.remover_fundo && item.midia.arquivos.includes(arquivoDaMascara(item.clipe)))
                .map((item) => (
                  <FonteDaMascara
                    key={`mascara:${item.chave}`}
                    item={item}
                    arquivo={arquivoDaMascara(item.clipe)}
                    tempo={tempo}
                    tocando={tocando}
                    aoRegistrar={(fonte) => {
                      if (fonte) fontes.current.set(`${item.chave}:mascara`, fonte);
                      else fontes.current.delete(`${item.chave}:mascara`);
                      marcarSujo();
                    }}
                    aoTerQuadro={marcarSujo}
                  />
                ))}
              {sons.map((item) => (
                // A voz limpa é outro arquivo: outro elemento, para não recarregar o som ao trocar de clipe
                <SomDoClipe key={`som:${item.chave}${usaVozLimpa(item) ? ":limpa" : ""}${arquivoDoTom(item) ? `:${arquivoDoTom(item)}` : ""}`} item={item} tempo={tempo} tocando={tocando} />
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

            <GuiasDaPrevia modo={modoDasGuias} quadro={tamanho} emPe={razao(projeto.proporcao) < 1} />

            {marcacao ? <MarcadorDeObjeto aoMarcar={marcarObjeto} aoCancelar={marcacao.aoCancelar} /> : null}
            {desenhoDaMascara ? (
              <DesenhoDaMascara
                aoCancelar={desenhoDaMascara.aoCancelar}
                aoConcluir={(pontos) => {
                  // Os cliques (pixels da prévia) em frações da caixa do clipe, antes do giro, como o v_local do shader
                  const camada = camadas.find((c) => c.clipe.id === desenhoDaMascara.clipeId);
                  if (!camada) return desenhoDaMascara.aoCancelar();
                  desenhoDaMascara.aoConcluir(
                    pontos.map((ponto) => {
                      const local = pontoNaCaixa(camada.caixa, ponto);
                      return [local.x / camada.caixa.largura + 0.5, local.y / camada.caixa.altura + 0.5];
                    }),
                  );
                }}
              />
            ) : null}

            {selecionada && !tocando && !marcacao && !desenhoDaMascara ? (
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
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-[10%] text-center text-xs text-white/60">
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
        <div className="flex min-w-40 items-center justify-end gap-1">
          <MedidorDeLoudness tocando={tocando} />
          <button
            type="button"
            className={`botao-icone ${modoDasGuias === "desligadas" ? "" : "text-destaque"}`}
            onClick={() => {
              const proximo = proximoModo(modoDasGuias);
              setModoDasGuias(proximo);
              try {
                localStorage.setItem(CHAVE_GUIAS, proximo);
              } catch {
                // Sem armazenamento (janela anônima), a escolha vale só até recarregar
              }
            }}
            aria-label={`Guias: ${MODOS_DAS_GUIAS.find((modo) => modo.id === modoDasGuias)?.nome}`}
            title={`Guias: ${MODOS_DAS_GUIAS.find((modo) => modo.id === modoDasGuias)?.nome} (clique para trocar)`}
          >
            <SquareDashed className="size-4" aria-hidden />
          </button>
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
