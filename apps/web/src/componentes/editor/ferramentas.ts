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
  },
  {
    id: "audio",
    nome: "Áudio",
    icone: Music,
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
  },
  {
    id: "efeitos",
    nome: "Efeitos",
    icone: Sparkles,
  },
  {
    id: "transicoes",
    nome: "Transições",
    icone: ArrowLeftRight,
  },
  {
    id: "filtros",
    nome: "Filtros",
    icone: Palette,
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
