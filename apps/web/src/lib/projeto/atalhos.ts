// Atalhos do editor: as contas que eles fazem (qual clipe o Q e o W aparam, onde fica o corte vizinho) e a
// lista que a janela "?" mostra. Função pura; quem escuta as teclas é o Editor.
import type { Tick } from "../tempo.ts";
import { type Clipe, fimDoClipe, type Projeto } from "./modelo.ts";

/** O grupo da aba na janela de atalhos (ADR 0007, 17.8). */
export type GrupoDeAtalho = "Tocar e andar" | "Cortar e aparar" | "Clipes" | "Linha do tempo" | "Geral";
export type Atalho = { teclas: string; acao: string; grupo: GrupoDeAtalho };
export const GRUPOS_DE_ATALHO: GrupoDeAtalho[] = ["Tocar e andar", "Cortar e aparar", "Clipes", "Linha do tempo", "Geral"];

/** A lista da janela de atalhos, na ordem em que aparece. */
export const ATALHOS: Atalho[] = [
  { teclas: "Espaço", acao: "Tocar e parar", grupo: "Tocar e andar" },
  { teclas: "J  K  L", acao: "Tocar para trás, parar e tocar; J ou L de novo dobra o andamento até 8× (K segurado com J ou L: um quadro)", grupo: "Tocar e andar" },
  { teclas: "← →", acao: "Um quadro para trás ou para a frente (Shift: cinco)", grupo: "Tocar e andar" },
  { teclas: "↑ ↓", acao: "Corte anterior ou seguinte", grupo: "Tocar e andar" },
  { teclas: "Home End", acao: "Começo ou fim da sequência", grupo: "Tocar e andar" },
  { teclas: "I  O", acao: "Marcar a entrada e a saída (Shift: ir até elas; Ctrl+Shift+X limpa)", grupo: "Cortar e aparar" },
  { teclas: ";  '", acao: "Elevar (deixa o espaço) e extrair (fecha o espaço) o trecho entre a entrada e a saída", grupo: "Cortar e aparar" },
  { teclas: "M", acao: "Pôr um marcador no cursor", grupo: "Linha do tempo" },
  { teclas: "Shift+M  Ctrl+Shift+M", acao: "Marcador seguinte ou anterior (também Shift+↓ e Shift+↑)", grupo: "Linha do tempo" },
  { teclas: "Ctrl+K  ou  Ctrl+B", acao: "Adicionar edição: dividir no cursor", grupo: "Cortar e aparar" },
  { teclas: "Q", acao: "Apagar do começo do clipe até o cursor", grupo: "Cortar e aparar" },
  { teclas: "W", acao: "Apagar do cursor até o fim do clipe", grupo: "Cortar e aparar" },
  { teclas: "V A Shift+A B N R C Y H Z T", acao: "Ferramentas da linha do tempo: seleção, faixa adiante, faixa para trás, ondulação, contínua, esticar a velocidade, navalha, deslizar, mão, zoom e texto (na tela larga)", grupo: "Linha do tempo" },
  { teclas: "Alt+← Alt+→", acao: "Empurrar os clipes marcados um quadro (Shift: cinco)", grupo: "Clipes" },
  { teclas: "Alt + arrastar o clipe", acao: "Deslizar o conteúdo: o clipe fica no lugar e mostra outro trecho da mídia", grupo: "Cortar e aparar" },
  { teclas: "Alt + arrastar a borda", acao: "Mover o corte entre dois clipes encostados: um cresce o que o outro encolhe", grupo: "Cortar e aparar" },
  { teclas: "Delete  Shift+Delete", acao: "Apagar os clipes marcados (Shift: e fechar o espaço)", grupo: "Clipes" },
  { teclas: "Ctrl+D  Ctrl+Shift+D", acao: "Aplicar a transição de vídeo (fusão de 1 s) ou a de áudio no corte", grupo: "Clipes" },
  { teclas: "Ctrl+Shift+/", acao: "Duplicar os clipes marcados", grupo: "Clipes" },
  { teclas: "Ctrl+C  Ctrl+V", acao: "Copiar e colar clipes no cursor", grupo: "Clipes" },
  { teclas: "Ctrl+Alt+V", acao: "Colar atributos (cor, efeito, animação...) nos clipes marcados", grupo: "Clipes" },
  { teclas: "Ctrl+A  Ctrl+Shift+A", acao: "Marcar todos os clipes e desmarcar", grupo: "Clipes" },
  { teclas: "Esc", acao: "Desmarcar", grupo: "Clipes" },
  { teclas: "S", acao: "Ligar e desligar o ímã", grupo: "Linha do tempo" },
  { teclas: "=  -", acao: "Aproximar e afastar a linha do tempo", grupo: "Linha do tempo" },
  { teclas: "Ctrl+Z  Ctrl+Shift+Z", acao: "Desfazer e refazer", grupo: "Geral" },
  { teclas: "Ctrl+E", acao: "Exportar", grupo: "Geral" },
  { teclas: "Shift+Z", acao: "Ver o projeto inteiro na linha do tempo", grupo: "Linha do tempo" },
  { teclas: "Botão direito", acao: "O menu do clipe ou do vazio na linha do tempo (com a IA no clipe)", grupo: "Clipes" },
  { teclas: "Arrastar no vazio", acao: "Escolher os clipes de uma caixa na linha do tempo (Shift soma)", grupo: "Clipes" },
  { teclas: "?", acao: "Esta lista", grupo: "Geral" },
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
