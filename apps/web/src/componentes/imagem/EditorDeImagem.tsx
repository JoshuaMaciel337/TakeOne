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
import { acharClipe, type Canal, type Clipe, type Faixa, MASCARA_PADRAO, type Projeto, type Transformacao } from "@/lib/projeto/modelo";
import { camadasDoModelo, fundoDoModelo, type MidiasDoModelo, type ModeloDeImagem, modeloDeImagem, pedidosDoModelo } from "@/lib/projeto/modelosDeImagem";
import { CONTORNO_PADRAO, SOMBRA_PADRAO } from "@/lib/projeto/silhueta";
import { ESTILOS_DE_TEXTO, type Texto, TEXTO_PADRAO } from "@/lib/projeto/texto";
import type { Midia } from "@/lib/tipos";
import { useMidias } from "@/lib/useMidias";

import type { Ajuste } from "./ajustesDaImagem";
import { BarraDeOpcoes, type OpcoesDaForma } from "./BarraDeOpcoes";
import { CaixaDeFerramentas } from "./CaixaDeFerramentas";
import { ferramenta as dadosDa, FERRAMENTAS_DA_SELECAO, FERRAMENTAS_DE_PINTURA, FORMA_DA_FERRAMENTA, GRUPOS_DE_FERRAMENTAS, grupoDa, type IdFerramentaDaImagem, MODO_DA_SELECAO, TODAS_AS_FERRAMENTAS } from "./ferramentasDaImagem";
import { type FerramentaDeSelecao, OPCOES_DA_SELECAO, type OpcoesDaSelecao } from "./SelecaoNaPrevia";
import { JanelaEscolherImagem } from "./JanelaEscolherImagem";
import { JanelaExportarImagem } from "./JanelaExportarImagem";
import { type AcoesDosMenus, AREAS_DA_IMAGEM, type IdPainelDaImagem, menusDaImagem, PAINEIS_DA_IMAGEM } from "./menusDaImagem";
import { nomeDaCamada, PainelCamadas } from "./PainelCamadas";
import { PainelFotoIA } from "./PainelFotoIA";
import { PainelAjustes, PainelAmostras, PainelBiblioteca, PainelCor, PainelModelosDaImagem } from "./PaineisDaImagem";
import { PreviaDaImagem, proximoZoom } from "./PreviaDaImagem";
import { PropriedadesDoDocumento } from "./PropriedadesDoDocumento";
import { PropriedadesDaMascara } from "./PropriedadesDaMascara";
import { useObjeto } from "./useObjeto";
import { alvoDaMascara, alvoDosPixels, usePinturas } from "./usePinturas";
import type { AlvoDaPintura } from "./PinturaNaPrevia";
import { type FerramentaDePintura, type OpcoesDoPincel, PINCEL_PADRAO, type SecaoDoPincel, type Simetria } from "@/lib/pintura/traco";
import { comPredefinicao, PainelConfiguracoesDoPincel, PainelPinceis } from "./PaineisDoPincel";
import { criarPincel, excluirPincel, importarAbr, predefinicaoDoEspaco, usePinceisDoEspaco } from "@/lib/pinceis";
import { criarCamadaDePixels, enviarVersao } from "@/lib/pixels";
import { exportarImagem } from "@/lib/exportacao/imagem";
import { planoDosPixels, type PlanoDosPixels, projetoSoCom, type TipoDaMesclagem } from "@/lib/projeto/rasterizar";
import { carregarBitmap } from "@/lib/previa/bitmaps";
import { arquivoDaMidia, chamarApi } from "@/lib/api";
import { ceu, imagemMenor } from "@/lib/selecao/cores";
import { JanelaAreaDeFoco, JanelaIntervaloDeCores } from "./JanelasDaSelecao";
import { selecaoEmCinza } from "./MascaraRapida";
import { type CorDoCanal, PainelCanais } from "./PainelCanais";
import { JanelaCarregarSelecao, JanelaSalvarSelecao } from "./JanelasDaSelecao";
import type { AlvoDoMotor } from "./usePinturas";
import { Pintura } from "@/lib/pintura/motor";
import { arquivoDaVersao } from "@/lib/pixels";
import { type Afim, compor, IDENTIDADE, matrizDaCaixa, matrizDaMascaraNoDocumento, matrizDaMidiaNoDocumento, matrizParaOutraCaixa } from "@/lib/projeto/mascaraDePixels";
import { borda, cheia, combinar, contrair, difusao, expandir, inverter as inverterSelecao, type ModoDaSelecao, type Selecao, suavizar, temAlgo } from "@/lib/selecao/mascara";
import { imagemDoBlob, imagemNoDocumento, selecaoDoCanvas, selecaoNaMidia, selecaoParaCanvas } from "@/lib/selecao/naTela";
import { mapaDeBordas, type MapaDeBordas } from "@/lib/selecao/magnetico";
import { aumentar, type ImagemRgba, varinha } from "@/lib/selecao/varinha";

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
      { id: "g-camadas", abas: ["camadas", "canais", "historico"], ativa: "camadas" },
    ],
  },
  fotografia: {
    direita: [
      { id: "g-propriedades", abas: ["propriedades", "ajustes", "filtros"], ativa: "propriedades", altura: 360 },
      { id: "g-biblioteca", abas: ["biblioteca", "fotoIA"], ativa: "biblioteca", altura: 220 },
      { id: "g-camadas", abas: ["camadas", "canais", "historico"], ativa: "camadas" },
    ],
  },
  grafico: {
    direita: [
      { id: "g-cor", abas: ["cor", "amostras"], ativa: "cor", altura: 190 },
      { id: "g-propriedades", abas: ["propriedades", "estilos", "formas", "modelos"], ativa: "propriedades", altura: 340 },
      { id: "g-camadas", abas: ["camadas", "canais", "historico", "biblioteca"], ativa: "camadas" },
    ],
  },
};
const IDS_DOS_PAINEIS = Object.keys(PAINEIS_DA_IMAGEM);

type Pendente = { trocar?: string[]; camadaDe?: string; caixa?: RetanguloDaImagem };
/** A chave do motor da máscara rápida (não é um clipe). */
const CHAVE_DA_MASCARA_RAPIDA = "#mascaraRapida";
type ModificacaoDaSelecao = "borda" | "suavizar" | "expandir" | "contrair" | "difusao";

/** O número de cada Selecionar › Modificar: o rótulo, o padrão e os limites, em pixels. */
const MODIFICACOES: Record<ModificacaoDaSelecao, { titulo: string; rotulo: string; padrao: number; minimo: number; maximo: number }> = {
  borda: { titulo: "Borda da seleção", rotulo: "Largura", padrao: 10, minimo: 1, maximo: 200 },
  suavizar: { titulo: "Suavizar a seleção", rotulo: "Raio da amostra", padrao: 5, minimo: 1, maximo: 500 },
  expandir: { titulo: "Expandir a seleção", rotulo: "Expandir em", padrao: 5, minimo: 1, maximo: 500 },
  contrair: { titulo: "Contrair a seleção", rotulo: "Contrair em", padrao: 5, minimo: 1, maximo: 500 },
  difusao: { titulo: "Difusão da seleção", rotulo: "Raio da difusão", padrao: 5, minimo: 0.2, maximo: 1000 },
};

/** A seleção em cinza opaco (branco no que entra), para uma máscara de camada. */
function pintarSelecao(ctx2d: CanvasRenderingContext2D, selecao: Selecao, invertida = false) {
  const dados = ctx2d.createImageData(selecao.largura, selecao.altura);
  for (let i = 0; i < selecao.dados.length; i++) {
    const valor = invertida ? 255 - selecao.dados[i] : selecao.dados[i];
    dados.data[i * 4] = valor;
    dados.data[i * 4 + 1] = valor;
    dados.data[i * 4 + 2] = valor;
    dados.data[i * 4 + 3] = 255;
  }
  ctx2d.putImageData(dados, 0, 0);
}

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
  const [localizador, setLocalizador] = useState(true);
  const [pedindo, setPedindo] = useState(false);
  const [pedidoDeAba, setPedidoDeAba] = useState<{ aba: IdAba; vez: number } | undefined>(undefined);

  // As opções de cada ferramenta de pintura (o pincel e a borracha guardam tamanhos diferentes, como lá)
  const [pinceis, setPinceis] = useState<Record<FerramentaDePintura, OpcoesDoPincel>>({
    pincel: PINCEL_PADRAO,
    lapis: { ...PINCEL_PADRAO, tamanho: 4, dureza: 1, espacamento: 0.1, suavizacao: 0 },
    borracha: { ...PINCEL_PADRAO, tamanho: 40 },
    historico: { ...PINCEL_PADRAO, tamanho: 40, dureza: 0.5 },
    historicoArtistico: { ...PINCEL_PADRAO, tamanho: 6, dureza: 0.6, fluxo: 0.85 },
  });
  // Os instantâneos do Histórico (da sessão, como nos editores de imagem) e a fonte dos pincéis do histórico
  const [instantaneos, setInstantaneos] = useState<{ id: string; nome: string; projeto: Projeto }[]>([]);
  const [fonteDoHistorico, setFonteDoHistorico] = useState("passo:0");
  // O último passo do Ctrl+Alt+Z (alternar o último estado): desfeito, para refazer na próxima
  const ultimoFoiDesfazer = useRef(false);
  const [simetria, setSimetria] = useState<Simetria | null>(null);
  const [gerandoPixels, setGerandoPixels] = useState(false);
  // A máscara de camada em foco (o pincel pinta nela) e a máscara à vista (Alt + clique na miniatura dela)
  const [mascaraEmFoco, setMascaraEmFoco] = useState<string | null>(null);
  const [mascaraAVista, setMascaraAVista] = useState<string | null>(null);
  // A seleção do documento (lib/selecao), a última desmarcada (Selecionar novamente), as bordas à vista (Ctrl+H), as
  // opções das ferramentas de seleção e o Modificar que está perguntando o número
  const [selecaoDoDocumento, setSelecaoDoDocumento] = useState<Selecao | null>(null);
  const [selecaoAnterior, setSelecaoAnterior] = useState<Selecao | null>(null);
  const [bordasDaSelecao, setBordasDaSelecao] = useState(true);
  const [opcoesDaSelecao, setOpcoesDaSelecao] = useState<OpcoesDaSelecao>(OPCOES_DA_SELECAO);
  const [modificando, setModificando] = useState<ModificacaoDaSelecao | null>(null);
  // A imagem que a varinha e o laço magnético leem, guardada até o projeto mudar, e as bordas dela para o laço
  const imagemLida = useRef<{ chave: string; projeto: Projeto; imagem: Promise<ImagemRgba> } | null>(null);
  const [bordasDaImagem, setBordasDaImagem] = useState<MapaDeBordas | null>(null);
  const [imagemDaRapida, setImagemDaRapida] = useState<ImagemRgba | null>(null);
  // A janela do Intervalo de cores ou da Área de foco, com a imagem que ela lê
  const [janelaDaSelecao, setJanelaDaSelecao] = useState<{ tipo: "cores" | "foco"; imagem: ImagemRgba } | null>(null);
  const [achandoAssunto, setAchandoAssunto] = useState(false);
  // A máscara rápida (Q): o motor do documento com a seleção em cinza, e o quadro do traço (o véu redesenha)
  const [mascaraRapida, setMascaraRapida] = useState<Pintura | null>(null);
  const [quadroDaRapida, setQuadroDaRapida] = useState(0);
  // Os canais: o de cor à vista, o alfa à vista e pintado (com a imagem da versão dele) e a janela de salvar ou carregar
  const [corAVista, setCorAVista] = useState<CorDoCanal | null>(null);
  const [canalAtivo, setCanalAtivo] = useState<string | null>(null);
  const [imagemDoCanal, setImagemDoCanal] = useState<{ chave: string; imagem: ImageBitmap } | null>(null);
  const [janelaDoCanal, setJanelaDoCanal] = useState<"salvar" | "carregar" | null>(null);
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
  // A seleção só vale no tamanho em que foi feita (recortar ou mudar o tamanho da imagem a desfaz)
  const tamanhoDoDocumento = projeto ? tamanhoDaImagem(projeto) : null;
  const selecaoNoDocumento =
    selecaoDoDocumento && tamanhoDoDocumento && selecaoDoDocumento.largura === tamanhoDoDocumento.largura && selecaoDoDocumento.altura === tamanhoDoDocumento.altura ? selecaoDoDocumento : null;
  const temSelecao = Boolean(objeto.selecao) || objeto.temPincel || Boolean(selecaoNoDocumento && foto);
  /** A seleção do documento muda; a que é desmarcada fica para o Selecionar novamente. */
  const selecionarNoDocumento = (nova: Selecao | null) => {
    const valida = nova && temAlgo(nova) ? nova : null;
    if (!valida && selecaoNoDocumento) setSelecaoAnterior(selecaoNoDocumento);
    setSelecaoDoDocumento(valida);
    if (valida) setBordasDaSelecao(true);
  };
  const modificarSelecao = (como: ModificacaoDaSelecao, valor: number) => {
    const atual = selecaoNoDocumento;
    if (!atual) return;
    const nova =
      como === "borda" ? borda(atual, valor) : como === "suavizar" ? suavizar(atual, valor) : como === "expandir" ? expandir(atual, valor) : como === "contrair" ? contrair(atual, valor) : difusao(atual, valor / 2);
    if (!temAlgo(nova)) mostrarAviso("Nenhum pixel ficou mais da metade selecionado: as bordas da seleção não vão aparecer.");
    setSelecaoDoDocumento(nova);
  };
  /**
   * A seleção do documento levada à foto escolhida, como o pincel da ferramenta Objeto: um PNG opaco, branco no que
   * entra, no tamanho da foto (até 2048 no lado maior). Null sem seleção ou sem a camada na prévia.
   */
  const selecaoNaFoto = (): string | null => {
    if (!selecaoNoDocumento || !selecionado || !foto?.video || !projeto) return null;
    const medida = caixasRef.current.get(selecionado.clipe.id);
    if (!medida?.bruta || !medida.quadro) return null;
    const fator = Math.min(1, 2048 / Math.max(foto.video.largura, foto.video.altura));
    const naFoto = { largura: Math.max(1, Math.round(foto.video.largura * fator)), altura: Math.max(1, Math.round(foto.video.altura * fator)) };
    const matriz = matrizDaMidiaNoDocumento(medida.bruta, selecionado.clipe.recorte, selecionado.clipe.virar, naFoto, medida.quadro, tamanhoDaImagem(projeto));
    const branca = selecaoNaMidia(selecaoNoDocumento, matriz, naFoto);
    const canvas = document.createElement("canvas");
    canvas.width = naFoto.largura;
    canvas.height = naFoto.altura;
    const ctx2d = canvas.getContext("2d")!;
    ctx2d.fillStyle = "#000";
    ctx2d.fillRect(0, 0, naFoto.largura, naFoto.altura);
    ctx2d.drawImage(branca, 0, 0);
    return canvas.toDataURL("image/png");
  };
  /**
   * Os pixels que a varinha, o Aumentar e o laço magnético leem: a imagem inteira, ou só a camada escolhida (sem
   * estilos, máscara nem opacidade), no tamanho do documento. Fica guardada até o projeto mudar.
   */
  const imagemParaSelecao = (todas: boolean): Promise<ImagemRgba> => {
    const atual = projetoRef.current ?? projeto!;
    const so = !todas && selecionado ? selecionado.faixa.id : null;
    const chave = so ?? "todas";
    const guardada = imagemLida.current;
    if (guardada && guardada.projeto === atual && guardada.chave === chave) return guardada.imagem;
    const desenhar = so ? projetoSoCom(atual, [so], { neutras: new Set([so]), semEstilo: true, semMascara: true }) : atual;
    const imagem = exportarImagem(desenhar, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara }).then(imagemDoBlob);
    imagemLida.current = { chave, projeto: atual, imagem };
    imagem.catch(() => {
      if (imagemLida.current?.imagem === imagem) imagemLida.current = null;
    });
    return imagem;
  };
  /** A varinha: a cor do ponto clicado (pixels do documento) e as parecidas, no modo. */
  const usarVarinha = (ponto: { x: number; y: number }, modo: ModoDaSelecao) => {
    const antes = selecaoNoDocumento;
    imagemParaSelecao(opcoesDaSelecao.todasAsCamadas || !selecionado)
      .then((imagem) => {
        const { tolerancia, contigua, suavizar: suave, amostra } = opcoesDaSelecao;
        const nova = varinha(imagem, ponto.x, ponto.y, { tolerancia, contigua, suavizar: suave, amostra });
        selecionarNoDocumento(combinar(antes, nova, modo));
      })
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível ler a imagem."));
  };
  /** Aumentar (contígua) e Semelhante (em toda a imagem), com a tolerância da varinha. */
  const aumentarSelecao = (contigua: boolean) => {
    const antes = selecaoNoDocumento;
    if (!antes) return;
    imagemParaSelecao(opcoesDaSelecao.todasAsCamadas || !selecionado)
      .then((imagem) => setSelecaoDoDocumento(aumentar(imagem, antes, opcoesDaSelecao.tolerancia, contigua)))
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível ler a imagem."));
  };
  // O laço magnético lê as bordas da imagem inteira ao ser escolhido, e de novo quando o projeto muda
  const lerBordas = useEffectEvent((vivo: { atual: boolean }) => {
    imagemParaSelecao(true)
      .then((imagem) => {
        if (vivo.atual) setBordasDaImagem(mapaDeBordas(imagem));
      })
      .catch(() => {
        if (vivo.atual) mostrarAviso("Não foi possível ler as bordas da imagem.");
      });
  });
  useEffect(() => {
    if (ferramenta !== "lacoMagnetico" || !projeto) return;
    const vivo = { atual: true };
    lerBordas(vivo);
    return () => {
      vivo.atual = false;
    };
  }, [ferramenta, projeto]);
  // A seleção rápida lê a camada escolhida (ou a imagem inteira) ao ser escolhida e quando o projeto muda
  const lerParaARapida = useEffectEvent((vivo: { atual: boolean }) => {
    imagemParaSelecao(opcoesDaSelecao.todasAsCamadas || !selecionado)
      .then((imagem) => {
        if (vivo.atual) setImagemDaRapida(imagem);
      })
      .catch(() => {
        if (vivo.atual) mostrarAviso("Não foi possível ler a imagem.");
      });
  });
  const camadaDaRapida = opcoesDaSelecao.todasAsCamadas ? null : (selecionado?.clipe.id ?? null);
  useEffect(() => {
    if (ferramenta !== "selecaoRapida" || !projeto) return;
    const vivo = { atual: true };
    lerParaARapida(vivo);
    return () => {
      vivo.atual = false;
    };
  }, [ferramenta, projeto, camadaDaRapida]);
  // A seleção da IA (na foto) vira a seleção do documento, com as formigas, para as outras ferramentas usarem
  const arquivoDoObjeto = objeto.selecao?.arquivo ?? null;
  const canais = projeto?.canais ?? [];
  const canalDaVez = canalAtivo ? (canais.find((canal) => canal.id === canalAtivo) ?? null) : null;
  /** O motor de um canal alfa: pintar nele sobe uma versão nova e muda o número no projeto (um passo do desfazer). */
  const alvoDoCanal = (canal: Canal): AlvoDoMotor => ({
    chave: `#canal:${canal.id}`,
    midiaId: canal.midia_id,
    versao: canal.versao,
    aoSubir: (versao) => ({ comando: "canal.mudar", parametros: { id: canal.id, mudanca: { versao } } }),
  });
  // A versão do canal à vista, para o véu cinza (enquanto ninguém pinta nele)
  const chaveDoCanal = canalDaVez ? arquivoDaMidia(canalDaVez.midia_id, arquivoDaVersao(canalDaVez.versao)) : null;
  useEffect(() => {
    if (!chaveDoCanal) return;
    let vivo = true;
    carregarBitmap(chaveDoCanal)
      .then((imagem) => {
        if (vivo) setImagemDoCanal({ chave: chaveDoCanal, imagem });
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [chaveDoCanal]);
  /** O canal alfa como seleção (o branco é selecionado), no tamanho do documento. */
  const selecaoDoCanal = async (canal: Canal): Promise<Selecao> => {
    const documento = tamanhoDaImagem(projetoRef.current ?? projeto!);
    const imagem = pinturas.fonteDe(alvoDoCanal(canal)) ?? (await carregarBitmap(arquivoDaMidia(canal.midia_id, arquivoDaVersao(canal.versao))));
    return imagemNoDocumento(imagem, [documento.largura / imagem.width, 0, 0, documento.altura / imagem.height, 0, 0], documento, "cinza");
  };
  /** Salvar a seleção: num canal novo, ou num que existe (substituir, somar, subtrair ou intersectar). */
  const salvarSelecaoNoCanal = async (destino: string | null, nome: string, operacao: ModoDaSelecao) => {
    const selecao = selecaoNoDocumento;
    if (!selecao || !projeto) return;
    try {
      await pinturas.esperar();
      if (!destino) {
        const { largura, altura } = tamanhoDaImagem(projeto);
        const midia = await criarCamadaDePixels(largura, altura, nome);
        const versao = await enviarVersao(midia.id, await pngDoDocumento((ctx2d) => pintarSelecao(ctx2d, selecao))());
        executar({ comando: "canal.adicionar", parametros: { canal: { nome, midia_id: midia.id, versao } } });
        return;
      }
      const canal = canais.find((item) => item.id === destino);
      if (!canal) return;
      const atual = await selecaoDoCanal(canal);
      const nova = operacao === "nova" ? selecao : (combinar(atual, selecao, operacao) ?? atual);
      const versao = await enviarVersao(canal.midia_id, await pngDoDocumento((ctx2d) => pintarSelecao(ctx2d, nova))());
      executar({ comando: "canal.mudar", parametros: { id: canal.id, mudanca: { versao } } });
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível salvar a seleção.");
    }
  };
  /** Carregar a seleção de um canal (ou da transparência da camada escolhida), invertida ou não, no modo. */
  const carregarSelecaoDoCanal = async (fonte: string, inverter: boolean, modo: ModoDaSelecao) => {
    try {
      if (fonte === "transparencia") {
        if (selecionado) await selecionarDaCamada(selecionado.clipe.id, modo, "camada", inverter);
        return;
      }
      const canal = canais.find((item) => item.id === fonte);
      if (!canal) return;
      const lida = await selecaoDoCanal(canal);
      const resultado = combinar(selecaoNoDocumento, inverter ? inverterSelecao(lida) : lida, modo);
      if (resultado && !temAlgo(resultado)) mostrarAviso("Nenhum pixel ficou mais da metade selecionado: as bordas da seleção não vão aparecer.");
      setSelecaoDoDocumento(resultado);
      setBordasDaSelecao(true);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível carregar a seleção.");
    }
  };
  /** Um canal alfa novo, preto (nada selecionado), já à vista para pintar. */
  const novoCanal = async () => {
    if (!projeto) return;
    const { largura, altura } = tamanhoDaImagem(projeto);
    const nome = `Alfa ${canais.length + 1}`;
    try {
      const midia = await criarCamadaDePixels(largura, altura, nome);
      const versao = await enviarVersao(midia.id, await pngDoDocumento((ctx2d) => {
        ctx2d.fillStyle = "#000";
        ctx2d.fillRect(0, 0, largura, altura);
      })());
      const resultado = executar({ comando: "canal.adicionar", parametros: { canal: { nome, midia_id: midia.id, versao } } });
      const criado = resultado?.projeto.canais?.at(-1);
      if (criado) {
        setCorAVista(null);
        setCanalAtivo(criado.id);
        if (!FERRAMENTAS_DE_PINTURA.has(ferramenta)) escolherFerramenta("pincel");
      }
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível criar o canal.");
    }
  };
  /** Selecionar › Luminosidade (Ctrl+Alt+2): a luz da imagem inteira vira a seleção (o claro mais selecionado). */
  const selecionarLuminosidade = () => {
    imagemParaSelecao(true)
      .then((imagem) => {
        const selecao: Selecao = { largura: imagem.largura, altura: imagem.altura, dados: new Uint8Array(imagem.largura * imagem.altura) };
        const d = imagem.dados;
        for (let i = 0; i < selecao.dados.length; i++) selecao.dados[i] = Math.round(((0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) * d[i * 4 + 3]) / 255);
        if (!temAlgo(selecao)) mostrarAviso("Nenhum pixel é claro o bastante: as bordas da seleção não vão aparecer.");
        setSelecaoDoDocumento(selecao);
        setBordasDaSelecao(true);
      })
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível ler a imagem."));
  };
  /** Q: entra na máscara rápida (a seleção vira cinza para pintar) ou sai dela (o cinza volta a ser a seleção). */
  const alternarMascaraRapida = () => {
    if (!projeto) return;
    if (mascaraRapida) {
      const nova = selecaoDoCanvas(mascaraRapida.camada, "cinza");
      setMascaraRapida(null);
      selecionarNoDocumento(temAlgo(nova) ? nova : null);
      return;
    }
    const { largura, altura } = tamanhoDaImagem(projeto);
    const pintura = new Pintura(largura, altura);
    pintura.carregar(selecaoEmCinza(selecaoNoDocumento, largura, altura));
    setMascaraRapida(pintura);
    if (!FERRAMENTAS_DE_PINTURA.has(ferramenta)) escolherFerramenta("pincel");
  };
  /** Uma máscara cinza da foto escolhida (a do objeto, a do assunto) como seleção do documento; null sem a camada na prévia. */
  const mascaraDaFotoNoDocumento = async (arquivo: string): Promise<Selecao | null> => {
    const medida = selecionado ? caixasRef.current.get(selecionado.clipe.id) : undefined;
    const video = foto?.video;
    if (!selecionado || !foto || !video || !projeto || !medida?.bruta || !medida.quadro) return null;
    const { bruta, quadro } = medida;
    const clipe = selecionado.clipe;
    const documento = tamanhoDaImagem(projeto);
    const mascara = await carregarBitmap(arquivoDaMidia(foto.id, arquivo));
    // A máscara vem menor que a foto: o pixel dela vai para o da foto e daí ao documento
    const escala: Afim = [video.largura / mascara.width, 0, 0, video.altura / mascara.height, 0, 0];
    return imagemNoDocumento(mascara, compor(matrizDaMidiaNoDocumento(bruta, clipe.recorte, clipe.virar, video, quadro, documento), escala), documento, "cinza");
  };
  const levarObjeto = useEffectEvent((arquivo: string) => {
    mascaraDaFotoNoDocumento(arquivo)
      .then((selecao) => {
        if (!selecao) return;
        setSelecaoDoDocumento(selecao);
        setBordasDaSelecao(true);
      })
      .catch(() => undefined);
  });
  /** Selecionar › Assunto: a pessoa da foto escolhida (o MODNet do recorte do fundo), como seleção. */
  const selecionarAssunto = async () => {
    if (!selecionado || !foto) return mostrarAviso("Escolha uma foto: o assunto (a pessoa) é achado na foto escolhida.");
    if (achandoAssunto) return;
    setAchandoAssunto(true);
    try {
      let estado = foto.recorte_fundo?.status;
      if (estado !== "pronta") {
        if (estado !== "processando") await chamarApi(`/midias/${foto.id}/recorte-fundo`, { metodo: "POST" });
        mostrarAviso("Achando o assunto da foto…");
        for (let i = 0; i < 300 && estado !== "pronta"; i++) {
          await new Promise((pronto) => setTimeout(pronto, 1000));
          const atual = await chamarApi<Midia>(`/midias/${foto.id}`);
          estado = atual.recorte_fundo?.status;
          if (estado === "erro") throw new Error(atual.recorte_fundo?.erro ?? "Não foi possível achar o assunto.");
        }
        if (estado !== "pronta") throw new Error("O assunto demorou demais. Tente de novo.");
        void biblioteca.recarregar();
      }
      const selecao = await mascaraDaFotoNoDocumento("mascara.png");
      if (!selecao || !temAlgo(selecao)) mostrarAviso("Nenhuma pessoa foi achada na foto.");
      else selecionarNoDocumento(selecao);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível achar o assunto.");
    } finally {
      setAchandoAssunto(false);
    }
  };
  /** Uma seleção feita numa cópia menor da imagem, ampliada (suave) para o tamanho do documento. */
  const ampliarSelecao = (selecao: Selecao, documento: { largura: number; altura: number }): Selecao =>
    selecao.largura === documento.largura && selecao.altura === documento.altura
      ? selecao
      : imagemNoDocumento(selecaoParaCanvas(selecao), [documento.largura / selecao.largura, 0, 0, documento.altura / selecao.altura, 0, 0], documento, "alfa");
  const selecionarPor = (como: "cores" | "foco" | "assunto" | "ceu") => {
    if (como === "assunto") return void selecionarAssunto();
    imagemParaSelecao(true)
      .then((imagem) => {
        if (como === "ceu") {
          const nova = ceu(imagemMenor(imagem, 512));
          const selecao = ampliarSelecao(nova, { largura: imagem.largura, altura: imagem.altura });
          if (!temAlgo(selecao)) mostrarAviso("Nenhum céu foi achado (o céu precisa tocar a borda de cima).");
          else selecionarNoDocumento(selecao);
        } else setJanelaDaSelecao({ tipo: como, imagem });
      })
      .catch((e: unknown) => mostrarAviso(e instanceof Error ? e.message : "Não foi possível ler a imagem."));
  };
  useEffect(() => {
    if (arquivoDoObjeto) levarObjeto(arquivoDoObjeto);
  }, [arquivoDoObjeto]);
  /** Ctrl + clique na miniatura: a seleção pela transparência da camada (sozinha) ou pelo cinza da máscara dela. */
  const selecionarDaCamada = async (clipeId: string, modo: ModoDaSelecao, de: "camada" | "mascara", inverter = false) => {
    const atual = projetoRef.current;
    const achado = atual ? acharClipe(atual, clipeId) : null;
    if (!atual || !achado) return;
    const documento = tamanhoDaImagem(atual);
    try {
      await pinturas.esperar();
      let nova: Selecao;
      if (de === "mascara") {
        const mascara = achado.clipe.mascara_pixels;
        const medida = caixasRef.current.get(clipeId);
        if (!mascara || !medida?.bruta || !medida.quadro) return;
        const imagem = pinturas.fonteDaMascara(achado.clipe) ?? (await carregarBitmap(arquivoDaMidia(mascara.midia_id, arquivoDaVersao(mascara.versao))));
        // A máscara tem o tamanho do documento de quando foi feita: o pixel dela vai para o documento pela matriz
        const escala: Afim = [documento.largura / imagem.width, 0, 0, documento.altura / imagem.height, 0, 0];
        nova = imagemNoDocumento(imagem, compor(matrizDaMascaraNoDocumento(mascara, medida.bruta, medida.quadro, documento), escala), documento, "cinza");
      } else {
        const sozinha = projetoSoCom(atual, [achado.faixa.id], { neutras: new Set([achado.faixa.id]), semEstilo: true, semMascara: true });
        const imagem = await createImageBitmap(await exportarImagem(sozinha, midias, { formato: "png", fonteDosPixels: pinturas.fonte }));
        nova = imagemNoDocumento(imagem, [documento.largura / imagem.width, 0, 0, documento.altura / imagem.height, 0, 0], documento, "alfa");
        imagem.close();
      }
      const resultado = combinar(selecaoNoDocumento, inverter ? inverterSelecao(nova) : nova, modo);
      if (resultado && !temAlgo(resultado)) mostrarAviso("A camada não tem nenhum pixel mais da metade opaco: nada foi selecionado.");
      selecionarNoDocumento(resultado);
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível selecionar pela camada.");
    }
  };
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
    const midia = await objeto.pedir(acao, selecaoNaFoto());
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
  /** O projeto do estado marcado como fonte no Histórico (o de abertura, se o passo marcado não existe mais). */
  const projetoDaFonte = (): Projeto | null => {
    if (fonteDoHistorico.startsWith("instantaneo:")) {
      const instantaneo = instantaneos.find((item) => `instantaneo:${item.id}` === fonteDoHistorico);
      if (instantaneo) return instantaneo.projeto;
    }
    const passo = Number(fonteDoHistorico.replace("passo:", ""));
    return edicao.projetoDoPasso(Number.isFinite(passo) ? passo : 0) ?? edicao.projetoDoPasso(0);
  };
  /**
   * A camada como estava na fonte do pincel do histórico, do tamanho dela: a versão de então (a mesma mídia), ou a
   * camada de então desenhada sozinha (um texto antes de rasterizar), quando a camada de agora cobre o quadro.
   */
  const fonteDoHistoricoPara = async (clipe: Clipe, tamanhoDaCamada: { largura: number; altura: number }): Promise<HTMLCanvasElement | null> => {
    const origem = projetoDaFonte();
    const naFonte = origem ? acharClipe(origem, clipe.id) : null;
    const canvas = document.createElement("canvas");
    canvas.width = tamanhoDaCamada.largura;
    canvas.height = tamanhoDaCamada.altura;
    const ctx2d = canvas.getContext("2d", { willReadFrequently: true })!;
    if (!naFonte) return canvas;
    if (naFonte.clipe.pixels && naFonte.clipe.midia_id === clipe.midia_id) {
      if (naFonte.clipe.pixels.versao > 0) ctx2d.drawImage(await carregarBitmap(arquivoDaMidia(clipe.midia_id!, arquivoDaVersao(naFonte.clipe.pixels.versao))), 0, 0, canvas.width, canvas.height);
      return canvas;
    }
    const t = clipe.transformacao;
    if (Math.abs(t.x) > 1e-6 || Math.abs(t.y) > 1e-6 || Math.abs(t.escala - 1) > 1e-6 || Math.abs(t.rotacao) > 1e-6) {
      mostrarAviso("A camada mudou de lugar desde aquele estado: o pincel do histórico não acha o que estava lá.");
      return null;
    }
    const sozinha = projetoSoCom(origem!, [naFonte.faixa.id], { neutras: new Set([naFonte.faixa.id]), semEstilo: true, semMascara: true });
    const imagem = await createImageBitmap(await exportarImagem(sozinha, midias, { formato: "png" }));
    ctx2d.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    imagem.close();
    return canvas;
  };
  const alvoDaPintura = async (): Promise<Omit<AlvoDaPintura, "caixa"> | null> => {
    const atual = projetoRef.current;
    if (!atual) return null;
    // Na máscara rápida, todo pincel pinta a seleção (do tamanho do documento, parada no lugar)
    if (mascaraRapida) {
      return { clipeId: CHAVE_DA_MASCARA_RAPIDA, chave: CHAVE_DA_MASCARA_RAPIDA, pintura: mascaraRapida, mascara: { vinculada: false, matriz: IDENTIDADE }, recorte: { x: 0, y: 0, largura: 1, altura: 1 }, virar: null, travarTransparencia: true };
    }
    // Com um canal alfa à vista, o pincel pinta nele, em cinza
    const canal = canalAtivo ? (atual.canais ?? []).find((item) => item.id === canalAtivo) : undefined;
    if (canal) {
      const alvo = alvoDoCanal(canal);
      try {
        const pintura = await pinturas.preparar(alvo, tamanhoDaImagem(atual));
        return { clipeId: alvo.chave, chave: alvo.chave, pintura, mascara: { vinculada: false, matriz: IDENTIDADE }, recorte: { x: 0, y: 0, largura: 1, altura: 1 }, virar: null, travarTransparencia: true };
      } catch {
        mostrarAviso("Não foi possível abrir o canal para pintar. Tente de novo.");
        return null;
      }
    }
    // Os pincéis do histórico pintam na camada de pixels escolhida, com ela como estava na fonte
    if (ferramenta === "historico" || ferramenta === "historicoArtistico") {
      const achado = selecionado?.clipe.pixels ? acharClipe(atual, selecionado.clipe.id) : null;
      if (!achado?.clipe.midia_id || !achado.clipe.pixels) {
        mostrarAviso("Escolha uma camada de pixels para pintar com o histórico.");
        return null;
      }
      if (camadaTravada(atual, achado.faixa) || achado.faixa.travas?.pixels) {
        mostrarAviso("A camada está travada.");
        return null;
      }
      const alvo = alvoDosPixels(achado.clipe)!;
      const tamanhoDaCamada = midias.get(achado.clipe.midia_id)?.camada_pixels ?? tamanhoDaImagem(atual);
      try {
        const [pintura, fonteDaTinta] = await Promise.all([pinturas.preparar(alvo, tamanhoDaCamada), fonteDoHistoricoPara(achado.clipe, tamanhoDaCamada)]);
        if (!fonteDaTinta) return null;
        return { clipeId: achado.clipe.id, chave: alvo.chave, pintura, recorte: achado.clipe.recorte, virar: achado.clipe.virar, travarTransparencia: Boolean(achado.faixa.travas?.transparencia), fonteDaTinta };
      } catch {
        mostrarAviso("Não foi possível abrir a camada para pintar. Tente de novo.");
        return null;
      }
    }
    // A máscara em foco (Ctrl+\ ou o clique na miniatura dela): o pincel pinta a máscara em tons de cinza
    if (selecionado && mascaraEmFoco === selecionado.clipe.id && selecionado.clipe.mascara_pixels) {
      const achado = acharClipe(atual, selecionado.clipe.id);
      const mascara = achado?.clipe.mascara_pixels;
      const alvo = achado ? alvoDaMascara(achado.clipe) : null;
      if (!achado || !mascara || !alvo) return null;
      if (camadaTravada(atual, achado.faixa) || achado.faixa.travas?.pixels) {
        mostrarAviso("A camada está travada. Destrave para pintar a máscara.");
        return null;
      }
      try {
        const pintura = await pinturas.preparar(alvo, tamanhoDaImagem(atual));
        return { clipeId: achado.clipe.id, chave: alvo.chave, pintura, recorte: achado.clipe.recorte, virar: achado.clipe.virar, travarTransparencia: true, mascara };
      } catch {
        mostrarAviso("Não foi possível abrir a máscara para pintar. Tente de novo.");
        return null;
      }
    }
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
    const alvo = alvoDosPixels(achado.clipe);
    if (!alvo) return null;
    try {
      const pintura = await pinturas.preparar(alvo, tamanhoDaCamada);
      return { clipeId: achado.clipe.id, chave: alvo.chave, pintura, recorte: achado.clipe.recorte, virar: achado.clipe.virar, travarTransparencia: Boolean(achado.faixa.travas?.transparencia) };
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
      const blob = typeof plano === "function" ? await plano() : await exportarImagem(plano.desenhar, midias, { formato: "png", fonteDosPixels: pinturas.fonte, fonteDaMascara: pinturas.fonteDaMascara });
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
  /** A matriz da máscara de camada para o quadro inteiro (a camada que rasterizar cria), pela caixa de agora. */
  const matrizNoQuadro = (faixa: Faixa) => {
    const medida = caixasRef.current.get(faixa.clipes[0].id);
    const mascara = faixa.clipes[0].mascara_pixels;
    if (!medida?.bruta || !medida.quadro || !mascara) return null;
    const inteira = { cx: medida.quadro.largura / 2, cy: medida.quadro.altura / 2, largura: medida.quadro.largura, altura: medida.quadro.altura, rotacao: 0, opacidade: 1 };
    return matrizParaOutraCaixa(mascara, medida.bruta, inteira, medida.quadro);
  };
  /** Rasterizar, mesclar, achatar ou carimbar as escolhidas (cada rasterizar é uma camada por vez). */
  const mesclarEmPixels = async (tipo: TipoDaMesclagem) => {
    if (!projeto || gerandoPixels) return;
    const ids = tipo === "rasterizar" && faixaIds.length > 1 ? faixaIds : [faixaIds];
    for (const grupo of ids) {
      const atual = projetoRef.current ?? projeto;
      let plano: PlanoDosPixels;
      try {
        plano = planoDosPixels(atual, tipo, Array.isArray(grupo) ? grupo : [grupo], nomeDaFaixa, alturaDaCaixa, matrizNoQuadro);
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
      const { desenhar, ...dados } = planoDosPixels(atual, "rasterizar", [faixa.id], nomeDaFaixa, alturaDaCaixa, matrizNoQuadro);
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

  /** Um PNG do tamanho da imagem: a cor lisa, ou a função que pinta o canvas. */
  const pngDoDocumento = (pintar: (ctx: CanvasRenderingContext2D, largura: number, altura: number) => void | Promise<void>) => async (): Promise<Blob> => {
    const { largura, altura } = tamanhoDaImagem(projetoRef.current ?? projeto!);
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx2d = canvas.getContext("2d", { willReadFrequently: true })!;
    await pintar(ctx2d, largura, altura);
    return new Promise<Blob>((pronto, falhou) => canvas.toBlob((blob) => (blob ? pronto(blob) : falhou(new Error("O navegador não conseguiu gerar a máscara."))), "image/png"));
  };
  /** Sobe um PNG como camada de pixels (a máscara de camada) e devolve a mídia e a versão. */
  const subirMascara = async (gerar: () => Promise<Blob>) => {
    const { largura, altura } = tamanhoDaImagem(projetoRef.current ?? projeto!);
    const blob = await gerar();
    const midia = await criarCamadaDePixels(largura, altura, "Máscara");
    setCriadas((atual) => new Map([...atual, [midia.id, midia]]));
    const versao = await enviarVersao(midia.id, blob);
    return { midia, versao };
  };
  /**
   * Camada › Máscara de camada: revelar tudo (branca), ocultar tudo (preta) ou a partir da transparência (o alfa da
   * camada, desenhada sozinha, vira o cinza). A matriz é a da caixa da camada agora: a máscara anda com ela.
   */
  const criarMascara = async (como: "revelar" | "ocultar" | "revelarSelecao" | "ocultarSelecao" | "transparencia") => {
    const daSelecao = selecaoNoDocumento;
    if ((como === "revelarSelecao" || como === "ocultarSelecao") && !daSelecao) return mostrarAviso("Não há seleção.");
    const alvo = selecionado;
    if (!alvo || !projeto || gerandoPixels) return;
    if (alvo.clipe.pasta || alvo.clipe.ajuste) return mostrarAviso("A máscara de pixels vale para camadas com imagem.");
    if (alvo.faixa.travada) return mostrarAviso("A camada está travada.");
    const medida = caixasRef.current.get(alvo.clipe.id);
    if (!medida?.bruta || !medida.quadro) return mostrarAviso("A camada ainda não apareceu na prévia. Tente de novo.");
    const matriz = matrizDaCaixa(medida.bruta, medida.quadro);
    setGerandoPixels(true);
    try {
      await pinturas.esperar();
      const gerar =
        como === "transparencia"
          ? pngDoDocumento(async (ctx2d, largura, altura) => {
              const sozinha = projetoSoCom(projetoRef.current ?? projeto, [alvo.faixa.id], { neutras: new Set([alvo.faixa.id]), semEstilo: true, semMascara: true });
              const imagem = await createImageBitmap(await exportarImagem(sozinha, midias, { formato: "png", fonteDosPixels: pinturas.fonte }));
              ctx2d.drawImage(imagem, 0, 0, largura, altura);
              imagem.close();
              const dados = ctx2d.getImageData(0, 0, largura, altura);
              for (let i = 0; i < dados.data.length; i += 4) {
                const a = dados.data[i + 3];
                dados.data[i] = a;
                dados.data[i + 1] = a;
                dados.data[i + 2] = a;
                dados.data[i + 3] = 255;
              }
              ctx2d.putImageData(dados, 0, 0);
            })
          : daSelecao && (como === "revelarSelecao" || como === "ocultarSelecao")
            ? pngDoDocumento((ctx2d) => pintarSelecao(ctx2d, daSelecao, como === "ocultarSelecao"))
            : pngDoDocumento((ctx2d, largura, altura) => {
                ctx2d.fillStyle = como === "revelar" ? "#ffffff" : "#000000";
                ctx2d.fillRect(0, 0, largura, altura);
              });
      const { midia, versao } = await subirMascara(gerar);
      if (executar({ comando: "mascara.definir", parametros: { clipeId: alvo.clipe.id, mascara: { midia_id: midia.id, versao, ligada: true, vinculada: true, densidade: 1, difusao: 0, matriz } } })) {
        setMascaraEmFoco(alvo.clipe.id);
      }
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível criar a máscara.");
    } finally {
      setGerandoPixels(false);
    }
  };
  /** Inverter a máscara (o que mostrava esconde): uma versão nova com o cinza ao contrário. */
  const inverterMascara = async () => {
    const mascara = selecionado?.clipe.mascara_pixels;
    if (!selecionado || !mascara || gerandoPixels) return;
    setGerandoPixels(true);
    try {
      await pinturas.esperar();
      const atual = pinturas.fonteDaMascara(selecionado.clipe) ?? (await carregarBitmap(arquivoDaMidia(mascara.midia_id, arquivoDaVersao(mascara.versao))));
      const blob = await pngDoDocumento((ctx2d, largura, altura) => {
        ctx2d.drawImage(atual, 0, 0, largura, altura);
        const dados = ctx2d.getImageData(0, 0, largura, altura);
        for (let i = 0; i < dados.data.length; i += 4) {
          dados.data[i] = 255 - dados.data[i];
          dados.data[i + 1] = 255 - dados.data[i + 1];
          dados.data[i + 2] = 255 - dados.data[i + 2];
          dados.data[i + 3] = 255;
        }
        ctx2d.putImageData(dados, 0, 0);
      })();
      const versao = await enviarVersao(mascara.midia_id, blob);
      executar({ comando: "mascara.mudar", parametros: { clipeId: selecionado.clipe.id, mudanca: { versao } } });
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : "Não foi possível inverter a máscara.");
    } finally {
      setGerandoPixels(false);
    }
  };
  /** Vincular de novo guarda a matriz da caixa de agora: a máscara fica onde está e volta a andar com a camada. */
  const vincularMascara = (clipeId: string, ligar: boolean) => {
    const medida = caixasRef.current.get(clipeId);
    if (ligar && (!medida?.bruta || !medida.quadro)) return;
    executar({ comando: "mascara.mudar", parametros: { clipeId, mudanca: ligar ? { vinculada: true, matriz: matrizDaCaixa(medida!.bruta!, medida!.quadro!) } : { vinculada: false } } });
  };
  const mascaraDaEscolhida = selecionado?.clipe.mascara_pixels ?? null;
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
    temSelecaoDoDocumento: Boolean(selecaoNoDocumento),
    podeSelecionarNovamente: !selecaoNoDocumento && Boolean(selecaoAnterior && selecaoAnterior.largura === tamanhoDoDocumento?.largura && selecaoAnterior.altura === tamanhoDoDocumento?.altura),
    bordasVisiveis: bordasDaSelecao,
    selecaoDoDocumento: (acao) => {
      if (!tamanhoDoDocumento) return;
      if (acao === "tudo") selecionarNoDocumento(cheia(tamanhoDoDocumento.largura, tamanhoDoDocumento.altura));
      else if (acao === "desmarcar") selecionarNoDocumento(null);
      else if (acao === "novamente" && selecaoAnterior) selecionarNoDocumento(selecaoAnterior);
      else if (acao === "inverter" && selecaoNoDocumento) setSelecaoDoDocumento(inverterSelecao(selecaoNoDocumento));
      else if (acao === "bordas") setBordasDaSelecao((atual) => !atual);
    },
    modificarSelecao: (como) => selecaoNoDocumento && setModificando(como),
    aumentarSelecao,
    selecionarPor,
    mascaraRapida: Boolean(mascaraRapida),
    alternarMascaraRapida,
    temCanais: canais.length > 0,
    canalDaSelecao: (acao) => (acao === "luminosidade" ? selecionarLuminosidade() : setJanelaDoCanal(acao)),
    podeDesfazer: edicao.nomeDesfazer,
    podeRefazer: edicao.nomeRefazer,
    area: area.area,
    painelAberto: (painel) => area.aberto(painel),
    novo: () => router.push("/app/ferramentas/editor-de-imagem"),
    abrir: () => router.push("/app/ferramentas/editor-de-imagem"),
    exportar: () => setExportando(true),
    salvar: () => mostrarAviso(edicao.salvamento === "salvo" ? "Tudo salvo: o TakeOne salva a cada mudança." : "Salvando: o TakeOne salva a cada mudança."),
    desfazer: () =>
      depoisDaPintura(() => {
        ultimoFoiDesfazer.current = true;
        desfazer();
      }),
    refazer: () =>
      depoisDaPintura(() => {
        ultimoFoiDesfazer.current = false;
        refazer();
      }),
    alternarUltimoEstado: () =>
      depoisDaPintura(() => {
        // Ctrl+Alt+Z: o último passo vai e volta (desfeito agora, refeito na próxima)
        if (ultimoFoiDesfazer.current && edicao.nomeRefazer) {
          ultimoFoiDesfazer.current = false;
          refazer();
        } else if (edicao.nomeDesfazer) {
          ultimoFoiDesfazer.current = true;
          desfazer();
        }
      }),
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
    temMascara: Boolean(mascaraDaEscolhida),
    mascaraLigada: Boolean(mascaraDaEscolhida?.ligada),
    mascaraVinculada: Boolean(mascaraDaEscolhida?.vinculada),
    mascaraEmFoco: Boolean(selecionado && mascaraEmFoco === selecionado.clipe.id),
    mascaraDePixels: (acao) => {
      if (!selecionado) return;
      const clipeId = selecionado.clipe.id;
      if (acao === "revelar" || acao === "ocultar" || acao === "revelarSelecao" || acao === "ocultarSelecao" || acao === "transparencia") void criarMascara(acao);
      else if (acao === "excluir") {
        if (executar({ comando: "mascara.definir", parametros: { clipeId, mascara: null } })) setMascaraEmFoco(null);
      } else if (acao === "aplicar") void mesclarEmPixels("aplicarMascara").then(() => setMascaraEmFoco(null));
      else if (acao === "ligar" && mascaraDaEscolhida) executar({ comando: "mascara.mudar", parametros: { clipeId, mudanca: { ligada: !mascaraDaEscolhida.ligada } } });
      else if (acao === "vincular" && mascaraDaEscolhida) vincularMascara(clipeId, !mascaraDaEscolhida.vinculada);
      else if (acao === "inverter") void inverterMascara();
      else if (acao === "foco") setMascaraEmFoco((atual) => (atual === clipeId || !mascaraDaEscolhida ? null : clipeId));
    },
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
    desmarcar: () => {
      objeto.limpar();
      selecionarNoDocumento(null);
    },
    todasAsCamadas: () => projeto && setSelecao(camadasDaImagem(projeto).map(({ clipe }) => clipe.id)),
    desmarcarCamadas: () => setSelecao([]),
    texto: (texto) => porTexto(texto),
    filtro: aplicarFiltro,
    zoom: mudarZoom,
    area_: area.escolherArea,
    restaurarArea: area.restaurar,
    atalhos: () => setAtalhos(true),
  };
  const janelaAberta = exportando || atalhos || trocando !== null || modificando !== null || janelaDaSelecao !== null || janelaDoCanal !== null;

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
      // Shift passa só pelas do grupo com a mesma tecla (o letreiro de linha única não tem tecla, como lá)
      const comAMesma = grupo.filter((item) => item.tecla === tecla);
      if (evento.shiftKey && atualNoGrupo) id = comAMesma[(comAMesma.findIndex((item) => item.id === ferramenta) + 1) % comAMesma.length].id;
      escolherFerramenta(id);
    } else if (tecla === "D") setCores((atual) => ({ ...atual, primeiroPlano: "#000000", fundo: "#ffffff" }));
    else if (tecla === "X") setCores((atual) => ({ ...atual, primeiroPlano: atual.fundo, fundo: atual.primeiroPlano }));
    else if ((tecla === "[" || tecla === "]") && ferramenta === "selecaoRapida") {
      const t = opcoesDaSelecao.tamanhoRapida;
      const passo = t < 10 ? 1 : t < 100 ? 5 : 25;
      setOpcoesDaSelecao((atual) => ({ ...atual, tamanhoRapida: Math.min(500, Math.max(1, tecla === "]" ? t + passo : t - passo)) }));
    } else if ((tecla === "[" || tecla === "]") && ferramenta === "remover") objeto.setTamanhoDoPincel(Math.min(0.2, Math.max(0.01, objeto.tamanhoDoPincel * (tecla === "]" ? 1.25 : 0.8))));
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
      conteudo:
        selecionado && mascaraEmFoco === selecionado.clipe.id && selecionado.clipe.mascara_pixels ? (
          <PropriedadesDaMascara
            clipeId={selecionado.clipe.id}
            mascara={selecionado.clipe.mascara_pixels}
            travada={selecionado.faixa.travada}
            aoPrever={preverDoPainel}
            aoExecutar={executar}
            aoAcao={(acao) => acoes.mascaraDePixels(acao)}
          />
        ) : (
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
    canais: {
      nome: PAINEIS_DA_IMAGEM.canais,
      conteudo: (
        <PainelCanais
          canais={canais}
          corAVista={corAVista}
          aoVerCor={setCorAVista}
          canalAtivo={canalDaVez?.id ?? null}
          aoAtivar={(id) => {
            setCanalAtivo(id);
            if (id && !FERRAMENTAS_DE_PINTURA.has(ferramenta)) escolherFerramenta("pincel");
          }}
          aoCarregar={(id, modo) => void carregarSelecaoDoCanal(id, false, modo)}
          aoSalvar={() => setJanelaDoCanal("salvar")}
          aoNovo={() => void novoCanal()}
          aoApagar={(id) => {
            if (executar({ comando: "canal.apagar", parametros: { id } }) && canalAtivo === id) setCanalAtivo(null);
          }}
          aoRenomear={(id, nome) => executar({ comando: "canal.mudar", parametros: { id, mudanca: { nome } } })}
          temSelecao={Boolean(selecaoNoDocumento)}
        />
      ),
    },
    camadas: {
      nome: PAINEIS_DA_IMAGEM.camadas,
      conteudo: <PainelCamadas projeto={projetoNaTela} midias={midias} selecao={selecaoValida} aoSelecionar={setSelecao} aoExecutar={executar} aoCriarAjuste={criarAjuste} aoAbrirPropriedades={() => abrirAba("basico")} aoNovaCamada={() => void novaCamada()} aoCamadaDoFundo={acoes.camadaDoFundo} mascaraEmFoco={mascaraEmFoco} mascaraAVista={mascaraAVista} aoFocarMascara={setMascaraEmFoco} aoVerMascara={setMascaraAVista} aoCriarMascara={(como) => void criarMascara(selecaoNoDocumento ? (como === "revelar" ? "revelarSelecao" : "ocultarSelecao") : como)} aoVincularMascara={vincularMascara} aoSelecionarDaCamada={(clipeId, modo, de) => void selecionarDaCamada(clipeId, modo, de)} />,
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
    historico: {
      nome: PAINEIS_DA_IMAGEM.historico,
      conteudo: (
        <PainelHistorico
          nome={edicao.nome}
          feitos={edicao.passos.feitos}
          desfeitos={edicao.passos.desfeitos}
          aoIr={edicao.irParaPasso}
          extras={{
            instantaneos,
            aoCriarInstantaneo: () => {
              if (!projeto) return;
              const id = crypto.randomUUID().slice(0, 8);
              setInstantaneos((atual) => [...atual, { id, nome: `Instantâneo ${atual.length + 1}`, projeto }]);
            },
            aoRestaurarInstantaneo: (id) => {
              const instantaneo = instantaneos.find((item) => item.id === id);
              if (instantaneo) depoisDaPintura(() => executar({ comando: "projeto.restaurar", parametros: { projeto: instantaneo.projeto } }));
            },
            fonte: fonteDoHistorico,
            aoEscolherFonte: setFonteDoHistorico,
          }}
        />
      ),
    },
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
        localizador={localizador}
        aoMudarLocalizador={setLocalizador}
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
        selecaoDoDocumento={{
          opcoes: opcoesDaSelecao,
          aoMudar: (mudanca) => setOpcoesDaSelecao((atual) => ({ ...atual, ...mudanca })),
          temSelecao: Boolean(selecaoNoDocumento),
          naFoto: Boolean(foto),
          aoDesmarcar: acoes.desmarcar,
        }}
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
          mascaraRapida={Boolean(mascaraRapida)}
          aoMascaraRapida={alternarMascaraRapida}
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
                    aoQuadro: mascaraRapida ? () => setQuadroDaRapida((atual) => atual + 1) : pinturas.avisarQuadro,
                    aoSoltar: (clipeId) => (clipeId === CHAVE_DA_MASCARA_RAPIDA ? setQuadroDaRapida((atual) => atual + 1) : pinturas.soltar(clipeId)),
                    aoAjustar: mudarPincel,
                    simetria,
                    // Na máscara, a tinta é cinza: a luz das cores (o branco mostra, o preto esconde)
                    emCinza: Boolean(selecionado && mascaraEmFoco === selecionado.clipe.id && selecionado.clipe.mascara_pixels),
                  }
                : null
            }
            fonteDosPixels={pinturas.fonte}
            fonteDaMascara={pinturas.fonteDaMascara}
            mascaraAVista={mascaraAVista}
            veu={
              mascaraRapida
                ? { fonte: mascaraRapida.fonte, quadro: quadroDaRapida, cinza: false }
                : canalDaVez
                  ? (() => {
                      // O canal à vista: o canvas do motor enquanto pinta (ou com traços subindo), senão a versão dele
                      const fonte = pinturas.fonteDe(alvoDoCanal(canalDaVez)) ?? (imagemDoCanal?.chave === chaveDoCanal ? imagemDoCanal.imagem : null);
                      return fonte ? { fonte, quadro: pinturas.quadro, cinza: true } : null;
                    })()
                  : null
            }
            corAVista={canalDaVez ? null : corAVista}
            selecaoDoDocumento={{
              selecao: selecaoNoDocumento,
              bordas: bordasDaSelecao,
              ferramenta: FERRAMENTAS_DA_SELECAO.has(ferramenta) ? (ferramenta as FerramentaDeSelecao) : null,
              opcoes: opcoesDaSelecao,
              aoSelecionar: selecionarNoDocumento,
              mapaDeBordas: ferramenta === "lacoMagnetico" ? bordasDaImagem : null,
              imagem: ferramenta === "selecaoRapida" ? imagemDaRapida : null,
              aoVarinha: usarVarinha,
            }}
            ferramenta={ferramenta}
            zoom={zoom}
            aoMudarZoom={setZoom}
            aoMedirZoom={setZoomMedido}
            recorte={recorte ? { ...recorte, aoMudar: (retangulo) => setRecorte({ ...recorte, retangulo }) } : null}
            objeto={MODO_DA_SELECAO[ferramenta] && objeto.foto && selecionado ? { clipeId: selecionado.clipe.id, ferramenta: objeto, localizador } : null}
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
          fonteDaMascara={pinturas.fonteDaMascara}
        />
      ) : null}
      {atalhos ? <JanelaDeAtalhos acoes={acoes} aoFechar={() => setAtalhos(false)} /> : null}
      {janelaDaSelecao?.tipo === "cores" ? (
        <JanelaIntervaloDeCores
          imagem={janelaDaSelecao.imagem}
          aoFechar={() => setJanelaDaSelecao(null)}
          aoConfirmar={(selecao) => {
            setJanelaDaSelecao(null);
            if (!temAlgo(selecao)) mostrarAviso("Nenhum pixel ficou mais da metade selecionado.");
            selecionarNoDocumento(selecao);
          }}
        />
      ) : null}
      {janelaDaSelecao?.tipo === "foco" ? (
        <JanelaAreaDeFoco
          imagem={janelaDaSelecao.imagem}
          aoFechar={() => setJanelaDaSelecao(null)}
          aoConfirmar={(selecao) => {
            setJanelaDaSelecao(null);
            selecionarNoDocumento(selecao);
          }}
        />
      ) : null}
      {janelaDoCanal === "salvar" ? (
        <JanelaSalvarSelecao
          canais={canais}
          aoFechar={() => setJanelaDoCanal(null)}
          aoConfirmar={(destino, nome, operacao) => {
            setJanelaDoCanal(null);
            void salvarSelecaoNoCanal(destino, nome, operacao);
          }}
        />
      ) : null}
      {janelaDoCanal === "carregar" ? (
        <JanelaCarregarSelecao
          canais={canais}
          camada={selecionado ? nomeDaFaixa(selecionado.faixa) : null}
          temSelecao={Boolean(selecaoNoDocumento)}
          aoFechar={() => setJanelaDoCanal(null)}
          aoConfirmar={(fonte, inverter, operacao) => {
            setJanelaDoCanal(null);
            void carregarSelecaoDoCanal(fonte, inverter, operacao);
          }}
        />
      ) : null}
      {modificando ? (
        <JanelaDeNumero
          {...MODIFICACOES[modificando]}
          aoFechar={() => setModificando(null)}
          aoConfirmar={(valor) => {
            setModificando(null);
            modificarSelecao(modificando, valor);
          }}
        />
      ) : null}
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
/** A janela de um número só (Selecionar › Modificar): Enter confirma, Esc fecha. */
function JanelaDeNumero({
  titulo,
  rotulo,
  padrao,
  minimo,
  maximo,
  aoFechar,
  aoConfirmar,
}: {
  titulo: string;
  rotulo: string;
  padrao: number;
  minimo: number;
  maximo: number;
  aoFechar: () => void;
  aoConfirmar: (valor: number) => void;
}) {
  const [texto, setTexto] = useState(String(padrao));
  const numero = Number(texto.replace(",", "."));
  const valido = Number.isFinite(numero) && numero >= minimo && numero <= maximo;
  useEffect(() => {
    const esc = (evento: KeyboardEvent) => evento.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoFechar}>
      <form
        role="dialog"
        aria-modal
        aria-label={titulo}
        className="w-full max-w-xs rounded-lg border border-borda bg-painel p-4 shadow-2xl"
        onClick={(evento) => evento.stopPropagation()}
        onSubmit={(evento) => {
          evento.preventDefault();
          if (valido) aoConfirmar(numero);
        }}
      >
        <h2 className="mb-3 text-sm font-semibold">{titulo}</h2>
        <label className="flex items-center gap-2 text-xs">
          {rotulo}:
          <input autoFocus inputMode="decimal" value={texto} onChange={(evento) => setTexto(evento.currentTarget.value)} onFocus={(evento) => evento.currentTarget.select()} className="w-20 rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-right tabular-nums" />
          pixels
        </label>
        {!valido ? <p className="mt-2 text-[11px] text-erro">Use um número de {minimo.toLocaleString("pt-BR")} a {maximo.toLocaleString("pt-BR")}.</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao-principal px-3 py-1 text-xs" disabled={!valido}>
            OK
          </button>
        </div>
      </form>
    </div>
  );
}

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
