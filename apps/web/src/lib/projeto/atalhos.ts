// Atalhos do editor: as contas que eles fazem (qual clipe o Q e o W aparam, onde fica o corte vizinho) e a
// lista que a janela "?" mostra. Função pura; quem escuta as teclas é o Editor.
import type { Tick } from "../tempo.ts";
import { type Clipe, fimDoClipe, type Projeto } from "./modelo.ts";

export type Atalho = { teclas: string; acao: string };

/** A lista da janela de atalhos, na ordem em que aparece. */
export const ATALHOS: Atalho[] = [
  { teclas: "Espaço", acao: "Tocar e parar" },
  { teclas: "← →", acao: "Um quadro para trás ou para a frente (Shift: um segundo)" },
  { teclas: "↑ ↓", acao: "Corte anterior ou seguinte da principal" },
  { teclas: "M", acao: "Pôr um marcador no cursor" },
  { teclas: "Shift+↑ Shift+↓", acao: "Marcador anterior ou seguinte" },
  { teclas: "Home End", acao: "Começo ou fim do projeto" },
  { teclas: "S  ou  Ctrl+B", acao: "Dividir no cursor" },
  { teclas: "Q", acao: "Apagar do começo do clipe até o cursor" },
  { teclas: "W", acao: "Apagar do cursor até o fim do clipe" },
  { teclas: "Alt+← Alt+→", acao: "Empurrar os clipes marcados um quadro (Shift: cinco)" },
  { teclas: "Alt + arrastar o clipe", acao: "Deslizar o conteúdo: o clipe fica no lugar e mostra outro trecho da mídia" },
  { teclas: "Alt + arrastar a borda", acao: "Mover o corte entre dois clipes encostados: um cresce o que o outro encolhe" },
  { teclas: "Delete", acao: "Apagar os clipes marcados" },
  { teclas: "Ctrl+D", acao: "Duplicar os clipes marcados" },
  { teclas: "Ctrl+C  Ctrl+V", acao: "Copiar e colar clipes no cursor" },
  { teclas: "Ctrl+Alt+V", acao: "Colar só os ajustes (cor, efeito, animação...) nos clipes marcados" },
  { teclas: "Ctrl+A", acao: "Marcar todos os clipes" },
  { teclas: "Esc", acao: "Desmarcar" },
  { teclas: "N", acao: "Ligar e desligar o ímã" },
  { teclas: "Ctrl+Z  Ctrl+Shift+Z", acao: "Desfazer e refazer" },
  { teclas: "?", acao: "Esta lista" },
];

/**
 * O clipe que o Q e o W aparam: o marcado que está sob o cursor ou, sem ele, o da principal sob o cursor. O
 * cursor precisa estar dentro do clipe (no começo ou no fim exatos não há o que apagar).
 */
export function clipeParaAparar(projeto: Projeto, selecao: string[], tempo: Tick): Clipe | null {
  const dentro = (clipe: Clipe) => clipe.inicio < tempo && tempo < fimDoClipe(clipe);
  const marcados = projeto.faixas.flatMap((faixa) => faixa.clipes.filter((clipe) => selecao.includes(clipe.id) && dentro(clipe)));
  if (marcados.length === 1) return marcados[0];
  return projeto.faixas.find((faixa) => faixa.tipo === "principal")?.clipes.find(dentro) ?? null;
}

/** O marcador antes (`sentido` -1) ou depois (1) de `tempo`; null quando não há. */
export function marcadorVizinho(projeto: Projeto, tempo: Tick, sentido: -1 | 1, meioQuadro: Tick): Tick | null {
  const tempos = (projeto.marcadores ?? []).map((m) => m.t).sort((a, b) => a - b);
  if (sentido > 0) return tempos.find((t) => t > tempo + meioQuadro) ?? null;
  return tempos.reverse().find((t) => t < tempo - meioQuadro) ?? null;
}

/**
 * O corte da principal antes (`sentido` -1) ou depois (1) de `tempo`, contando o começo e o fim do projeto;
 * null quando não há. Os cortes a menos de meio quadro do cursor não contam, para a tecla sempre andar.
 */
export function corteVizinho(projeto: Projeto, tempo: Tick, sentido: -1 | 1, meioQuadro: Tick): Tick | null {
  const principal = projeto.faixas.find((faixa) => faixa.tipo === "principal");
  const cortes = new Set<Tick>([0, projeto.duracao]);
  for (const clipe of principal?.clipes ?? []) {
    cortes.add(clipe.inicio);
    cortes.add(fimDoClipe(clipe));
  }
  const ordenados = [...cortes].sort((a, b) => a - b);
  if (sentido > 0) return ordenados.find((corte) => corte > tempo + meioQuadro) ?? null;
  return ordenados.reverse().find((corte) => corte < tempo - meioQuadro) ?? null;
}
