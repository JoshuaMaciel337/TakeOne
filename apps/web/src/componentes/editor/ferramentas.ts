import {
  ArrowLeftRight,
  Captions,
  Clapperboard,
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
  | "corte"
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
  /** Só aparece quando o projeto veio de um corte do Clipar. */
  soNoCorte?: boolean;
};

// A ordem e os nomes seguem a seção 5 do docs/PLANO.md
export const FERRAMENTAS: Ferramenta[] = [
  { id: "corte", nome: "Corte", icone: Clapperboard, soNoCorte: true },
  { id: "midia", nome: "Mídia", icone: Film },
  {
    id: "modelos",
    nome: "Modelos",
    icone: LayoutTemplate,
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
  },
  {
    id: "plugins",
    nome: "Plugins",
    icone: Puzzle,
    emBreve: { fase: "Depois da fase 6", descricao: "Bancos de música e de imagens com licença e integrações com outras ferramentas." },
  },
];
