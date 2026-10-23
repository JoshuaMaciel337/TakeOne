// Os menus do editor de imagem (ADR 0002), na ordem e com os nomes e os atalhos dos editores de imagem
// profissionais. Os atalhos que o navegador não deixa a página pegar (Ctrl+N, Ctrl+T, Ctrl+W) ficam de fora.
import type { ItemDeMenu, Menu } from "@/componentes/area/BarraDeMenus";
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
  cor: "Cor",
  estilos: "Estilos de texto",
  filtros: "Filtros",
  fotoIA: "Foto com IA",
  formas: "Formas",
  historico: "Histórico",
  modelos: "Modelos",
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

export type AcoesDosMenus = {
  temCamada: boolean;
  /** A camada escolhida é uma foto (as ações de foto e de seleção valem). */
  temFoto: boolean;
  temSelecao: boolean;
  podeDesfazer: string | null;
  podeRefazer: string | null;
  area: string;
  painelAberto: (painel: IdPainelDaImagem) => boolean;
  novo: () => void;
  abrir: () => void;
  exportar: () => void;
  salvar: () => void;
  desfazer: () => void;
  refazer: () => void;
  ferramenta: (id: IdFerramentaDaImagem) => void;
  ajuste: (ajuste: Ajuste) => void;
  documento: () => void;
  painel: (painel: IdPainelDaImagem) => void;
  alternarPainel: (painel: IdPainelDaImagem) => void;
  duplicar: () => void;
  excluir: () => void;
  ordenar: (para: "topo" | "cima" | "baixo" | "fundo") => void;
  esconder: () => void;
  bloquear: () => void;
  estilo: (qual: "contorno" | "sombra") => void;
  mascara: () => void;
  viaRecorte: () => void;
  preencher: () => void;
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
        { nome: "Abrir…", atalho: "Ctrl+O", aoEscolher: a.abrir },
        "-",
        { nome: "Salvar", atalho: "Ctrl+S", aoEscolher: a.salvar, titulo: "O TakeOne salva sozinho a cada mudança" },
        "-",
        { nome: "Exportar", itens: [{ nome: "Exportar como…", atalho: "Ctrl+Alt+Shift+W", aoEscolher: a.exportar }] },
      ],
    },
    {
      nome: "Editar",
      itens: [
        { nome: a.podeDesfazer ? `Desfazer ${a.podeDesfazer}` : "Desfazer", atalho: "Ctrl+Z", desativado: !a.podeDesfazer, aoEscolher: a.desfazer },
        { nome: a.podeRefazer ? `Refazer ${a.podeRefazer}` : "Refazer", atalho: "Ctrl+Shift+Z ou Ctrl+Y", desativado: !a.podeRefazer, aoEscolher: a.refazer },
        "-",
        { nome: "Preencher sensível ao conteúdo", atalho: "Shift+F5", desativado: !a.temSelecao, aoEscolher: a.preencher },
        { nome: "Transformação livre", desativado: semCamada, aoEscolher: () => a.ferramenta("mover") },
        "-",
        { nome: "Atalhos do teclado…", aoEscolher: a.atalhos },
      ],
    },
    {
      nome: "Imagem",
      itens: [
        { nome: "Ajustes", itens: AJUSTES.map((ajuste) => ({ nome: `${ajuste.nome}…`, atalho: ajuste.atalho, aoEscolher: () => a.ajuste(ajuste) })) },
        "-",
        { nome: "Tamanho da imagem…", atalho: "Ctrl+Alt+I", aoEscolher: a.documento },
        { nome: "Tamanho da tela…", atalho: "Ctrl+Alt+C", aoEscolher: a.documento },
        { nome: "Cortar", aoEscolher: () => a.ferramenta("corte") },
        "-",
        { nome: "Ampliar ou expandir com IA…", desativado: !a.temFoto, aoEscolher: () => a.painel("fotoIA") },
      ],
    },
    {
      nome: "Camada",
      itens: [
        { nome: "Nova camada de ajuste", itens: AJUSTES.map((ajuste) => ({ nome: `${ajuste.nome}…`, aoEscolher: () => a.ajuste(ajuste) })) },
        { nome: "Duplicar camada", atalho: "Ctrl+J", desativado: semCamada, aoEscolher: a.duplicar },
        { nome: "Camada via recorte", atalho: "Ctrl+Shift+J", desativado: !a.temSelecao, aoEscolher: a.viaRecorte },
        { nome: "Excluir camada", desativado: semCamada, aoEscolher: a.excluir },
        "-",
        {
          nome: "Estilo de camada",
          desativado: semCamada,
          itens: [
            { nome: "Traçado…", aoEscolher: () => a.estilo("contorno") },
            { nome: "Sombra projetada…", aoEscolher: () => a.estilo("sombra") },
          ],
        },
        { nome: "Máscara de camada", desativado: semCamada, itens: [{ nome: "Revelar tudo", aoEscolher: a.mascara }] },
        "-",
        {
          nome: "Organizar",
          desativado: semCamada,
          itens: [
            { nome: "Trazer para a frente", atalho: "Ctrl+Shift+]", aoEscolher: () => a.ordenar("topo") },
            { nome: "Avançar", atalho: "Ctrl+]", aoEscolher: () => a.ordenar("cima") },
            { nome: "Recuar", atalho: "Ctrl+[", aoEscolher: () => a.ordenar("baixo") },
            { nome: "Enviar para trás", atalho: "Ctrl+Shift+[", aoEscolher: () => a.ordenar("fundo") },
          ],
        },
        { nome: "Bloquear camadas", atalho: "Ctrl+/", desativado: semCamada, aoEscolher: a.bloquear },
        { nome: "Ocultar camadas", atalho: "Ctrl+,", desativado: semCamada, aoEscolher: a.esconder },
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
        { nome: "Todas as camadas", atalho: "Ctrl+Alt+A", aoEscolher: a.todasAsCamadas },
        { nome: "Desmarcar camadas", aoEscolher: a.desmarcarCamadas },
        "-",
        { nome: "Desmarcar", atalho: "Ctrl+D", desativado: !a.temSelecao, aoEscolher: a.desmarcar },
        { nome: "Objeto", aoEscolher: () => a.ferramenta("objeto") },
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
        ...(Object.entries(PAINEIS_DA_IMAGEM) as [IdPainelDaImagem, string][]).map(([id, nome]): ItemDeMenu => ({ nome, marcado: a.painelAberto(id), aoEscolher: () => a.alternarPainel(id) })),
      ],
    },
    { nome: "Ajuda", itens: [{ nome: "Atalhos do teclado…", aoEscolher: a.atalhos }] },
  ];
}
