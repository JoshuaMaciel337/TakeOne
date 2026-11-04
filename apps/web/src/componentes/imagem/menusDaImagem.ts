// Os menus do editor de imagem (ADR 0002), na ordem e com os nomes e os atalhos dos editores de imagem
// profissionais. Os atalhos que o navegador não deixa a página pegar (Ctrl+N, Ctrl+T, Ctrl+W) ficam de fora.
import { type PreferenciasDaVista, UNIDADES_DA_REGUA } from "@/lib/imagem/vista";
import { PROVAS, type TipoDaProva } from "@/lib/imagem/prova";
import type { DocumentoAberto } from "@/lib/imagem/documentos";
import type { ItemDeMenu, Menu } from "@/componentes/area/BarraDeMenus";
import type { Alinhamento, Distribuicao } from "@/lib/projeto/alinhar";
import type { TipoDaMesclagem } from "@/lib/projeto/rasterizar";
import { EFEITOS, type TipoEfeito } from "@/lib/projeto/efeitos";
import { ESTILOS_DE_TEXTO, type Texto } from "@/lib/projeto/texto";
import { NOMES_DOS_EFEITOS, type TipoDoEfeito } from "@/lib/imagem/estiloDeCamada";
import type { TipoDoAjuste } from "@/lib/imagem/ajustes";
import { FILTROS as CATALOGO_DE_FILTROS, GRUPOS_DE_FILTROS } from "@/lib/imagem/filtros/catalogo";
import { FERRAMENTAS_DA_GALERIA, type FerramentaDaGaleria, NOMES_DA_GALERIA } from "@/lib/imagem/filtros/galeria";
import type { Suavizacao, TextoRico } from "@/lib/texto/modelo";

import { AJUSTES, type Ajuste } from "./ajustesDaImagem";
import type { IdFerramentaDaImagem } from "./ferramentasDaImagem";

/** Os painéis do editor de imagem, com o nome do menu Janela (em ordem alfabética, como lá). */
export const PAINEIS_DA_IMAGEM = {
  ajustes: "Ajustes",
  amostras: "Amostras",
  biblioteca: "Biblioteca",
  camadas: "Camadas",
  caminhos: "Caminhos",
  canais: "Canais",
  caractere: "Caractere",
  glifos: "Glifos",
  histograma: "Histograma",
  acoes: "Ações",
  comps: "Comps de camada",
  linhaDoTempo: "Linha do tempo",
  teclasModificadoras: "Teclas modificadoras",
  predefinicoes: "Predefinições de ferramenta",
  informacoes: "Informações",
  notas: "Notas",
  registro: "Registro de medições",
  navegador: "Navegador",
  paragrafo: "Parágrafo",
  degrades: "Degradês",
  fonteDeClonagem: "Fonte de clonagem",
  configuracoesDoPincel: "Configurações do pincel",
  cor: "Cor",
  estilos: "Estilos de texto",
  estilosDeCamada: "Estilos",
  filtros: "Filtros",
  fotoIA: "Foto com IA",
  formas: "Formas",
  historico: "Histórico",
  modelos: "Modelos",
  padroes: "Padrões",
  pinceis: "Pincéis",
  propriedades: "Propriedades",
  simbolos: "Símbolos",
} as const;
export type IdPainelDaImagem = keyof typeof PAINEIS_DA_IMAGEM;

export const AREAS_DA_IMAGEM = { essenciais: "Essenciais", fotografia: "Fotografia", grafico: "Gráficos e web" } as const;

/** Os filtros do menu Filtro: os efeitos do TakeOne nos submenus de sempre. */
const FILTROS: { submenu: string; itens: { efeito: TipoEfeito; nome: string }[] }[] = [
  {
    submenu: "Desfoque",
    itens: [
      { efeito: "desfoque", nome: "Desfoque gaussiano…" },
      { efeito: "zoom", nome: "Desfoque radial (zoom)…" },
      { efeito: "giro", nome: "Desfoque radial (giro)…" },
    ],
  },
  { submenu: "Distorcer", itens: [{ efeito: "distorcao", nome: "Esfera…" }] },
  { submenu: "Pixelização", itens: [{ efeito: "pixelizar", nome: "Mosaico…" }] },
  { submenu: "Ruído", itens: [{ efeito: "granulacao", nome: "Adicionar ruído…" }] },
  {
    submenu: "Tornar nítido",
    itens: [
      { efeito: "nitidez", nome: "Tornar nítido…" },
      { efeito: "clareza", nome: "Clareza…" },
    ],
  },
  {
    submenu: "Estilização",
    itens: [
      { efeito: "brilho", nome: "Brilho difuso…" },
      { efeito: "luz", nome: "Efeitos de iluminação…" },
      { efeito: "vhs", nome: "VHS…" },
      { efeito: "glitch", nome: "Glitch…" },
    ],
  },
];

/** Alinhar e distribuir, na ordem do menu Camada. */
const ALINHAMENTOS: { id: Alinhamento; nome: string }[] = [
  { id: "topo", nome: "Bordas superiores" },
  { id: "centroV", nome: "Centros verticais" },
  { id: "base", nome: "Bordas inferiores" },
  { id: "esquerda", nome: "Bordas esquerdas" },
  { id: "centroH", nome: "Centros horizontais" },
  { id: "direita", nome: "Bordas direitas" },
];
const DISTRIBUICOES: { id: Distribuicao; nome: string }[] = [...ALINHAMENTOS, { id: "espacoH", nome: "Espaçamento horizontal" }, { id: "espacoV", nome: "Espaçamento vertical" }];

/** Os modos de tela, na ordem do F: o padrão, a tela cheia com os menus e só a imagem no preto. */
export type ModoDeTela = "padrao" | "comMenus" | "cheia";
export const MODOS_DE_TELA: ModoDeTela[] = ["padrao", "comMenus", "cheia"];

export type AcoesDosMenus = {
  temCamada: boolean;
  /** Quantas camadas estão escolhidas. */
  quantas: number;
  temPasta: boolean;
  /** Todas as escolhidas estão presas à de baixo (o item vira "Liberar máscara de corte"). */
  recortadas: boolean;
  vinculadas: boolean;
  /** A camada escolhida é uma foto (as ações de foto e de seleção valem). */
  temFoto: boolean;
  temSelecao: boolean;
  /** A seleção do documento (letreiros, laços): tem algo, há uma anterior para selecionar de novo, as bordas à vista. */
  temSelecaoDoDocumento: boolean;
  /** O caminho escolhido no painel Caminhos (ou o da forma escolhida) tem área: vira seleção (Ctrl+Enter). */
  temCaminho: boolean;
  caminhoComoSelecao: () => void;
  /** Editar › Definir forma personalizada (os caminhos da forma escolhida, ou do caminho escolhido). */
  definirFormaPersonalizada: () => void;
  caminhoDaSelecao: () => void;
  podeSelecionarNovamente: boolean;
  bordasVisiveis: boolean;
  selecaoDoDocumento: (acao: "tudo" | "desmarcar" | "novamente" | "inverter" | "bordas") => void;
  /** Selecionar › Modificar: pergunta o número e muda a seleção. */
  modificarSelecao: (como: "borda" | "suavizar" | "expandir" | "contrair" | "difusao") => void;
  /** Aumentar (contígua) e Semelhante, com a tolerância da varinha. */
  aumentarSelecao: (contigua: boolean) => void;
  /** Intervalo de cores e Área de foco (abrem a janela), Assunto (na foto escolhida) e Céu. */
  selecionarPor: (como: "cores" | "foco" | "assunto" | "ceu") => void;
  /** Salvar a seleção num canal alfa, carregar a de um canal e a luminosidade (Ctrl+Alt+2). */
  canalDaSelecao: (acao: "salvar" | "carregar" | "luminosidade") => void;
  temCanais: boolean;
  /** Selecionar › Selecionar e mascarar (Ctrl+Alt+R). */
  selecionarEMascarar: () => void;
  /** Selecionar › Transformar seleção. */
  transformarSelecao: () => void;
  /** Filtro › Dissolver e Editar › Distorção de marionete (na camada escolhida). */
  dissolver: () => void;
  marionete: () => void;
  /** Editar › Alinhar e Mesclar camadas automaticamente (as escolhidas). */
  alinharCamadas: () => void;
  mesclarCamadas: () => void;
  /** Filtro › Ponto de fuga (a imagem inteira). */
  pontoDeFuga: () => void;
  /** Editar › Deformação de perspectiva (na camada escolhida). */
  perspectiva: () => void;
  /** Filtro › Correção de lente e Grande-angular adaptável (na camada escolhida). */
  lente: (tipo: "lente" | "grandeAngular") => void;
  /** Editar › Escala sensível ao conteúdo (na camada escolhida). */
  escalaSensivel: () => void;
  /** Imagem › Tamanho da imagem, Tamanho da tela, Rotação da imagem e Revelar tudo. */
  tamanhoDaImagem: () => void;
  tamanhoDaTela: () => void;
  girarImagem: (giro: "180" | "90" | "-90" | "virarH" | "virarV" | "arbitraria") => void;
  revelarTudo: () => void;
  /** Editar › Transformação livre, a de uma cópia e o submenu Transformar (na camada escolhida). */
  transformarCamada: (como: "livre" | "copia" | "novamente" | "escala" | "girar" | "inclinar" | "distorcer" | "perspectiva" | "deformar" | "girar180" | "girar90" | "girarMenos90" | "virarH" | "virarV") => void;
  temUltimaTransformacao: boolean;
  /** Editar › Definir predefinição de pincel (a seleção vira a ponta). */
  definirPincel: () => void;
  /** Editar › Definir padrão (a seleção retangular, ou a imagem inteira, vira um padrão do espaço). */
  definirPadrao: () => void;
  /** Selecionar › Encontrar camadas e Isolar camadas. */
  camadasNoPainel: (como: "procurar" | "isolar") => void;
  /** O modo Máscara rápida (Q). */
  mascaraRapida: boolean;
  alternarMascaraRapida: () => void;
  podeDesfazer: string | null;
  podeRefazer: string | null;
  area: string;
  painelAberto: (painel: IdPainelDaImagem) => boolean;
  novo: () => void;
  abrir: () => void;
  /** As imagens mexidas há menos tempo (Arquivo › Abrir recentes). */
  recentes: { id: string; nome: string }[];
  abrirRecente: (id: string) => void;
  /** Arquivo › Colocar incorporado: uma imagem do computador como camada. */
  colocarIncorporado: () => void;
  /** Exibir › Configuração da prova, Cores de prova e Alerta de gama (só na tela). */
  prova: { tipo: TipoDaProva; ligada: boolean };
  mudarProva: (mudanca: Partial<{ tipo: TipoDaProva; ligada: boolean }>) => void;
  alertaDeGama: boolean;
  alternarAlertaDeGama: () => void;
  /** Os documentos abertos em abas: Arquivo › Fechar e Fechar tudo, Janela › Documentos abertos (Ctrl+F6). */
  documentosAbertos: DocumentoAberto[];
  documentoAtual: string;
  irParaDocumento: (id: string) => void;
  documentoVizinho: (sentido: 1 | -1) => void;
  fecharDocumento: (id?: string) => void;
  fecharTodos: () => void;
  /** Editar › Atalhos de teclado e menus e Barra de ferramentas: a janela da personalização, na aba pedida. */
  personalizar: (aba: "atalhos" | "menus" | "ferramentas") => void;
  /** Exibir › Grade de perspectiva: se ela está à vista, mostrar ou ocultar e começar uma de um, dois ou três pontos. */
  gradeDePerspectiva: "visivel" | "oculta" | "nenhuma";
  mudarGradeDePerspectiva: (como: "alternar" | 1 | 2 | 3) => void;
  /** Exibir › Interface mais escura e mais clara (os quatro temas, em ordem). */
  clarearInterface: (passo: -1 | 1) => void;
  /** Editar › Preferências (Ctrl+K). */
  preferencias: () => void;
  /** Editar › Pesquisar (Ctrl+F): a caixa que procura nos comandos e nas ferramentas. */
  pesquisar: () => void;
  /** Imagem › Análise: a escala de medida, o registro e o marcador de escala. */
  temEscalaDeMedida: boolean;
  escalaDeMedidaPadrao: () => void;
  janelaDaMedicao: (janela: "escala" | "marcador") => void;
  registrarMedicoes: () => void;
  /** Exibir › Modo de tela (F) e os painéis escondidos (Tab: todos; Shift+Tab: só os encaixados, que alternam). */
  modoDeTela: ModoDeTela;
  mudarModoDeTela: (modo: ModoDeTela) => void;
  ocultarPaineis: (quais: "todos" | "encaixados") => void;
  /** Exibir › 200%, Tamanho de impressão, Ajustar a camada à tela, Espelhar e Redefinir a vista. */
  zoomExato: (zoom: number) => void;
  tamanhoDeImpressao: () => void;
  ajustarCamadaATela: () => void;
  giroDaVista: { angulo: number; espelhada: boolean };
  girarVista: (giro: Partial<{ angulo: number; espelhada: boolean }>) => void;
  /** Exibir: as preferências da vista (réguas, guias, grade, extras, encaixe) e as guias do documento. */
  vista: PreferenciasDaVista;
  mudarVista: (mudanca: Partial<PreferenciasDaVista>) => void;
  janelaDaVista: (janela: "guia" | "layout" | "grade") => void;
  temGuias: boolean;
  limparGuias: () => void;
  guiasDaForma: () => void;
  /** Imagem › Variáveis e Aplicar conjunto de dados (os nomes dos conjuntos). */
  variaveis: (janela: "definir" | "conjuntos") => void;
  conjuntos: string[];
  aplicarConjunto: (indice: number) => void;
  /** Imagem › Modo: o modo de cor do documento e a tabela de cores (nas cores indexadas). */
  modoAtual: "rgb" | "cinza" | "bitmap" | "duotone" | "indexadas" | "cmyk" | "lab";
  modoDeCor: (tipo: "rgb" | "cinza" | "bitmap" | "duotone" | "indexadas" | "cmyk" | "lab") => void;
  tabelaDeCores: () => void;
  /** Arquivo › Automatizar e Arquivo › Scripts. */
  automatizar: (tipo: "lote" | "processador" | "pilha" | "fotomesclagem" | "hdr" | "folha") => void;
  cortarEEndireitar: () => void;
  ajustarImagem: () => void;
  script: (qual: "vazias" | "efeitos" | "mascaras") => void;
  /** Arquivo › Informações do arquivo, Arquivo › Imprimir e Imagem › Duplicar. */
  informacoesDoArquivo: () => void;
  imprimir: () => void;
  duplicarDocumento: () => void;
  exportar: () => void;
  /** Arquivo › Exportar: Salvar para web, Exportação rápida (no formato das preferências) e as preferências. */
  salvarParaWeb: () => void;
  exportacaoRapida: () => void;
  nomeDaExportacaoRapida: string;
  preferenciasDeExportacao: () => void;
  /** As pranchetas: Camada › Novo › Prancheta (nova, a partir do grupo escolhido ou das camadas escolhidas) e a exportação. */
  temPranchetas: boolean;
  grupoEscolhido: boolean;
  prancheta: (como: "nova" | "grupo" | "camadas") => void;
  exportarPranchetas: () => void;
  /** Arquivo › Exportar › Camadas em arquivos e Arquivo › Gerar › Ativos de imagem. */
  camadasEmArquivos: () => void;
  /** Arquivo › Exportar › Fatias em arquivos. */
  fatiasEmArquivos: () => void;
  /** Arquivo › Exportar › Comps de camada em arquivos. */
  temComps: boolean;
  compsEmArquivos: () => void;
  gerarAtivos: () => void;
  /** Arquivo › Exportar › PSD com as camadas. */
  exportarPsd: () => void;
  salvar: () => void;
  desfazer: () => void;
  refazer: () => void;
  /** Ctrl+Alt+Z: o último passo vai e volta. */
  alternarUltimoEstado: () => void;
  ferramenta: (id: IdFerramentaDaImagem) => void;
  ajuste: (ajuste: Ajuste) => void;
  /** Imagem › Ajustes: grava nos pixels da camada escolhida (noutras camadas, entra como ajuste preso a ela). */
  ajusteNosPixels: (tipo: TipoDoAjuste) => void;
  classico: (qual: "sombrasRealces" | "hdr" | "dessaturar" | "corresponder" | "substituir" | "equalizar") => void;
  automatico: (jeito: "tom" | "contraste" | "cor") => void;
  /** Um filtro do catálogo (lib/imagem/filtros), o último de novo (com as mesmas opções) e converter a camada. */
  filtroDoCatalogo: (tipo: string) => void;
  /** A galeria de desfoque, aberta numa ferramenta (campo, íris, inclinação, caminho ou giro). */
  galeriaDeDesfoque: (ferramenta: FerramentaDaGaleria) => void;
  /** Filtro › Filtros neurais: os de modelo (estilo, colorir, restaurar), o desfoque de profundidade e o super zoom. */
  filtroNeural: (qual: "estilo" | "colorir" | "restaurar" | "profundidade" | "superZoom") => void;
  /** Filtro › Galeria de filtros: os 47 efeitos numa pilha própria. */
  galeriaDeFiltros: () => void;
  ultimoFiltro: { nome: string | null; aplicar: () => void };
  converterParaFiltrosInteligentes: () => void;
  /** Camada › Nova camada de preenchimento, Opções do conteúdo e Alterar o conteúdo (da escolhida, se for uma). */
  preenchimento: { escolhido: boolean; nova: (tipo: "cor" | "degrade" | "padrao") => void; editar: (tipo?: "cor" | "degrade" | "padrao") => void };
  documento: () => void;
  painel: (painel: IdPainelDaImagem) => void;
  alternarPainel: (painel: IdPainelDaImagem) => void;
  duplicar: () => void;
  excluir: () => void;
  apagarOcultas: () => void;
  /** Camada › Novo › Camada (Ctrl+Shift+N): uma camada de pixels vazia. */
  novaCamada: () => void;
  /** Rasterizar a escolhida, o estilo dela ou todas. */
  rasterizar: (tipo: "rasterizar" | "rasterizarEstilo" | "todas") => void;
  /** Mesclar para baixo, as escolhidas, o grupo, as visíveis, achatar e carimbar. */
  mesclar: (tipo: Exclude<TipoDaMesclagem, "rasterizar" | "rasterizarEstilo">) => void;
  /** Camada a partir do fundo e Fundo a partir da camada. */
  camadaDoFundo: () => void;
  fundoDaCamada: () => void;
  temFundo: boolean;
  podeVirarFundo: boolean;
  /** Os pixels de um mesclar ou rasterizar estão sendo gerados (os itens esperam). */
  gerandoPixels: boolean;
  /** A máscara de camada pintável da escolhida. */
  temMascara: boolean;
  mascaraLigada: boolean;
  mascaraVinculada: boolean;
  /** O pincel pinta a máscara (Ctrl+\). */
  mascaraEmFoco: boolean;
  mascaraDePixels: (acao: "revelar" | "ocultar" | "revelarSelecao" | "ocultarSelecao" | "transparencia" | "excluir" | "aplicar" | "ligar" | "vincular" | "inverter" | "foco") => void;
  /** A máscara vetorial da camada escolhida (Camada › Máscara vetorial). */
  temMascaraVetorial: boolean;
  mascaraVetorialLigada: boolean;
  mascaraVetorialVinculada: boolean;
  mascaraVetorial: (acao: "revelar" | "ocultar" | "caminho" | "ligar" | "vincular" | "excluir") => void;
  /** Selecionar › Converter em forma (a seleção vira uma camada de forma). */
  converterSelecaoEmForma: () => void;
  apagarVazias: () => void;
  selecionarVinculadas: () => void;
  ordenar: (para: "topo" | "cima" | "baixo" | "fundo") => void;
  inverter: () => void;
  grupo: () => void;
  agrupar: () => void;
  /** Camada › Mesclar objetos: há duas formas escolhidas, e a janela dos passos. */
  duasFormas: boolean;
  mesclarObjetos: () => void;
  /** Camada › Objetos no caminho: a janela das cópias. */
  objetosNoCaminho: () => void;
  /** Camada › Dados do gráfico: há um gráfico escolhido, e a janela da tabela dele. */
  comGrafico: boolean;
  dadosDoGrafico: () => void;
  desagrupar: () => void;
  recortar: () => void;
  vincular: () => void;
  alinhar: (como: Alinhamento) => void;
  distribuir: (como: Distribuicao) => void;
  /** Alt+[ e Alt+]: escolhe a camada de baixo (1) ou de cima (-1). */
  camadaVizinha: (sentido: 1 | -1) => void;
  esconder: () => void;
  bloquear: () => void;
  /** Camada › Estilo de camada: a janela, aberta num efeito (ou nas opções de mesclagem). */
  estilo: (foco: TipoDoEfeito | "mesclagem") => void;
  /** As outras ações do estilo de camada. */
  estiloDeCamada: {
    temEstilo: boolean;
    temCopiado: boolean;
    efeitosVisiveis: boolean;
    copiar: () => void;
    colar: () => void;
    limpar: () => void;
    luzGlobal: () => void;
    criarCamadas: () => void;
    alternarVisiveis: () => void;
    dimensionar: () => void;
  };
  mascara: () => void;
  viaRecorte: () => void;
  /** Editar › Preencher (a janela) e os preenchimentos rápidos (Alt e Ctrl + Backspace). */
  preencher: () => void;
  /** Editar › Substituição do céu: o céu da foto escolhida trocado por um pronto ou uma imagem. */
  substituicaoDoCeu: () => void;
  /** Editar › Preenchimento generativo: a área marcada refeita pelo texto, no worker de GPU. */
  preenchimentoGenerativo: () => void;
  preencherRapido: (com: "primeiroPlano" | "fundo", preservar: boolean) => void;
  /** Editar › Recortar, Copiar, Copiar mesclado e Colar (normal, no local, dentro e fora da seleção). */
  copiar: (mesclado: boolean) => void;
  recortarPixels: () => void;
  colar: (como: "normal" | "noLocal" | "dentro" | "fora") => void;
  /** Arquivo › Novo a partir da área de transferência. */
  novoDaAreaDeTransferencia: () => void;
  /** Camada › Novo › Camada via cópia (Ctrl+J; sem seleção, duplica) e via recorte (Ctrl+Shift+J). */
  camadaVia: (recortar: boolean) => void;
  /** Editar › Atenuar (Ctrl+Shift+F) o último passo de pixels. */
  atenuar: () => void;
  /** Editar › Limpar (Delete com seleção) e Traçado. */
  limpar: () => void;
  tracado: () => void;
  /** Imagem › Cortar (pela seleção, quando há) e Aparar. */
  cortar: () => void;
  aparar: () => void;
  desmarcar: () => void;
  todasAsCamadas: () => void;
  desmarcarCamadas: () => void;
  texto: (texto?: Texto) => void;
  /** O texto do navegador escolhido (ou em edição): o modo, a orientação e a suavização, e o que muda neles. */
  textoRico: {
    modo: TextoRico["modo"] | null;
    orientacao: TextoRico["orientacao"];
    suavizacao: Suavizacao;
    aoConverter: () => void;
    aoOrientacao: (orientacao: TextoRico["orientacao"]) => void;
    aoSuavizacao: (suavizacao: Suavizacao) => void;
    aoConverterEmForma: () => void;
    aoCaminhoDeTrabalho: () => void;
    editando: boolean;
    aoLocalizar: () => void;
    aoLorem: () => void;
    aoAtualizarTodas: () => void;
    aoDeformar: () => void;
  };
  filtro: (efeito: TipoEfeito) => void;
  zoom: (para: "mais" | "menos" | "ajustar" | 1) => void;
  area_: (nome: string) => void;
  restaurarArea: () => void;
  atalhos: () => void;
};

export function menusDaImagem(a: AcoesDosMenus): Menu[] {
  const semCamada = !a.temCamada;
  const nomeDoFiltro = (efeito: TipoEfeito) => EFEITOS.find((item) => item.id === efeito)?.descricao;
  return [
    {
      nome: "Arquivo",
      itens: [
        { nome: "Novo…", aoEscolher: a.novo },
        { nome: "Novo a partir da área de transferência", aoEscolher: a.novoDaAreaDeTransferencia },
        { nome: "Abrir…", atalho: "Ctrl+O", aoEscolher: a.abrir, titulo: "Uma imagem do computador vira um documento do tamanho dela" },
        {
          nome: "Abrir recentes",
          desativado: !a.recentes.length,
          itens: a.recentes.map((recente) => ({ nome: recente.nome, aoEscolher: () => a.abrirRecente(recente.id) })),
        },
        "-",
        { nome: "Colocar incorporado…", aoEscolher: a.colocarIncorporado, titulo: "Uma imagem do computador entra como camada neste documento" },
        "-",
        { nome: "Informações do arquivo…", atalho: "Ctrl+Alt+Shift+I", aoEscolher: a.informacoesDoArquivo, titulo: "Título, autor, palavras-chave e direitos, que vão nos metadados dos arquivos exportados" },
        { nome: "Imprimir…", atalho: "Ctrl+P", aoEscolher: a.imprimir },
        "-",
        { nome: "Fechar", aoEscolher: () => a.fecharDocumento(), titulo: "Fecha a aba deste documento (ele continua salvo nas imagens); o Ctrl+W é do navegador" },
        { nome: "Fechar tudo", aoEscolher: a.fecharTodos },
        { nome: "Salvar", atalho: "Ctrl+S", aoEscolher: a.salvar, titulo: "O TakeOne salva sozinho a cada mudança" },
        "-",
        {
          nome: "Automatizar",
          itens: [
            { nome: "Lote…", aoEscolher: () => a.automatizar("lote") },
            "-",
            { nome: "Folha de contato…", aoEscolher: () => a.automatizar("folha") },
            { nome: "Cortar e endireitar fotos", aoEscolher: a.cortarEEndireitar, titulo: "As fotos escaneadas juntas viram documentos separados, endireitados" },
            "-",
            { nome: "Mesclar para HDR…", aoEscolher: () => a.automatizar("hdr") },
            { nome: "Fotomesclagem…", aoEscolher: () => a.automatizar("fotomesclagem") },
            "-",
            { nome: "Ajustar imagem…", aoEscolher: a.ajustarImagem },
          ],
        },
        {
          nome: "Scripts",
          itens: [
            { nome: "Processador de imagens…", aoEscolher: () => a.automatizar("processador") },
            { nome: "Carregar arquivos em pilha…", aoEscolher: () => a.automatizar("pilha") },
            "-",
            { nome: "Excluir todas as camadas vazias", aoEscolher: () => a.script("vazias"), titulo: "As camadas de pixels sem nada, os textos vazios e os grupos que ficam sem nada" },
            { nome: "Achatar todos os efeitos de camada", aoEscolher: () => a.script("efeitos"), titulo: "O estilo de cada camada vai para os pixels dela" },
            { nome: "Achatar todas as máscaras", aoEscolher: () => a.script("mascaras"), titulo: "As máscaras de pixels e vetoriais de cada camada vão para os pixels dela" },
          ],
        },
        {
          nome: "Gerar",
          itens: [{ nome: "Ativos de imagem", aoEscolher: a.gerarAtivos, titulo: 'As camadas com o nome terminado numa extensão ("logo.png", "200% logo@2x.png", "foto.jpg80") viram arquivos num ZIP' }],
        },
        "-",
        {
          nome: "Exportar",
          itens: [
            { nome: `Exportação rápida como ${a.nomeDaExportacaoRapida}`, atalho: "Ctrl+Alt+Shift+'", aoEscolher: a.exportacaoRapida },
            { nome: "Exportar como…", atalho: "Ctrl+Alt+Shift+W", aoEscolher: a.exportar },
            { nome: "Salvar para web…", atalho: "Ctrl+Alt+Shift+S", aoEscolher: a.salvarParaWeb, titulo: "GIF, PNG-8, JPG e WebP com a original e a otimizada lado a lado" },
            { nome: "Preferências de exportação…", aoEscolher: a.preferenciasDeExportacao },
            "-",
            { nome: "Camadas em arquivos…", aoEscolher: a.camadasEmArquivos, titulo: "Cada camada sozinha num arquivo (num ZIP)" },
            { nome: "Comps de camada em arquivos…", desativado: !a.temComps, aoEscolher: a.compsEmArquivos, titulo: "O documento com cada comp de camada, um arquivo por comp (num ZIP)" },
            { nome: "Fatias em arquivos…", aoEscolher: a.fatiasEmArquivos, titulo: "Cada fatia num arquivo (num ZIP)" },
            { nome: "Pranchetas em arquivos…", desativado: !a.temPranchetas, aoEscolher: a.exportarPranchetas, titulo: "Cada prancheta num arquivo, ou todas num PDF" },
            { nome: "PSD com as camadas", aoEscolher: a.exportarPsd, titulo: "As camadas, as pastas, as máscaras, os modos e os ajustes, para abrir em outro editor" },
          ],
        },
      ],
    },
    {
      nome: "Editar",
      itens: [
        { nome: a.podeDesfazer ? `Desfazer ${a.podeDesfazer}` : "Desfazer", chave: "Editar › Desfazer", atalho: "Ctrl+Z", desativado: !a.podeDesfazer, aoEscolher: a.desfazer },
        { nome: a.podeRefazer ? `Refazer ${a.podeRefazer}` : "Refazer", chave: "Editar › Refazer", atalho: "Ctrl+Shift+Z", desativado: !a.podeRefazer, aoEscolher: a.refazer },
        { nome: "Alternar o último estado", atalho: "Ctrl+Alt+Z", desativado: !a.podeDesfazer && !a.podeRefazer, aoEscolher: a.alternarUltimoEstado },
        { nome: "Avançar um passo", desativado: !a.podeRefazer, aoEscolher: a.refazer, titulo: "O mesmo que refazer (Ctrl+Shift+Z)" },
        { nome: "Voltar um passo", desativado: !a.podeDesfazer, aoEscolher: a.desfazer, titulo: "O mesmo que desfazer (Ctrl+Z)" },
        { nome: "Pesquisar…", atalho: "Ctrl+F", aoEscolher: a.pesquisar, titulo: "Procurar um comando ou uma ferramenta" },
        { nome: "Atalhos de teclado e menus…", atalho: "Ctrl+Alt+Shift+K", aoEscolher: () => a.personalizar("atalhos") },
        { nome: "Barra de ferramentas…", aoEscolher: () => a.personalizar("ferramentas") },
        { nome: "Preferências…", atalho: "Ctrl+K", aoEscolher: a.preferencias },
        "-",
        { nome: "Recortar", atalho: "Ctrl+X", desativado: !a.temCamada, aoEscolher: a.recortarPixels },
        { nome: "Copiar", atalho: "Ctrl+C", desativado: !a.temCamada, aoEscolher: () => a.copiar(false) },
        { nome: "Copiar mesclado", atalho: "Ctrl+Shift+C", aoEscolher: () => a.copiar(true) },
        { nome: "Colar", atalho: "Ctrl+V", aoEscolher: () => a.colar("normal") },
        {
          nome: "Colar especial",
          itens: [
            { nome: "Colar no local", atalho: "Ctrl+Shift+V", aoEscolher: () => a.colar("noLocal") },
            { nome: "Colar dentro", atalho: "Ctrl+Alt+Shift+V", desativado: !a.temSelecaoDoDocumento, aoEscolher: () => a.colar("dentro") },
            { nome: "Colar fora", desativado: !a.temSelecaoDoDocumento, aoEscolher: () => a.colar("fora") },
          ],
        },
        "-",
        { nome: a.podeDesfazer ? `Atenuar ${a.podeDesfazer}…` : "Atenuar…", atalho: "Ctrl+Shift+F", desativado: !a.podeDesfazer, aoEscolher: a.atenuar },
        "-",
        { nome: "Preencher…", atalho: "Shift+F5", aoEscolher: a.preencher },
        { nome: "Preenchimento generativo…", desativado: !a.temSelecaoDoDocumento, aoEscolher: a.preenchimentoGenerativo, titulo: "Marque a área com uma ferramenta de seleção" },
        { nome: "Substituição do céu…", aoEscolher: a.substituicaoDoCeu, titulo: "Escolha uma foto: o céu dela é achado pela profundidade" },
        { nome: "Traçado…", desativado: !a.temSelecaoDoDocumento, aoEscolher: a.tracado },
        { nome: "Limpar", desativado: !a.temSelecaoDoDocumento, aoEscolher: a.limpar },
        {
          nome: "Preencher rápido",
          itens: [
            { nome: "Com a cor do primeiro plano", atalho: "Alt+Backspace", aoEscolher: () => a.preencherRapido("primeiroPlano", false) },
            { nome: "Com a cor do fundo", atalho: "Ctrl+Backspace", aoEscolher: () => a.preencherRapido("fundo", false) },
            { nome: "Com o primeiro plano, preservando a transparência", atalho: "Shift+Alt+Backspace", aoEscolher: () => a.preencherRapido("primeiroPlano", true) },
            { nome: "Com o fundo, preservando a transparência", atalho: "Shift+Ctrl+Backspace", aoEscolher: () => a.preencherRapido("fundo", true) },
          ],
        },
        { nome: "Transformação livre", desativado: semCamada, aoEscolher: () => a.transformarCamada("livre"), titulo: "Ctrl+T é do navegador: use o menu" },
        { nome: "Transformação livre de uma cópia", atalho: "Ctrl+Alt+T", desativado: semCamada, aoEscolher: () => a.transformarCamada("copia") },
        { nome: "Escala sensível ao conteúdo…", atalho: "Ctrl+Alt+Shift+C", desativado: semCamada, aoEscolher: a.escalaSensivel },
        { nome: "Distorção de marionete", desativado: semCamada, aoEscolher: a.marionete },
        { nome: "Deformação de perspectiva", desativado: semCamada, aoEscolher: a.perspectiva },
        "-",
        { nome: "Alinhar camadas automaticamente…", desativado: a.quantas < 2, aoEscolher: a.alinharCamadas, titulo: "Escolha duas ou mais camadas" },
        { nome: "Mesclar camadas automaticamente…", desativado: a.quantas < 2, aoEscolher: a.mesclarCamadas, titulo: "Escolha duas ou mais camadas" },
        {
          nome: "Transformar",
          desativado: semCamada,
          itens: [
            { nome: "Transformar novamente", desativado: !a.temUltimaTransformacao, aoEscolher: () => a.transformarCamada("novamente") },
            "-",
            { nome: "Escala", aoEscolher: () => a.transformarCamada("escala") },
            { nome: "Girar", aoEscolher: () => a.transformarCamada("girar") },
            { nome: "Inclinar", aoEscolher: () => a.transformarCamada("inclinar") },
            { nome: "Distorcer", aoEscolher: () => a.transformarCamada("distorcer") },
            { nome: "Perspectiva", aoEscolher: () => a.transformarCamada("perspectiva") },
            { nome: "Deformar", aoEscolher: () => a.transformarCamada("deformar") },
            "-",
            { nome: "Girar 180°", aoEscolher: () => a.transformarCamada("girar180") },
            { nome: "Girar 90° no sentido horário", aoEscolher: () => a.transformarCamada("girar90") },
            { nome: "Girar 90° no sentido anti-horário", aoEscolher: () => a.transformarCamada("girarMenos90") },
            "-",
            { nome: "Virar horizontalmente", aoEscolher: () => a.transformarCamada("virarH") },
            { nome: "Virar verticalmente", aoEscolher: () => a.transformarCamada("virarV") },
          ],
        },
        { nome: "Definir predefinição de pincel…", desativado: !a.temSelecaoDoDocumento, aoEscolher: a.definirPincel },
        { nome: "Definir padrão…", aoEscolher: a.definirPadrao },
        { nome: "Definir forma personalizada…", desativado: !a.temCaminho, aoEscolher: a.definirFormaPersonalizada, titulo: "Escolha uma camada de forma ou um caminho" },
        "-",
        { nome: "Atalhos do teclado…", aoEscolher: a.atalhos },
      ],
    },
    {
      nome: "Imagem",
      itens: [
        {
          nome: "Variáveis",
          itens: [
            { nome: "Definir…", aoEscolher: () => a.variaveis("definir") },
            { nome: "Conjuntos de dados…", aoEscolher: () => a.variaveis("conjuntos") },
          ],
        },
        {
          nome: "Aplicar conjunto de dados",
          desativado: !a.conjuntos.length,
          itens: a.conjuntos.map((nome, indice) => ({ nome, aoEscolher: () => a.aplicarConjunto(indice) })),
        },
        "-",
        {
          nome: "Modo",
          itens: [
            { nome: "Bitmap…", marcado: a.modoAtual === "bitmap", aoEscolher: () => a.modoDeCor("bitmap") },
            { nome: "Escala de cinza", marcado: a.modoAtual === "cinza", aoEscolher: () => a.modoDeCor("cinza") },
            { nome: "Duotone…", marcado: a.modoAtual === "duotone", aoEscolher: () => a.modoDeCor("duotone") },
            { nome: "Cores indexadas…", marcado: a.modoAtual === "indexadas", aoEscolher: () => a.modoDeCor("indexadas") },
            { nome: "Cor RGB", marcado: a.modoAtual === "rgb", aoEscolher: () => a.modoDeCor("rgb") },
            { nome: "Cor CMYK…", marcado: a.modoAtual === "cmyk", aoEscolher: () => a.modoDeCor("cmyk"), titulo: "A prova da impressão na tela; o TIFF e o PDF saem em CMYK" },
            { nome: "Cor Lab", marcado: a.modoAtual === "lab", aoEscolher: () => a.modoDeCor("lab"), titulo: "A tela não muda; o TIFF e o PDF saem em L*a*b*" },
            "-",
            { nome: "8 bits/canal", marcado: true, aoEscolher: () => undefined },
            { nome: "16 bits/canal", desativado: true, aoEscolher: () => undefined, titulo: "O TakeOne desenha e guarda as camadas em 8 bits por canal (o que o navegador desenha e grava)." },
            { nome: "32 bits/canal", desativado: true, aoEscolher: () => undefined, titulo: "O TakeOne desenha e guarda as camadas em 8 bits por canal (o que o navegador desenha e grava)." },
            "-",
            { nome: "Tabela de cores…", desativado: a.modoAtual !== "indexadas", aoEscolher: a.tabelaDeCores },
          ],
        },
        "-",
        {
          nome: "Ajustes",
          itens: [
            ...AJUSTES.map((ajuste) => ({ nome: ajuste.id === "inverter" ? ajuste.nome : `${ajuste.nome}…`, atalho: ajuste.atalho, aoEscolher: () => a.ajusteNosPixels(ajuste.id) })),
            "-",
            { nome: "Sombras/Realces…", aoEscolher: () => a.classico("sombrasRealces") },
            { nome: "Tonalização HDR…", aoEscolher: () => a.classico("hdr") },
            "-",
            { nome: "Dessaturar", atalho: "Ctrl+Shift+U", aoEscolher: () => a.classico("dessaturar") },
            { nome: "Corresponder cor…", aoEscolher: () => a.classico("corresponder") },
            { nome: "Substituir cor…", aoEscolher: () => a.classico("substituir") },
            { nome: "Equalizar", aoEscolher: () => a.classico("equalizar") },
          ],
        },
        "-",
        { nome: "Tom automático", atalho: "Ctrl+Shift+L", aoEscolher: () => a.automatico("tom") },
        { nome: "Contraste automático", atalho: "Ctrl+Alt+Shift+L", aoEscolher: () => a.automatico("contraste") },
        { nome: "Cor automática", atalho: "Ctrl+Shift+B", aoEscolher: () => a.automatico("cor") },
        "-",
        { nome: "Duplicar…", aoEscolher: a.duplicarDocumento, titulo: "Uma cópia deste documento, com as camadas ou achatada" },
        "-",
        { nome: "Tamanho da imagem…", atalho: "Ctrl+Alt+I", aoEscolher: a.tamanhoDaImagem },
        { nome: "Tamanho da tela…", atalho: "Ctrl+Alt+C", aoEscolher: a.tamanhoDaTela },
        {
          nome: "Rotação da imagem",
          itens: [
            { nome: "180°", aoEscolher: () => a.girarImagem("180") },
            { nome: "90° no sentido horário", aoEscolher: () => a.girarImagem("90") },
            { nome: "90° no sentido anti-horário", aoEscolher: () => a.girarImagem("-90") },
            { nome: "Arbitrária…", aoEscolher: () => a.girarImagem("arbitraria") },
            "-",
            { nome: "Virar a tela na horizontal", aoEscolher: () => a.girarImagem("virarH") },
            { nome: "Virar a tela na vertical", aoEscolher: () => a.girarImagem("virarV") },
          ],
        },
        { nome: "Cortar", aoEscolher: a.cortar },
        { nome: "Aparar…", aoEscolher: a.aparar },
        { nome: "Revelar tudo", aoEscolher: a.revelarTudo },
        "-",
        {
          nome: "Análise",
          itens: [
            {
              nome: "Definir escala de medida",
              itens: [
                { nome: "Padrão", marcado: !a.temEscalaDeMedida, aoEscolher: a.escalaDeMedidaPadrao, titulo: "1 pixel = 1 pixel" },
                { nome: "Personalizar…", marcado: a.temEscalaDeMedida, aoEscolher: () => a.janelaDaMedicao("escala") },
              ],
            },
            { nome: "Registrar medições", aoEscolher: a.registrarMedicoes, titulo: "Da seleção, da medida da Régua (com ela escolhida) ou da Contagem (com ela escolhida)" },
            "-",
            { nome: "Ferramenta Régua", aoEscolher: () => a.ferramenta("regua") },
            { nome: "Ferramenta Contagem", aoEscolher: () => a.ferramenta("contagem") },
            "-",
            { nome: "Inserir marcador de escala…", aoEscolher: () => a.janelaDaMedicao("marcador") },
          ],
        },
        "-",
        { nome: "Ampliar ou expandir com IA…", desativado: !a.temFoto, aoEscolher: () => a.painel("fotoIA") },
      ],
    },
    {
      nome: "Camada",
      itens: [
        {
          nome: "Novo",
          itens: [
            { nome: "Camada…", atalho: "Ctrl+Shift+N", aoEscolher: a.novaCamada },
            { nome: "Camada a partir do fundo", desativado: !a.temFundo, aoEscolher: a.camadaDoFundo },
            { nome: "Fundo a partir da camada", desativado: !a.podeVirarFundo, aoEscolher: a.fundoDaCamada },
            "-",
            { nome: "Grupo", aoEscolher: a.grupo },
            { nome: "Grupo a partir das camadas…", desativado: semCamada, aoEscolher: a.agrupar },
            "-",
            { nome: "Prancheta", aoEscolher: () => a.prancheta("nova") },
            { nome: "Prancheta a partir de grupo", desativado: !a.grupoEscolhido, aoEscolher: () => a.prancheta("grupo") },
            { nome: "Prancheta a partir de camadas", desativado: semCamada, aoEscolher: () => a.prancheta("camadas") },
            "-",
            { nome: "Camada via cópia", atalho: "Ctrl+J", desativado: semCamada, aoEscolher: () => a.camadaVia(false) },
            { nome: "Camada via recorte", atalho: "Ctrl+Shift+J", desativado: semCamada || !a.temSelecaoDoDocumento, aoEscolher: () => a.camadaVia(true) },
          ],
        },
        {
          nome: "Nova camada de preenchimento",
          itens: [
            { nome: "Cor sólida…", aoEscolher: () => a.preenchimento.nova("cor") },
            { nome: "Degradê…", aoEscolher: () => a.preenchimento.nova("degrade") },
            { nome: "Padrão…", aoEscolher: () => a.preenchimento.nova("padrao") },
          ],
        },
        { nome: "Nova camada de ajuste", itens: AJUSTES.map((ajuste) => ({ nome: `${ajuste.nome}…`, aoEscolher: () => a.ajuste(ajuste) })) },
        { nome: "Opções do conteúdo da camada…", desativado: !a.preenchimento.escolhido, aoEscolher: () => a.preenchimento.editar() },
        {
          nome: "Alterar o conteúdo da camada",
          desativado: !a.preenchimento.escolhido,
          itens: [
            { nome: "Cor sólida…", aoEscolher: () => a.preenchimento.editar("cor") },
            { nome: "Degradê…", aoEscolher: () => a.preenchimento.editar("degrade") },
            { nome: "Padrão…", aoEscolher: () => a.preenchimento.editar("padrao") },
          ],
        },
        { nome: a.quantas > 1 ? "Duplicar camadas" : "Duplicar camada", desativado: semCamada, aoEscolher: a.duplicar },
        {
          nome: "Excluir",
          itens: [
            { nome: a.quantas > 1 ? "Camadas" : "Camada", desativado: semCamada, aoEscolher: a.excluir },
            { nome: "Camadas ocultas", aoEscolher: a.apagarOcultas },
            { nome: "Grupos vazios", aoEscolher: a.apagarVazias },
          ],
        },
        "-",
        {
          nome: "Estilo de camada",
          desativado: semCamada,
          itens: [
            { nome: "Opções de mesclagem…", aoEscolher: () => a.estilo("mesclagem") },
            "-",
            ...NOMES_DOS_EFEITOS.map(({ tipo, nome }) => ({ nome: `${nome}…`, aoEscolher: () => a.estilo(tipo) })),
            "-",
            { nome: "Copiar estilo de camada", desativado: !a.estiloDeCamada.temEstilo, aoEscolher: a.estiloDeCamada.copiar },
            { nome: "Colar estilo de camada", desativado: !a.estiloDeCamada.temCopiado, aoEscolher: a.estiloDeCamada.colar },
            { nome: "Limpar estilo de camada", desativado: !a.estiloDeCamada.temEstilo, aoEscolher: a.estiloDeCamada.limpar },
            "-",
            { nome: "Luz global…", aoEscolher: a.estiloDeCamada.luzGlobal },
            { nome: "Criar camadas", desativado: !a.estiloDeCamada.temEstilo, aoEscolher: a.estiloDeCamada.criarCamadas },
            { nome: a.estiloDeCamada.efeitosVisiveis ? "Ocultar todos os efeitos" : "Mostrar todos os efeitos", aoEscolher: a.estiloDeCamada.alternarVisiveis },
            { nome: "Dimensionar efeitos…", desativado: !a.estiloDeCamada.temEstilo, aoEscolher: a.estiloDeCamada.dimensionar },
          ],
        },
        {
          nome: "Máscara de camada",
          desativado: semCamada || a.gerandoPixels,
          itens: [
            { nome: "Revelar tudo", desativado: a.temMascara, aoEscolher: () => a.mascaraDePixels("revelar") },
            { nome: "Ocultar tudo", desativado: a.temMascara, aoEscolher: () => a.mascaraDePixels("ocultar") },
            { nome: "Revelar seleção", desativado: a.temMascara || !a.temSelecaoDoDocumento, aoEscolher: () => a.mascaraDePixels("revelarSelecao") },
            { nome: "Ocultar seleção", desativado: a.temMascara || !a.temSelecaoDoDocumento, aoEscolher: () => a.mascaraDePixels("ocultarSelecao") },
            { nome: "A partir da transparência", desativado: a.temMascara, aoEscolher: () => a.mascaraDePixels("transparencia") },
            "-",
            { nome: "Pintar na máscara", atalho: "Ctrl+\\", marcado: a.mascaraEmFoco, desativado: !a.temMascara, aoEscolher: () => a.mascaraDePixels("foco") },
            { nome: "Inverter", desativado: !a.temMascara, aoEscolher: () => a.mascaraDePixels("inverter") },
            { nome: a.mascaraLigada || !a.temMascara ? "Desativar" : "Ativar", desativado: !a.temMascara, aoEscolher: () => a.mascaraDePixels("ligar") },
            { nome: a.mascaraVinculada || !a.temMascara ? "Desvincular" : "Vincular", desativado: !a.temMascara, aoEscolher: () => a.mascaraDePixels("vincular") },
            { nome: "Aplicar", desativado: !a.temMascara, aoEscolher: () => a.mascaraDePixels("aplicar") },
            { nome: "Excluir", desativado: !a.temMascara, aoEscolher: () => a.mascaraDePixels("excluir") },
          ],
        },
        {
          nome: "Máscara vetorial",
          desativado: semCamada,
          itens: [
            { nome: "Revelar tudo", desativado: a.temMascaraVetorial, aoEscolher: () => a.mascaraVetorial("revelar") },
            { nome: "Ocultar tudo", desativado: a.temMascaraVetorial, aoEscolher: () => a.mascaraVetorial("ocultar") },
            { nome: "Caminho atual", desativado: a.temMascaraVetorial || !a.temCaminho, aoEscolher: () => a.mascaraVetorial("caminho"), titulo: "Escolha um caminho no painel Caminhos" },
            "-",
            { nome: a.mascaraVetorialLigada || !a.temMascaraVetorial ? "Desativar" : "Ativar", desativado: !a.temMascaraVetorial, aoEscolher: () => a.mascaraVetorial("ligar") },
            { nome: a.mascaraVetorialVinculada || !a.temMascaraVetorial ? "Desvincular" : "Vincular", desativado: !a.temMascaraVetorial, aoEscolher: () => a.mascaraVetorial("vincular") },
            { nome: "Excluir", desativado: !a.temMascaraVetorial, aoEscolher: () => a.mascaraVetorial("excluir") },
            "-",
            { nome: "Máscara de forma (elipse ou retângulo)…", aoEscolher: a.mascara },
          ],
        },
        { nome: a.recortadas ? "Liberar máscara de corte" : "Criar máscara de corte", atalho: "Ctrl+Alt+G", desativado: semCamada, aoEscolher: a.recortar },
        "-",
        { nome: "Agrupar camadas", atalho: "Ctrl+G", desativado: semCamada, aoEscolher: a.agrupar },
        { nome: "Desagrupar camadas", atalho: "Ctrl+Shift+G", desativado: !a.temPasta, aoEscolher: a.desagrupar },
        { nome: "Dados do gráfico…", desativado: !a.comGrafico, aoEscolher: a.dadosDoGrafico, titulo: "A tabela e o tipo do gráfico escolhido" },
        { nome: "Objetos no caminho…", desativado: semCamada, aoEscolher: a.objetosNoCaminho, titulo: "Cópias da camada escolhida ao longo do caminho escolhido no painel Caminhos (ou de outra forma escolhida)" },
        { nome: "Mesclar objetos…", atalho: "Ctrl+Alt+B", desativado: !a.duasFormas, aoEscolher: a.mesclarObjetos, titulo: "Os passos entre as duas formas escolhidas" },
        { nome: "Ocultar camadas", atalho: "Ctrl+,", desativado: semCamada, aoEscolher: a.esconder },
        "-",
        {
          nome: "Organizar",
          desativado: semCamada,
          itens: [
            { nome: "Trazer para a frente", atalho: "Ctrl+Shift+]", aoEscolher: () => a.ordenar("topo") },
            { nome: "Avançar", atalho: "Ctrl+]", aoEscolher: () => a.ordenar("cima") },
            { nome: "Recuar", atalho: "Ctrl+[", aoEscolher: () => a.ordenar("baixo") },
            { nome: "Enviar para trás", atalho: "Ctrl+Shift+[", aoEscolher: () => a.ordenar("fundo") },
            "-",
            { nome: "Inverter", desativado: a.quantas < 2, aoEscolher: a.inverter },
          ],
        },
        { nome: "Alinhar", desativado: semCamada, itens: ALINHAMENTOS.map((item) => ({ nome: item.nome, aoEscolher: () => a.alinhar(item.id) })) },
        { nome: "Distribuir", desativado: a.quantas < 3, itens: DISTRIBUICOES.map((item) => ({ nome: item.nome, aoEscolher: () => a.distribuir(item.id) })) },
        "-",
        {
          nome: "Rasterizar",
          desativado: a.gerandoPixels,
          itens: [
            { nome: "Camada", desativado: semCamada, aoEscolher: () => a.rasterizar("rasterizar") },
            { nome: "Estilo de camada", desativado: semCamada, aoEscolher: () => a.rasterizar("rasterizarEstilo") },
            { nome: "Todas as camadas", aoEscolher: () => a.rasterizar("todas") },
          ],
        },
        "-",
        {
          nome: a.temPasta && a.quantas === 1 ? "Mesclar grupo" : a.quantas > 1 ? "Mesclar camadas" : "Mesclar para baixo",
          atalho: "Ctrl+E",
          desativado: semCamada || a.gerandoPixels,
          aoEscolher: () => a.mesclar(a.temPasta && a.quantas === 1 ? "grupo" : a.quantas > 1 ? "selecionadas" : "baixo"),
        },
        { nome: "Mesclar visíveis", atalho: "Ctrl+Shift+E", desativado: a.gerandoPixels, aoEscolher: () => a.mesclar("visiveis") },
        { nome: "Achatar imagem", desativado: a.gerandoPixels, aoEscolher: () => a.mesclar("achatar") },
        { nome: "Carimbar para baixo", atalho: "Ctrl+Alt+E", desativado: semCamada || a.gerandoPixels, aoEscolher: () => a.mesclar("carimbarBaixo") },
        { nome: "Carimbar visíveis", atalho: "Ctrl+Alt+Shift+E", desativado: a.gerandoPixels, aoEscolher: () => a.mesclar("carimbarVisiveis") },
        "-",
        { nome: "Bloquear camadas", atalho: "Ctrl+/", desativado: semCamada, aoEscolher: a.bloquear },
        { nome: a.vinculadas ? "Desvincular camadas" : "Vincular camadas", desativado: !a.vinculadas && a.quantas < 2, aoEscolher: a.vincular },
      ],
    },
    {
      nome: "Texto",
      itens: [
        { nome: "Nova camada de texto", aoEscolher: () => a.texto() },
        { nome: "Estilos prontos", itens: ESTILOS_DE_TEXTO.map((estilo) => ({ nome: estilo.nome, aoEscolher: () => a.texto(estilo.texto) })) },
        "-",
        {
          nome: "Painéis",
          itens: [
            { nome: "Caractere", aoEscolher: () => a.painel("caractere") },
            { nome: "Parágrafo", aoEscolher: () => a.painel("paragrafo") },
            { nome: "Glifos", aoEscolher: () => a.painel("glifos") },
            { nome: "Estilos de texto", aoEscolher: () => a.painel("estilos") },
          ],
        },
        "-",
        {
          nome: "Orientação",
          itens: [
            { nome: "Horizontal", marcado: a.textoRico.orientacao === "horizontal", aoEscolher: () => a.textoRico.aoOrientacao("horizontal") },
            { nome: "Vertical", marcado: a.textoRico.orientacao === "vertical", aoEscolher: () => a.textoRico.aoOrientacao("vertical") },
          ],
        },
        {
          nome: "Suavização",
          itens: (
            [
              ["nenhuma", "Nenhum"],
              ["nitida", "Nítido"],
              ["forte", "Forte"],
              ["suave", "Suave"],
            ] as const
          ).map(([id, nome]) => ({ nome, marcado: a.textoRico.suavizacao === id, aoEscolher: () => a.textoRico.aoSuavizacao(id) })),
        },
        {
          nome: a.textoRico.modo === "paragrafo" ? "Converter em texto de ponto" : "Converter em texto de parágrafo",
          desativado: !a.textoRico.modo,
          aoEscolher: a.textoRico.aoConverter,
        },
        { nome: "Deformar texto…", desativado: !a.textoRico.modo, aoEscolher: a.textoRico.aoDeformar },
        "-",
        { nome: "Criar caminho de trabalho", desativado: !a.textoRico.modo, aoEscolher: a.textoRico.aoCaminhoDeTrabalho },
        { nome: "Converter em forma", desativado: !a.textoRico.modo, aoEscolher: a.textoRico.aoConverterEmForma },
        { nome: "Rasterizar camada de texto", desativado: !a.textoRico.modo, aoEscolher: () => a.rasterizar("rasterizar") },
        "-",
        { nome: "Localizar e substituir texto…", aoEscolher: a.textoRico.aoLocalizar },
        { nome: "Colar Lorem Ipsum", desativado: !a.textoRico.editando, aoEscolher: a.textoRico.aoLorem },
        { nome: "Atualizar todas as camadas de texto", aoEscolher: a.textoRico.aoAtualizarTodas },
      ],
    },
    {
      nome: "Selecionar",
      itens: [
        { nome: "Tudo", atalho: "Ctrl+A", aoEscolher: () => a.selecaoDoDocumento("tudo") },
        { nome: "Desmarcar", atalho: "Ctrl+D", desativado: !a.temSelecao && !a.temSelecaoDoDocumento, aoEscolher: a.desmarcar },
        { nome: "Selecionar novamente", atalho: "Ctrl+Shift+D", desativado: !a.podeSelecionarNovamente, aoEscolher: () => a.selecaoDoDocumento("novamente") },
        { nome: "Inverter", atalho: "Ctrl+Shift+I", desativado: !a.temSelecaoDoDocumento, aoEscolher: () => a.selecaoDoDocumento("inverter") },
        "-",
        { nome: "Todas as camadas", atalho: "Ctrl+Alt+A", aoEscolher: a.todasAsCamadas },
        { nome: "Desmarcar camadas", aoEscolher: a.desmarcarCamadas },
        { nome: "Camadas vinculadas", desativado: !a.temCamada, aoEscolher: a.selecionarVinculadas },
        { nome: "Camada de cima", atalho: "Alt+]", aoEscolher: () => a.camadaVizinha(-1) },
        { nome: "Camada de baixo", atalho: "Alt+[", aoEscolher: () => a.camadaVizinha(1) },
        { nome: "Encontrar camadas", atalho: "Ctrl+Alt+Shift+F", aoEscolher: () => a.camadasNoPainel("procurar") },
        { nome: "Isolar camadas", desativado: !a.temCamada, aoEscolher: () => a.camadasNoPainel("isolar") },
        "-",
        {
          nome: "Modificar",
          desativado: !a.temSelecaoDoDocumento,
          itens: [
            { nome: "Borda…", aoEscolher: () => a.modificarSelecao("borda") },
            { nome: "Suavizar…", aoEscolher: () => a.modificarSelecao("suavizar") },
            { nome: "Expandir…", aoEscolher: () => a.modificarSelecao("expandir") },
            { nome: "Contrair…", aoEscolher: () => a.modificarSelecao("contrair") },
            { nome: "Difusão…", atalho: "Shift+F6", aoEscolher: () => a.modificarSelecao("difusao") },
          ],
        },
        { nome: "Transformar seleção", desativado: !a.temSelecaoDoDocumento, aoEscolher: a.transformarSelecao },
        { nome: "Aumentar", desativado: !a.temSelecaoDoDocumento, aoEscolher: () => a.aumentarSelecao(true) },
        { nome: "Semelhante", desativado: !a.temSelecaoDoDocumento, aoEscolher: () => a.aumentarSelecao(false) },
        "-",
        { nome: "Selecionar e mascarar…", atalho: "Ctrl+Alt+R", aoEscolher: a.selecionarEMascarar },
        { nome: "Assunto", aoEscolher: () => a.selecionarPor("assunto") },
        { nome: "Céu", aoEscolher: () => a.selecionarPor("ceu") },
        { nome: "Intervalo de cores…", aoEscolher: () => a.selecionarPor("cores") },
        { nome: "Área de foco…", aoEscolher: () => a.selecionarPor("foco") },
        { nome: "Objeto", aoEscolher: () => a.ferramenta("objeto") },
        "-",
        { nome: "Editar no modo Máscara rápida", atalho: "Q", marcado: a.mascaraRapida, aoEscolher: a.alternarMascaraRapida },
        "-",
        { nome: "Carregar seleção…", aoEscolher: () => a.canalDaSelecao("carregar") },
        { nome: "Salvar seleção…", desativado: !a.temSelecaoDoDocumento, aoEscolher: () => a.canalDaSelecao("salvar") },
        "-",
        { nome: "Carregar o caminho como seleção", atalho: "Ctrl+Enter", desativado: !a.temCaminho, aoEscolher: a.caminhoComoSelecao },
        { nome: "Criar caminho de trabalho…", desativado: !a.temSelecaoDoDocumento, aoEscolher: a.caminhoDaSelecao },
        { nome: "Converter em forma", desativado: !a.temSelecaoDoDocumento, aoEscolher: a.converterSelecaoEmForma },
        { nome: "Luminosidade", atalho: "Ctrl+Alt+2", aoEscolher: () => a.canalDaSelecao("luminosidade") },
      ],
    },
    {
      nome: "Filtro",
      itens: [
        { nome: a.ultimoFiltro.nome ? `Último filtro: ${a.ultimoFiltro.nome}` : "Último filtro", atalho: "Ctrl+Alt+F", desativado: semCamada || !a.ultimoFiltro.nome, aoEscolher: a.ultimoFiltro.aplicar },
        "-",
        { nome: "Converter para filtros inteligentes", desativado: semCamada, aoEscolher: a.converterParaFiltrosInteligentes },
        "-",
        ...GRUPOS_DE_FILTROS.filter((grupo) => CATALOGO_DE_FILTROS.some((filtro) => filtro.grupo === grupo.id)).map(
          (grupo): ItemDeMenu => ({
            nome: grupo.nome,
            desativado: semCamada,
            itens:
              grupo.id === "galeria"
                ? FERRAMENTAS_DA_GALERIA.map((ferramenta) => ({ nome: `${NOMES_DA_GALERIA[ferramenta]}…`, aoEscolher: () => a.galeriaDeDesfoque(ferramenta) }))
                : CATALOGO_DE_FILTROS.filter((filtro) => filtro.grupo === grupo.id).map((filtro) => ({ nome: filtro.semJanela ? filtro.nome : `${filtro.nome}…`, aoEscolher: () => a.filtroDoCatalogo(filtro.id) })),
          }),
        ),
        {
          nome: "Efeitos do vídeo",
          desativado: semCamada,
          itens: FILTROS.flatMap((grupo) => grupo.itens).map((item) => ({ nome: item.nome, titulo: nomeDoFiltro(item.efeito), aoEscolher: () => a.filtro(item.efeito) })),
        },
        "-",
        { nome: "Grande-angular adaptável…", atalho: "Ctrl+Alt+Shift+A", desativado: semCamada, aoEscolher: () => a.lente("grandeAngular") },
        { nome: "Correção de lente…", desativado: semCamada, aoEscolher: () => a.lente("lente"), titulo: "Ctrl+Shift+R é do navegador: use o menu" },
        { nome: "Dissolver…", atalho: "Ctrl+Shift+X", desativado: semCamada, aoEscolher: a.dissolver },
        { nome: "Ponto de fuga…", atalho: "Ctrl+Alt+V", aoEscolher: a.pontoDeFuga },
        { nome: "Galeria de filtros…", desativado: semCamada, aoEscolher: a.galeriaDeFiltros },
        {
          nome: "Filtros neurais",
          desativado: semCamada,
          itens: [
            { nome: "Transferência de estilo…", aoEscolher: () => a.filtroNeural("estilo") },
            { nome: "Colorir…", aoEscolher: () => a.filtroNeural("colorir") },
            { nome: "Restaurar foto…", aoEscolher: () => a.filtroNeural("restaurar") },
            { nome: "Desfoque de profundidade…", aoEscolher: () => a.filtroNeural("profundidade") },
            { nome: "Super zoom (2×)", aoEscolher: () => a.filtroNeural("superZoom") },
            { nome: "Remover artefatos de JPEG…", aoEscolher: () => a.filtroDoCatalogo("remover_jpeg") },
          ],
        },
        { nome: "Filtro de revelação…", desativado: semCamada, aoEscolher: () => a.filtroDoCatalogo("revelacao"), titulo: "Ctrl+Shift+A é do navegador: use o menu" },
      ],
    },
    {
      nome: "Exibir",
      itens: [
        { nome: "Aumentar zoom", atalho: "Ctrl+= ou Ctrl+Shift+=", aoEscolher: () => a.zoom("mais") },
        { nome: "Diminuir zoom", atalho: "Ctrl+-", aoEscolher: () => a.zoom("menos") },
        { nome: "Ajustar à tela", atalho: "Ctrl+0", aoEscolher: () => a.zoom("ajustar") },
        { nome: "100%", atalho: "Ctrl+1", aoEscolher: () => a.zoom(1) },
        { nome: "200%", aoEscolher: () => a.zoomExato(2) },
        { nome: "Tamanho de impressão", aoEscolher: a.tamanhoDeImpressao, titulo: "O documento no tamanho em que sai impresso, pela resolução dele" },
        { nome: "Ajustar a camada à tela", desativado: semCamada, aoEscolher: a.ajustarCamadaATela },
        "-",
        { nome: "Espelhar a vista na horizontal", marcado: a.giroDaVista.espelhada, aoEscolher: () => a.girarVista({ espelhada: !a.giroDaVista.espelhada }) },
        { nome: "Redefinir a vista", desativado: !a.giroDaVista.angulo && !a.giroDaVista.espelhada, aoEscolher: () => a.girarVista({ angulo: 0, espelhada: false }), titulo: "Tira o giro e o espelho da vista" },
        {
          nome: "Modo de tela",
          itens: [
            { nome: "Modo de tela padrão", marcado: a.modoDeTela === "padrao", aoEscolher: () => a.mudarModoDeTela("padrao") },
            { nome: "Modo de tela cheia com a barra de menus", marcado: a.modoDeTela === "comMenus", aoEscolher: () => a.mudarModoDeTela("comMenus") },
            { nome: "Modo de tela cheia", marcado: a.modoDeTela === "cheia", aoEscolher: () => a.mudarModoDeTela("cheia"), titulo: "Só a imagem, no preto; Tab mostra os painéis e F (ou Esc) volta" },
            "-",
            { nome: "Próximo modo de tela", atalho: "F", aoEscolher: () => a.mudarModoDeTela(MODOS_DE_TELA[(MODOS_DE_TELA.indexOf(a.modoDeTela) + 1) % MODOS_DE_TELA.length]) },
            { nome: "Modo de tela anterior", atalho: "Shift+F", aoEscolher: () => a.mudarModoDeTela(MODOS_DE_TELA[(MODOS_DE_TELA.indexOf(a.modoDeTela) + MODOS_DE_TELA.length - 1) % MODOS_DE_TELA.length]) },
          ],
        },
        { nome: "Mostrar ou ocultar os painéis", atalho: "Tab", aoEscolher: () => a.ocultarPaineis("todos") },
        { nome: "Interface mais escura", atalho: "Shift+F1", aoEscolher: () => a.clarearInterface(-1) },
        { nome: "Interface mais clara", atalho: "Shift+F2", aoEscolher: () => a.clarearInterface(1) },
        { nome: "Mostrar ou ocultar os painéis encaixados", atalho: "Shift+Tab", aoEscolher: () => a.ocultarPaineis("encaixados"), titulo: "Só os painéis da direita; a caixa de ferramentas e a barra de opções ficam" },
        "-",
        { nome: "Extras", atalho: "Ctrl+H", marcado: a.vista.extras, aoEscolher: () => a.mudarVista({ extras: !a.vista.extras }), titulo: "Mostra ou esconde de uma vez as guias, a grade, as bordas e as formigas da seleção" },
        {
          nome: "Mostrar",
          itens: [
            { nome: "Bordas da seleção", marcado: a.bordasVisiveis, aoEscolher: () => a.selecaoDoDocumento("bordas") },
            { nome: "Bordas da camada", marcado: a.vista.bordasDaCamada, aoEscolher: () => a.mudarVista({ bordasDaCamada: !a.vista.bordasDaCamada }) },
            { nome: "Guias", atalho: "Ctrl+;", marcado: a.vista.guias, aoEscolher: () => a.mudarVista({ guias: !a.vista.guias }) },
            { nome: "Grade", atalho: "Ctrl+'", marcado: a.vista.grade, aoEscolher: () => a.mudarVista({ grade: !a.vista.grade }) },
            { nome: "Guias inteligentes", marcado: a.vista.guiasInteligentes, aoEscolher: () => a.mudarVista({ guiasInteligentes: !a.vista.guiasInteligentes }) },
            { nome: "Notas", marcado: a.vista.notas, aoEscolher: () => a.mudarVista({ notas: !a.vista.notas }) },
            { nome: "Contagem", marcado: a.vista.contagem, aoEscolher: () => a.mudarVista({ contagem: !a.vista.contagem }) },
            { nome: "Fatias", marcado: a.vista.fatias, aoEscolher: () => a.mudarVista({ fatias: !a.vista.fatias }) },
            { nome: "Malha de pixels", marcado: a.vista.malhaDePixels, aoEscolher: () => a.mudarVista({ malhaDePixels: !a.vista.malhaDePixels }), titulo: "Um quadriculado em cada pixel, com o zoom a partir de 800%" },
            "-",
            { nome: "Configurar a grade…", aoEscolher: () => a.janelaDaVista("grade") },
          ],
        },
        {
          nome: "Grade de perspectiva",
          itens: [
            { nome: "Mostrar a grade", marcado: a.gradeDePerspectiva === "visivel", aoEscolher: () => a.mudarGradeDePerspectiva("alternar") },
            "-",
            { nome: "Um ponto", aoEscolher: () => a.mudarGradeDePerspectiva(1) },
            { nome: "Dois pontos", aoEscolher: () => a.mudarGradeDePerspectiva(2) },
            { nome: "Três pontos", aoEscolher: () => a.mudarGradeDePerspectiva(3) },
          ],
        },
        { nome: "Réguas", atalho: "Ctrl+R", marcado: a.vista.reguas, aoEscolher: () => a.mudarVista({ reguas: !a.vista.reguas }) },
        {
          nome: "Unidade das réguas",
          itens: UNIDADES_DA_REGUA.map((u) => ({ nome: u.nome, marcado: a.vista.unidade === u.id, aoEscolher: () => a.mudarVista({ unidade: u.id }) })),
        },
        "-",
        { nome: "Encaixar", atalho: "Ctrl+Shift+;", marcado: a.vista.encaixar, aoEscolher: () => a.mudarVista({ encaixar: !a.vista.encaixar }) },
        {
          nome: "Encaixar em",
          itens: [
            { nome: "Guias", marcado: a.vista.encaixarEm.guias, aoEscolher: () => a.mudarVista({ encaixarEm: { ...a.vista.encaixarEm, guias: !a.vista.encaixarEm.guias } }) },
            { nome: "Grade", marcado: a.vista.encaixarEm.grade, aoEscolher: () => a.mudarVista({ encaixarEm: { ...a.vista.encaixarEm, grade: !a.vista.encaixarEm.grade } }) },
            { nome: "Camadas", marcado: a.vista.encaixarEm.camadas, aoEscolher: () => a.mudarVista({ encaixarEm: { ...a.vista.encaixarEm, camadas: !a.vista.encaixarEm.camadas } }) },
            { nome: "Limites do documento", marcado: a.vista.encaixarEm.limites, aoEscolher: () => a.mudarVista({ encaixarEm: { ...a.vista.encaixarEm, limites: !a.vista.encaixarEm.limites } }) },
            "-",
            { nome: "Tudo", aoEscolher: () => a.mudarVista({ encaixarEm: { guias: true, grade: true, camadas: true, limites: true } }) },
            { nome: "Nada", aoEscolher: () => a.mudarVista({ encaixarEm: { guias: false, grade: false, camadas: false, limites: false } }) },
          ],
        },
        "-",
        { nome: "Bloquear guias", atalho: "Ctrl+Alt+;", marcado: a.vista.travarGuias, aoEscolher: () => a.mudarVista({ travarGuias: !a.vista.travarGuias }) },
        { nome: "Limpar guias", desativado: !a.temGuias, aoEscolher: a.limparGuias },
        { nome: "Nova guia…", aoEscolher: () => a.janelaDaVista("guia") },
        { nome: "Novo layout de guias…", aoEscolher: () => a.janelaDaVista("layout") },
        { nome: "Novas guias a partir da forma", desativado: semCamada, aoEscolher: a.guiasDaForma },
        "-",
        {
          nome: "Configuração da prova",
          itens: PROVAS.map((prova) => ({ nome: prova.nome, marcado: a.prova.tipo === prova.id, aoEscolher: () => a.mudarProva({ tipo: prova.id, ligada: true }) })),
        },
        { nome: "Cores de prova", atalho: "Ctrl+Y", marcado: a.prova.ligada, aoEscolher: () => a.mudarProva({ ligada: !a.prova.ligada }), titulo: "A tela mostra a imagem como na prova escolhida; os arquivos não mudam" },
        { nome: "Alerta de gama", atalho: "Ctrl+Shift+Y", marcado: a.alertaDeGama, aoEscolher: a.alternarAlertaDeGama, titulo: "Pinta de cinza o que a impressão em CMYK não alcança" },
        "-",
      ],
    },
    {
      nome: "Janela",
      itens: [
        {
          nome: "Área de trabalho",
          itens: [
            ...Object.entries(AREAS_DA_IMAGEM).map(([id, nome]): ItemDeMenu => ({ nome, marcado: a.area === id, aoEscolher: () => a.area_(id) })),
            "-",
            { nome: `Redefinir ${AREAS_DA_IMAGEM[a.area as keyof typeof AREAS_DA_IMAGEM] ?? ""}`.trim(), chave: "Janela › Área de trabalho › Redefinir", aoEscolher: a.restaurarArea },
          ],
        },
        "-",
        {
          nome: "Documentos abertos",
          itens: [
            { nome: "Próximo documento", atalho: "Ctrl+F6", desativado: a.documentosAbertos.length < 2, aoEscolher: () => a.documentoVizinho(1), titulo: "O Ctrl+Tab é do navegador" },
            { nome: "Documento anterior", atalho: "Ctrl+Shift+F6", desativado: a.documentosAbertos.length < 2, aoEscolher: () => a.documentoVizinho(-1) },
            "-",
            ...a.documentosAbertos.map((documento): ItemDeMenu => ({ nome: documento.nome || "Imagem sem título", marcado: documento.id === a.documentoAtual, aoEscolher: () => a.irParaDocumento(documento.id) })),
          ],
        },
        "-",
        ...(Object.entries(PAINEIS_DA_IMAGEM) as [IdPainelDaImagem, string][]).map(
          (([id, nome]): ItemDeMenu => ({ nome, marcado: a.painelAberto(id), atalho: id === "configuracoesDoPincel" ? "F5" : id === "informacoes" ? "F8" : id === "acoes" ? "Alt+F9" : undefined, aoEscolher: () => a.alternarPainel(id) })),
        ),
      ],
    },
    { nome: "Ajuda", itens: [{ nome: "Atalhos do teclado…", aoEscolher: a.atalhos }] },
  ];
}
