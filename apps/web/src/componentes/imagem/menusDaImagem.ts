// Os menus do editor de imagem (ADR 0002), na ordem e com os nomes e os atalhos dos editores de imagem
// profissionais. Os atalhos que o navegador não deixa a página pegar (Ctrl+N, Ctrl+T, Ctrl+W) ficam de fora.
import type { ItemDeMenu, Menu } from "@/componentes/area/BarraDeMenus";
import type { Alinhamento, Distribuicao } from "@/lib/projeto/alinhar";
import type { TipoDaMesclagem } from "@/lib/projeto/rasterizar";
import { EFEITOS, type TipoEfeito } from "@/lib/projeto/efeitos";
import { ESTILOS_DE_TEXTO, type Texto } from "@/lib/projeto/texto";

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
  paragrafo: "Parágrafo",
  degrades: "Degradês",
  fonteDeClonagem: "Fonte de clonagem",
  configuracoesDoPincel: "Configurações do pincel",
  cor: "Cor",
  estilos: "Estilos de texto",
  filtros: "Filtros",
  fotoIA: "Foto com IA",
  formas: "Formas",
  historico: "Histórico",
  modelos: "Modelos",
  padroes: "Padrões",
  pinceis: "Pincéis",
  propriedades: "Propriedades",
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
  exportar: () => void;
  /** As pranchetas: Camada › Novo › Prancheta (nova, a partir do grupo escolhido ou das camadas escolhidas) e a exportação. */
  temPranchetas: boolean;
  grupoEscolhido: boolean;
  prancheta: (como: "nova" | "grupo" | "camadas") => void;
  exportarPranchetas: () => void;
  salvar: () => void;
  desfazer: () => void;
  refazer: () => void;
  /** Ctrl+Alt+Z: o último passo vai e volta. */
  alternarUltimoEstado: () => void;
  ferramenta: (id: IdFerramentaDaImagem) => void;
  ajuste: (ajuste: Ajuste) => void;
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
  desagrupar: () => void;
  recortar: () => void;
  vincular: () => void;
  alinhar: (como: Alinhamento) => void;
  distribuir: (como: Distribuicao) => void;
  /** Alt+[ e Alt+]: escolhe a camada de baixo (1) ou de cima (-1). */
  camadaVizinha: (sentido: 1 | -1) => void;
  esconder: () => void;
  bloquear: () => void;
  estilo: (qual: "contorno" | "sombra") => void;
  mascara: () => void;
  viaRecorte: () => void;
  /** Editar › Preencher (a janela) e os preenchimentos rápidos (Alt e Ctrl + Backspace). */
  preencher: () => void;
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
        { nome: "Abrir…", atalho: "Ctrl+O", aoEscolher: a.abrir },
        "-",
        { nome: "Salvar", atalho: "Ctrl+S", aoEscolher: a.salvar, titulo: "O TakeOne salva sozinho a cada mudança" },
        "-",
        {
          nome: "Exportar",
          itens: [
            { nome: "Exportar como…", atalho: "Ctrl+Alt+Shift+W", aoEscolher: a.exportar },
            { nome: "Pranchetas em arquivos…", desativado: !a.temPranchetas, aoEscolher: a.exportarPranchetas },
          ],
        },
      ],
    },
    {
      nome: "Editar",
      itens: [
        { nome: a.podeDesfazer ? `Desfazer ${a.podeDesfazer}` : "Desfazer", atalho: "Ctrl+Z", desativado: !a.podeDesfazer, aoEscolher: a.desfazer },
        { nome: a.podeRefazer ? `Refazer ${a.podeRefazer}` : "Refazer", atalho: "Ctrl+Shift+Z ou Ctrl+Y", desativado: !a.podeRefazer, aoEscolher: a.refazer },
        { nome: "Alternar o último estado", atalho: "Ctrl+Alt+Z", desativado: !a.podeDesfazer && !a.podeRefazer, aoEscolher: a.alternarUltimoEstado },
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
        { nome: "Ajustes", itens: AJUSTES.map((ajuste) => ({ nome: `${ajuste.nome}…`, atalho: ajuste.atalho, aoEscolher: () => a.ajuste(ajuste) })) },
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
        { nome: "Nova camada de ajuste", itens: AJUSTES.map((ajuste) => ({ nome: `${ajuste.nome}…`, aoEscolher: () => a.ajuste(ajuste) })) },
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
            { nome: "Traçado…", aoEscolher: () => a.estilo("contorno") },
            { nome: "Sombra projetada…", aoEscolher: () => a.estilo("sombra") },
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
        { nome: "Painéis", itens: [{ nome: "Caractere", aoEscolher: () => a.painel("propriedades") }, { nome: "Estilos de texto", aoEscolher: () => a.painel("estilos") }] },
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
        ...FILTROS.map((grupo): ItemDeMenu => ({
          nome: grupo.submenu,
          desativado: semCamada,
          itens: grupo.itens.map((item) => ({ nome: item.nome, titulo: nomeDoFiltro(item.efeito), aoEscolher: () => a.filtro(item.efeito) })),
        })),
        "-",
        { nome: "Grande-angular adaptável…", atalho: "Ctrl+Alt+Shift+A", desativado: semCamada, aoEscolher: () => a.lente("grandeAngular") },
        { nome: "Correção de lente…", desativado: semCamada, aoEscolher: () => a.lente("lente"), titulo: "Ctrl+Shift+R é do navegador: use o menu" },
        { nome: "Dissolver…", atalho: "Ctrl+Shift+X", desativado: semCamada, aoEscolher: a.dissolver },
        { nome: "Ponto de fuga…", atalho: "Ctrl+Alt+V", aoEscolher: a.pontoDeFuga },
        { nome: "Galeria de filtros…", aoEscolher: () => a.painel("filtros") },
      ],
    },
    {
      nome: "Exibir",
      itens: [
        { nome: "Aumentar zoom", atalho: "Ctrl+= ou Ctrl+Shift+=", aoEscolher: () => a.zoom("mais") },
        { nome: "Diminuir zoom", atalho: "Ctrl+-", aoEscolher: () => a.zoom("menos") },
        { nome: "Ajustar à tela", atalho: "Ctrl+0", aoEscolher: () => a.zoom("ajustar") },
        { nome: "100%", atalho: "Ctrl+1", aoEscolher: () => a.zoom(1) },
        "-",
        { nome: "Bordas da seleção", atalho: "Ctrl+H", marcado: a.bordasVisiveis, aoEscolher: () => a.selecaoDoDocumento("bordas") },
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
            { nome: `Redefinir ${AREAS_DA_IMAGEM[a.area as keyof typeof AREAS_DA_IMAGEM] ?? ""}`.trim(), aoEscolher: a.restaurarArea },
          ],
        },
        "-",
        ...(Object.entries(PAINEIS_DA_IMAGEM) as [IdPainelDaImagem, string][]).map(
          (([id, nome]): ItemDeMenu => ({ nome, marcado: a.painelAberto(id), atalho: id === "configuracoesDoPincel" ? "F5" : undefined, aoEscolher: () => a.alternarPainel(id) })),
        ),
      ],
    },
    { nome: "Ajuda", itens: [{ nome: "Atalhos do teclado…", aoEscolher: a.atalhos }] },
  ];
}
