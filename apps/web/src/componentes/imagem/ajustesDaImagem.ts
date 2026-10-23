// Os tipos de ajuste do painel Ajustes e do botão de ajuste do painel Camadas, na ordem dos editores de imagem
// profissionais. Todos criam a mesma camada de ajuste (a cor dela vale para o que está embaixo); o tipo só dá os
// valores de partida e a parte do painel Propriedades que abre.
import { Aperture, Blend, Contrast, Droplet, Gauge, Grid3x3, type LucideIcon, PenTool, Sparkles, Sun, Thermometer } from "lucide-react";

import type { Cor } from "@/lib/projeto/cor";

export type Ajuste = { id: string; nome: string; icone: LucideIcon; atalho?: string; cor?: Partial<Cor> };

export const AJUSTES: Ajuste[] = [
  { id: "brilho", nome: "Brilho/Contraste", icone: Sun },
  { id: "niveis", nome: "Níveis", icone: Gauge, atalho: "Ctrl+L" },
  { id: "curvas", nome: "Curvas", icone: PenTool, atalho: "Ctrl+M" },
  { id: "exposicao", nome: "Exposição", icone: Aperture },
  { id: "vibracao", nome: "Vibração", icone: Sparkles },
  { id: "matiz", nome: "Matiz/Saturação", icone: Droplet, atalho: "Ctrl+U" },
  { id: "equilibrio", nome: "Equilíbrio de cores", icone: Blend, atalho: "Ctrl+B" },
  { id: "pretoBranco", nome: "Preto e branco", icone: Contrast, atalho: "Ctrl+Alt+Shift+B", cor: { saturacao: -1 } },
  { id: "filtroDeFoto", nome: "Filtro de fotos", icone: Thermometer, cor: { temperatura: 0.25 } },
  { id: "lut", nome: "Pesquisa de cores", icone: Grid3x3 },
];
