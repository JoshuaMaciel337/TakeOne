// As opções do painel Histórico do editor de imagem (ADR 0003, onda 13.15), guardadas no navegador: o número de
// estados, o primeiro instantâneo ao abrir, o histórico não linear, a janela do instantâneo novo e se mostrar e
// esconder camadas vira passo.

export type OpcoesDoHistorico = {
  /** Quantos passos o desfazer guarda (de 1 a 1000). */
  estados: number;
  primeiroInstantaneo: boolean;
  naoLinear: boolean;
  janelaDoInstantaneo: boolean;
  visibilidadeDesfazivel: boolean;
};

export const OPCOES_DO_HISTORICO_PADRAO: OpcoesDoHistorico = { estados: 200, primeiroInstantaneo: true, naoLinear: false, janelaDoInstantaneo: false, visibilidadeDesfazivel: true };
export const MAXIMO_DE_ESTADOS = 1000;
const CHAVE = "takeone-opcoes-historico";

/** As opções guardadas, conferidas: o que falta ou não serve volta ao padrão. */
export function lerOpcoesDoHistorico(texto: string | null): OpcoesDoHistorico {
  try {
    const lidas = JSON.parse(texto ?? "null") as Partial<OpcoesDoHistorico> | null;
    if (!lidas || typeof lidas !== "object") return OPCOES_DO_HISTORICO_PADRAO;
    const sim = (chave: keyof Omit<OpcoesDoHistorico, "estados">) => (typeof lidas[chave] === "boolean" ? lidas[chave] : OPCOES_DO_HISTORICO_PADRAO[chave]);
    const estados = Number.isInteger(lidas.estados) && lidas.estados! >= 1 && lidas.estados! <= MAXIMO_DE_ESTADOS ? lidas.estados! : OPCOES_DO_HISTORICO_PADRAO.estados;
    return { estados, primeiroInstantaneo: sim("primeiroInstantaneo"), naoLinear: sim("naoLinear"), janelaDoInstantaneo: sim("janelaDoInstantaneo"), visibilidadeDesfazivel: sim("visibilidadeDesfazivel") };
  } catch {
    return OPCOES_DO_HISTORICO_PADRAO;
  }
}

export function carregarOpcoesDoHistorico(): OpcoesDoHistorico {
  try {
    return lerOpcoesDoHistorico(localStorage.getItem(CHAVE));
  } catch {
    return OPCOES_DO_HISTORICO_PADRAO;
  }
}

export function guardarOpcoesDoHistorico(opcoes: OpcoesDoHistorico) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(opcoes));
  } catch {
    // Sem armazenamento: valem até recarregar
  }
}
