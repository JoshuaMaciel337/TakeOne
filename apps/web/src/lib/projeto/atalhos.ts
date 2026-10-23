// Atalhos do editor: as contas que eles fazem (qual clipe o Q e o W aparam, onde fica o corte vizinho) e a
// lista que a janela "?" mostra. Função pura; quem escuta as teclas é o Editor.
import type { Tick } from "../tempo.ts";
import { type Clipe, fimDoClipe, type Projeto } from "./modelo.ts";

export type Atalho = { teclas: string; acao: string };

/** A lista da janela de atalhos, na ordem em que aparece. */
export const ATALHOS: Atalho[] = [
  { teclas: "Espaço", acao: "Tocar e parar" },
  { teclas: "J  K  L", acao: "Voltar um segundo, parar e tocar (o editor não toca para trás)" },
  { teclas: "← →", acao: "Um quadro para trás ou para a frente (Shift: cinco)" },
  { teclas: "↑ ↓", acao: "Corte anterior ou seguinte" },
  { teclas: "Home End", acao: "Começo ou fim da sequência" },
  { teclas: "I  O", acao: "Marcar a entrada e a saída (Shift: ir até elas; Ctrl+Shift+X limpa)" },
  { teclas: ";  '", acao: "Elevar (deixa o espaço) e extrair (fecha o espaço) o trecho entre a entrada e a saída" },
  { teclas: "M", acao: "Pôr um marcador no cursor" },
  { teclas: "Shift+M  Ctrl+Shift+M", acao: "Marcador seguinte ou anterior (também Shift+↓ e Shift+↑)" },
  { teclas: "Ctrl+K  ou  Ctrl+B", acao: "Adicionar edição: dividir no cursor" },
  { teclas: "Q", acao: "Apagar do começo do clipe até o cursor" },
  { teclas: "W", acao: "Apagar do cursor até o fim do clipe" },
  { teclas: "V A B N R C Y H Z T", acao: "Ferramentas da linha do tempo: seleção, faixa adiante, ondulação, contínua, esticar a velocidade, navalha, deslizar, mão, zoom e texto (na tela larga)" },
  { teclas: "Alt+← Alt+→", acao: "Empurrar os clipes marcados um quadro (Shift: cinco)" },
  { teclas: "Alt + arrastar o clipe", acao: "Deslizar o conteúdo: o clipe fica no lugar e mostra outro trecho da mídia" },
  { teclas: "Alt + arrastar a borda", acao: "Mover o corte entre dois clipes encostados: um cresce o que o outro encolhe" },
  { teclas: "Delete  Shift+Delete", acao: "Apagar os clipes marcados (Shift: e fechar o espaço)" },
  { teclas: "Ctrl+D  Ctrl+Shift+D", acao: "Aplicar a transição de vídeo (fusão de 1 s) ou a de áudio no corte" },
  { teclas: "Ctrl+Shift+/", acao: "Duplicar os clipes marcados" },
  { teclas: "Ctrl+C  Ctrl+V", acao: "Copiar e colar clipes no cursor" },
  { teclas: "Ctrl+Alt+V", acao: "Colar atributos (cor, efeito, animação...) nos clipes marcados" },
  { teclas: "Ctrl+A  Ctrl+Shift+A", acao: "Marcar todos os clipes e desmarcar" },
  { teclas: "Esc", acao: "Desmarcar" },
  { teclas: "S", acao: "Ligar e desligar o ímã" },
  { teclas: "=  -", acao: "Aproximar e afastar a linha do tempo" },
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
