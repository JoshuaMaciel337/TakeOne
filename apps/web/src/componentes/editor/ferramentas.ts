import {
  ArrowLeftRight,
  Captions,
  Film,
  LayoutTemplate,
  type LucideIcon,
  Music,
  Palette,
  Puzzle,
  ScrollText,
  Shapes,
  Sparkles,
  Stamp,
  Type,
} from "lucide-react";

export type IdFerramenta =
  | "midia"
  | "modelos"
  | "elementos"
  | "audio"
  | "texto"
  | "legendas"
  | "transcricao"
  | "efeitos"
  | "transicoes"
  | "filtros"
  | "marca"
  | "plugins";

export type Ferramenta = {
  id: IdFerramenta;
  nome: string;
  icone: LucideIcon;
  /** O que o painel vai ter. Some quando a ferramenta fica pronta. */
  emBreve?: { fase: string; descricao: string };
};

// A ordem e os nomes seguem a seção 5 do docs/PLANO.md
export const FERRAMENTAS: Ferramenta[] = [
  { id: "midia", nome: "Mídia", icone: Film },
  {
    id: "modelos",
    nome: "Modelos",
    icone: LayoutTemplate,
    emBreve: { fase: "Fase 6", descricao: "Projetos prontos para trocar as mídias e os textos: intro, outro, revelação de logo e cortes para redes." },
  },
  {
    id: "elementos",
    nome: "Elementos",
    icone: Shapes,
    emBreve: { fase: "Fase 6", descricao: "Figuras, adesivos animados, formas e imagens do banco gratuito." },
  },
  {
    id: "audio",
    nome: "Áudio",
    icone: Music,
    emBreve: { fase: "Fase 3", descricao: "Músicas com licença, efeitos sonoros, fades e volume que abaixa sob a voz." },
  },
  {
    id: "texto",
    nome: "Texto",
    icone: Type,
  },
  {
    id: "legendas",
    nome: "Legendas",
    icone: Captions,
  },
  {
    id: "transcricao",
    nome: "Transcrição",
    icone: ScrollText,
    emBreve: { fase: "Fase 5", descricao: "Editar o vídeo pelo texto: apagar uma frase corta o trecho. Limpeza de pausas, vícios e retakes." },
  },
  {
    id: "efeitos",
    nome: "Efeitos",
    icone: Sparkles,
    emBreve: { fase: "Fase 4", descricao: "Desfoque, brilho, tremor, zoom, glitch, VHS, tela verde e keyframes em qualquer propriedade." },
  },
  {
    id: "transicoes",
    nome: "Transições",
    icone: ArrowLeftRight,
    emBreve: { fase: "Fase 4", descricao: "Fusão, escurecer, deslizar, empurrar, zoom, desfoque e wipes entre os clipes." },
  },
  {
    id: "filtros",
    nome: "Filtros",
    icone: Palette,
    emBreve: { fase: "Fase 4", descricao: "Filtros prontos com intensidade e ajustes de cor: temperatura, exposição, curvas e rodas de cor." },
  },
  {
    id: "marca",
    nome: "Kit de marca",
    icone: Stamp,
    emBreve: { fase: "Fase 6", descricao: "Logo, cores e fontes do seu espaço, prontos para usar em qualquer projeto." },
  },
  {
    id: "plugins",
    nome: "Plugins",
    icone: Puzzle,
    emBreve: { fase: "Depois da fase 6", descricao: "Bancos de música e de imagens com licença e integrações com outras ferramentas." },
  },
];
