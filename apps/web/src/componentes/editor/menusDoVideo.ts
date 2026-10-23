// Os menus do editor de vídeo (ADR 0002), na ordem, com os nomes e com os atalhos dos editores de vídeo profissionais.
// Os atalhos de uma tecla são atendidos pelo teclado do editor; aqui eles aparecem para quem procura.
import type { ItemDeMenu, Menu } from "@/componentes/area/BarraDeMenus";

/** Os painéis do editor de vídeo, com o nome do menu Janela (em ordem alfabética, como lá). */
export const PAINEIS_DO_VIDEO = {
  controles: "Controles de efeito",
  cor: "Cor",
  efeitos: "Efeitos",
  fonte: "Fonte",
  graficos: "Gráficos essenciais",
  historico: "Histórico",
  marca: "Kit de marca",
  marcadores: "Marcadores",
  metadados: "Metadados",
  projeto: "Projeto",
  propriedades: "Propriedades",
  som: "Som essencial",
  texto: "Texto",
} as const;
export type IdPainelDoVideo = keyof typeof PAINEIS_DO_VIDEO;

export const AREAS_DO_VIDEO = { edicao: "Edição", montagem: "Montagem", cor: "Cor", efeitos: "Efeitos", audio: "Áudio", legendas: "Legendas e gráficos" } as const;

export type AcoesDoVideo = {
  temSelecao: boolean;
  podeDesfazer: string | null;
  podeRefazer: string | null;
  ima: boolean;
  temMarcadores: boolean;
  podeSepararSom: boolean;
  podeCongelar: boolean;
  area: string;
  painelAberto: (painel: IdPainelDoVideo) => boolean;
  novo: () => void;
  abrir: () => void;
  importar: () => void;
  salvar: () => void;
  salvarModelo: () => void;
  exportar: () => void;
  exportarQuadro: () => void;
  desfazer: () => void;
  refazer: () => void;
  recortar: () => void;
  copiar: () => void;
  colar: () => void;
  colarAtributos: () => void;
  limpar: () => void;
  excluirEmOndulacao: () => void;
  duplicar: () => void;
  /** Há entrada ou saída marcada (elevar e extrair valem). */
  temTrecho: boolean;
  marcarEntradaSaida: (qual: "entrada" | "saida") => void;
  irParaEntradaSaida: (qual: "entrada" | "saida") => void;
  limparEntradaSaida: () => void;
  elevar: () => void;
  extrair: () => void;
  transicaoPadrao: (doSom: boolean) => void;
  temFonte: boolean;
  porDaFonte: (modo: "inserir" | "sobrescrever") => void;
  selecionarTudo: () => void;
  desmarcarTudo: () => void;
  atalhos: () => void;
  velocidade: () => void;
  separarSom: () => void;
  congelar: () => void;
  dividir: () => void;
  alternarIma: () => void;
  criarAutomaticamente: () => void;
  configuracoes: () => void;
  marcador: () => void;
  marcadorVizinho: (sentido: -1 | 1) => void;
  limparMarcadores: () => void;
  novoTexto: () => void;
  legendas: () => void;
  zoomDaLinha: (fator: number) => void;
  painel: (painel: IdPainelDoVideo) => void;
  alternarPainel: (painel: IdPainelDoVideo) => void;
  escolherArea: (nome: string) => void;
  restaurarArea: () => void;
};

export function menusDoVideo(a: AcoesDoVideo): Menu[] {
  const semSelecao = !a.temSelecao;
  return [
    {
      nome: "Arquivo",
      itens: [
        { nome: "Novo projeto…", aoEscolher: a.novo },
        { nome: "Abrir projeto…", atalho: "Ctrl+O", aoEscolher: a.abrir },
        "-",
        { nome: "Salvar", atalho: "Ctrl+S", aoEscolher: a.salvar, titulo: "O TakeOne salva sozinho a cada mudança" },
        { nome: "Salvar como modelo…", aoEscolher: a.salvarModelo },
        "-",
        { nome: "Importar…", atalho: "Ctrl+I", aoEscolher: a.importar },
        "-",
        {
          nome: "Exportar",
          itens: [
            { nome: "Mídia…", atalho: "Ctrl+M", aoEscolher: a.exportar },
            { nome: "Quadro…", atalho: "Ctrl+Shift+E", aoEscolher: a.exportarQuadro },
          ],
        },
      ],
    },
    {
      nome: "Editar",
      itens: [
        { nome: a.podeDesfazer ? `Desfazer ${a.podeDesfazer}` : "Desfazer", atalho: "Ctrl+Z", desativado: !a.podeDesfazer, aoEscolher: a.desfazer },
        { nome: a.podeRefazer ? `Refazer ${a.podeRefazer}` : "Refazer", atalho: "Ctrl+Shift+Z ou Ctrl+Y", desativado: !a.podeRefazer, aoEscolher: a.refazer },
        "-",
        { nome: "Recortar", atalho: "Ctrl+X", desativado: semSelecao, aoEscolher: a.recortar },
        { nome: "Copiar", atalho: "Ctrl+C", desativado: semSelecao, aoEscolher: a.copiar },
        { nome: "Colar", atalho: "Ctrl+V", aoEscolher: a.colar },
        { nome: "Colar atributos…", atalho: "Ctrl+Alt+V", desativado: semSelecao, aoEscolher: a.colarAtributos },
        "-",
        { nome: "Limpar", atalho: "Delete", desativado: semSelecao, aoEscolher: a.limpar },
        { nome: "Exclusão em ondulação", atalho: "Shift+Delete", desativado: semSelecao, aoEscolher: a.excluirEmOndulacao },
        { nome: "Duplicar", atalho: "Ctrl+Shift+/", desativado: semSelecao, aoEscolher: a.duplicar },
        "-",
        { nome: "Selecionar tudo", atalho: "Ctrl+A", aoEscolher: a.selecionarTudo },
        { nome: "Desmarcar tudo", atalho: "Ctrl+Shift+A", aoEscolher: a.desmarcarTudo },
        "-",
        { nome: "Atalhos do teclado…", atalho: "Ctrl+Alt+K", aoEscolher: a.atalhos },
      ],
    },
    {
      nome: "Clipe",
      itens: [
        { nome: "Velocidade/duração…", atalho: "Ctrl+R", desativado: semSelecao, aoEscolher: a.velocidade },
        "-",
        { nome: "Inserir", atalho: ",", desativado: !a.temFonte, aoEscolher: () => a.porDaFonte("inserir"), titulo: "O trecho da Fonte entra no cursor e abre o espaço" },
        { nome: "Sobrescrever", atalho: ".", desativado: !a.temFonte, aoEscolher: () => a.porDaFonte("sobrescrever"), titulo: "O trecho da Fonte entra no cursor por cima do que estava" },
        "-",
        { nome: "Opções de vídeo", itens: [{ nome: "Inserir segmento de quadro congelado", desativado: !a.podeCongelar, aoEscolher: a.congelar }] },
        { nome: "Opções de áudio", itens: [{ nome: "Separar o som", desativado: !a.podeSepararSom, aoEscolher: a.separarSom }] },
      ],
    },
    {
      nome: "Sequência",
      itens: [
        { nome: "Configurações da sequência…", aoEscolher: a.configuracoes },
        "-",
        { nome: "Adicionar edição", atalho: "Ctrl+K", aoEscolher: a.dividir },
        "-",
        { nome: "Elevar", atalho: ";", desativado: !a.temTrecho, aoEscolher: a.elevar, titulo: "Tira o trecho entre a entrada e a saída e deixa o espaço" },
        { nome: "Extrair", atalho: "'", desativado: !a.temTrecho, aoEscolher: a.extrair, titulo: "Tira o trecho entre a entrada e a saída e fecha o espaço" },
        "-",
        { nome: "Aplicar transição de vídeo", atalho: "Ctrl+D", aoEscolher: () => a.transicaoPadrao(false) },
        { nome: "Aplicar transição de áudio", atalho: "Ctrl+Shift+D", aoEscolher: () => a.transicaoPadrao(true) },
        "-",
        { nome: "Encaixar na linha do tempo", atalho: "S", marcado: a.ima, aoEscolher: a.alternarIma },
        "-",
        { nome: "Criar automaticamente…", aoEscolher: a.criarAutomaticamente, titulo: "Transcreve, corta pausas e retakes, cria legendas, títulos e zooms" },
        { nome: "Legendas…", aoEscolher: a.legendas },
      ],
    },
    {
      nome: "Marcadores",
      itens: [
        { nome: "Marcar entrada", atalho: "I", aoEscolher: () => a.marcarEntradaSaida("entrada") },
        { nome: "Marcar saída", atalho: "O", aoEscolher: () => a.marcarEntradaSaida("saida") },
        { nome: "Ir para a entrada", atalho: "Shift+I", aoEscolher: () => a.irParaEntradaSaida("entrada") },
        { nome: "Ir para a saída", atalho: "Shift+O", aoEscolher: () => a.irParaEntradaSaida("saida") },
        { nome: "Limpar entrada e saída", atalho: "Ctrl+Shift+X", desativado: !a.temTrecho, aoEscolher: a.limparEntradaSaida },
        "-",
        { nome: "Adicionar marcador", atalho: "M", aoEscolher: a.marcador },
        { nome: "Ir para o próximo marcador", atalho: "Shift+M", desativado: !a.temMarcadores, aoEscolher: () => a.marcadorVizinho(1) },
        { nome: "Ir para o marcador anterior", atalho: "Ctrl+Shift+M", desativado: !a.temMarcadores, aoEscolher: () => a.marcadorVizinho(-1) },
        "-",
        { nome: "Limpar todos os marcadores", atalho: "Ctrl+Alt+Shift+M", desativado: !a.temMarcadores, aoEscolher: a.limparMarcadores },
        "-",
        { nome: "Painel Marcadores", aoEscolher: () => a.painel("marcadores") },
      ],
    },
    {
      nome: "Gráficos e títulos",
      itens: [
        { nome: "Novo texto", aoEscolher: a.novoTexto },
        { nome: "Gráficos e modelos…", aoEscolher: () => a.painel("graficos") },
        { nome: "Kit de marca…", aoEscolher: () => a.painel("marca") },
      ],
    },
    {
      nome: "Exibir",
      itens: [
        { nome: "Aumentar o zoom da linha do tempo", atalho: "=", aoEscolher: () => a.zoomDaLinha(1.5) },
        { nome: "Diminuir o zoom da linha do tempo", atalho: "-", aoEscolher: () => a.zoomDaLinha(1 / 1.5) },
      ],
    },
    {
      nome: "Janela",
      itens: [
        {
          nome: "Área de trabalho",
          itens: [
            ...Object.entries(AREAS_DO_VIDEO).map(([id, nome]): ItemDeMenu => ({ nome, marcado: a.area === id, aoEscolher: () => a.escolherArea(id) })),
            "-",
            { nome: `Redefinir ${AREAS_DO_VIDEO[a.area as keyof typeof AREAS_DO_VIDEO] ?? ""}`.trim(), aoEscolher: a.restaurarArea },
          ],
        },
        "-",
        ...(Object.entries(PAINEIS_DO_VIDEO) as [IdPainelDoVideo, string][]).map(([id, nome]): ItemDeMenu => ({ nome, marcado: a.painelAberto(id), aoEscolher: () => a.alternarPainel(id) })),
      ],
    },
    { nome: "Ajuda", itens: [{ nome: "Atalhos do teclado…", aoEscolher: a.atalhos }] },
  ];
}
