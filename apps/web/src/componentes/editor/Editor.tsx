"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { Redirecionar } from "@/componentes/projeto/Redirecionar";
import { chamarApi, ErroApi } from "@/lib/api";
import { useEnvios } from "@/lib/envios";
import { enderecoDoProjeto } from "@/lib/hub";
import { clipeParaAparar, corteVizinho, marcadorVizinho } from "@/lib/projeto/atalhos";
import { type Comando, executarComando } from "@/lib/projeto/comandos";
import { retomarAudio } from "@/lib/previa/audio";
import { type ClipeCopiado, type Contexto, DURACAO_CONGELADO_S } from "@/lib/projeto/edicao";
import { acharClipe, fimDoClipe, tempoNaMidia } from "@/lib/projeto/modelo";
import { duracaoDoQuadro, quadroMaisProximo, type Taxa, type Tick, TICK_MAXIMO, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import { useMidias } from "@/lib/useMidias";
import { useTamanhoSalvo } from "@/lib/useTamanhoSalvo";
import type { Midia } from "@/lib/tipos";

import { BarraFerramentas } from "./BarraFerramentas";
import { BarraSuperior } from "./BarraSuperior";
import { Divisor } from "./Divisor";
import { FERRAMENTAS, type IdFerramenta } from "./ferramentas";
import { contextoDasMidias } from "./contexto";
import { JanelaAtalhos } from "./JanelaAtalhos";
import { JanelaColarAjustes } from "./JanelaColarAjustes";
import { JanelaSalvarModelo } from "./JanelaSalvarModelo";
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

/**
 * As quatro áreas: ferramentas e painel de conteúdo à esquerda, prévia no centro,
 * propriedades à direita e linha do tempo embaixo. No celular, a prévia ocupa o
 * topo, as ferramentas viram uma faixa embaixo e o painel abre por cima.
 */
type PropsDoEditor = { projetoId: string; ferramentaInicial?: string; modeloInicial?: string; animacaoInicial?: string };

/** `ferramentaInicial`, `modeloInicial` e `animacaoInicial` vêm do endereço, quando o hub abre o editor numa ferramenta. */
export function Editor({ projetoId, ferramentaInicial, modeloInicial, animacaoInicial }: PropsDoEditor) {
  const biblioteca = useMidias();
  const { iniciar: iniciarEnvio } = useEnvios();
  const [ferramenta, setFerramenta] = useState<IdFerramenta>(() => FERRAMENTAS.find((item) => item.id === ferramentaInicial && !item.emBreve)?.id ?? "midia");
  const [painelNoCelular, setPainelNoCelular] = useState(false);
  const [midiaId, setMidiaId] = useState<string | null>(null);
  const [selecao, definirSelecao] = useState<string[]>([]);
  /**
   * Troca a seleção. Antes, tira o foco do campo do painel que estiver sendo editado: o onBlur dele roda com o
   * clipe de antes e confirma o valor ali. Sem isso, a linha do tempo e a prévia trocavam a seleção no
   * pointerdown e o valor digitado ia para o clipe novo (ou se perdia, com o painel desmontado).
   */
  const setSelecao = useCallback((ids: string[]) => {
    const ativo = document.activeElement;
    if (ativo instanceof HTMLElement && ativo.matches("input, textarea, select")) ativo.blur();
    definirSelecao(ids);
  }, []);
  const [ima, setIma] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [vendoAtalhos, setVendoAtalhos] = useState(false);
  const [salvandoModelo, setSalvandoModelo] = useState(false);
  // O clipe de onde saem os ajustes enquanto a janela "Colar ajustes" está aberta
  const [colandoAjustes, setColandoAjustes] = useState<ClipeCopiado | null>(null);
  // Os clipes copiados (Ctrl+C), na memória desta aba; o primeiro é a origem do "Colar ajustes"
  const copiados = useRef<ClipeCopiado[]>([]);

  const midias = useMemo(() => new Map((biblioteca.midias ?? []).map((midia) => [midia.id, midia])), [biblioteca.midias]);
  const ctx = useMemo<Contexto>(() => contextoDasMidias(midias), [midias]);

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
  // Congelar o quadro: um vídeo da principal escolhido, com o cursor sobre ele
  const midiaDoEscolhido = selecionado?.clipe.midia_id ? midias.get(selecionado.clipe.midia_id) : undefined;
  const congelavel =
    selecionado?.faixa.tipo === "principal" &&
    Boolean(midiaDoEscolhido?.video) &&
    !midiaDoEscolhido?.imagem &&
    tempo >= selecionado.clipe.inicio &&
    tempo <= fimDoClipe(selecionado.clipe);
  function congelar() {
    if (!selecionado?.clipe.midia_id) return;
    const { clipe } = selecionado;
    // O quadro do corte (o mesmo que o comando usa): a foto é o que o vídeo mostra nele
    const instante = Math.min(Math.max(quadroMaisProximo(projeto!.taxa, tempo), clipe.inicio), fimDoClipe(clipe));
    chamarApi<Midia>(`/midias/${clipe.midia_id}/quadro`, {
      metodo: "POST",
      corpo: { segundos: tempoNaMidia(clipe, instante) / TICKS_POR_SEGUNDO, imagem_limpa: Boolean(clipe.imagem_limpa), estabilizar: Boolean(clipe.estabilizar) },
    })
      .then((midia) => {
        mostrarAviso("Congelando o quadro: a foto entra no cursor quando ficar pronta.");
        executarQuandoProntas([midia.id], {
          comando: "clipe.congelar",
          parametros: { clipeId: clipe.id, tempo: instante, midiaId: midia.id, duracao: DURACAO_CONGELADO_S * TICKS_POR_SEGUNDO },
        });
      })
      .catch((erro: unknown) => mostrarAviso(erro instanceof ErroApi ? erro.message : "Não foi possível congelar o quadro agora."));
  }
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
    [executarNoProjeto, setSelecao],
  );

  /** Pelo botão "+": entra no cursor, e o cursor vai para o fim do clipe novo, como no CapCut. */
  function adicionarNoCursor(midiaId: string) {
    const resultado = executar({ comando: "clipe.adicionar", parametros: { midiaId, inicio: tempo } });
    const novo = resultado?.selecao?.[0] && acharClipe(resultado.projeto, resultado.selecao[0]);
    if (novo && novo.faixa.tipo === "principal") buscar(fimDoClipe(novo.clipe));
  }

  // Mídias pedidas nos painéis (animações, formas): quando ficam prontas, entram no cursor do momento do
  // pedido ou trocam a imagem dos clipes escolhidos. Só saem da lista quando aparecem prontas ou com erro.
  const pendentes = useRef(new Map<string, { inicio: Tick } | { clipeIds: string[] }>());
  function pedirAnimacao(midia: { id: string }, inicio: Tick = tempo) {
    pendentes.current.set(midia.id, { inicio });
    void biblioteca.recarregar();
  }
  function trocarMidiaQuandoPronta(clipeIds: string[], midia: { id: string }) {
    pendentes.current.set(midia.id, { clipeIds });
    void biblioteca.recarregar();
  }
  // Um comando que precisa de várias mídias novas (as formas de um modelo): roda quando todas estão prontas
  const grupos = useRef<{ ids: string[]; comando: Comando }[]>([]);
  function executarQuandoProntas(ids: string[], comando: Comando) {
    if (!ids.length) {
      executar(comando);
      return;
    }
    grupos.current.push({ ids, comando });
    void biblioteca.recarregar();
  }
  const resolverPendentes = useEffectEvent(() => {
    grupos.current = grupos.current.filter(({ ids, comando }) => {
      const lista = ids.map((id) => midias.get(id));
      const comErro = lista.find((midia) => midia?.status === "erro");
      if (comErro) {
        mostrarAviso(`"${comErro.nome}" não ficou pronta: ${comErro.erro ?? "erro desconhecido"}`);
        return false;
      }
      if (!lista.every((midia) => midia?.status === "pronta")) return true;
      executar(comando);
      return false;
    });
    for (const [id, acao] of pendentes.current) {
      const midia = midias.get(id);
      if (!midia || midia.status === "processando" || midia.status === "enviando") continue;
      pendentes.current.delete(id);
      if (midia.status === "erro") mostrarAviso(`"${midia.nome}" não ficou pronta: ${midia.erro ?? "erro desconhecido"}`);
      else if ("inicio" in acao) executar({ comando: "clipe.adicionar", parametros: { midiaId: id, inicio: acao.inicio } });
      else executar({ comando: "clipe.trocarMidia", parametros: { clipeIds: acao.clipeIds, midiaId: id } });
    }
  });
  useEffect(() => {
    if (pendentes.current.size || grupos.current.length) resolverPendentes();
  }, [midias]);

  const bibliotecaDoEditor = useMemo(
    () => ({
      ...biblioteca,
      excluir: (id: string) =>
        biblioteca.excluir(id).catch((e) => mostrarAviso(e instanceof ErroApi ? e.message : "Não foi possível excluir a mídia.")),
    }),
    [biblioteca, mostrarAviso],
  );

  /** Ctrl+C: guarda uma cópia dos clipes marcados, com a faixa de onde vieram, em ordem no tempo. */
  function copiar() {
    if (!projeto) return;
    copiados.current = selecaoValida
      .flatMap((id) => {
        const achado = acharClipe(projeto, id);
        return achado ? [{ clipe: structuredClone(achado.clipe), tipo: achado.faixa.tipo, faixaId: achado.faixa.id }] : [];
      })
      .sort((a, b) => a.clipe.inicio - b.clipe.inicio);
    const quantos = copiados.current.length;
    mostrarAviso(`${quantos === 1 ? "1 clipe copiado" : `${quantos} clipes copiados`}. Ctrl+V cola no cursor; Ctrl+Alt+V cola só os ajustes nos marcados.`);
  }

  /** Q e W: apaga do começo do clipe até o cursor, ou do cursor até o fim (o clipe marcado, ou o da principal). */
  function aparaAteOCursor(borda: "inicio" | "fim") {
    if (!projeto) return;
    const clipe = clipeParaAparar(projeto, selecaoValida, tempo);
    if (!clipe) {
      mostrarAviso("Ponha o cursor dentro de um clipe (o marcado ou o da principal) para aparar até ele.");
      return;
    }
    executar({ comando: "clipe.aparar", parametros: { clipeId: clipe.id, borda, tempo } });
  }

  /** Alt+setas: empurra os clipes marcados `quadros` quadros para um lado (só fora da principal, que é encostada). */
  function empurrar(sentido: -1 | 1, quadros: number) {
    if (!projeto || !selecaoValida.length) return;
    const delta = sentido * quadros * duracaoDoQuadro(projeto.taxa);
    const achados = selecaoValida.map((id) => acharClipe(projeto, id)).filter((achado) => achado !== null);
    if (achados.some(({ faixa }) => faixa.tipo === "principal")) {
      mostrarAviso("Na principal os clipes ficam encostados: use Q e W para aparar, ou arraste para mudar a ordem.");
      return;
    }
    // Do lado para onde andam primeiro, para um não esbarrar no outro
    const ordem = [...achados].sort((a, b) => (b.clipe.inicio - a.clipe.inicio) * sentido);
    for (const { clipe, faixa } of ordem) {
      executar({ comando: "clipe.mover", parametros: { clipeId: clipe.id, inicio: Math.max(0, clipe.inicio + delta), faixaId: faixa.id } });
    }
  }

  const aoTeclar = useEffectEvent((evento: KeyboardEvent) => {
    const alvo = evento.target as HTMLElement | null;
    const ctrl = evento.ctrlKey || evento.metaKey;
    const tecla = evento.key.toLowerCase();
    // Num controle deslizante, só as setas e Home/End são dele: desfazer, refazer e o espaço continuam valendo
    // (antes, depois de mexer num controle, o foco ficava nele e esses atalhos paravam)
    const deslizante = alvo instanceof HTMLInputElement && alvo.type === "range";
    const doDeslizante = deslizante && (tecla.startsWith("arrow") || tecla === "home" || tecla === "end" || tecla === "pageup" || tecla === "pagedown");
    const campo = alvo?.closest("input, textarea, select, [contenteditable], [role=dialog]");
    if (!projeto || exportando || vendoAtalhos || colandoAjustes || salvandoModelo || doDeslizante || (campo && !deslizante)) return;
    if (deslizante && evento.code === "Space") alvo.blur();
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
    else if (ctrl && tecla === "c" && selecaoValida.length) copiar();
    else if (ctrl && evento.altKey && tecla === "v") {
      if (!copiados.current.length) mostrarAviso("Copie um clipe antes (Ctrl+C).");
      else if (!selecaoValida.length) mostrarAviso("Marque os clipes que vão receber os ajustes do clipe copiado.");
      else setColandoAjustes(copiados.current[0]);
    } else if (ctrl && tecla === "v") {
      if (copiados.current.length) executar({ comando: "clipe.colar", parametros: { copiados: copiados.current, inicio: tempo } });
      else mostrarAviso("Copie um clipe antes (Ctrl+C).");
    }
    else if (ctrl && tecla === "a") setSelecao(projeto.faixas.flatMap((faixa) => faixa.clipes.map((clipe) => clipe.id)));
    else if (evento.altKey && (tecla === "arrowleft" || tecla === "arrowright")) empurrar(tecla === "arrowleft" ? -1 : 1, evento.shiftKey ? 5 : 1);
    else if ((tecla === "q" || tecla === "w") && !ctrl && !evento.altKey) aparaAteOCursor(tecla === "q" ? "inicio" : "fim");
    else if (tecla === "m" && !ctrl && !evento.altKey) executar({ comando: "marcador.adicionar", parametros: { tempo } });
    else if ((tecla === "arrowup" || tecla === "arrowdown") && evento.shiftKey && !ctrl && !evento.altKey) {
      const marcador = marcadorVizinho(projeto, tempo, tecla === "arrowup" ? -1 : 1, quadro / 2);
      if (marcador !== null) buscar(marcador);
    } else if ((tecla === "arrowup" || tecla === "arrowdown") && !ctrl && !evento.altKey) {
      const corte = corteVizinho(projeto, tempo, tecla === "arrowup" ? -1 : 1, quadro / 2);
      if (corte !== null) buscar(corte);
    } else if (evento.key === "?") setVendoAtalhos(true);
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

  if (projeto.tipo === "imagem") return <Redirecionar para={enderecoDoProjeto({ id: projetoId, tipo: "imagem" })} />;

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
        aoSalvarModelo={() => setSalvandoModelo(true)}
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
          gravacao={{
            tempo,
            taxa: projeto.taxa,
            tocando: reproducao.tocando,
            aoAlternar: alternar,
            aoGravar: (arquivo, inicio) => {
              iniciarEnvio([arquivo], (id) => pedirAnimacao({ id }, inicio));
              mostrarAviso("Narração gravada: ela entra na faixa de áudio quando terminar de subir.");
            },
          }}
          aoExecutarQuandoProntas={executarQuandoProntas}
          modeloInicial={modeloInicial}
          animacaoInicial={animacaoInicial}
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
          className={`md:w-[var(--largura-conteudo)] max-md:fixed max-md:inset-x-0 max-md:bottom-16 max-md:z-40 max-md:h-[55dvh] ${
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
              marcacao={objeto.marcando ? { seguidorId: objeto.marcando, proprio: objeto.modo === "esconder", aoConfirmar: objeto.confirmar, aoCancelar: objeto.cancelar } : null}
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
              midias={midias}
              selecionado={selecionado}
              taxa={projeto.taxa}
              tempo={tempo}
              aoBuscar={buscar}
              proporcao={projeto.proporcao}
              faixas={projeto.faixas}
              aoAvisar={mostrarAviso}
              aoTrocarMidia={trocarMidiaQuandoPronta}
              seguirObjeto={{
                marcando: objeto.marcando,
                andamento: objeto.andamento,
                aoIniciar: (clipeId) => {
                  if (reproducao.tocando) alternar();
                  objeto.iniciar(clipeId);
                },
                aoEsconder: (clipeId) => {
                  if (reproducao.tocando) alternar();
                  objeto.iniciar(clipeId, "esconder");
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
            aoCongelar={congelavel ? congelar : undefined}
            className="h-48 md:h-[var(--altura-linha)]"
          />
        </div>
      </div>

      {vendoAtalhos ? <JanelaAtalhos aoFechar={() => setVendoAtalhos(false)} /> : null}
      {salvandoModelo ? (
        <JanelaSalvarModelo
          projetoId={projetoId}
          projeto={projeto}
          nome={edicao.nome}
          midias={bibliotecaDoEditor.midias ?? []}
          salvamento={edicao.salvamento}
          aoFechar={() => setSalvandoModelo(false)}
          aoSalvo={mostrarAviso}
        />
      ) : null}
      {colandoAjustes ? (
        <JanelaColarAjustes
          quantos={selecaoValida.filter((id) => id !== colandoAjustes.clipe.id).length}
          aoFechar={() => setColandoAjustes(null)}
          aoColar={(grupos) => {
            setColandoAjustes(null);
            if (executar({ comando: "clipe.colarAjustes", parametros: { origem: colandoAjustes.clipe, clipeIds: selecaoValida, grupos } })) mostrarAviso("Ajustes colados. Ctrl+Z desfaz.");
          }}
        />
      ) : null}
      {exportando ? (
        <JanelaExportar projetoId={projetoId} projeto={projeto} midias={midias} proporcao={projeto.proporcao} salvamento={edicao.salvamento} tempo={tempo} aoFechar={() => setExportando(false)} />
      ) : null}

      {edicao.aviso ? (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <p className="rounded-lg border border-borda bg-painel-3 px-4 py-2 text-sm shadow-xl shadow-black/40">{edicao.aviso}</p>
        </div>
      ) : null}
    </div>
  );
}