// O hub do TakeOne: as ferramentas que aparecem na página inicial e em "Todas as ferramentas", e as seções do
// menu lateral. Só dados; os ícones ficam em componentes/hub/icones.tsx, pelo id.
import type { IdFerramenta } from "../componentes/editor/ferramentas.ts";

export type CategoriaDaFerramenta = "video" | "imagem" | "audio" | "ia";

export const CATEGORIAS: { id: CategoriaDaFerramenta | "todas"; nome: string }[] = [
  { id: "todas", nome: "Todas" },
  { id: "video", nome: "Para vídeos" },
  { id: "imagem", nome: "Para imagens" },
  { id: "audio", nome: "Para áudio" },
  { id: "ia", nome: "Com IA" },
];

/**
 * Para onde a ferramenta leva: uma página do hub, o editor de vídeo já na ferramenta certa (num projeto novo ou
 * num dos recentes, escolhido na janela), ou nada ainda.
 */
export type DestinoDaFerramenta =
  | { tipo: "pagina"; href: string }
  | { tipo: "editor"; ferramenta: IdFerramenta; ondeFica?: string }
  | { tipo: "em-breve"; quando: string };

export type FerramentaDoHub = {
  id: string;
  nome: string;
  descricao: string;
  categorias: CategoriaDaFerramenta[];
  destino: DestinoDaFerramenta;
  selo?: "novo" | "popular";
};

const NO_BASICO = "Selecione o vídeo na linha do tempo e abra a aba Básico.";
const NO_AUDIO = "Selecione o clipe na linha do tempo e abra a aba Áudio.";

export const FERRAMENTAS_DO_HUB: FerramentaDoHub[] = [
  {
    id: "editor-video",
    nome: "Editor de vídeo",
    descricao: "Linha do tempo com várias faixas, texto, efeitos, cor e exportação até 4K.",
    categorias: ["video"],
    destino: { tipo: "editor", ferramenta: "midia" },
  },
  {
    id: "editor-imagem",
    nome: "Editor de imagem",
    descricao: "Posts, capas e stories em camadas, com cor, texto, formas e fundo removido.",
    categorias: ["imagem"],
    destino: { tipo: "pagina", href: "/app/ferramentas/editor-de-imagem" },
    selo: "novo",
  },
  {
    id: "criar-automaticamente",
    nome: "Criar automaticamente",
    descricao: "Tira pausas e retakes e põe legendas, título, tarja, zooms e a chamada do fim.",
    categorias: ["video", "ia"],
    destino: { tipo: "editor", ferramenta: "transcricao", ondeFica: "Ponha o vídeo na linha do tempo e use o botão no topo da ferramenta Transcrição." },
    selo: "popular",
  },
  {
    id: "legendas",
    nome: "Legendas automáticas",
    descricao: "A fala vira legenda no tempo certo, com estilos e a palavra falada em destaque.",
    categorias: ["video", "ia"],
    destino: { tipo: "editor", ferramenta: "legendas" },
    selo: "popular",
  },
  {
    id: "gerar-video",
    nome: "Gerar vídeo com IA",
    descricao: "Descreva a cena, ou parta de uma imagem, e o clipe entra na biblioteca.",
    categorias: ["video", "ia"],
    destino: { tipo: "pagina", href: "/app/ferramentas/gerar-video" },
  },
  {
    id: "texto-em-fala",
    nome: "Texto em fala",
    descricao: "Escreva o texto, escolha a voz e o áudio entra na biblioteca.",
    categorias: ["audio", "ia"],
    destino: { tipo: "pagina", href: "/app/ferramentas/texto-em-fala" },
  },
  {
    id: "montar",
    nome: "Montar com vários clipes",
    descricao: "Escolha os vídeos e uma música: os melhores trechos entram cortados na batida.",
    categorias: ["video", "ia"],
    destino: { tipo: "editor", ferramenta: "midia", ondeFica: "Na ferramenta Mídia, em “Montar com vários clipes”." },
    selo: "novo",
  },
  {
    id: "modelos",
    nome: "Modelos de projeto",
    descricao: "Projetos prontos: escolha um, troque as mídias e os textos.",
    categorias: ["video"],
    destino: { tipo: "pagina", href: "/app/modelos" },
  },
  {
    id: "limpar-fala",
    nome: "Limpar a fala",
    descricao: "Tira pausas longas, hesitações e retakes de uma vez, ou corta pelo texto.",
    categorias: ["video", "ia"],
    destino: { tipo: "editor", ferramenta: "transcricao" },
  },
  {
    id: "animacoes",
    nome: "Títulos e animações",
    descricao: "Mil animações prontas: títulos, tarjas, citações e textos animados.",
    categorias: ["video"],
    destino: { tipo: "editor", ferramenta: "texto" },
  },
  {
    id: "elementos",
    nome: "Elementos e formas",
    descricao: "Formas, chamadas, números, listas, redes e “Descreva a animação”.",
    categorias: ["video", "ia"],
    destino: { tipo: "editor", ferramenta: "elementos" },
  },
  {
    id: "efeitos",
    nome: "Efeitos",
    descricao: "Desfoque, brilho, olho de peixe, VHS, glitch, luz e granulação.",
    categorias: ["video"],
    destino: { tipo: "editor", ferramenta: "efeitos" },
  },
  {
    id: "transicoes",
    nome: "Transições",
    descricao: "Fusão, deslizar, zoom, cortinas e desfoque entre os clipes.",
    categorias: ["video"],
    destino: { tipo: "editor", ferramenta: "transicoes" },
  },
  {
    id: "filtros",
    nome: "Filtros e cor",
    descricao: "Filtros prontos, ajustes, rodas e curvas de cor.",
    categorias: ["video"],
    destino: { tipo: "editor", ferramenta: "filtros" },
  },
  {
    id: "remover-fundo",
    nome: "Remover o fundo",
    descricao: "Recorta a pessoa do vídeo, sem tela verde.",
    categorias: ["video", "ia"],
    destino: { tipo: "editor", ferramenta: "midia", ondeFica: `${NO_BASICO} Ligue “Remover o fundo”.` },
  },
  {
    id: "seguir-rosto",
    nome: "Reenquadrar pelo rosto",
    descricao: "Um vídeo deitado vira em pé, com a câmera seguindo a pessoa.",
    categorias: ["video", "ia"],
    destino: { tipo: "editor", ferramenta: "midia", ondeFica: `${NO_BASICO} Use “Seguir o rosto”.` },
  },
  {
    id: "seguir-objeto",
    nome: "Seguir um objeto",
    descricao: "Um texto ou adesivo anda junto com algo que se move no vídeo.",
    categorias: ["video", "ia"],
    destino: { tipo: "editor", ferramenta: "midia", ondeFica: "Selecione o texto ou a sobreposição e, na aba Básico, use “Seguir um objeto do vídeo”." },
  },
  {
    id: "estabilizar",
    nome: "Estabilizar",
    descricao: "Tira o tremor da câmera do vídeo gravado.",
    categorias: ["video"],
    destino: { tipo: "editor", ferramenta: "midia", ondeFica: `${NO_BASICO} Ligue “Estabilizar”.` },
  },
  {
    id: "tela-verde",
    nome: "Tela verde e fundo preto",
    descricao: "Some com a cor do fundo, ou com o preto e o branco.",
    categorias: ["video"],
    destino: { tipo: "editor", ferramenta: "midia", ondeFica: NO_BASICO },
  },
  {
    id: "fundo-da-foto",
    nome: "Tirar o fundo da foto",
    descricao: "Recorta a pessoa da foto e deixa o fundo transparente.",
    categorias: ["imagem", "ia"],
    destino: { tipo: "em-breve", quando: "Com o editor de imagem" },
  },
  {
    id: "limpar-voz",
    nome: "Limpar a voz",
    descricao: "Tira o ruído de fundo e deixa só a fala.",
    categorias: ["audio", "ia"],
    destino: { tipo: "editor", ferramenta: "midia", ondeFica: `${NO_AUDIO} Ligue “Limpar a voz”.` },
  },
  {
    id: "ritmo",
    nome: "Cortar no ritmo",
    descricao: "Acha as batidas da música e corta os vídeos nelas.",
    categorias: ["audio", "ia"],
    destino: { tipo: "editor", ferramenta: "midia", ondeFica: "Selecione a música na linha do tempo e abra a seção Ritmo da aba Áudio." },
  },
  {
    id: "abaixar",
    nome: "Abaixar na fala",
    descricao: "A música abaixa sozinha quando alguém fala.",
    categorias: ["audio"],
    destino: { tipo: "editor", ferramenta: "midia", ondeFica: "Selecione a música na linha do tempo e abra a aba Áudio." },
  },
  {
    id: "efeitos-voz",
    nome: "Efeitos e tom da voz",
    descricao: "Graves, agudos, eco, reverb e o tom da voz.",
    categorias: ["audio"],
    destino: { tipo: "editor", ferramenta: "midia", ondeFica: NO_AUDIO },
  },
  {
    id: "kit-marca",
    nome: "Kit de marca",
    descricao: "Cores, fontes e logo do espaço, a um clique em todo projeto.",
    categorias: ["video", "imagem"],
    destino: { tipo: "pagina", href: "/app/marca" },
  },
  {
    id: "levar-xml",
    nome: "Levar para outro editor",
    descricao: "A linha do tempo em XML, sozinha ou num ZIP com as mídias.",
    categorias: ["video"],
    destino: { tipo: "editor", ferramenta: "midia", ondeFica: "Na janela Exportar, no canto de cima do editor." },
  },
];

/** As que aparecem na fileira de cartões da página inicial, nesta ordem. */
export const NO_INICIO = ["editor-video", "criar-automaticamente", "legendas", "gerar-video", "texto-em-fala", "montar", "modelos", "editor-imagem"];

export function ferramentaDoHub(id: string): FerramentaDoHub {
  const achada = FERRAMENTAS_DO_HUB.find((ferramenta) => ferramenta.id === id);
  if (!achada) throw new Error(`Ferramenta do hub desconhecida: ${id}`);
  return achada;
}

/** As da categoria, na ordem do catálogo. */
export function ferramentasDaCategoria(categoria: CategoriaDaFerramenta | "todas"): FerramentaDoHub[] {
  return categoria === "todas" ? FERRAMENTAS_DO_HUB : FERRAMENTAS_DO_HUB.filter((ferramenta) => ferramenta.categorias.includes(categoria));
}

/** O endereço do editor aberto num projeto, já na ferramenta. O modelo ou a animação, quando há, já vêm escolhidos. */
export function enderecoNoEditor(projetoId: string, ferramenta: IdFerramenta, escolhido: { modelo?: string; animacao?: string } = {}): string {
  const busca = new URLSearchParams({ ferramenta });
  if (escolhido.modelo) busca.set("modelo", escolhido.modelo);
  if (escolhido.animacao) busca.set("animacao", escolhido.animacao);
  return `/app/editor/${projetoId}?${busca}`;
}

/** Onde o projeto abre: o de imagem no editor de imagem, o resto no de vídeo. */
export function enderecoDoProjeto(projeto: { id: string; tipo?: string | null }): string {
  return projeto.tipo === "imagem" ? `/app/imagem/${projeto.id}` : `/app/editor/${projeto.id}`;
}

export type ItemDoMenu =
  | { nome: string; href: string; icone: string }
  | { nome: string; acao: "editor-video"; icone: string }
  | { nome: string; emBreve: true; icone: string };

/** As seções do menu lateral; o ícone é o id de componentes/hub/icones.tsx. */
export const SECOES_DO_MENU: { titulo: string | null; itens: ItemDoMenu[] }[] = [
  { titulo: null, itens: [{ nome: "Início", href: "/app", icone: "inicio" }] },
  {
    titulo: "Criar",
    itens: [
      { nome: "Editor de vídeo", acao: "editor-video", icone: "editor-video" },
      { nome: "Editor de imagem", href: "/app/ferramentas/editor-de-imagem", icone: "editor-imagem" },
      { nome: "Gerar vídeo com IA", href: "/app/ferramentas/gerar-video", icone: "gerar-video" },
      { nome: "Texto em fala", href: "/app/ferramentas/texto-em-fala", icone: "texto-em-fala" },
      { nome: "Todas as ferramentas", href: "/app/ferramentas", icone: "ferramentas" },
    ],
  },
  {
    titulo: "Biblioteca",
    itens: [
      { nome: "Projetos", href: "/app/projetos", icone: "projetos" },
      { nome: "Mídias", href: "/app/midias", icone: "midias" },
      { nome: "Modelos", href: "/app/modelos", icone: "modelos" },
      { nome: "Kit de marca", href: "/app/marca", icone: "kit-marca" },
      { nome: "Exportados", href: "/app/exportados", icone: "exportados" },
    ],
  },
  {
    titulo: "Publicar",
    itens: [
      { nome: "Agenda", emBreve: true, icone: "agenda" },
      { nome: "Desempenho", emBreve: true, icone: "desempenho" },
      { nome: "Redes conectadas", emBreve: true, icone: "redes" },
    ],
  },
];

/** O item do menu que fica marcado no endereço: o mais longo que bate (a ferramenta antes de "Todas"). */
export function itemAtivo(caminho: string): string | null {
  const hrefs = SECOES_DO_MENU.flatMap((secao) => secao.itens).flatMap((item) => ("href" in item ? [item.href] : []));
  const batem = hrefs.filter((href) => caminho === href || (href !== "/app" && caminho.startsWith(`${href}/`)));
  return batem.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** "Bom dia", "Boa tarde" ou "Boa noite", pela hora de quem abre. */
export function saudacao(hora: number): string {
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}
