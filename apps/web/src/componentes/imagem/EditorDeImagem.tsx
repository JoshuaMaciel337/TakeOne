"use client";

import { Check, ChevronLeft, Download, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { BarraDeMenus, useAtalhosDosMenus } from "@/componentes/area/BarraDeMenus";
import { ColunaDePaineis, type Painel, useAreaDeTrabalho } from "@/componentes/area/Paineis";
import { PainelHistorico } from "@/componentes/area/PainelHistorico";
import { BotaoTema } from "@/componentes/BotaoTema";
import { Simbolo } from "@/componentes/Logo";
import { contextoDasMidias } from "@/componentes/editor/contexto";
import { PainelEfeitos } from "@/componentes/editor/PainelEfeitos";
import { PainelFormas } from "@/componentes/editor/PainelFormas";
import { type IdAba, PainelPropriedades } from "@/componentes/editor/PainelPropriedades";
import { MiniaturaDoEstilo } from "@/componentes/editor/PainelTexto";
import { useProjeto } from "@/componentes/editor/useProjeto";
import { Redirecionar } from "@/componentes/projeto/Redirecionar";
import { criarForma } from "@/lib/elementos";
import type { EstadoDaArea } from "@/lib/areaDeTrabalho";
import { enderecoDoProjeto } from "@/lib/hub";
import { useMarca } from "@/lib/marca";
import type { Comando } from "@/lib/projeto/comandos";
import { executarComando } from "@/lib/projeto/comandos";
import { INTENSIDADE_PADRAO, type TipoEfeito } from "@/lib/projeto/efeitos";
import { alinhar, type CaixaNoQuadro, deslocar, distribuir, type MudancaDePosicao, mudancaComVinculadas, unidadesDaSelecao } from "@/lib/projeto/alinhar";
import { camadaTravada, camadaVisivel, comDescendentes, faixasEmOrdem } from "@/lib/projeto/arvore";
import { camadasDaImagem, type RetanguloDaImagem, tamanhoDaImagem } from "@/lib/projeto/imagem";
import { acharClipe, type Faixa, MASCARA_PADRAO, type Transformacao } from "@/lib/projeto/modelo";
import { camadasDoModelo, fundoDoModelo, type MidiasDoModelo, type ModeloDeImagem, modeloDeImagem, pedidosDoModelo } from "@/lib/projeto/modelosDeImagem";
import { CONTORNO_PADRAO, SOMBRA_PADRAO } from "@/lib/projeto/silhueta";
import { ESTILOS_DE_TEXTO, type Texto, TEXTO_PADRAO } from "@/lib/projeto/texto";
import type { Midia } from "@/lib/tipos";
import { useMidias } from "@/lib/useMidias";

import type { Ajuste } from "./ajustesDaImagem";
import { BarraDeOpcoes, type OpcoesDaForma } from "./BarraDeOpcoes";
import { CaixaDeFerramentas } from "./CaixaDeFerramentas";
import { ferramenta as dadosDa, FERRAMENTAS_DE_PINTURA, FORMA_DA_FERRAMENTA, GRUPOS_DE_FERRAMENTAS, grupoDa, type IdFerramentaDaImagem, MODO_DA_SELECAO, TODAS_AS_FERRAMENTAS } from "./ferramentasDaImagem";
import { JanelaEscolherImagem } from "./JanelaEscolherImagem";
import { JanelaExportarImagem } from "./JanelaExportarImagem";
import { type AcoesDosMenus, AREAS_DA_IMAGEM, type IdPainelDaImagem, menusDaImagem, PAINEIS_DA_IMAGEM } from "./menusDaImagem";
import { nomeDaCamada, PainelCamadas } from "./PainelCamadas";
import { PainelFotoIA } from "./PainelFotoIA";
import { PainelAjustes, PainelAmostras, PainelBiblioteca, PainelCor, PainelModelosDaImagem } from "./PaineisDaImagem";
import { PreviaDaImagem, proximoZoom } from "./PreviaDaImagem";
import { PropriedadesDoDocumento } from "./PropriedadesDoDocumento";
import { useObjeto } from "./useObjeto";
import { usePinturas } from "./usePinturas";
import type { AlvoDaPintura } from "./PinturaNaPrevia";
import { type FerramentaDePintura, type OpcoesDoPincel, PINCEL_PADRAO, type SecaoDoPincel, type Simetria } from "@/lib/pintura/traco";
import { comPredefinicao, PainelConfiguracoesDoPincel, PainelPinceis } from "./PaineisDoPincel";
import { criarPincel, excluirPincel, importarAbr, predefinicaoDoEspaco, usePinceisDoEspaco } from "@/lib/pinceis";
import { criarCamadaDePixels, enviarVersao } from "@/lib/pixels";
import { exportarImagem } from "@/lib/exportacao/imagem";
import { planoDosPixels, type PlanoDosPixels, type TipoDaMesclagem } from "@/lib/projeto/rasterizar";

const SEM_SEGUIR = {
  marcando: null,
  andamento: null,
  aoIniciar: () => undefined,
};
const NADA = () => undefined;

/** As áreas de trabalho: uma coluna de grupos à direita, como nos editores de imagem profissionais. */
const AREAS: Record<string, EstadoDaArea> = {
  essenciais: {
    direita: [
      { id: "g-cor", abas: ["cor", "amostras", "formas"], ativa: "cor", altura: 190 },
      { id: "g-propriedades", abas: ["propriedades", "ajustes", "biblioteca", "modelos"], ativa: "propriedades", altura: 340 },
      { id: "g-camadas", abas: ["camadas", "historico"], ativa: "camadas" },
    ],
  },
  fotografia: {
    direita: [
      { id: "g-propriedades", abas: ["propriedades", "ajustes", "filtros"], ativa: "propriedades", altura: 360 },
      { id: "g-biblioteca", abas: ["biblioteca", "fotoIA"], ativa: "biblioteca", altura: 220 },
      { id: "g-camadas", abas: ["camadas", "historico"], ativa: "camadas" },
    ],
  },
  grafico: {
    direita: [
      { id: "g-cor", abas: ["cor", "amostras"], ativa: "cor", altura: 190 },
      { id: "g-propriedades", abas: ["propriedades", "estilos", "formas", "modelos"], ativa: "propriedades", altura: 340 },
      { id: "g-camadas", abas: ["camadas", "historico", "biblioteca"], ativa: "camadas" },
    ],
  },
};
const IDS_DOS_PAINEIS = Object.keys(PAINEIS_DA_IMAGEM);

type Pendente = { trocar?: string[]; camadaDe?: string; caixa?: RetanguloDaImagem };

function porcentagem(zoom: number): string {
  return `${(Math.round(zoom * 1000) / 10).toLocaleString("pt-BR")}%`;
}

/**
 * O editor de imagem (ADR 0002): menus, barra de opções, caixa de ferramentas à esquerda, o documento no meio e os
 * painéis encaixados à direita, nos lugares e com os nomes dos editores de imagem profissionais. O projeto, o
 * desfazer e o salvamento são os do editor de vídeo; as camadas são faixas com um clipe só.
 */
export function EditorDeImagem({ projetoId, modeloInicial }: { projetoId: string; modeloInicial?: string }) {
  const router = useRouter();
  const marca = useMarca();
  const biblioteca = useMidias();
  // As camadas de pixels criadas agora entram aqui antes da biblioteca recarregar (a pessoa já está pintando)
  const [criadas, setCriadas] = useState<ReadonlyMap<string, Midia>>(new Map());
  const midias = useMemo(() => new Map([...criadas, ...(biblioteca.midias ?? []).map((midia) => [midia.id, midia] as const)]), [biblioteca.midias, criadas]);
  const ctx = useMemo(() => contextoDasMidias(midias), [midias]);
  const edicao = useProjeto(projetoId, ctx);
  const { projeto, executar: executarNoProjeto, desfazer, refazer, mostrarAviso } = edicao;
  const area = useAreaDeTrabalho("imagem", AREAS, "essenciais", IDS_DOS_PAINEIS);

  const [ferramenta, setFerramenta] = useState<IdFerramentaDaImagem>("mover");
  const [ultimas, setUltimas] = useState<Partial<Record<number, IdFerramentaDaImagem>>>({});
  const [cores, setCores] = useState<{ primeiroPlano: string; fundo: string; editando: "primeiroPlano" | "fundo" }>({ primeiroPlano: "#000000", fundo: "#ffffff", editando: "primeiroPlano" });
  const [forma, setForma] = useState<OpcoesDaForma>({ tracoCor: "#000000", traco: 0, arredondado: false, personalizada: "seta" });
  const [zoom, setZoom] = useState<number | null>(null);
  const [zoomMedido, setZoomMedido] = useState(1);
  const [removerAoSoltar, setRemoverAoSoltar] = useState(true);
  const [pedindo, setPedindo] = useState(false);
  const [pedidoDeAba, setPedidoDeAba] = useState<{ aba: IdAba; vez: number } | undefined>(undefined);

  // As opções de cada ferramenta de pintura (o pincel e a borracha guardam tamanhos diferentes, como lá)
  const [pinceis, setPinceis] = useState<Record<FerramentaDePintura, OpcoesDoPincel>>({
    pincel: PINCEL_PADRAO,
    lapis: { ...PINCEL_PADRAO, tamanho: 4, dureza: 1, espacamento: 0.1, suavizacao: 0 },
    borracha: { ...PINCEL_PADRAO, tamanho: 40 },
  });
  const [simetria, setSimetria] = useState<Simetria | null>(null);
  const [gerandoPixels, setGerandoPixels] = useState(false);
  // As seções travadas no painel Configurações do pincel ficam ao escolher outra predefinição
  const [secoesTravadas, setSecoesTravadas] = useState<ReadonlySet<SecaoDoPincel>>(new Set());
  const pinceisDoEspaco = usePinceisDoEspaco();
  const [ocupadoComPinceis, setOcupadoComPinceis] = useState<string | null>(null);
  const [selecao, definirSelecao] = useState<string[]>([]);
  const [exportando, setExportando] = useState(false);
  const [atalhos, setAtalhos] = useState(false);
  const [provisorio, setProvisorio] = useState<Comando | null>(null);
  // As mídias pedidas (formas, fotos da IA) entram como camada quando ficam prontas; a troca de uma foto também espera
  const pendentes = useRef(new Map<string, Pendente>());
  // O modelo escolhido espera as formas dele aparecerem na biblioteca, como as formas avulsas
  const modeloPendente = useRef<{ modelo: ModeloDeImagem; cores: string[]; midias: Record<string, Midia> } | null>(null);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [trocando, setTrocando] = useState<string | null>(null);
  const [recorte, setRecorte] = useState<{ retangulo: RetanguloDaImagem; proporcao: number | null } | null>(null);
  const modeloDoEndereco = useRef(false);
  // As caixas das camadas na tela (a prévia mede), para alinhar e distribuir
  const caixasRef = useRef<Map<string, CaixaNoQuadro>>(new Map());

  const setSelecao = useCallback((ids: string[]) => {
    const ativo = document.activeElement;
    if (ativo instanceof HTMLElement && ativo.matches("input, textarea, select")) ativo.blur();
    definirSelecao(ids);
  }, []);
  const executar = useCallback(
    (comando: Comando) => {
      const resultado = executarNoProjeto(comando);
      if (resultado?.selecao) setSelecao(resultado.selecao);
      return resultado;
    },
    [executarNoProjeto, setSelecao],
  );
  const pinturas = usePinturas({ executar, aoAvisar: mostrarAviso });
  // O projeto mais novo, para quem espera a pintura subir (a exportação) ler o que veio depois
  const projetoRef = useRef(projeto);
  useEffect(() => {
    projetoRef.current = projeto;
  });
  /** Desfazer e refazer esperam a pintura que ainda está subindo: o traço vira um passo antes. */
  const depoisDaPintura = (acao: () => void) => (pinturas.enviando ? void pinturas.esperar().then(acao) : acao());
  const projetoNaTela = useMemo(() => {
    if (!projeto || !provisorio) return projeto;
    try {
      return executarComando(projeto, provisorio, ctx).projeto;
    } catch {
      return projeto;
    }
  }, [projeto, provisorio, ctx]);
  const preverDoPainel = (comando: Comando | null) => {
    if (comando !== null || !provisorio) {
      setProvisorio(comando);
      return;
    }
    setProvisorio(null);
    if (JSON.stringify(projetoNaTela) !== JSON.stringify(projeto)) executar(provisorio);
  };
  const abrirAba = (aba: IdAba) => {
    area.abrir("propriedades");
    setPedidoDeAba((atual) => ({ aba, vez: (atual?.vez ?? 0) + 1 }));
  };

  /** Pede as formas do modelo (e o lugar das fotos); o modelo entra quando todas aparecem na biblioteca. */
  const aplicarModelo = (modelo: ModeloDeImagem) => {
    setAplicando(modelo.id);
    const coresDaMarca = marca.cores;
    Promise.all(pedidosDoModelo(modelo, coresDaMarca, new Set()).map(({ chave, forma: pedido }) => criarForma(pedido).then((midia) => [chave, midia] as const)))
      .then((lista) => {
        modeloPendente.current = { modelo, cores: coresDaMarca, midias: Object.fromEntries(lista) };
        void biblioteca.recarregar();
      })
      .catch((e: unknown) => {
        mostrarAviso(e instanceof Error ? e.message : "Não foi possível aplicar o modelo agora.");
        setAplicando(null);
      });
  };
  const esperarMidia = (midia: Midia, pendente: Pendente = {}) => {
    pendentes.current.set(midia.id, pendente);
    void biblioteca.recarregar();
  };

  const resolverPendentes = useEffectEvent(() => {
    const pendente = modeloPendente.current;
    if (pendente && Object.values(pendente.midias).every((midia) => midias.get(midia.id)?.status === "pronta")) {
      modeloPendente.current = null;
      setAplicando(null);
      const doModelo: MidiasDoModelo = {};
      for (const [chave, midia] of Object.entries(pendente.midias)) doModelo[chave] = { id: midia.id, largura: midia.video?.largura ?? 1, altura: midia.video?.altura ?? 1 };
      executar({
        comando: "imagem.aplicarModelo",
        parametros: { camadas: camadasDoModelo(pendente.modelo, pendente.cores, doModelo), tamanho: pendente.modelo.tamanho, fundo: fundoDoModelo(pendente.modelo, pendente.cores) },
      });
    }
    for (const [id, acao] of pendentes.current) {
      const midia = midias.get(id);
      if (!midia || midia.status === "processando" || midia.status === "enviando") continue;
      pendentes.current.delete(id);
      if (midia.status === "erro") mostrarAviso(`"${midia.nome}" não ficou pronta: ${midia.erro ?? "erro desconhecido"}`);
      else if (acao.camadaDe) executar({ comando: "imagem.camadaComOutraMidia", parametros: { faixaId: acao.camadaDe, midiaId: id } });
      else if (acao.trocar) executar({ comando: "clipe.trocarMidia", parametros: { clipeIds: acao.trocar, midiaId: id } });
      else executar({ comando: "imagem.adicionarMidia", parametros: { midiaId: id, transformacao: acao.caixa && projeto ? transformacaoDaCaixa(acao.caixa, midia, tamanhoDaImagem(projeto)) : undefined } });
    }
  });
  useEffect(() => {
    if (pendentes.current.size || modeloPendente.current) resolverPendentes();
  }, [midias]);

  // O modelo escolhido na biblioteca (?modelo=): entra uma vez, na imagem ainda vazia, e sai do endereço
  const aplicarDoEndereco = useEffectEvent(() => {
    if (modeloDoEndereco.current || !projeto || !modeloInicial) return;
    modeloDoEndereco.current = true;
    router.replace(`/app/imagem/${projetoId}`);
    const modelo = modeloDeImagem(modeloInicial);
    // Depois do efeito: aplicar muda o estado (o modelo sendo aplicado)
    if (modelo && camadasDaImagem(projeto).length === 0) void Promise.resolve().then(() => aplicarModelo(modelo));
  });
  useEffect(() => {
    if (projeto) aplicarDoEndereco();
  }, [projeto]);

  const selecaoValida = projeto ? selecao.filter((id) => acharClipe(projeto, id)) : [];
  const escolhidoNaTela = projetoNaTela && selecaoValida.length === 1 ? acharClipe(projetoNaTela, selecaoValida[0]) : null;
  // Uma pasta não tem imagem: as propriedades, os filtros e as fotos valem só para as outras camadas
  const selecionado = escolhidoNaTela?.clipe.pasta ? null : escolhidoNaTela;
  const midiaDoClipe = selecionado?.clipe.midia_id ? (midias.get(selecionado.clipe.midia_id) ?? null) : null;
  const foto = midiaDoClipe?.imagem && !midiaDoClipe.elemento && !midiaDoClipe.camada_pixels && !midiaDoClipe.animacao ? midiaDoClipe : null;
  const objeto = useObjeto(selecionado?.clipe ?? null, midiaDoClipe);
  const temSelecao = Boolean(objeto.selecao) || objeto.temPincel;
  const camadaEscolhida = projeto && selecionado ? camadasDaImagem(projeto).find(({ clipe }) => clipe.id === selecionado.clipe.id) : undefined;
  // As camadas escolhidas (podem ser várias, e pastas), de cima para baixo como no painel
  const escolhidas = projeto ? faixasEmOrdem(projeto).filter((faixa) => selecaoValida.includes(faixa.clipes[0].id)) : [];
  const faixaIds = escolhidas.map((faixa) => faixa.id);

  const escolherFerramenta = (id: IdFerramentaDaImagem) => {
    setFerramenta(id);
    const indice = GRUPOS_DE_FERRAMENTAS.findIndex((grupo) => grupo.some((item) => item.id === id));
    setUltimas((atual) => ({ ...atual, [indice]: id }));
    const modo = MODO_DA_SELECAO[id];
    if (modo) objeto.setModo(modo);
    if (id === "corte" && projeto) {
      const { largura, altura } = tamanhoDaImagem(projeto);
      setRecorte({ retangulo: { x: 0, y: 0, largura, altura }, proporcao: null });
    } else setRecorte(null);
  };

  const confirmarCorte = () => {
    if (!recorte) return;
    // O tamanho de cada mídia usada, para as camadas ficarem do mesmo tamanho em pixels
    const tamanhos: Record<string, { largura: number; altura: number }> = {};
    for (const midia of midias.values()) if (midia.video) tamanhos[midia.id] = { largura: midia.video.largura, altura: midia.video.altura };
    const r = recorte.retangulo;
    const retangulo = { x: Math.round(r.x), y: Math.round(r.y), largura: Math.round(r.largura), altura: Math.round(r.altura) };
    if (executar({ comando: "imagem.recortar", parametros: { retangulo, tamanhos } })) {
      setRecorte(null);
      setFerramenta("mover");
    }
  };
  const cancelarCorte = () => {
    setRecorte(null);
    setFerramenta("mover");
  };

  /** Apagar (a IA refaz o fundo e a foto da camada troca) ou recortar (vira uma camada nova) a seleção da foto. */
  async function usarSelecao(acao: "apagar" | "recortar") {
    if (!selecionado || pedindo) return;
    setPedindo(true);
    const midia = await objeto.pedir(acao);
    setPedindo(false);
    if (!midia) return;
    esperarMidia(midia, acao === "apagar" ? { trocar: [selecionado.clipe.id] } : { camadaDe: selecionado.faixa.id });
    objeto.limpar();
    mostrarAviso(acao === "apagar" ? "Removendo: a foto troca quando ficar pronta." : "Recortando: o objeto entra numa camada nova quando ficar pronto.");
  }
  // O "Remover após cada traço" roda depois que o traço entra no estado do pincel
  const usarSelecaoRef = useRef(usarSelecao);
  useEffect(() => {
    usarSelecaoRef.current = usarSelecao;
  });

  const criarAjuste = (ajuste: Ajuste) => {
    const resultado = executar({ comando: "imagem.adicionarAjuste", parametros: {} });
    const id = resultado?.selecao?.[0];
    if (id && ajuste.cor) executar({ comando: "clipe.cor", parametros: { clipeIds: [id], cor: ajuste.cor } });
    if (resultado) abrirAba("cor");
  };
  const porTexto = (texto?: Texto, onde?: { x: number; y: number }) => {
    const base = texto ?? { ...TEXTO_PADRAO, cor: cores.primeiroPlano };
    const resultado = executar({ comando: "imagem.adicionarTexto", parametros: { texto: base, transformacao: onde } });
    if (resultado) abrirAba("texto");
  };
  const desenharForma = (caixa: RetanguloDaImagem) => {
    const tipo = ferramenta === "formaPersonalizada" ? forma.personalizada : ferramenta === "retangulo" && forma.arredondado ? "arredondado" : FORMA_DA_FERRAMENTA[ferramenta];
    if (!tipo) return;
    // A linha é fina: a proporção é a do arrasto (com um mínimo, para a imagem não sumir)
    const proporcao = Math.min(20, Math.max(0.05, caixa.largura / Math.max(1, caixa.altura)));
    criarForma({ tipo, cor: cores.primeiroPlano, contorno_cor: forma.tracoCor, contorno: forma.traco, proporcao })
      .then((midia) => esperarMidia(midia, { caixa }))
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível desenhar a forma agora."));
  };
  const aplicarFiltro = (efeito: TipoEfeito) => {
    if (!selecionado) return;
    if (executar({ comando: "clipe.efeito", parametros: { clipeIds: [selecionado.clipe.id], efeito: { tipo: efeito, intensidade: INTENSIDADE_PADRAO } } })) area.abrir("filtros");
  };
  const mudarZoom = (para: "mais" | "menos" | "ajustar" | 1) => setZoom(para === "ajustar" ? null : para === 1 ? 1 : proximoZoom(zoom ?? zoomMedido, para === "mais" ? 1 : -1));
  /** Uma camada de pixels vazia, do tamanho da imagem, acima da escolhida. Devolve o clipe dela. */
  const novaCamada = async (): Promise<string | null> => {
    if (!projeto) return null;
    const { largura, altura } = tamanhoDaImagem(projeto);
    const numero = projeto.faixas.filter((faixa) => faixa.clipes[0]?.pixels).length + 1;
    const nome = `Camada ${numero}`;
    try {
      const midia = await criarCamadaDePixels(largura, altura, nome);
      setCriadas((atual) => new Map([...atual, [midia.id, midia]]));
      void biblioteca.recarregar();
      const acima = escolhidas[0]?.id ?? null;
      const resultado = executar({ comando: "imagem.adicionarPixels", parametros: { midiaId: midia.id, nome, acima } });
      // Quem pinta logo em seguida procura a camada nova antes da tela desenhar de novo
      if (resultado) projetoRef.current = resultado.projeto;
      return resultado?.selecao?.[0] ?? null;
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível criar a camada.");
      return null;
    }
  };
  /**
   * A camada do traço: a de pixels escolhida, ou uma nova acima da escolhida (como pintar numa foto ou num texto não
   * muda a foto nem o texto). As travas de tudo e de pixels recusam; a de transparência só segura o alfa.
   */
  const alvoDaPintura = async (): Promise<Omit<AlvoDaPintura, "caixa"> | null> => {
    const atual = projetoRef.current;
    if (!atual) return null;
    let clipeId = selecionado?.clipe.pixels ? selecionado.clipe.id : null;
    if (!clipeId) clipeId = await novaCamada();
    const achado = clipeId && projetoRef.current ? acharClipe(projetoRef.current, clipeId) : null;
    if (!achado?.clipe.midia_id || !achado.clipe.pixels) return null;
    const projetoAgora = projetoRef.current ?? atual;
    if (camadaTravada(projetoAgora, achado.faixa)) {
      mostrarAviso("A camada está travada. Destrave o cadeado para pintar.");
      return null;
    }
    if (achado.faixa.travas?.pixels) {
      mostrarAviso("Os pixels desta camada estão travados (painel Camadas).");
      return null;
    }
    const midia = midias.get(achado.clipe.midia_id);
    const tamanhoDaCamada = midia?.camada_pixels ?? tamanhoDaImagem(projetoAgora);
    try {
      const pintura = await pinturas.preparar(achado.clipe, tamanhoDaCamada);
      return { clipeId: achado.clipe.id, pintura, recorte: achado.clipe.recorte, virar: achado.clipe.virar, travarTransparencia: Boolean(achado.faixa.travas?.transparencia) };
    } catch {
      mostrarAviso("Não foi possível abrir a camada para pintar. Tente de novo.");
      return null;
    }
  };
  /**
   * Os pixels de um plano (rasterizar, mesclar, achatar, carimbar, a camada a partir do fundo): o projeto do plano é
   * desenhado como na exportação, sobe como camada de pixels nova e um comando troca as camadas, num passo só.
   */
  const gerarPixels = async (plano: PlanoDosPixels | (() => Promise<Blob>), dados: Omit<PlanoDosPixels, "desenhar">) => {
    if (!projeto) return;
    setGerandoPixels(true);
    try {
      await pinturas.esperar();
      const blob = typeof plano === "function" ? await plano() : await exportarImagem(plano.desenhar, midias, { formato: "png", fonteDosPixels: pinturas.fonte });
      const { largura, altura } = tamanhoDaImagem(projetoRef.current ?? projeto);
      const midia = await criarCamadaDePixels(largura, altura, dados.nome);
      setCriadas((atual) => new Map([...atual, [midia.id, midia]]));
      const versao = await enviarVersao(midia.id, blob);
      void biblioteca.recarregar();
      executar({ comando: "imagem.substituirPorPixels", parametros: { ...dados, midiaId: midia.id, versao } });
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível gerar os pixels.");
    } finally {
      setGerandoPixels(false);
    }
  };
  const nomeDaFaixa = (faixa: Faixa) => nomeDaCamada(faixa.clipes[0], midias, faixa);
  const alturaDaCaixa = (faixa: Faixa) => caixasRef.current.get(faixa.clipes[0].id)?.altura ?? null;
  /** Rasterizar, mesclar, achatar ou carimbar as escolhidas (cada rasterizar é uma camada por vez). */
  const mesclarEmPixels = async (tipo: TipoDaMesclagem) => {
    if (!projeto || gerandoPixels) return;
    const ids = tipo === "rasterizar" && faixaIds.length > 1 ? faixaIds : [faixaIds];
    for (const grupo of ids) {
      const atual = projetoRef.current ?? projeto;
      let plano: PlanoDosPixels;
      try {
        plano = planoDosPixels(atual, tipo, Array.isArray(grupo) ? grupo : [grupo], nomeDaFaixa, alturaDaCaixa);
      } catch (e) {
        mostrarAviso(e instanceof Error ? e.message : "Não foi possível.");
        return;
      }
      const { desenhar, ...dados } = plano;
      await gerarPixels({ desenhar, ...dados }, dados);
    }
  };
  /** Rasterizar › Todas as camadas: cada camada que não é de pixels (nem grupo nem ajuste), uma por vez. */
  const rasterizarTodas = async () => {
    if (!projeto) return;
    for (const faixa of faixasEmOrdem(projeto).filter((item) => !item.clipes[0].pixels && !item.clipes[0].pasta && !item.clipes[0].ajuste && !item.travada)) {
      const atual = projetoRef.current ?? projeto;
      if (!atual.faixas.some((item) => item.id === faixa.id)) continue;
      const { desenhar, ...dados } = planoDosPixels(atual, "rasterizar", [faixa.id], nomeDaFaixa, alturaDaCaixa);
      await gerarPixels({ desenhar, ...dados }, dados);
    }
  };
  /** Camada a partir do fundo: a cor do fundo vira uma camada de pixels embaixo de todas, e a imagem fica sem fundo. */
  const camadaDoFundoDoDocumento = () => {
    if (!projeto) return;
    const { largura, altura } = tamanhoDaImagem(projeto);
    const cor = projeto.fundo.cor;
    void gerarPixels(
      () =>
        new Promise<Blob>((pronto, falhou) => {
          const canvas = document.createElement("canvas");
          canvas.width = largura;
          canvas.height = altura;
          const ctx2d = canvas.getContext("2d")!;
          ctx2d.fillStyle = cor;
          ctx2d.fillRect(0, 0, largura, altura);
          canvas.toBlob((blob) => (blob ? pronto(blob) : falhou(new Error("O navegador não conseguiu gerar a camada."))), "image/png");
        }),
      { remover: [], lugar: null, nome: "Camada 0", manter: { opacidade: 1, faixa: {} }, doFundoDoDocumento: true },
    );
  };
  const camadaDeFundoAtual = projeto?.faixas.find((faixa) => faixa.fundo) ?? null;
  const ferramentaDePintura = FERRAMENTAS_DE_PINTURA.has(ferramenta) ? (ferramenta as FerramentaDePintura) : null;
  // Fora das ferramentas de pintura, os painéis do pincel mostram o Pincel (como lá, o último pincel usado)
  const pincelDosPaineis: FerramentaDePintura = ferramentaDePintura ?? "pincel";
  const mudarPincel = (mudanca: Partial<OpcoesDoPincel>) => setPinceis((atual) => ({ ...atual, [pincelDosPaineis]: { ...atual[pincelDosPaineis], ...mudanca } }));
  const ordenar = (para: "topo" | "cima" | "baixo" | "fundo") => {
    // Várias: cada uma anda entre as irmãs dela; para cima, a de cima anda primeiro (e o contrário para baixo)
    const ordem = para === "cima" || para === "fundo" ? escolhidas : [...escolhidas].reverse();
    for (const faixa of ordem) executar({ comando: "imagem.mover", parametros: { faixaId: faixa.id, para } });
  };
  const posicoes = (mudancas: MudancaDePosicao[]) => mudancas.length > 0 && executar({ comando: "imagem.posicoes", parametros: { mudancas } });
  /** A mudança de um clipe com as vinculadas a ele (um passo só). */
  const comandoDaMudanca = (clipeId: string, mudanca: Partial<Transformacao>): Comando => {
    const achado = projeto ? acharClipe(projeto, clipeId) : null;
    const mudancas = projeto && achado ? mudancaComVinculadas(projeto, achado.clipe, mudanca) : [];
    return mudancas.length > 1 ? { comando: "imagem.posicoes", parametros: { mudancas } } : { comando: "clipe.transformar", parametros: { clipeIds: [clipeId], transformacao: mudanca } };
  };
  /** Deslocar as escolhidas (as pastas inteiras) e as vinculadas, em frações do quadro. */
  const mudancasDoDeslocamento = (dx: number, dy: number) =>
    projeto
      ? deslocar(
          projeto,
          unidadesDaSelecao(projeto, selecaoValida).flatMap((unidade) => unidade.clipeIds),
          dx,
          dy,
        )
      : [];
  /** Alt+[ e Alt+]: a camada visível de baixo ou de cima da escolhida (ou a de cima de todas). */
  const camadaVizinha = (sentido: 1 | -1) => {
    if (!projeto) return;
    const visiveis = faixasEmOrdem(projeto).filter((faixa) => camadaVisivel(projeto, faixa));
    if (!visiveis.length) return;
    const atual = escolhidas.length ? visiveis.findIndex((faixa) => faixa.id === escolhidas[sentido > 0 ? escolhidas.length - 1 : 0].id) : -1;
    const proxima = atual < 0 ? visiveis[0] : visiveis[Math.min(visiveis.length - 1, Math.max(0, atual + sentido))];
    setSelecao([proxima.clipes[0].id]);
  };
  const todasRecortadas = escolhidas.length > 0 && escolhidas.every((faixa) => faixa.recortada);
  const vinculadas = escolhidas.length > 1 && escolhidas.every((faixa) => faixa.vinculo && faixa.vinculo === escolhidas[0].vinculo);

  const acoes: AcoesDosMenus = {
    temCamada: escolhidas.length > 0,
    quantas: escolhidas.length,
    temPasta: escolhidas.some((faixa) => faixa.clipes[0].pasta),
    recortadas: todasRecortadas,
    vinculadas,
    temFoto: Boolean(foto),
    temSelecao,
    podeDesfazer: edicao.nomeDesfazer,
    podeRefazer: edicao.nomeRefazer,
    area: area.area,
    painelAberto: (painel) => area.aberto(painel),
    novo: () => router.push("/app/ferramentas/editor-de-imagem"),
    abrir: () => router.push("/app/ferramentas/editor-de-imagem"),
    exportar: () => setExportando(true),
    salvar: () => mostrarAviso(edicao.salvamento === "salvo" ? "Tudo salvo: o TakeOne salva a cada mudança." : "Salvando: o TakeOne salva a cada mudança."),
    desfazer: () => depoisDaPintura(desfazer),
    refazer: () => depoisDaPintura(refazer),
    novaCamada: () => void novaCamada(),
    rasterizar: (tipo) => void (tipo === "todas" ? rasterizarTodas() : mesclarEmPixels(tipo)),
    mesclar: (tipo) => void mesclarEmPixels(tipo),
    camadaDoFundo: () => {
      if (camadaDeFundoAtual) executar({ comando: "imagem.camadaDeFundo", parametros: { faixaId: camadaDeFundoAtual.id, ligar: false } });
      else if (projeto && !projeto.fundo.transparente) camadaDoFundoDoDocumento();
    },
    fundoDaCamada: () => escolhidas[0] && executar({ comando: "imagem.camadaDeFundo", parametros: { faixaId: escolhidas[0].id, ligar: true } }),
    temFundo: Boolean(camadaDeFundoAtual) || Boolean(projeto && !projeto.fundo.transparente),
    podeVirarFundo: escolhidas.length === 1 && Boolean(escolhidas[0].clipes[0].pixels) && !camadaDeFundoAtual,
    gerandoPixels,
    ferramenta: escolherFerramenta,
    ajuste: criarAjuste,
    documento: () => {
      setSelecao([]);
      area.abrir("propriedades");
    },
    painel: (painel) => area.abrir(painel),
    alternarPainel: (painel) => area.alternar(painel),
    duplicar: () => escolhidas.length && executar({ comando: "imagem.duplicarVarias", parametros: { faixaIds } }),
    excluir: () => escolhidas.length && executar({ comando: "imagem.apagarVarias", parametros: { faixaIds } }),
    apagarOcultas: () => executar({ comando: "imagem.apagarOcultas", parametros: {} }),
    apagarVazias: () => {
      if (!projeto) return;
      // Os grupos sem nenhuma camada dentro (os de fora primeiro: apagar um leva os vazios de dentro)
      const vazias = projeto.faixas.filter((faixa) => faixa.clipes[0]?.pasta && comDescendentes(projeto, faixa.id).every((item) => item.clipes[0]?.pasta));
      if (vazias.length) executar({ comando: "imagem.apagarVarias", parametros: { faixaIds: vazias.map((faixa) => faixa.id) } });
      else mostrarAviso("Não há grupos vazios para excluir.");
    },
    selecionarVinculadas: () => {
      if (!projeto) return;
      const vinculos = new Set(escolhidas.flatMap((faixa) => (faixa.vinculo ? [faixa.vinculo] : [])));
      if (vinculos.size) setSelecao(camadasDaImagem(projeto).filter(({ faixa }) => faixa.vinculo && vinculos.has(faixa.vinculo)).map(({ clipe }) => clipe.id));
    },
    ordenar,
    inverter: () => executar({ comando: "imagem.inverter", parametros: { faixaIds } }),
    esconder: () => escolhidas.length && executar({ comando: "imagem.camada", parametros: { faixaIds, mudanca: { oculta: !escolhidas.every((faixa) => faixa.oculta) } } }),
    bloquear: () => escolhidas.length && executar({ comando: "imagem.camada", parametros: { faixaIds, mudanca: { travada: !escolhidas.every((faixa) => faixa.travada) } } }),
    grupo: () => executar({ comando: "imagem.agrupar", parametros: { faixaIds: [] } }),
    agrupar: () => escolhidas.length && executar({ comando: "imagem.agrupar", parametros: { faixaIds } }),
    desagrupar: () => {
      for (const faixa of escolhidas) if (faixa.clipes[0].pasta) executar({ comando: "imagem.desagrupar", parametros: { faixaId: faixa.id } });
    },
    recortar: () => escolhidas.length && executar({ comando: "imagem.camada", parametros: { faixaIds, mudanca: { recortada: !todasRecortadas } } }),
    vincular: () => executar({ comando: "imagem.vincular", parametros: { faixaIds, ligar: !vinculadas } }),
    alinhar: (como) => projeto && posicoes(alinhar(projeto, selecaoValida, caixasRef.current, como)),
    distribuir: (como) => projeto && posicoes(distribuir(projeto, selecaoValida, caixasRef.current, como)),
    camadaVizinha,
    estilo: (qual) => {
      if (!camadaEscolhida) return;
      const clipe = camadaEscolhida.clipe;
      const parametros = qual === "contorno" ? { clipeIds: [clipe.id], contorno: clipe.contorno ?? CONTORNO_PADRAO } : { clipeIds: [clipe.id], sombra: clipe.sombra ?? SOMBRA_PADRAO };
      if (executar({ comando: "clipe.silhueta", parametros })) abrirAba("basico");
    },
    mascara: () => {
      if (camadaEscolhida && executar({ comando: "clipe.mascara", parametros: { clipeIds: [camadaEscolhida.clipe.id], mascara: camadaEscolhida.clipe.mascara ?? MASCARA_PADRAO } })) abrirAba("basico");
    },
    viaRecorte: () => void usarSelecao("recortar"),
    preencher: () => void usarSelecao("apagar"),
    desmarcar: () => objeto.limpar(),
    todasAsCamadas: () => projeto && setSelecao(camadasDaImagem(projeto).map(({ clipe }) => clipe.id)),
    desmarcarCamadas: () => setSelecao([]),
    texto: (texto) => porTexto(texto),
    filtro: aplicarFiltro,
    zoom: mudarZoom,
    area_: area.escolherArea,
    restaurarArea: area.restaurar,
    atalhos: () => setAtalhos(true),
  };
  const janelaAberta = exportando || atalhos || trocando !== null;

  // As teclas sem Ctrl: as ferramentas, as cores, as setas e o Enter e o Esc do corte e da seleção
  const teclas = useEffectEvent((evento: KeyboardEvent) => {
    if (!projeto || janelaAberta || evento.defaultPrevented) return;
    const alvo = evento.target as HTMLElement;
    if (alvo.closest("input, textarea, select, [contenteditable='true'], [role='menu']")) return;
    if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
    const tecla = evento.key.length === 1 ? evento.key.toUpperCase() : evento.key;
    // Com uma ferramenta de pintura, os números dão a opacidade dela; fora delas, a das camadas escolhidas
    if (/^[0-9]$/.test(tecla) && ferramentaDePintura) {
      mudarPincel({ opacidade: tecla === "0" ? 1 : Number(tecla) / 10 });
      evento.preventDefault();
      return;
    }
    if (/^[0-9]$/.test(tecla) && escolhidas.length && !MODO_DA_SELECAO[ferramenta]) {
      const clipeIds = escolhidas.filter((faixa) => !faixa.travada).map((faixa) => faixa.clipes[0].id);
      if (clipeIds.length) executar({ comando: "clipe.transformar", parametros: { clipeIds, transformacao: { opacidade: tecla === "0" ? 1 : Number(tecla) / 10 } } });
      evento.preventDefault();
      return;
    }
    const comTecla = TODAS_AS_FERRAMENTAS.filter((item) => item.tecla === tecla);
    if (comTecla.length) {
      // Shift + a tecla passa à seguinte do grupo; sem Shift, volta à última usada do grupo
      const atualNoGrupo = comTecla.some((item) => item.id === ferramenta);
      const grupo = grupoDa(comTecla[0].id);
      const indice = GRUPOS_DE_FERRAMENTAS.indexOf(grupo);
      let id = ultimas[indice] ?? comTecla[0].id;
      if (evento.shiftKey && atualNoGrupo) id = grupo[(grupo.findIndex((item) => item.id === ferramenta) + 1) % grupo.length].id;
      escolherFerramenta(id);
    } else if (tecla === "D") setCores((atual) => ({ ...atual, primeiroPlano: "#000000", fundo: "#ffffff" }));
    else if (tecla === "X") setCores((atual) => ({ ...atual, primeiroPlano: atual.fundo, fundo: atual.primeiroPlano }));
    else if ((tecla === "[" || tecla === "]") && ferramenta === "remover") objeto.setTamanhoDoPincel(Math.min(0.2, Math.max(0.01, objeto.tamanhoDoPincel * (tecla === "]" ? 1.25 : 0.8))));
    else if (ferramentaDePintura && (tecla === "[" || tecla === "]" || tecla === "{" || tecla === "}")) {
      const opcoes = pinceis[ferramentaDePintura];
      const maior = tecla === "]" || tecla === "}";
      if (evento.shiftKey || tecla === "{" || tecla === "}") mudarPincel({ dureza: Math.min(1, Math.max(0, Math.round((opcoes.dureza + (maior ? 0.25 : -0.25)) * 4) / 4)) });
      else {
        // Os degraus dos editores de imagem: de 1 em 1 até 10, de 10 em 10 até 100, depois maiores
        const t = opcoes.tamanho;
        const passo = t < 10 ? 1 : t < 100 ? 10 : t < 200 ? 25 : t < 500 ? 50 : 100;
        mudarPincel({ tamanho: Math.min(5000, Math.max(1, maior ? t + passo : t - (t <= 10 ? 1 : t <= 100 ? 10 : passo))) });
      }
    }
    else if (tecla === "Enter" && recorte) confirmarCorte();
    else if (tecla === "Escape") {
      if (recorte) cancelarCorte();
      else if (temSelecao || objeto.pontos.length) objeto.limpar();
      else setSelecao([]);
    } else if ((tecla === "Delete" || tecla === "Backspace") && escolhidas.length && !escolhidas.some((faixa) => faixa.travada)) executar({ comando: "imagem.apagarVarias", parametros: { faixaIds } });
    else if (escolhidas.length && evento.key.startsWith("Arrow")) {
      // Um pixel da imagem por toque (dez com Shift), em frações do quadro, com as pastas e as vinculadas
      const { largura, altura } = tamanhoDaImagem(projeto);
      const passo = evento.shiftKey ? 10 : 1;
      const dx = evento.key === "ArrowLeft" ? -passo / largura : evento.key === "ArrowRight" ? passo / largura : 0;
      const dy = evento.key === "ArrowUp" ? -passo / altura : evento.key === "ArrowDown" ? passo / altura : 0;
      posicoes(mudancasDoDeslocamento(dx, dy));
    } else return;
    evento.preventDefault();
  });
  useEffect(() => {
    const ouvir = (evento: KeyboardEvent) => teclas(evento);
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, []);

  if (edicao.erroCarga) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-fundo p-6 text-center">
        <p className="text-sm">{edicao.erroCarga}</p>
        <Link href="/app" className="botao-secundario px-3 py-1.5">
          Voltar ao início
        </Link>
      </div>
    );
  }
  if (!projeto || !projetoNaTela) {
    return (
      <div className="flex h-dvh items-center justify-center gap-2 bg-fundo text-sm text-suave">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Abrindo a imagem…
      </div>
    );
  }
  if (projeto.tipo !== "imagem") return <Redirecionar para={enderecoDoProjeto({ id: projetoId, tipo: projeto.tipo })} />;

  const imagensProntas = (biblioteca.midias ?? []).filter((midia) => midia.imagem && !midia.elemento && !midia.camada_pixels && !midia.animacao);
  const tamanho = tamanhoDaImagem(projetoNaTela);
  const zoomNaTela = zoom ?? zoomMedido;

  const paineis: Record<IdPainelDaImagem, Painel> = {
    cor: { nome: PAINEIS_DA_IMAGEM.cor, conteudo: <PainelCor cores={cores} aoMudar={(qual, cor) => setCores((atual) => ({ ...atual, [qual]: cor }))} aoEscolherEditada={(qual) => setCores((atual) => ({ ...atual, editando: qual }))} /> },
    amostras: { nome: PAINEIS_DA_IMAGEM.amostras, conteudo: <PainelAmostras aoEscolher={(cor, paraOFundo) => setCores((atual) => ({ ...atual, [paraOFundo ? "fundo" : "primeiroPlano"]: cor }))} /> },
    formas: {
      nome: PAINEIS_DA_IMAGEM.formas,
      conteudo: (
        <div className="p-3">
          <PainelFormas aoPedir={(midia) => esperarMidia(midia)} aoAvisar={mostrarAviso} />
        </div>
      ),
    },
    propriedades: {
      nome: PAINEIS_DA_IMAGEM.propriedades,
      conteudo: (
        <PainelPropriedades
          modo="imagem"
          midia={midiaDoClipe}
          selecionado={escolhidoNaTela}
          taxa={projeto.taxa}
          tempo={0}
          aoBuscar={NADA}
          proporcao={projeto.proporcao}
          faixas={projeto.faixas}
          aoAvisar={mostrarAviso}
          aoTrocarMidia={(clipeIds, midia) => esperarMidia(midia, { trocar: clipeIds })}
          seguirObjeto={SEM_SEGUIR}
          aoTrocarImagem={setTrocando}
          fundo={projeto.fundo.cor}
          aoPrever={preverDoPainel}
          aoExecutar={executar}
          pedidoDeAba={pedidoDeAba}
          semSelecao={<PropriedadesDoDocumento projeto={projetoNaTela} aoPrever={preverDoPainel} aoExecutar={executar} />}
          className="h-full"
        />
      ),
    },
    ajustes: { nome: PAINEIS_DA_IMAGEM.ajustes, conteudo: <PainelAjustes aoCriar={criarAjuste} /> },
    biblioteca: {
      nome: PAINEIS_DA_IMAGEM.biblioteca,
      conteudo: (
        <PainelBiblioteca
          imagens={imagensProntas}
          erro={biblioteca.erro}
          quadro={tamanho}
          aoPorImagem={(midia) => executar({ comando: "imagem.adicionarMidia", parametros: { midiaId: midia.id } })}
          aoGerada={(midia) => {
            esperarMidia(midia);
            mostrarAviso("Gerando a imagem: ela entra como camada quando ficar pronta (uns 3 min).");
          }}
        />
      ),
    },
    modelos: { nome: PAINEIS_DA_IMAGEM.modelos, conteudo: <PainelModelosDaImagem aplicando={aplicando} aoAplicar={aplicarModelo} /> },
    estilos: {
      nome: PAINEIS_DA_IMAGEM.estilos,
      conteudo: (
        <div className="grid grid-cols-2 gap-1.5 p-3">
          {ESTILOS_DE_TEXTO.map((estilo) => (
            <button key={estilo.id} type="button" onClick={() => porTexto(estilo.texto)} className="flex h-16 items-center justify-center rounded border border-borda bg-painel-3 p-1 transition hover:border-destaque" title={estilo.nome}>
              <MiniaturaDoEstilo texto={estilo.texto} nome={estilo.nome} />
            </button>
          ))}
        </div>
      ),
    },
    filtros: {
      nome: PAINEIS_DA_IMAGEM.filtros,
      conteudo: (
        <div className="p-3">
          <PainelEfeitos selecionado={selecionado} aoPrever={preverDoPainel} aoExecutar={executar} />
        </div>
      ),
    },
    fotoIA: {
      nome: PAINEIS_DA_IMAGEM.fotoIA,
      conteudo: (
        <div className="p-3">
          <PainelFotoIA
            foto={foto}
            quadro={tamanho}
            aoPedir={(acao, midia) => {
              if (!selecionado) return;
              // Ampliada: a foto da camada é trocada; expandida: entra uma camada nova com tudo da camada
              esperarMidia(midia, acao === "ampliar" ? { trocar: [selecionado.clipe.id] } : { camadaDe: selecionado.faixa.id });
              mostrarAviso(acao === "ampliar" ? "Ampliando a foto: ela troca quando ficar pronta." : "Expandindo a foto: ela entra numa camada nova quando ficar pronta.");
            }}
          />
        </div>
      ),
    },
    camadas: {
      nome: PAINEIS_DA_IMAGEM.camadas,
      conteudo: <PainelCamadas projeto={projetoNaTela} midias={midias} selecao={selecaoValida} aoSelecionar={setSelecao} aoExecutar={executar} aoCriarAjuste={criarAjuste} aoAbrirPropriedades={() => abrirAba("basico")} aoNovaCamada={() => void novaCamada()} aoCamadaDoFundo={acoes.camadaDoFundo} />,
    },
    pinceis: {
      nome: PAINEIS_DA_IMAGEM.pinceis,
      conteudo: (
        <PainelPinceis
          opcoes={pinceis[pincelDosPaineis]}
          cor={cores.primeiroPlano}
          doEspaco={pinceisDoEspaco.pinceis.map(predefinicaoDoEspaco)}
          ocupado={ocupadoComPinceis}
          aoSalvar={(nome) => {
            setOcupadoComPinceis("Salvando o pincel…");
            criarPincel({ nome, pasta: "meus", opcoes: pinceis[pincelDosPaineis] })
              .then(() => {
                pinceisDoEspaco.recarregar();
                mostrarAviso(`O pincel "${nome}" está em Meus pincéis.`);
              })
              .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível salvar o pincel."))
              .finally(() => setOcupadoComPinceis(null));
          }}
          aoImportar={(arquivo) => {
            setOcupadoComPinceis("Importando os pincéis…");
            importarAbr(arquivo, (feitas, total) => setOcupadoComPinceis(`Importando ${feitas} de ${total}…`))
              .then((quantos) => mostrarAviso(quantos === 1 ? "Um pincel entrou em Importados." : `${quantos} pincéis entraram em Importados.`))
              .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível importar os pincéis."))
              .finally(() => {
                pinceisDoEspaco.recarregar();
                setOcupadoComPinceis(null);
              });
          }}
          aoExcluir={(predefinicao) =>
            excluirPincel(predefinicao.id.replace("espaco:", ""))
              .then(pinceisDoEspaco.recarregar)
              .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível excluir o pincel."))
          }
          aoEscolher={(predefinicao) => {
            setPinceis((atual) => ({ ...atual, [pincelDosPaineis]: comPredefinicao(atual[pincelDosPaineis], predefinicao, secoesTravadas) }));
            if (!ferramentaDePintura) escolherFerramenta("pincel");
          }}
          aoAbrirConfiguracoes={() => area.abrir("configuracoesDoPincel")}
        />
      ),
    },
    configuracoesDoPincel: {
      nome: PAINEIS_DA_IMAGEM.configuracoesDoPincel,
      conteudo: (
        <PainelConfiguracoesDoPincel
          opcoes={pinceis[pincelDosPaineis]}
          cor={cores.primeiroPlano}
          aoMudar={mudarPincel}
          travadas={secoesTravadas}
          aoTravar={(secao) =>
            setSecoesTravadas((atual) => {
              const novas = new Set(atual);
              if (novas.has(secao)) novas.delete(secao);
              else novas.add(secao);
              return novas;
            })
          }
          aoAbrirPredefinicoes={() => area.abrir("pinceis")}
          pontasDoEspaco={pinceisDoEspaco.pinceis.filter((pincel) => pincel.tem_ponta).map((pincel) => `pincel:${pincel.id}` as const)}
        />
      ),
    },
    historico: { nome: PAINEIS_DA_IMAGEM.historico, conteudo: <PainelHistorico nome={edicao.nome} feitos={edicao.passos.feitos} desfeitos={edicao.passos.desfeitos} aoIr={edicao.irParaPasso} /> },
  };

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
    <div className="flex h-dvh flex-col overflow-hidden bg-fundo text-texto">
      <header className="flex h-8 shrink-0 items-center gap-1 border-b border-borda bg-painel px-1.5">
        <Link href="/app" className="flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-suave transition hover:text-texto" title="Voltar ao início">
          <ChevronLeft className="size-3.5" aria-hidden />
          <Simbolo tamanho={18} />
        </Link>
        <MenusDaImagem acoes={acoes} ativo={!janelaAberta} />
        <span className="ml-auto hidden items-center gap-1 text-[11px] text-suave sm:flex" role="status">
          {edicao.salvamento === "salvo" ? <Check className="size-3" aria-hidden /> : <LoaderCircle className="size-3 animate-spin" aria-hidden />}
          {salvamento}
        </span>
        <select
          aria-label="Área de trabalho"
          title="Área de trabalho"
          value={area.area}
          onChange={(evento) => area.escolherArea(evento.currentTarget.value)}
          className="ml-2 rounded border border-borda bg-painel-2 px-1 py-0.5 text-[11px] max-md:hidden"
        >
          {Object.entries(AREAS_DA_IMAGEM).map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
        <BotaoTema />
        <button type="button" className="botao-principal shrink-0 px-2.5 py-0.5 text-xs" onClick={() => setExportando(true)} title="Exportar como PNG, JPG ou WebP (Ctrl+Alt+Shift+W)">
          <Download className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Exportar</span>
        </button>
      </header>

      <BarraDeOpcoes
        ferramenta={ferramenta}
        clipe={selecionado?.clipe ?? null}
        aoExecutar={executar}
        objeto={objeto}
        aoUsarSelecao={(acao) => void usarSelecao(acao)}
        pedindo={pedindo}
        removerAoSoltar={removerAoSoltar}
        aoMudarRemoverAoSoltar={setRemoverAoSoltar}
        corte={recorte ? { proporcao: recorte.proporcao, largura: recorte.retangulo.largura, altura: recorte.retangulo.altura } : null}
        aoMudarProporcao={(proporcao) => {
          if (!recorte) return;
          const inteiro = { x: 0, y: 0, ...tamanho };
          setRecorte({ proporcao, retangulo: proporcao ? encaixarProporcao(inteiro, proporcao) : recorte.retangulo });
        }}
        aoConfirmarCorte={confirmarCorte}
        aoCancelarCorte={cancelarCorte}
        forma={forma}
        aoMudarForma={(mudanca) => setForma((atual) => ({ ...atual, ...mudanca }))}
        primeiroPlano={cores.primeiroPlano}
        aoZoom={setZoom}
        aoAlinhar={(eixo) => camadaEscolhida && executar({ comando: "clipe.transformar", parametros: { clipeIds: [camadaEscolhida.clipe.id], transformacao: { [eixo]: 0 } } })}
        pincel={ferramentaDePintura ? pinceis[ferramentaDePintura] : undefined}
        aoMudarPincel={mudarPincel}
        simetria={simetria}
        aoMudarSimetria={setSimetria}
      />

      <div className="flex min-h-0 flex-1 max-md:flex-wrap max-md:content-start max-md:overflow-y-auto">
        <CaixaDeFerramentas
          ativa={ferramenta}
          aoEscolher={escolherFerramenta}
          ultimas={ultimas}
          primeiroPlano={cores.primeiroPlano}
          fundo={cores.fundo}
          aoEditarCor={(qual) => {
            setCores((atual) => ({ ...atual, editando: qual }));
            area.abrir("cor");
          }}
          aoTrocarCores={() => setCores((atual) => ({ ...atual, primeiroPlano: atual.fundo, fundo: atual.primeiroPlano }))}
          aoCoresPadrao={() => setCores((atual) => ({ ...atual, primeiroPlano: "#000000", fundo: "#ffffff" }))}
          aoDuploClique={(id) => setZoom(id === "zoom" ? 1 : null)}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col max-md:h-[62vh]">
          <div role="tablist" aria-label="Documentos" className="flex h-7 shrink-0 items-end border-b border-borda bg-painel-2">
            <div role="tab" aria-selected className="flex h-full max-w-full items-center gap-1 border-r border-borda bg-fundo px-2 text-[11px]">
              <input
                id="nome-projeto"
                value={edicao.nome}
                onChange={(evento) => edicao.renomear(evento.currentTarget.value)}
                aria-label="Nome da imagem"
                maxLength={120}
                size={Math.max(6, Math.min(40, edicao.nome.length + 1))}
                className="min-w-0 bg-transparent font-medium outline-none focus:bg-painel-2"
              />
              <span className="shrink-0 truncate text-suave">
                @ {porcentagem(zoomNaTela)} ({escolhidoNaTela ? nomeDaCamada(escolhidoNaTela.clipe, midias, escolhidoNaTela.faixa) : escolhidas.length > 1 ? `${escolhidas.length} camadas` : "Fundo"}, RGB/8)
              </span>
            </div>
          </div>
          <PreviaDaImagem
            projeto={projetoNaTela}
            midias={midias}
            selecao={selecaoValida}
            aoSelecionar={setSelecao}
            aoPrever={(clipeId, mudanca) => setProvisorio(mudanca ? comandoDaMudanca(clipeId, mudanca) : null)}
            aoTransformar={(clipeId, mudanca) => executar(comandoDaMudanca(clipeId, mudanca))}
            aoPreverDeslocamento={(deslocamento) => setProvisorio(deslocamento ? { comando: "imagem.posicoes", parametros: { mudancas: mudancasDoDeslocamento(deslocamento.dx, deslocamento.dy) } } : null)}
            aoDeslocar={(dx, dy) => posicoes(mudancasDoDeslocamento(dx, dy))}
            caixasRef={caixasRef}
            pintura={
              ferramentaDePintura
                ? {
                    ferramenta: ferramentaDePintura,
                    opcoes: pinceis[ferramentaDePintura],
                    cores,
                    aoPedirAlvo: alvoDaPintura,
                    aoQuadro: pinturas.avisarQuadro,
                    aoSoltar: pinturas.soltar,
                    aoAjustar: mudarPincel,
                    simetria,
                  }
                : null
            }
            fonteDosPixels={pinturas.fonte}
            ferramenta={ferramenta}
            zoom={zoom}
            aoMudarZoom={setZoom}
            aoMedirZoom={setZoomMedido}
            recorte={recorte ? { ...recorte, aoMudar: (retangulo) => setRecorte({ ...recorte, retangulo }) } : null}
            objeto={MODO_DA_SELECAO[ferramenta] && objeto.foto && selecionado ? { clipeId: selecionado.clipe.id, ferramenta: objeto } : null}
            aoTerminarTraco={ferramenta === "remover" && removerAoSoltar ? () => window.setTimeout(() => void usarSelecaoRef.current("apagar"), 0) : undefined}
            aoClicarTexto={(x, y) => porTexto(undefined, { x: x / tamanho.largura - 0.5, y: y / tamanho.altura - 0.5 })}
            aoDesenharForma={desenharForma}
            aoPegarCor={(cor, paraOFundo) => setCores((atual) => ({ ...atual, [paraOFundo ? "fundo" : "primeiroPlano"]: cor }))}
          />
          <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-borda bg-painel px-2 text-[11px] text-suave">
            <span className="tabular-nums">{porcentagem(zoomNaTela)}</span>
            <span className="tabular-nums">
              {tamanho.largura} px × {tamanho.altura} px (72 ppp)
            </span>
            <span className="min-w-0 truncate max-md:hidden">{dadosDa(ferramenta).dica}</span>
          </footer>
        </main>

        <ColunaDePaineis grupos={area.estado.direita ?? []} paineis={paineis} area={area} className="shrink-0 border-l border-borda bg-painel max-md:h-[70vh] max-md:w-full max-md:border-l-0 max-md:border-t md:w-80" />
      </div>

      {trocando ? (
        <JanelaEscolherImagem
          imagens={imagensProntas}
          aoFechar={() => setTrocando(null)}
          aoEscolher={(nova) => {
            const clipe = acharClipe(projeto, trocando)?.clipe;
            const atual = clipe?.midia_id ? midias.get(clipe.midia_id) : undefined;
            setTrocando(null);
            if (!clipe || !atual?.video || !nova.video) return;
            executar({
              comando: "imagem.trocarImagem",
              parametros: {
                clipeId: clipe.id,
                midiaId: nova.id,
                tamanhoAtual: { largura: atual.video.largura, altura: atual.video.altura },
                tamanhoNovo: { largura: nova.video.largura, altura: nova.video.altura },
              },
            });
          }}
        />
      ) : null}
      {exportando ? (
        <JanelaExportarImagem
          projeto={projeto}
          nome={edicao.nome}
          midias={midias}
          aoFechar={() => setExportando(false)}
          aoAvisar={mostrarAviso}
          aoPrepararPintura={() => pinturas.esperar().then(() => projetoRef.current ?? projeto)}
          fonteDosPixels={pinturas.fonte}
        />
      ) : null}
      {atalhos ? <JanelaDeAtalhos acoes={acoes} aoFechar={() => setAtalhos(false)} /> : null}
      {edicao.aviso ? (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-8 z-50 flex justify-center px-4">
          <p className="rounded-lg border border-borda bg-painel-3 px-4 py-2 text-sm shadow-xl shadow-black/40">{edicao.aviso}</p>
        </div>
      ) : null}
    </div>
  );
}

/** A barra de menus e os atalhos dela (os menus são montados aqui, com o estado da vez). */
function MenusDaImagem({ acoes, ativo }: { acoes: AcoesDosMenus; ativo: boolean }) {
  const menus = menusDaImagem(acoes);
  useAtalhosDosMenus(menus, ativo);
  return (
    <>
      <BarraDeMenus menus={menus} className="min-w-0 max-md:hidden" />
      {/* No celular, os menus num só, como submenus */}
      <BarraDeMenus menus={[{ nome: "Menu", itens: menus.map((menu) => ({ nome: menu.nome, itens: menu.itens })) }]} className="md:hidden" />
    </>
  );
}

/** A camada da forma desenhada: o centro no meio da caixa e a escala que dá à imagem a largura da caixa. */
function transformacaoDaCaixa(caixa: RetanguloDaImagem, midia: Midia, quadro: { largura: number; altura: number }): Partial<Transformacao> {
  const largura = midia.video?.largura ?? 1;
  const altura = midia.video?.altura ?? 1;
  // Escala 1 é a imagem inteira cabendo no quadro
  const cabe = Math.min(quadro.largura / largura, quadro.altura / altura);
  return {
    x: (caixa.x + caixa.largura / 2) / quadro.largura - 0.5,
    y: (caixa.y + caixa.altura / 2) / quadro.altura - 0.5,
    escala: Math.max(caixa.largura / (largura * cabe), caixa.altura / (altura * cabe)),
  };
}

/** O maior retângulo na proporção, no meio do atual (ou da imagem). */
function encaixarProporcao(r: RetanguloDaImagem, proporcao: number): RetanguloDaImagem {
  const largura = Math.min(r.largura, r.altura * proporcao);
  const altura = largura / proporcao;
  return { x: r.x + (r.largura - largura) / 2, y: r.y + (r.altura - altura) / 2, largura, altura };
}

/** Ajuda > Atalhos do teclado: as ferramentas e os atalhos dos menus. */
function JanelaDeAtalhos({ acoes, aoFechar }: { acoes: AcoesDosMenus; aoFechar: () => void }) {
  const menus = menusDaImagem(acoes);
  type Linha = { nome: string; atalho: string };
  const doMenu = (itens: ReturnType<typeof menusDaImagem>[number]["itens"]): Linha[] =>
    itens.flatMap((item) => (item === "-" ? [] : "itens" in item ? doMenu(item.itens) : item.atalho ? [{ nome: item.nome.replace(/…$/, ""), atalho: item.atalho }] : []));
  useEffect(() => {
    const esc = (evento: KeyboardEvent) => evento.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoFechar}>
      <div role="dialog" aria-modal aria-label="Atalhos do teclado" className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-borda bg-painel shadow-2xl" onClick={(evento) => evento.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-2.5">
          <h2 className="text-sm font-semibold">Atalhos do teclado</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="grid min-h-0 gap-6 overflow-y-auto p-4 text-xs sm:grid-cols-2">
          <section>
            <h3 className="mb-2 font-semibold">Ferramentas</h3>
            <dl>
              {TODAS_AS_FERRAMENTAS.map((item) => (
                <div key={item.id} className="flex justify-between gap-3 border-b border-borda/50 py-1">
                  <dt>{item.nome}</dt>
                  <dd className="font-mono text-suave">{item.tecla}</dd>
                </div>
              ))}
              {[
                ["Mão temporária", "Espaço"],
                ["Cores padrão", "D"],
                ["Trocar as cores", "X"],
                ["Pincel menor / maior", "[ / ]"],
                ["Pincel mais macio / mais duro", "Shift + [ / ]"],
                ["Tamanho e dureza arrastando", "Alt + botão direito"],
                ["Opacidade do pincel (10% a 100%)", "1 … 0"],
                ["Empurrar as camadas 1 px (10 com Shift)", "Setas"],
                ["Opacidade das camadas (10% a 100%)", "1 … 0"],
                ["Excluir as camadas", "Delete"],
                ["Mostrar só uma camada", "Alt + clique no olho"],
                ["Escolher várias camadas", "Ctrl ou Shift + clique"],
                ["Renomear a camada", "Duplo clique no nome"],
              ].map(([nome, atalho]) => (
                <div key={nome} className="flex justify-between gap-3 border-b border-borda/50 py-1">
                  <dt>{nome}</dt>
                  <dd className="font-mono text-suave">{atalho}</dd>
                </div>
              ))}
            </dl>
          </section>
          {menus.map((menu) => {
            const linhas = doMenu(menu.itens);
            return linhas.length ? (
              <section key={menu.nome}>
                <h3 className="mb-2 font-semibold">{menu.nome}</h3>
                <dl>
                  {linhas.map((linha) => (
                    <div key={linha.nome} className="flex justify-between gap-3 border-b border-borda/50 py-1">
                      <dt>{linha.nome}</dt>
                      <dd className="font-mono text-suave">{linha.atalho}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
}
