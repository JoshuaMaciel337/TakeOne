"use client";

import { Check, ChevronLeft, Download, Film, LoaderCircle, SlidersHorizontal, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { BarraDeMenus, useAtalhosDosMenus } from "@/componentes/area/BarraDeMenus";
import { ColunaDePaineis, type Painel, useAreaDeTrabalho } from "@/componentes/area/Paineis";
import { PainelHistorico } from "@/componentes/area/PainelHistorico";
import { BotaoTema } from "@/componentes/BotaoTema";
import { Simbolo } from "@/componentes/Logo";

import { Redirecionar } from "@/componentes/projeto/Redirecionar";
import { chamarApi, ErroApi } from "@/lib/api";
import { ACEITAR_ARQUIVOS, useEnvios } from "@/lib/envios";
import type { EstadoDaArea } from "@/lib/areaDeTrabalho";
import { enderecoDoProjeto } from "@/lib/hub";
import { clipeParaAparar, corteVizinho, marcadorVizinho } from "@/lib/projeto/atalhos";
import { type Comando, executarComando } from "@/lib/projeto/comandos";
import type { Texto } from "@/lib/projeto/texto";
import { retomarAudio } from "@/lib/previa/audio";
import { type ClipeCopiado, type Contexto, DURACAO_CONGELADO_S } from "@/lib/projeto/edicao";
import { acharClipe, fimDoClipe, tempoNaMidia, type Transformacao } from "@/lib/projeto/modelo";
import { TEXTO_PADRAO } from "@/lib/projeto/texto";
import { duracaoMaximaDaTransicao } from "@/lib/projeto/transicao";
import { duracaoDoQuadro, quadroMaisProximo, type Taxa, type Tick, TICK_MAXIMO, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import { useMidias } from "@/lib/useMidias";
import { useTamanhoSalvo } from "@/lib/useTamanhoSalvo";
import type { Midia } from "@/lib/tipos";

import { BarraFerramentas } from "./BarraFerramentas";
import { BarraSuperior } from "./BarraSuperior";
import { Divisor } from "./Divisor";
import { FERRAMENTAS, type IdFerramenta } from "./ferramentas";
import { contextoDasMidias } from "./contexto";
import { ControlesDeEfeito } from "./ControlesDeEfeito";
import { ColunaDeFerramentas } from "./ColunaDeFerramentas";
import { FERRAMENTAS_DA_LINHA, type IdFerramentaDaLinha } from "./ferramentasDaLinha";
import { JanelaAtalhos } from "./JanelaAtalhos";
import { JanelaColarAjustes } from "./JanelaColarAjustes";
import { JanelaSalvarModelo } from "./JanelaSalvarModelo";
import { IniciarDesenhoDaMascara } from "./DesenhoDaMascara";
import { JanelaExportar } from "./JanelaExportar";
import { LinhaDoTempo } from "./LinhaDoTempo";
import { JanelaSequencia } from "./JanelaSequencia";
import { MedidoresDeAudio } from "./MedidoresDeAudio";
import { type AcoesDoVideo, AREAS_DO_VIDEO, type IdPainelDoVideo, menusDoVideo, PAINEIS_DO_VIDEO } from "./menusDoVideo";
import { ConteudoDaFerramenta, PainelConteudo } from "./PainelConteudo";
import { PainelComRolagem, PainelEfeitosDoVideo, PainelGraficosEssenciais, PainelSomEssencial, PainelTextoDoVideo } from "./PaineisDoVideo";
import { PainelMarcadores } from "./PainelMarcadores";
import { type IdAba, PainelPropriedades } from "./PainelPropriedades";
import { Previa } from "./Previa";
import { useSeguirObjeto } from "./SeguirObjeto";
import { useProjeto } from "./useProjeto";

const CONTEUDO = { padrao: 320, minimo: 240, maximo: 520 };
const PROPRIEDADES = { padrao: 300, minimo: 240, maximo: 440 };
const LINHA_DO_TEMPO = { padrao: 260, minimo: 150, maximo: 560 };
// O layout dos programas profissionais (tela larga): as colunas de painéis e a altura da metade de cima
const ESQUERDA_CIMA = { padrao: 440, minimo: 260, maximo: 700 };
const DIREITA_CIMA = { padrao: 320, minimo: 240, maximo: 560 };
const ESQUERDA_BAIXO = { padrao: 380, minimo: 220, maximo: 640 };
const METADE_DE_CIMA = { padrao: 470, minimo: 240, maximo: 900 };

/** A área "Edição" dos editores de vídeo profissionais (ADR 0002). */
const AREAS: Record<string, EstadoDaArea> = {
  edicao: {
    cimaEsquerda: [{ id: "g-controles", abas: ["controles", "cor", "metadados"], ativa: "controles" }],
    cimaDireita: [{ id: "g-propriedades", abas: ["propriedades", "graficos", "texto"], ativa: "propriedades" }],
    baixoEsquerda: [{ id: "g-projeto", abas: ["projeto", "efeitos", "marcadores", "historico"], ativa: "projeto" }],
  },
};
const IDS_DOS_PAINEIS = Object.keys(PAINEIS_DO_VIDEO);
/** As ferramentas de antes (o endereço do hub ainda usa os ids delas) e o painel novo de cada uma. */
const PAINEL_DA_FERRAMENTA: Record<IdFerramenta, { painel: IdPainelDoVideo; aba?: string }> = {
  midia: { painel: "projeto" },
  modelos: { painel: "graficos", aba: "modelos" },
  elementos: { painel: "graficos", aba: "elementos" },
  audio: { painel: "som" },
  texto: { painel: "texto", aba: "graficos" },
  legendas: { painel: "texto", aba: "legendas" },
  transcricao: { painel: "texto", aba: "transcricao" },
  efeitos: { painel: "efeitos" },
  transicoes: { painel: "efeitos" },
  filtros: { painel: "efeitos" },
  marca: { painel: "marca" },
  plugins: { painel: "projeto" },
};

/** Tela larga o bastante para o layout dos programas profissionais; abaixo dela, a tela simplificada. */
const CONSULTA_LARGA = "(min-width: 1024px)";
function useTelaLarga(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const consulta = window.matchMedia(CONSULTA_LARGA);
      consulta.addEventListener("change", avisar);
      return () => consulta.removeEventListener("change", avisar);
    },
    () => window.matchMedia(CONSULTA_LARGA).matches,
    () => true,
  );
}

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
  // Abaixo da tela larga as propriedades não cabem ao lado da prévia: abrem numa folha pelo botão "Ajustar"
  const [propriedadesNoCelular, setPropriedadesNoCelular] = useState(false);
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
  // O desenho da máscara de um clipe, na prévia (o painel começa; a prévia devolve os pontos)
  const [desenhandoMascara, setDesenhandoMascara] = useState<string | null>(null);
  const iniciarDesenho = (clipeId: string) => {
    if (reproducao.tocando) alternar();
    setDesenhandoMascara(clipeId);
  };
  const concluirDesenho = (pontos: [number, number][]) => {
    const clipeId = desenhandoMascara;
    setDesenhandoMascara(null);
    if (!clipeId || !projeto) return;
    const anterior = acharClipe(projeto, clipeId)?.clipe.mascara;
    executar({
      comando: "clipe.mascara",
      parametros: { clipeIds: [clipeId], mascara: { forma: "desenho", x: 0.5, y: 0.5, largura: 1, altura: 1, suavidade: anterior?.suavidade ?? 0.02, inverter: anterior?.inverter ?? false, pontos } },
    });
  };

  const [larguraConteudo, setLarguraConteudo] = useTamanhoSalvo("largura-conteudo", CONTEUDO.padrao, CONTEUDO.minimo, CONTEUDO.maximo);
  const [larguraPropriedades, setLarguraPropriedades] = useTamanhoSalvo(
    "largura-propriedades",
    PROPRIEDADES.padrao,
    PROPRIEDADES.minimo,
    PROPRIEDADES.maximo,
  );
  const [alturaLinha, setAlturaLinha] = useTamanhoSalvo("altura-linha", LINHA_DO_TEMPO.padrao, LINHA_DO_TEMPO.minimo, LINHA_DO_TEMPO.maximo);

  // O layout dos programas profissionais (tela larga)
  const router = useRouter();
  const telaLarga = useTelaLarga();
  const area = useAreaDeTrabalho("video", AREAS, "edicao", IDS_DOS_PAINEIS);
  const [larguraEsquerdaCima, setLarguraEsquerdaCima] = useTamanhoSalvo("video-esquerda-cima", ESQUERDA_CIMA.padrao, ESQUERDA_CIMA.minimo, ESQUERDA_CIMA.maximo);
  const [larguraDireitaCima, setLarguraDireitaCima] = useTamanhoSalvo("video-direita-cima", DIREITA_CIMA.padrao, DIREITA_CIMA.minimo, DIREITA_CIMA.maximo);
  const [larguraEsquerdaBaixo, setLarguraEsquerdaBaixo] = useTamanhoSalvo("video-esquerda-baixo", ESQUERDA_BAIXO.padrao, ESQUERDA_BAIXO.minimo, ESQUERDA_BAIXO.maximo);
  const [alturaDeCima, setAlturaDeCima] = useTamanhoSalvo("video-metade-de-cima", METADE_DE_CIMA.padrao, METADE_DE_CIMA.minimo, METADE_DE_CIMA.maximo);
  const [configurando, setConfigurando] = useState(false);
  const [exportandoQuadro, setExportandoQuadro] = useState(false);
  const [pedidoDeAba, setPedidoDeAba] = useState<{ aba: IdAba; vez: number } | undefined>(undefined);
  const [pedidoDeZoom, setPedidoDeZoom] = useState<{ fator: number; vez: number } | undefined>(undefined);
  // A aba dos painéis Texto e Gráficos essenciais (o hub abre o editor numa ferramenta de antes)
  const doEndereco = ferramentaInicial ? PAINEL_DA_FERRAMENTA[ferramentaInicial as IdFerramenta] : undefined;
  const [pedidoTexto, setPedidoTexto] = useState(doEndereco?.painel === "texto" && doEndereco.aba ? { aba: doEndereco.aba, vez: 1 } : undefined);
  const [pedidoGraficos, setPedidoGraficos] = useState(doEndereco?.painel === "graficos" && doEndereco.aba ? { aba: doEndereco.aba, vez: 1 } : undefined);
  const importarRef = useRef<HTMLInputElement>(null);
  const [ferramentaDaLinha, setFerramentaDaLinha] = useState<IdFerramentaDaLinha>("selecao");
  const [entradaSaida, setEntradaSaida] = useState<{ entrada: Tick | null; saida: Tick | null }>({ entrada: null, saida: null });
  // O painel da ferramenta do endereço fica à vista (depois de ler a área guardada no navegador)
  const abrirDoEndereco = useEffectEvent(() => {
    if (doEndereco) area.abrir(doEndereco.painel);
  });
  useEffect(() => {
    void Promise.resolve().then(abrirDoEndereco);
  }, []);
  /** Abre (ou põe à frente) um painel, na aba pedida. */
  function abrirPainel(painel: IdPainelDoVideo, aba?: string) {
    area.abrir(painel);
    if (!aba) return;
    if (painel === "texto") setPedidoTexto((atual) => ({ aba, vez: (atual?.vez ?? 0) + 1 }));
    else if (painel === "graficos") setPedidoGraficos((atual) => ({ aba, vez: (atual?.vez ?? 0) + 1 }));
    else setPedidoDeAba((atual) => ({ aba: aba as IdAba, vez: (atual?.vez ?? 0) + 1 }));
  }

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
  const pendentes = useRef(new Map<string, { inicio: Tick } | { clipeIds: string[] } | { preencher: string }>());
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
      // A foto em 3D: o vídeo entra no lugar da foto (o clipe encurta se ele for mais curto)
      else if ("preencher" in acao) executar({ comando: "clipe.preencher", parametros: { clipeId: acao.preencher, midiaId: id } });
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

  /** O trecho entre a entrada e a saída (sem uma delas, do começo ou até o fim); null sem nenhuma ou ao contrário. */
  function trechoMarcado(): { inicio: Tick; fim: Tick } | null {
    if (!projeto || (entradaSaida.entrada === null && entradaSaida.saida === null)) return null;
    const inicio = entradaSaida.entrada ?? 0;
    const fim = entradaSaida.saida ?? projeto.duracao;
    return fim > inicio ? { inicio, fim } : null;
  }
  function marcarEntradaSaida(qual: "entrada" | "saida") {
    if (!projeto) return;
    const t = quadroMaisProximo(projeto.taxa, tempo);
    // A saída marca o fim do quadro do cursor, como nos editores profissionais
    setEntradaSaida((atual) => ({ ...atual, [qual]: qual === "saida" ? Math.min(t + duracaoDoQuadro(projeto.taxa), projeto.duracao) : t }));
  }
  function irParaEntradaSaida(qual: "entrada" | "saida") {
    const t = entradaSaida[qual];
    if (t === null) mostrarAviso(qual === "entrada" ? "Marque a entrada com I." : "Marque a saída com O.");
    else buscar(qual === "saida" && projeto ? Math.max(0, t - duracaoDoQuadro(projeto.taxa)) : t);
  }
  /** Elevar (;) e extrair ('): tiram o trecho entre a entrada e a saída; extrair fecha o espaço em todas as faixas. */
  function tirarTrecho(fechar: boolean) {
    const trecho = trechoMarcado();
    if (!trecho || !projeto) {
      mostrarAviso("Marque a entrada (I) e a saída (O) antes.");
      return;
    }
    const resultado = fechar
      ? executar({ comando: "linha.removerIntervalos", parametros: { intervalos: [trecho] } })
      : executar({ comando: "linha.elevar", parametros: { intervalo: trecho } });
    if (!resultado) return;
    setEntradaSaida({ entrada: null, saida: null });
    if (fechar) buscar(trecho.inicio);
    const naPrincipal = projeto.faixas.some((faixa) => faixa.tipo === "principal" && faixa.clipes.some((clipe) => clipe.inicio < trecho.fim && fimDoClipe(clipe) > trecho.inicio));
    if (!fechar && naPrincipal) mostrarAviso("A principal é magnética e ficou como estava: para tirar o trecho dela também, use Extrair (').");
  }
  /** Ctrl+D e Ctrl+Shift+D: a transição padrão (fusão de 1 s) nos cortes dos clipes marcados da principal, ou no do cursor. */
  function transicaoPadrao(doSom: boolean) {
    if (!projeto) return;
    const faixa = projeto.faixas.find((item) => item.tipo === "principal");
    if (!faixa) return;
    const marcados = faixa.clipes.filter((clipe) => selecaoValida.includes(clipe.id));
    // Sem clipe marcado, o corte mais perto do cursor
    const perto = [...faixa.clipes].slice(0, -1).sort((a, b) => Math.abs(fimDoClipe(a) - tempo) - Math.abs(fimDoClipe(b) - tempo))[0];
    const alvos = (marcados.length ? marcados : perto ? [perto] : []).filter((clipe) => faixa.clipes.indexOf(clipe) < faixa.clipes.length - 1);
    if (!alvos.length) {
      mostrarAviso("A transição fica no corte entre dois clipes da principal.");
      return;
    }
    for (const clipe of alvos) {
      const proximo = faixa.clipes[faixa.clipes.indexOf(clipe) + 1];
      const duracao = Math.min(TICKS_POR_SEGUNDO, duracaoMaximaDaTransicao(clipe, proximo));
      const atual = clipe.transicao;
      const transicao = doSom ? { ...(atual ?? { tipo: "fusao" as const, duracao }), misturar_som: true } : { tipo: "fusao" as const, duracao, misturar_som: Boolean(atual?.misturar_som) };
      executar({ comando: "clipe.transicao", parametros: { clipeId: clipe.id, transicao } });
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
    if (!projeto || exportando || vendoAtalhos || colandoAjustes || salvandoModelo || configurando || evento.defaultPrevented || doDeslizante || (campo && !deslizante)) return;
    if (deslizante && evento.code === "Space") alvo.blur();
    const quadro = duracaoDoQuadro(projeto.taxa);

    if (evento.code === "Space") {
      if (alvo instanceof HTMLButtonElement) alvo.blur();
      alternar();
    } else if (ctrl && tecla === "z" && !evento.shiftKey) desfazer();
    else if (ctrl && (tecla === "y" || (tecla === "z" && evento.shiftKey))) refazer();
    else if (ctrl && tecla === "s") mostrarAviso("O TakeOne salva sozinho a cada alteração.");
    // S liga o ímã e Ctrl+K divide, como nos editores profissionais (Ctrl+B também divide)
    else if (tecla === "s" && !ctrl && !evento.altKey) setIma((atual) => !atual);
    else if (ctrl && !evento.shiftKey && (tecla === "b" || tecla === "k")) executar({ comando: "linha.dividir", parametros: { tempo, clipeIds: selecaoValida } });
    else if (ctrl && tecla === "d") transicaoPadrao(evento.shiftKey);
    else if (ctrl && evento.shiftKey && tecla === "x") setEntradaSaida({ entrada: null, saida: null });
    else if ((tecla === "i" || tecla === "o") && !ctrl && !evento.altKey) {
      if (evento.shiftKey) irParaEntradaSaida(tecla === "i" ? "entrada" : "saida");
      else marcarEntradaSaida(tecla === "i" ? "entrada" : "saida");
    } else if (evento.key === ";" && !ctrl) tirarTrecho(false);
    else if (evento.key === "'" && !ctrl) tirarTrecho(true);
    else if (tecla === "k" && !ctrl) {
      if (reproducao.tocando) alternar();
    } else if (tecla === "l" && !ctrl) {
      if (!reproducao.tocando) alternar();
    } else if (tecla === "j" && !ctrl) {
      // O editor não toca para trás: o J para e volta um segundo
      if (reproducao.tocando) alternar();
      buscar(Math.max(0, tempo - TICKS_POR_SEGUNDO));
    } else if (telaLarga && !ctrl && !evento.altKey && !evento.shiftKey && FERRAMENTAS_DA_LINHA.some((item) => item.tecla.toLowerCase() === tecla)) {
      setFerramentaDaLinha(FERRAMENTAS_DA_LINHA.find((item) => item.tecla.toLowerCase() === tecla)!.id);
    }
    else if ((tecla === "delete" || tecla === "backspace") && !evento.shiftKey && selecaoValida.length) executar({ comando: "clipe.apagar", parametros: { clipeIds: selecaoValida } });
    else if (ctrl && evento.shiftKey && (evento.key === "/" || evento.key === "?") && selecaoValida.length) executar({ comando: "clipe.duplicar", parametros: { clipeIds: selecaoValida } });
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
    else if (tecla === "m" && !ctrl && !evento.altKey && !evento.shiftKey) executar({ comando: "marcador.adicionar", parametros: { tempo } });
    else if (tecla === "m" && evento.shiftKey && !evento.altKey) {
      // Shift+M: o próximo marcador; Ctrl+Shift+M: o anterior
      const marcador = marcadorVizinho(projeto, tempo, ctrl ? -1 : 1, quadro / 2);
      if (marcador !== null) buscar(marcador);
    }
    else if ((tecla === "arrowup" || tecla === "arrowdown") && evento.shiftKey && !ctrl && !evento.altKey) {
      const marcador = marcadorVizinho(projeto, tempo, tecla === "arrowup" ? -1 : 1, quadro / 2);
      if (marcador !== null) buscar(marcador);
    } else if ((tecla === "arrowup" || tecla === "arrowdown") && !ctrl && !evento.altKey) {
      const corte = corteVizinho(projeto, tempo, tecla === "arrowup" ? -1 : 1, quadro / 2);
      if (corte !== null) buscar(corte);
    } else if (evento.key === "?") setVendoAtalhos(true);
    // Shift + seta: cinco quadros, como nos editores profissionais
    else if (tecla === "arrowleft") buscar(quadroMaisProximo(projeto.taxa, tempo) - (evento.shiftKey ? 5 : 1) * quadro);
    else if (tecla === "arrowright") buscar(quadroMaisProximo(projeto.taxa, tempo) + (evento.shiftKey ? 5 : 1) * quadro);
    else if (tecla === "home") buscar(0);
    else if (tecla === "end") buscar(projeto.duracao);
    else if (tecla === "escape") setSelecao([]);
    // Na tela simplificada o N continua ligando o ímã (na larga, é a Edição contínua)
    else if (tecla === "n" && !ctrl && !telaLarga) setIma((atual) => !atual);
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

  const aoSelecionarClipes = (ids: string[]) => {
    setSelecao(ids);
    if (ids.length) setMidiaId(null);
  };
  const propsDoConteudo = {
    biblioteca: bibliotecaDoEditor,
    midiaSelecionadaId: midiaId,
    aoSelecionarMidia: (id: string | null) => {
      setMidiaId(id);
      setSelecao([]);
    },
    aoAdicionarMidia: adicionarNoCursor,
    aoAdicionarTexto: (texto: Texto) => executar({ comando: "texto.adicionar", parametros: { inicio: tempo, texto } }),
    aoPedirAnimacao: pedirAnimacao,
    gravacao: {
      tempo,
      taxa: projeto.taxa,
      tocando: reproducao.tocando,
      aoAlternar: alternar,
      aoGravar: (arquivo: File, inicio: Tick) => {
        iniciarEnvio([arquivo], (id) => pedirAnimacao({ id }, inicio));
        mostrarAviso("Narração gravada: ela entra na faixa de áudio quando terminar de subir.");
      },
    },
    aoExecutarQuandoProntas: executarQuandoProntas,
    modeloInicial,
    animacaoInicial,
    selecionado,
    aoPrever: preverDoPainel,
    legendas: {
      projeto,
      nome: edicao.nome,
      tempo,
      selecao: selecaoValida,
      aoExecutar: executar,
      aoBuscar: buscar,
      aoSelecionar: aoSelecionarClipes,
      aoAvisar: mostrarAviso,
    },
  };
  const propsDasPropriedades = {
    midias,
    taxa: projeto.taxa,
    tempo,
    aoBuscar: buscar,
    proporcao: projeto.proporcao,
    faixas: projeto.faixas,
    aoAvisar: mostrarAviso,
    aoTrocarMidia: trocarMidiaQuandoPronta,
    aoTrocarPorVideo: (clipeId: string, midia: Midia) => {
      pendentes.current.set(midia.id, { preencher: clipeId });
      void biblioteca.recarregar();
    },
    seguirObjeto: {
      marcando: objeto.marcando,
      andamento: objeto.andamento,
      aoIniciar: (clipeId: string) => {
        if (reproducao.tocando) alternar();
        objeto.iniciar(clipeId);
      },
      aoEsconder: (clipeId: string) => {
        if (reproducao.tocando) alternar();
        objeto.iniciar(clipeId, "esconder");
      },
    },
    fundo: (projetoNaTela ?? projeto).fundo.cor,
    aoPrever: preverDoPainel,
    aoExecutar: (comando: Comando) => {
      setProvisorio(null);
      executar(comando);
    },
  };
  const propsDaPrevia = {
    projeto: projetoNaTela ?? projeto,
    midias,
    tempo,
    tocando: reproducao.tocando,
    aoAlternar: alternar,
    selecao: selecaoValida,
    aoSelecionar: aoSelecionarClipes,
    aoPrever: (clipeId: string, mudanca: Partial<Transformacao> | null) =>
      setProvisorio(mudanca ? { comando: "clipe.transformar", parametros: { clipeIds: [clipeId], transformacao: mudanca, tempo } } : null),
    aoTransformar: (clipeId: string, mudanca: Partial<Transformacao>) => executar({ comando: "clipe.transformar", parametros: { clipeIds: [clipeId], transformacao: mudanca, tempo } }),
    desenhoDaMascara: desenhandoMascara ? { clipeId: desenhandoMascara, aoConcluir: concluirDesenho, aoCancelar: () => setDesenhandoMascara(null) } : null,
    marcacao: objeto.marcando ? { seguidorId: objeto.marcando, proprio: objeto.modo === "esconder", aoConfirmar: objeto.confirmar, aoCancelar: objeto.cancelar } : null,
  };
  const propsDaLinha = {
    projeto,
    midias,
    ctx,
    tempo,
    tocando: reproducao.tocando,
    selecao: selecaoValida,
    ima,
    aoAlternarIma: () => setIma((atual) => !atual),
    aoBuscar: buscar,
    aoSelecionar: aoSelecionarClipes,
    aoExecutar: executar,
    aoCongelar: congelavel ? congelar : undefined,
  };
  const janelas = (
    <>
      {vendoAtalhos ? <JanelaAtalhos aoFechar={() => setVendoAtalhos(false)} /> : null}
      {configurando ? <JanelaSequencia projeto={projetoNaTela ?? projeto} aoPrever={preverDoPainel} aoExecutar={executar} aoFechar={() => setConfigurando(false)} /> : null}
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
        <JanelaExportar
          projetoId={projetoId}
          projeto={projeto}
          midias={midias}
          proporcao={projeto.proporcao}
          salvamento={edicao.salvamento}
          tempo={tempo}
          inicial={exportandoQuadro ? "quadro" : "video"}
          aoFechar={() => {
            setExportando(false);
            setExportandoQuadro(false);
          }}
        />
      ) : null}
      {edicao.aviso ? (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <p className="rounded-lg border border-borda bg-painel-3 px-4 py-2 text-sm shadow-xl shadow-black/40">{edicao.aviso}</p>
        </div>
      ) : null}
    </>
  );

  if (telaLarga) {
    const conteudo = (id: IdFerramenta) => <ConteudoDaFerramenta ferramenta={FERRAMENTAS.find((item) => item.id === id)!} {...propsDoConteudo} />;
    const acoes: AcoesDoVideo = {
      temSelecao: selecaoValida.length > 0,
      podeDesfazer: edicao.nomeDesfazer,
      podeRefazer: edicao.nomeRefazer,
      ima,
      temMarcadores: (projeto.marcadores ?? []).length > 0,
      podeSepararSom: selecaoValida.some((id) => {
        const achado = acharClipe(projeto, id);
        const midia = achado?.clipe.midia_id ? midias.get(achado.clipe.midia_id) : undefined;
        return Boolean(achado && achado.faixa.tipo !== "audio" && !achado.clipe.som_separado && midia?.audio && midia.video && !midia.imagem);
      }),
      podeCongelar: congelavel,
      area: area.area,
      painelAberto: (painel) => area.aberto(painel),
      novo: () => router.push("/app/projetos"),
      abrir: () => router.push("/app/projetos"),
      importar: () => importarRef.current?.click(),
      salvar: () => mostrarAviso("O TakeOne salva sozinho a cada alteração."),
      salvarModelo: () => setSalvandoModelo(true),
      exportar: () => setExportando(true),
      exportarQuadro: () => {
        setExportandoQuadro(true);
        setExportando(true);
      },
      desfazer,
      refazer,
      recortar: () => {
        copiar();
        executar({ comando: "clipe.apagar", parametros: { clipeIds: selecaoValida } });
      },
      copiar,
      colar: () => {
        if (copiados.current.length) executar({ comando: "clipe.colar", parametros: { copiados: copiados.current, inicio: tempo } });
        else mostrarAviso("Copie um clipe antes (Ctrl+C).");
      },
      colarAtributos: () => {
        if (!copiados.current.length) mostrarAviso("Copie um clipe antes (Ctrl+C).");
        else setColandoAjustes(copiados.current[0]);
      },
      limpar: () => executar({ comando: "clipe.apagar", parametros: { clipeIds: selecaoValida } }),
      excluirEmOndulacao: () => executar({ comando: "clipe.apagar", parametros: { clipeIds: selecaoValida, fecharEspaco: true } }),
      duplicar: () => executar({ comando: "clipe.duplicar", parametros: { clipeIds: selecaoValida } }),
      temTrecho: trechoMarcado() !== null,
      marcarEntradaSaida,
      irParaEntradaSaida,
      limparEntradaSaida: () => setEntradaSaida({ entrada: null, saida: null }),
      elevar: () => tirarTrecho(false),
      extrair: () => tirarTrecho(true),
      transicaoPadrao,
      selecionarTudo: () => setSelecao(projeto.faixas.flatMap((faixa) => faixa.clipes.map((clipe) => clipe.id))),
      desmarcarTudo: () => setSelecao([]),
      atalhos: () => setVendoAtalhos(true),
      velocidade: () => abrirPainel("controles", "velocidade"),
      separarSom: () =>
        executar({
          comando: "clipe.separarSom",
          parametros: {
            clipeIds: selecaoValida.filter((id) => {
              const achado = acharClipe(projeto, id);
              return achado && achado.faixa.tipo !== "audio";
            }),
          },
        }),
      congelar,
      dividir: () => executar({ comando: "linha.dividir", parametros: { tempo, clipeIds: selecaoValida } }),
      alternarIma: () => setIma((atual) => !atual),
      criarAutomaticamente: () => abrirPainel("texto", "transcricao"),
      configuracoes: () => setConfigurando(true),
      marcador: () => executar({ comando: "marcador.adicionar", parametros: { tempo } }),
      marcadorVizinho: (sentido) => {
        const marcador = marcadorVizinho(projeto, tempo, sentido, duracaoDoQuadro(projeto.taxa) / 2);
        if (marcador !== null) buscar(marcador);
      },
      limparMarcadores: () => {
        for (const marcador of projeto.marcadores ?? []) executar({ comando: "marcador.apagar", parametros: { id: marcador.id } });
      },
      novoTexto: () => executar({ comando: "texto.adicionar", parametros: { inicio: tempo, texto: TEXTO_PADRAO } }),
      legendas: () => abrirPainel("texto", "legendas"),
      zoomDaLinha: (fator) => setPedidoDeZoom((atual) => ({ fator, vez: (atual?.vez ?? 0) + 1 })),
      painel: (painel) => abrirPainel(painel),
      alternarPainel: (painel) => area.alternar(painel),
      escolherArea: area.escolherArea,
      restaurarArea: area.restaurar,
    };
    const paineis: Record<IdPainelDoVideo, Painel> = {
      controles: {
        nome: PAINEIS_DO_VIDEO.controles,
        conteudo: (
          <ControlesDeEfeito
            projeto={projetoNaTela ?? projeto}
            selecionado={selecionado}
            midia={midiaDoClipe}
            tempo={tempo}
            aoBuscar={buscar}
            aoPrever={preverDoPainel}
            aoExecutar={propsDasPropriedades.aoExecutar}
            aoAbrirAba={(aba) => abrirPainel("propriedades", aba)}
          />
        ),
      },
      cor: { nome: PAINEIS_DO_VIDEO.cor, conteudo: <PainelPropriedades {...propsDasPropriedades} midia={midiaDoClipe} selecionado={selecionado} somenteAbas={["cor"]} className="h-full" /> },
      metadados: { nome: PAINEIS_DO_VIDEO.metadados, conteudo: <PainelPropriedades {...propsDasPropriedades} midia={midiaDasPropriedades} selecionado={selecionado} somenteAbas={["info"]} className="h-full" /> },
      propriedades: { nome: PAINEIS_DO_VIDEO.propriedades, conteudo: <PainelPropriedades {...propsDasPropriedades} midia={midiaDasPropriedades} selecionado={selecionado} pedidoDeAba={pedidoDeAba} className="h-full" /> },
      graficos: { nome: PAINEIS_DO_VIDEO.graficos, conteudo: <PainelGraficosEssenciais conteudo={conteudo} pedido={pedidoGraficos} /> },
      texto: { nome: PAINEIS_DO_VIDEO.texto, conteudo: <PainelTextoDoVideo conteudo={conteudo} pedido={pedidoTexto} /> },
      projeto: { nome: PAINEIS_DO_VIDEO.projeto, conteudo: <PainelComRolagem>{conteudo("midia")}</PainelComRolagem> },
      efeitos: { nome: PAINEIS_DO_VIDEO.efeitos, conteudo: <PainelEfeitosDoVideo conteudo={conteudo} /> },
      marcadores: { nome: PAINEIS_DO_VIDEO.marcadores, conteudo: <PainelMarcadores projeto={projeto} tempo={tempo} aoBuscar={buscar} aoExecutar={executar} /> },
      historico: { nome: PAINEIS_DO_VIDEO.historico, conteudo: <PainelHistorico nome={edicao.nome} feitos={edicao.passos.feitos} desfeitos={edicao.passos.desfeitos} aoIr={edicao.irParaPasso} Icone={Film} /> },
      som: {
        nome: PAINEIS_DO_VIDEO.som,
        conteudo: (
          <PainelSomEssencial
            clipe={selecionado?.clipe ?? null}
            comSom={Boolean(selecionado && (selecionado.faixa.tipo === "audio" || (midiaDoClipe?.audio && !midiaDoClipe.imagem && !selecionado.clipe.texto)))}
            sugerido={selecionado?.faixa.tipo === "audio" ? "musica" : "dialogo"}
            ajustes={(tipoDeSom) => <PainelPropriedades {...propsDasPropriedades} midia={midiaDoClipe} selecionado={selecionado} somenteAbas={["audio"]} tipoDeSom={tipoDeSom} />}
            adicionar={conteudo("audio")}
          />
        ),
      },
      marca: { nome: PAINEIS_DO_VIDEO.marca, conteudo: <PainelComRolagem>{conteudo("marca")}</PainelComRolagem> },
    };
    const colunas = { cimaEsquerda: area.estado.cimaEsquerda ?? [], cimaDireita: area.estado.cimaDireita ?? [], baixoEsquerda: area.estado.baixoEsquerda ?? [] };
    const janelaAberta = exportando || vendoAtalhos || Boolean(colandoAjustes) || salvandoModelo || configurando;
    const salvamento =
      edicao.salvamento === "salvo"
        ? "Salvo"
        : edicao.salvamento === "conflito"
          ? "Alterado em outra aba"
          : edicao.salvamento === "erro"
            ? "Não foi possível salvar"
            : edicao.salvamento === "sem-conexao"
              ? "Sem conexão"
              : "Salvando…";
    return (
      <IniciarDesenhoDaMascara.Provider value={iniciarDesenho}>
        <div className="flex h-dvh flex-col overflow-hidden bg-fundo text-texto">
          <header className="flex h-8 shrink-0 items-center gap-1 border-b border-borda bg-painel px-1.5">
            <Link href="/app" className="flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-suave transition hover:text-texto" title="Voltar ao início">
              <ChevronLeft className="size-3.5" aria-hidden />
              <Simbolo tamanho={18} />
            </Link>
            <MenusDoVideo acoes={acoes} ativo={!janelaAberta} />
            <input
              id="nome-projeto"
              value={edicao.nome}
              onChange={(evento) => edicao.renomear(evento.currentTarget.value)}
              aria-label="Nome do projeto"
              maxLength={120}
              className="mx-auto w-56 min-w-0 rounded bg-transparent px-2 py-0.5 text-center text-xs font-medium outline-none hover:bg-painel-2 focus:bg-painel-2"
            />
            <span className="flex items-center gap-1 text-[11px] text-suave" role="status">
              {edicao.salvamento === "salvo" ? <Check className="size-3" aria-hidden /> : <LoaderCircle className="size-3 animate-spin" aria-hidden />}
              {salvamento}
            </span>
            <select
              aria-label="Área de trabalho"
              title="Área de trabalho"
              value={area.area}
              onChange={(evento) => area.escolherArea(evento.currentTarget.value)}
              className="ml-2 rounded border border-borda bg-painel-2 px-1 py-0.5 text-[11px]"
            >
              {Object.entries(AREAS_DO_VIDEO).map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
            <BotaoTema />
            <button type="button" className="botao-principal shrink-0 px-2.5 py-0.5 text-xs" onClick={() => setExportando(true)} title="Exportar mídia (Ctrl+M)">
              <Download className="size-3.5" aria-hidden />
              Exportar
            </button>
          </header>
          <input
            ref={importarRef}
            type="file"
            multiple
            hidden
            accept={ACEITAR_ARQUIVOS}
            onChange={(evento) => {
              const arquivos = [...(evento.currentTarget.files ?? [])];
              evento.currentTarget.value = "";
              if (arquivos.length) {
                iniciarEnvio(arquivos);
                abrirPainel("projeto");
              }
            }}
          />

          <div className="flex shrink-0 gap-px bg-borda" style={{ height: alturaDeCima }}>
            {colunas.cimaEsquerda.length ? (
              <>
                <ColunaDePaineis grupos={colunas.cimaEsquerda} paineis={paineis} area={area} className="shrink-0" style={{ width: larguraEsquerdaCima }} />
                <Divisor direcao="coluna" valor={larguraEsquerdaCima} minimo={ESQUERDA_CIMA.minimo} maximo={ESQUERDA_CIMA.maximo} aoMudar={setLarguraEsquerdaCima} rotulo="Largura dos painéis de cima à esquerda" />
              </>
            ) : null}
            <section aria-label="Programa" className="flex min-w-0 flex-1 flex-col overflow-hidden bg-painel">
              <div className="flex h-7 shrink-0 items-center gap-1 border-b border-borda bg-painel-2/60 px-3 text-[11px]">
                <span className="font-semibold">Programa:</span>
                <span className="truncate text-suave">{edicao.nome || "Sequência"}</span>
              </div>
              <Previa
                {...propsDaPrevia}
                programa={{
                  aoQuadro: (passo) => buscar(quadroMaisProximo(projeto.taxa, tempo) + passo * duracaoDoQuadro(projeto.taxa)),
                  aoIr: (onde) => (onde === "entrada" || onde === "saida" ? irParaEntradaSaida(onde) : buscar(onde === "inicio" ? 0 : projeto.duracao)),
                  aoMarcador: acoes.marcador,
                  aoExportarQuadro: acoes.exportarQuadro,
                  aoMarcar: marcarEntradaSaida,
                  aoElevar: () => tirarTrecho(false),
                  aoExtrair: () => tirarTrecho(true),
                  temTrecho: trechoMarcado() !== null,
                }}
                aoClicarParaTexto={
                  ferramentaDaLinha === "texto"
                    ? (x, y) => {
                        executar({ comando: "texto.adicionar", parametros: { inicio: tempo, texto: TEXTO_PADRAO, transformacao: { x, y } } });
                        setFerramentaDaLinha("selecao");
                        abrirPainel("propriedades", "texto");
                      }
                    : undefined
                }
                className="min-h-0 flex-1"
              />
            </section>
            {colunas.cimaDireita.length ? (
              <>
                <Divisor direcao="coluna" valor={larguraDireitaCima} minimo={DIREITA_CIMA.minimo} maximo={DIREITA_CIMA.maximo} aoMudar={setLarguraDireitaCima} sentido={-1} rotulo="Largura dos painéis de cima à direita" />
                <ColunaDePaineis grupos={colunas.cimaDireita} paineis={paineis} area={area} className="shrink-0" style={{ width: larguraDireitaCima }} />
              </>
            ) : null}
          </div>
          <Divisor direcao="linha" valor={alturaDeCima} minimo={METADE_DE_CIMA.minimo} maximo={METADE_DE_CIMA.maximo} aoMudar={setAlturaDeCima} rotulo="Altura da metade de cima" />
          <div className="flex min-h-0 flex-1 gap-px bg-borda">
            {colunas.baixoEsquerda.length ? (
              <>
                <ColunaDePaineis grupos={colunas.baixoEsquerda} paineis={paineis} area={area} className="shrink-0" style={{ width: larguraEsquerdaBaixo }} />
                <Divisor direcao="coluna" valor={larguraEsquerdaBaixo} minimo={ESQUERDA_BAIXO.minimo} maximo={ESQUERDA_BAIXO.maximo} aoMudar={setLarguraEsquerdaBaixo} rotulo="Largura dos painéis de baixo à esquerda" />
              </>
            ) : null}
            <ColunaDeFerramentas ativa={ferramentaDaLinha} aoEscolher={setFerramentaDaLinha} />
            <LinhaDoTempo {...propsDaLinha} profissional pedidoDeZoom={pedidoDeZoom} ferramenta={ferramentaDaLinha} entradaSaida={entradaSaida} className="min-w-0 flex-1" />
            <MedidoresDeAudio tocando={reproducao.tocando} className="w-12" />
          </div>
          {janelas}
        </div>
      </IniciarDesenhoDaMascara.Provider>
    );
  }

  const tamanhos = {
    "--largura-conteudo": `${larguraConteudo}px`,
    "--largura-propriedades": `${larguraPropriedades}px`,
    "--altura-linha": `${alturaLinha}px`,
  } as React.CSSProperties;

  return (
    <IniciarDesenhoDaMascara.Provider value={iniciarDesenho}>
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
            setPropriedadesNoCelular(false);
          }}
          className="max-md:order-2"
        />

        <PainelConteudo
          ferramenta={ferramentaAtual}
          {...propsDoConteudo}
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
          <div className="relative flex min-h-0 flex-1">
            {selecionado && !propriedadesNoCelular ? (
              <button
                type="button"
                onClick={() => {
                  setPropriedadesNoCelular(true);
                  setPainelNoCelular(false);
                }}
                className="botao-secundario absolute right-3 top-3 z-30 px-3 py-1.5 text-xs shadow-lg lg:hidden"
              >
                <SlidersHorizontal className="size-3.5" aria-hidden />
                Ajustar
              </button>
            ) : null}
            <Previa
              {...propsDaPrevia}
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
              {...propsDasPropriedades}
              midia={midiaDasPropriedades}
              selecionado={selecionado}
              aoFechar={() => setPropriedadesNoCelular(false)}
              className={`w-[var(--largura-propriedades)] ${
                propriedadesNoCelular && selecionado
                  ? "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:h-[60dvh] max-lg:w-auto max-lg:border-t max-lg:border-borda max-lg:shadow-2xl"
                  : "max-lg:hidden"
              }`}
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
            {...propsDaLinha}
            className="h-48 md:h-[var(--altura-linha)]"
          />
        </div>
      </div>

      {janelas}
    </div>
    </IniciarDesenhoDaMascara.Provider>
  );
}

/** A barra de menus e os atalhos dela (os menus são montados aqui, com o estado da vez). */
function MenusDoVideo({ acoes, ativo }: { acoes: AcoesDoVideo; ativo: boolean }) {
  const menus = menusDoVideo(acoes);
  useAtalhosDosMenus(menus, ativo);
  return <BarraDeMenus menus={menus} className="min-w-0" />;
}
