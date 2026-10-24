// Os tipos de ajuste do painel Ajustes, do menu e do botão de ajuste do painel Camadas, na ordem dos editores de
// imagem profissionais (lib/imagem/ajustes.ts faz a conta de cada um). Criar põe uma camada de ajuste acima da
// escolhida, com os valores de partida, e abre o painel Propriedades dela.
import {
  Aperture,
  Blend,
  Contrast,
  Droplet,
  Gauge,
  Grid3x3,
  type LucideIcon,
  Layers2,
  Palette,
  PenTool,
  Rainbow,
  ScanLine,
  SlidersHorizontal,
  Sparkles,
  Sun,
  SunMoon,
  Thermometer,
} from "lucide-react";

import { NOMES_DOS_AJUSTES, type TipoDoAjuste } from "@/lib/imagem/ajustes";

export type Ajuste = { id: TipoDoAjuste; nome: string; icone: LucideIcon; atalho?: string };

const ajuste = (id: TipoDoAjuste, icone: LucideIcon, atalho?: string): Ajuste => ({ id, nome: NOMES_DOS_AJUSTES[id], icone, atalho });

export const AJUSTES: Ajuste[] = [
  ajuste("brilho_contraste", Sun),
  ajuste("niveis", Gauge, "Ctrl+L"),
  ajuste("curvas", PenTool, "Ctrl+M"),
  ajuste("exposicao", Aperture),
  ajuste("vibracao", Sparkles),
  ajuste("matiz_saturacao", Droplet, "Ctrl+U"),
  ajuste("equilibrio", Blend, "Ctrl+B"),
  ajuste("preto_branco", Contrast, "Ctrl+Alt+Shift+B"),
  ajuste("filtro_de_fotos", Thermometer),
  ajuste("mixer", SlidersHorizontal),
  ajuste("pesquisa", Grid3x3),
  ajuste("inverter", SunMoon, "Ctrl+I"),
  ajuste("posterizar", Layers2),
  ajuste("limiar", ScanLine),
  ajuste("mapa_degrade", Rainbow),
  ajuste("cor_seletiva", Palette),
];
