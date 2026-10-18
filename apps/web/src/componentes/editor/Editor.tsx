"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { ErroApi } from "@/lib/api";
import { type Comando, executarComando } from "@/lib/projeto/comandos";
import { retomarAudio } from "@/lib/previa/audio";
import type { Contexto } from "@/lib/projeto/edicao";
import { acharClipe, fimDoClipe } from "@/lib/projeto/modelo";
import { duracaoDoQuadro, quadroMaisProximo, segundosParaTicks, type Taxa, type Tick, TICK_MAXIMO, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import { useMidias } from "@/lib/useMidias";
import { useTamanhoSalvo } from "@/lib/useTamanhoSalvo";

import { BarraFerramentas } from "./BarraFerramentas";
import { BarraSuperior } from "./BarraSuperior";
import { Divisor } from "./Divisor";
import { FERRAMENTAS, type IdFerramenta } from "./ferramentas";
import { JanelaExportar } from "./JanelaExportar";
import { LinhaDoTempo } from "./LinhaDoTempo";
import { PainelConteudo } from "./PainelConteudo";
import { PainelPropriedades } from "./PainelPropriedades";
import { Previa } from "./Previa";
import { useSeguirObjeto } from "./SeguirObjeto";
import { useProjeto } from "./useProjeto";

const CONTEUDO = { padrao: 320, minimo: 240, maximo: 520 };
const PROPRIEDADES = { padrao: 300, minimo: 240, maximo: 440 };
const LINHA_DO_TEMPO = { padrao: 260, minimo: 150, maximo: 560 };

/** Relógio da reprodução. O tempo anda pelo relógio do navegador; os vídeos da prévia seguem ele. */
function useReproducao(duracao: Tick, taxa: Taxa) {
  const [tempo, setTempo] = useState<Tick>(0);
  const [tocando, setTocando] = useState(false);
  const partida = useRef({ tempo: 0, relogio: 0 });

  useEffect(() => {
    if (!tocando) return;
    let pedido = 0;
    const avancar = () => {
      const t = partida.current.tempo + ((performance.now() - partida.current.relogio) / 1000) * TICKS_POR_SEGUNDO;
      if (t >= duracao) {
        setTempo(duracao);
        setTocando(false);
        return;
      }
      setTempo(Math.round(t));
      pedido = requestAnimationFrame(avancar);
    };
    pedido = requestAnimationFrame(avancar);
    return () => cancelAnimationFrame(pedido);
  }, [tocando, duracao]);

  // O limite é aplicado na leitura: logo depois de um comando, `duracao` ainda é a de antes
  const buscar = useCallback((t: Tick) => {
    const alvo = Math.round(Math.max(0, Math.min(t, TICK_MAXIMO)));
    partida.current = { tempo: alvo, relogio: performance.now() };
    setTempo(alvo);
  }, []);

  const atual = Math.min(tempo, duracao);
  const alternar = useCallback(() => {
    if (tocando) {
      setTocando(false);
      setTempo((t) => Math.min(quadroMaisProximo(taxa, t), duracao));
      return;
    }
    if (duracao <= 0) return;
    // O navegador só libera o som dentro do clique ou da tecla da pessoa
    retomarAudio();
    const inicio = atual >= duracao ? 0 : atual;
    partida.current = { tempo: inicio, relogio: performance.now() };
    setTempo(inicio);
    setTocando(true);
  }, [tocando, atual, duracao, taxa]);

  return { tempo: atual, tocando, buscar, alternar };
}

function novoId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

/**
 * As quatro áreas: ferramentas e painel de conteúdo à esquerda, prévia no centro,
 * propriedades à direita e linha do tempo embaixo. No celular, a prévia ocupa o
 * topo, as ferramentas viram uma faixa embaixo e o painel abre por cima.
 */
export function Editor({ projetoId }: { projetoId: string }) {
  const biblioteca = useMidias();
  const [ferramenta, setFerramenta] = useState<IdFerramenta>("midia");
  const [painelNoCelular, setPainelNoCelular] = useState(false);
  const [midiaId, setMidiaId] = useState<string | null>(null);
  const [selecao, setSelecao] = useState<string[]>([]);
  const [ima, setIma] = useState(true);
  const [exportando, setExportando] = useState(false);

  const midias = useMemo(() => new Map((biblioteca.midias ?? []).map((midia) => [midia.id, midia])), [biblioteca.midias]);
  const ctx = useMemo<Contexto>(
    () => ({
      novoId,
      midia: (id) => {
        const midia = midias.get(id);
        if (!midia || midia.status !== "pronta") return null;
        if (midia.imagem && midia.video) {
          // Imagem parada: sem fim, sem som; com transparência, entra numa faixa por cima
          return { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, transparente: Boolean(midia.video.transparente), imagem: true };
        }
        if (!midia.duracao) return null;
        return {
          duracao: segundosParaTicks(midia.duracao),
          video: Boolean(midia.video),
          audio: Boolean(midia.audio),
          transparente: Boolean(midia.animacao) && midia.arquivos.includes("mascara.mp4"),
        };
      },
    }),
    [midias],
  );

  const edicao = useProjeto(projetoId, ctx);
  const { projeto, executar: executarNoProjeto, desfazer, refazer, mostrarAviso } = edicao;

  // Mudança em curso (arrastando na prévia ou num controle do painel): aparece na tela, mas só vira
  // comando, e passo do desfazer, quando a pessoa solta
  const [provisorio, setProvisorio] = useState<Comando | null>(null);
  const projetoNaTela = useMemo(() => {
    if (!projeto || !provisorio) return projeto;
    try {
      return executarComando(projeto, provisorio, ctx).projeto;
    } catch {
      return projeto;
    }
  }, [projeto, provisorio, ctx]);
  const reproducao = useReproducao(projeto?.duracao ?? 0, projeto?.taxa ?? { num: 30, den: 1 });
  const { tempo, buscar, alternar } = reproducao;
  const objeto = useSeguirObjeto({ projeto, midias, tempo, executar: (comando) => executar(comando), aoAvisar: mostrarAviso });

  const [larguraConteudo, setLarguraConteudo] = useTamanhoSalvo("largura-conteudo", CONTEUDO.padrao, CONTEUDO.minimo, CONTEUDO.maximo);
  const [larguraPropriedades, setLarguraPropriedades] = useTamanhoSalvo(
    "largura-propriedades",
    PROPRIEDADES.padrao,
    PROPRIEDADES.minimo,
    PROPRIEDADES.maximo,
  );
  const [alturaLinha, setAlturaLinha] = useTamanhoSalvo("altura-linha", LINHA_DO_TEMPO.padrao, LINHA_DO_TEMPO.minimo, LINHA_DO_TEMPO.maximo);

  // Depois de desfazer, a seleção pode apontar para clipes que não existem mais
  const selecaoValida = projeto ? selecao.filter((id) => acharClipe(projeto, id)) : [];
  const selecionado = projetoNaTela && selecaoValida.length === 1 ? acharClipe(projetoNaTela, selecaoValida[0]) : null;
  /**
   * Os controles dos painéis comparam o valor solto com o que está na tela, que já tem a prévia, e
   * mandam null quando são iguais. Com uma prévia ativa, isso quer dizer que o valor final é o dela:
   * ela vira comando (sem passo no desfazer se não mudou nada em relação ao projeto salvo).
   */
  const preverDoPainel = (comando: Comando | null) => {
    if (comando !== null || !provisorio) {
      setProvisorio(comando);
      return;
    }
    setProvisorio(null);
    if (JSON.stringify(projetoNaTela) !== JSON.stringify(projeto)) executar(provisorio);
  };
  const midiaDoClipe = selecionado?.clipe.midia_id ? (midias.get(selecionado.clipe.midia_id) ?? null) : null;
  const midiaDasPropriedades = selecionado ? midiaDoClipe : midiaId ? (midias.get(midiaId) ?? null) : null;
  const ferramentaAtual = FERRAMENTAS.find((item) => item.id === ferramenta)!;

  const executar = useCallback(
    (comando: Comando) => {
      const resultado = executarNoProjeto(comando);
      if (resultado?.selecao) setSelecao(resultado.selecao);
      return resultado;
    },
    [executarNoProjeto],
  );

  /** Pelo botão "+": entra no cursor, e o cursor vai para o fim do clipe novo, como no CapCut. */
  function adicionarNoCursor(midiaId: string) {
    const resultado = executar({ comando: "clipe.adicionar", parametros: { midiaId, inicio: tempo } });
    const novo = resultado?.selecao?.[0] && acharClipe(resultado.projeto, resultado.selecao[0]);
    if (novo && novo.faixa.tipo === "principal") buscar(fimDoClipe(novo.clipe));
  }

  // Animações pedidas no painel: cada uma entra no instante em que o cursor estava, quando ficar pronta
  const animacoesPedidas = useRef(new Map<string, Tick>());
  function pedirAnimacao(midia: { id: string }, inicio: Tick = tempo) {
    animacoesPedidas.current.set(midia.id, inicio);
    void biblioteca.recarregar();
  }
  const colocarAnimacoes = useEffectEvent(() => {
    for (const [id, inicio] of animacoesPedidas.current) {
      const midia = midias.get(id);
      if (!midia || midia.status === "erro") {
        animacoesPedidas.current.delete(id);
        if (midia) mostrarAviso(`"${midia.nome}" não ficou pronta: ${midia.erro ?? "erro desconhecido"}`);
      } else if (midia.status === "pronta") {
        animacoesPedidas.current.delete(id);
        executar({ comando: "clipe.adicionar", parametros: { midiaId: id, inicio } });
      }
    }
  });
  useEffect(() => {
    if (animacoesPedidas.current.size) colocarAnimacoes();
  }, [midias]);

  const bibliotecaDoEditor = useMemo(
    () => ({
      ...biblioteca,
      excluir: (id: string) =>
        biblioteca.excluir(id).catch((e) => mostrarAviso(e instanceof ErroApi ? e.message : "Não foi possível excluir a mídia.")),
    }),
    [biblioteca, mostrarAviso],
  );

  const aoTeclar = useEffectEvent((evento: KeyboardEvent) => {
    const alvo = evento.target as HTMLElement | null;
    if (!projeto || alvo?.closest("input, textarea, select, [contenteditable], [role=dialog]") || exportando) return;
    const ctrl = evento.ctrlKey || evento.metaKey;
    const tecla = evento.key.toLowerCase();
    const quadro = duracaoDoQuadro(projeto.taxa);

    if (evento.code === "Space") {
      if (alvo instanceof HTMLButtonElement) alvo.blur();
      alternar();
    } else if (ctrl && tecla === "z" && !evento.shiftKey) desfazer();
    else if (ctrl && (tecla === "y" || (tecla === "z" && evento.shiftKey))) refazer();
    else if (ctrl && tecla === "s") mostrarAviso("O TakeOne salva sozinho a cada alteração.");
    else if ((tecla === "s" && !ctrl) || (ctrl && tecla === "b")) executar({ comando: "linha.dividir", parametros: { tempo, clipeIds: selecaoValida } });
    else if ((tecla === "delete" || tecla === "backspace") && selecaoValida.length) executar({ comando: "clipe.apagar", parametros: { clipeIds: selecaoValida } });
    else if (ctrl && tecla === "d" && selecaoValida.length) executar({ comando: "clipe.duplicar", parametros: { clipeIds: selecaoValida } });
    else if (ctrl && tecla === "a") setSelecao(projeto.faixas.flatMap((faixa) => faixa.clipes.map((clipe) => clipe.id)));
    else if (tecla === "arrowleft") buscar(quadroMaisProximo(projeto.taxa, tempo) - (evento.shiftKey ? TICKS_POR_SEGUNDO : quadro));
    else if (tecla === "arrowright") buscar(quadroMaisProximo(projeto.taxa, tempo) + (evento.shiftKey ? TICKS_POR_SEGUNDO : quadro));
    else if (tecla === "home") buscar(0);
    else if (tecla === "end") buscar(projeto.duracao);
    else if (tecla === "escape") setSelecao([]);
    else if (tecla === "n" && !ctrl) setIma((atual) => !atual);
    else return;
    evento.preventDefault();
  });

  useEffect(() => {
    const ouvir = (evento: KeyboardEvent) => aoTeclar(evento);
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, []);

  if (edicao.erroCarga) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-fundo p-6 text-center text-texto">
        <TriangleAlert className="size-8 text-erro" aria-hidden />
        <p className="text-sm">{edicao.erroCarga}</p>
        <Link href="/app" className="botao-secundario px-3 py-1.5">
          Voltar aos projetos
        </Link>
      </div>
    );
  }

  if (!projeto) {
    return (
      <div className="flex h-dvh items-center justify-center gap-2 bg-fundo text-sm text-suave">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Abrindo o projeto…
      </div>
    );
  }

  const tamanhos = {
    "--largura-conteudo": `${larguraConteudo}px`,
    "--largura-propriedades": `${larguraPropriedades}px`,
    "--altura-linha": `${alturaLinha}px`,
  } as React.CSSProperties;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-fundo text-texto" style={tamanhos}>
      <BarraSuperior
        nome={edicao.nome}
        aoMudarNome={edicao.renomear}
        proporcao={projeto.proporcao}
        aoMudarProporcao={(proporcao) => executar({ comando: "projeto.proporcao", parametros: { proporcao } })}
        salvamento={edicao.salvamento}
        nomeDesfazer={edicao.nomeDesfazer}
        nomeRefazer={edicao.nomeRefazer}
        aoDesfazer={desfazer}
        aoRefazer={refazer}
        aoExportar={() => setExportando(true)}
      />

      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <BarraFerramentas
          ativa={ferramenta}
          aoEscolher={(id) => {
            setFerramenta(id);
            setPainelNoCelular(true);
          }}
          className="max-md:order-2"
        />

        <PainelConteudo
          ferramenta={ferramentaAtual}
          biblioteca={bibliotecaDoEditor}
          midiaSelecionadaId={midiaId}
          aoSelecionarMidia={(id) => {
            setMidiaId(id);
            setSelecao([]);
          }}
          aoAdicionarMidia={adicionarNoCursor}
          aoAdicionarTexto={(texto) => executar({ comando: "texto.adicionar", parametros: { inicio: tempo, texto } })}
          aoPedirAnimacao={pedirAnimacao}
          selecionado={selecionado}
          aoPrever={preverDoPainel}
          legendas={{
            projeto,
            nome: edicao.nome,
            tempo,
            selecao: selecaoValida,
            aoExecutar: executar,
            aoBuscar: buscar,
            aoSelecionar: (ids) => {
              setSelecao(ids);
              if (ids.length) setMidiaId(null);
            },
            aoAvisar: mostrarAviso,
          }}
          aoFechar={() => setPainelNoCelular(false)}
          className={`md:w-[var(--largura-conteudo)] max-md:fixed max-md:inset-x-0 max-md:bottom-16 max-md:z-30 max-md:h-[55dvh] ${
            painelNoCelular ? "" : "max-md:hidden"
          }`}
        />
        <Divisor
          direcao="coluna"
          valor={larguraConteudo}
          minimo={CONTEUDO.minimo}
          maximo={CONTEUDO.maximo}
          aoMudar={setLarguraConteudo}
          rotulo="Largura do painel de conteúdo"
          className="max-md:hidden"
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:order-1">
          <div className="flex min-h-0 flex-1">
            <Previa
              projeto={projetoNaTela ?? projeto}
              midias={midias}
              tempo={tempo}
              tocando={reproducao.tocando}
              aoAlternar={alternar}
              selecao={selecaoValida}
              aoSelecionar={(ids) => {
                setSelecao(ids);
                if (ids.length) setMidiaId(null);
              }}
              aoPrever={(clipeId, mudanca) =>
                setProvisorio(mudanca ? { comando: "clipe.transformar", parametros: { clipeIds: [clipeId], transformacao: mudanca, tempo } } : null)
              }
              aoTransformar={(clipeId, mudanca) => executar({ comando: "clipe.transformar", parametros: { clipeIds: [clipeId], transformacao: mudanca, tempo } })}
              marcacao={objeto.marcando ? { seguidorId: objeto.marcando, aoConfirmar: objeto.confirmar, aoCancelar: objeto.cancelar } : null}
              className="flex-1"
            />
            <Divisor
              direcao="coluna"
              valor={larguraPropriedades}
              minimo={PROPRIEDADES.minimo}
              maximo={PROPRIEDADES.maximo}
              aoMudar={setLarguraPropriedades}
              sentido={-1}
              rotulo="Largura do painel de propriedades"
              className="max-lg:hidden"
            />
            <PainelPropriedades
              midia={midiaDasPropriedades}
              selecionado={selecionado}
              taxa={projeto.taxa}
              tempo={tempo}
              aoBuscar={buscar}
              proporcao={projeto.proporcao}
              faixas={projeto.faixas}
              aoAvisar={mostrarAviso}
              seguirObjeto={{
                marcando: objeto.marcando,
                andamento: objeto.andamento,
                aoIniciar: (clipeId) => {
                  if (reproducao.tocando) alternar();
                  objeto.iniciar(clipeId);
                },
              }}
              fundo={(projetoNaTela ?? projeto).fundo.cor}
              aoPrever={preverDoPainel}
              aoExecutar={(comando) => {
                setProvisorio(null);
                executar(comando);
              }}
              className="w-[var(--largura-propriedades)] max-lg:hidden"
            />
          </div>
          <Divisor
            direcao="linha"
            valor={alturaLinha}
            minimo={LINHA_DO_TEMPO.minimo}
            maximo={LINHA_DO_TEMPO.maximo}
            aoMudar={setAlturaLinha}
            sentido={-1}
            rotulo="Altura da linha do tempo"
            className="max-md:hidden"
          />
          <LinhaDoTempo
            projeto={projeto}
            midias={midias}
            ctx={ctx}
            tempo={tempo}
            tocando={reproducao.tocando}
            selecao={selecaoValida}
            ima={ima}
            aoAlternarIma={() => setIma((atual) => !atual)}
            aoBuscar={buscar}
            aoSelecionar={(ids) => {
              setSelecao(ids);
              if (ids.length) setMidiaId(null);
            }}
            aoExecutar={executar}
            className="h-48 md:h-[var(--altura-linha)]"
          />
        </div>
      </div>

      {exportando ? (
        <JanelaExportar projetoId={projetoId} proporcao={projeto.proporcao} salvamento={edicao.salvamento} aoFechar={() => setExportando(false)} />
      ) : null}

      {edicao.aviso ? (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <p className="rounded-lg border border-borda bg-painel-3 px-4 py-2 text-sm shadow-xl shadow-black/40">{edicao.aviso}</p>
        </div>
      ) : null}
    </div>
  );
}