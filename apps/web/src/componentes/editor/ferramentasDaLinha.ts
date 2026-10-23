// As ferramentas da linha do tempo (ADR 0002), com os nomes e as teclas dos editores de vídeo profissionais.
import { ArrowRightToLine, Hand, type LucideIcon, MousePointer2, MoveHorizontal, Scissors, StretchHorizontal, Type, UnfoldHorizontal, ZoomIn, Columns2 } from "lucide-react";

export type IdFerramentaDaLinha = "selecao" | "faixaAdiante" | "ondulacao" | "continua" | "velocidade" | "navalha" | "deslizar" | "mao" | "zoom" | "texto";

export type FerramentaDaLinha = { id: IdFerramentaDaLinha; nome: string; tecla: string; icone: LucideIcon; dica: string };

export const FERRAMENTAS_DA_LINHA: FerramentaDaLinha[] = [
  { id: "selecao", nome: "Ferramenta Seleção", tecla: "V", icone: MousePointer2, dica: "Escolhe, move e apara os clipes." },
  { id: "faixaAdiante", nome: "Ferramenta Seleção de faixa adiante", tecla: "A", icone: ArrowRightToLine, dica: "Clique num clipe: ele e os seguintes da faixa ficam escolhidos (Shift: de todas as faixas)." },
  { id: "ondulacao", nome: "Ferramenta Edição em ondulação", tecla: "B", icone: UnfoldHorizontal, dica: "Arraste a borda do clipe escolhido: os seguintes da faixa andam junto." },
  { id: "continua", nome: "Ferramenta Edição contínua", tecla: "N", icone: Columns2, dica: "Arraste a borda entre dois clipes encostados: um cresce o que o outro encolhe." },
  { id: "velocidade", nome: "Ferramenta Esticar a velocidade", tecla: "R", icone: StretchHorizontal, dica: "Arraste a borda do clipe escolhido: a velocidade muda para o mesmo trecho caber." },
  { id: "navalha", nome: "Ferramenta Navalha", tecla: "C", icone: Scissors, dica: "Clique num clipe para cortá-lo ali (Shift: corta todas as faixas)." },
  { id: "deslizar", nome: "Ferramenta Deslizar", tecla: "Y", icone: MoveHorizontal, dica: "Arraste um clipe: ele fica no lugar e mostra outro trecho da mídia." },
  { id: "mao", nome: "Ferramenta Mão", tecla: "H", icone: Hand, dica: "Arraste para andar pela linha do tempo." },
  { id: "zoom", nome: "Ferramenta Zoom", tecla: "Z", icone: ZoomIn, dica: "Clique para aproximar a linha do tempo (Alt: afastar)." },
  { id: "texto", nome: "Ferramenta Texto", tecla: "T", icone: Type, dica: "Clique no monitor Programa para escrever um texto ali." },
];

export function ferramentaDaLinha(id: IdFerramentaDaLinha): FerramentaDaLinha {
  return FERRAMENTAS_DA_LINHA.find((item) => item.id === id)!;
}
