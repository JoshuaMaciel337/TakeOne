// As áreas de trabalho dos editores (ADR 0002): cada área é um conjunto de colunas de grupos de painéis com abas,
// como nos programas profissionais. As contas são puras (sem React), para os testes; o estado de cada área fica no
// navegador (useAreaDeTrabalho), e "Restaurar" volta ao desenho padrão dela.

/** Um grupo de painéis com abas: os ids dos painéis, o da aba ativa, recolhido (só a faixa de abas) e a altura. */
export type GrupoDaArea = { id: string; abas: string[]; ativa: string; recolhido?: boolean; altura?: number };

/** As colunas da área, cada uma com os grupos de cima para baixo. */
export type EstadoDaArea = Record<string, GrupoDaArea[]>;

function copia(estado: EstadoDaArea): EstadoDaArea {
  return Object.fromEntries(Object.entries(estado).map(([coluna, grupos]) => [coluna, grupos.map((grupo) => ({ ...grupo, abas: [...grupo.abas] }))]));
}

/** Onde o painel está: a coluna e o índice do grupo, ou null. */
export function ondeEsta(estado: EstadoDaArea, painel: string): { coluna: string; indice: number } | null {
  for (const [coluna, grupos] of Object.entries(estado)) {
    const indice = grupos.findIndex((grupo) => grupo.abas.includes(painel));
    if (indice >= 0) return { coluna, indice };
  }
  return null;
}

export function painelAberto(estado: EstadoDaArea, painel: string): boolean {
  return ondeEsta(estado, painel) !== null;
}

/** Fecha o painel; o grupo que fica sem abas sai, e a aba ativa passa à vizinha. */
export function fecharPainel(estado: EstadoDaArea, painel: string): EstadoDaArea {
  const lugar = ondeEsta(estado, painel);
  if (!lugar) return estado;
  const novo = copia(estado);
  const grupos = novo[lugar.coluna];
  const grupo = grupos[lugar.indice];
  const posicao = grupo.abas.indexOf(painel);
  grupo.abas.splice(posicao, 1);
  if (!grupo.abas.length) grupos.splice(lugar.indice, 1);
  else if (grupo.ativa === painel) grupo.ativa = grupo.abas[Math.max(0, posicao - 1)];
  return novo;
}

/** Fecha o grupo inteiro (todas as abas dele). */
export function fecharGrupo(estado: EstadoDaArea, grupoId: string): EstadoDaArea {
  const novo = copia(estado);
  for (const coluna of Object.keys(novo)) novo[coluna] = novo[coluna].filter((grupo) => grupo.id !== grupoId);
  return novo;
}

/**
 * Abre o painel e deixa a aba dele ativa. Fechado, ele volta ao grupo onde fica no desenho padrão (se o grupo ainda
 * existe) ou num grupo próprio, no lugar do padrão na coluna.
 */
export function abrirPainel(estado: EstadoDaArea, painel: string, padrao: EstadoDaArea): EstadoDaArea {
  const lugar = ondeEsta(estado, painel);
  const novo = copia(estado);
  if (lugar) {
    const grupo = novo[lugar.coluna][lugar.indice];
    grupo.ativa = painel;
    grupo.recolhido = false;
    return novo;
  }
  const doPadrao = ondeEsta(padrao, painel) ?? { coluna: Object.keys(padrao)[0], indice: 0 };
  const grupoPadrao = padrao[doPadrao.coluna]?.[doPadrao.indice];
  const grupos = (novo[doPadrao.coluna] ??= []);
  const existente = grupoPadrao ? grupos.find((grupo) => grupo.id === grupoPadrao.id) : undefined;
  if (existente) {
    // Na ordem do padrão, entre as abas que estão abertas
    const ordem = grupoPadrao!.abas;
    existente.abas.push(painel);
    existente.abas.sort((a, b) => (ordem.indexOf(a) === -1 ? 99 : ordem.indexOf(a)) - (ordem.indexOf(b) === -1 ? 99 : ordem.indexOf(b)));
    existente.ativa = painel;
    existente.recolhido = false;
    return novo;
  }
  const grupoNovo: GrupoDaArea = { id: grupoPadrao?.id ?? `grupo-${painel}`, abas: [painel], ativa: painel, altura: grupoPadrao?.altura };
  // No lugar do padrão: depois do último grupo aberto que vem antes dele no desenho padrão
  const antes = (padrao[doPadrao.coluna] ?? []).slice(0, doPadrao.indice).map((grupo) => grupo.id);
  let posicao = 0;
  grupos.forEach((grupo, i) => {
    if (antes.includes(grupo.id)) posicao = i + 1;
  });
  grupos.splice(posicao, 0, grupoNovo);
  return novo;
}

/** Abre ou fecha o painel (o item do menu Janela). */
export function alternarPainel(estado: EstadoDaArea, painel: string, padrao: EstadoDaArea): EstadoDaArea {
  return painelAberto(estado, painel) ? fecharPainel(estado, painel) : abrirPainel(estado, painel, padrao);
}

export function ativarAba(estado: EstadoDaArea, grupoId: string, painel: string): EstadoDaArea {
  const novo = copia(estado);
  for (const grupos of Object.values(novo)) {
    const grupo = grupos.find((item) => item.id === grupoId);
    if (grupo && grupo.abas.includes(painel)) {
      grupo.ativa = painel;
      grupo.recolhido = false;
    }
  }
  return novo;
}

export function alternarRecolhido(estado: EstadoDaArea, grupoId: string): EstadoDaArea {
  const novo = copia(estado);
  for (const grupos of Object.values(novo)) {
    const grupo = grupos.find((item) => item.id === grupoId);
    if (grupo) grupo.recolhido = !grupo.recolhido;
  }
  return novo;
}

export function mudarAltura(estado: EstadoDaArea, grupoId: string, altura: number): EstadoDaArea {
  const novo = copia(estado);
  for (const grupos of Object.values(novo)) {
    const grupo = grupos.find((item) => item.id === grupoId);
    if (grupo) grupo.altura = Math.round(altura);
  }
  return novo;
}

/** Sobe ou desce o grupo na coluna dele. */
export function moverGrupo(estado: EstadoDaArea, grupoId: string, passo: -1 | 1): EstadoDaArea {
  const novo = copia(estado);
  for (const grupos of Object.values(novo)) {
    const i = grupos.findIndex((grupo) => grupo.id === grupoId);
    const j = i + passo;
    if (i >= 0 && j >= 0 && j < grupos.length) [grupos[i], grupos[j]] = [grupos[j], grupos[i]];
  }
  return novo;
}

/** O estado guardado só vale se cada painel aparece uma vez e todos existem; senão volta o padrão. */
export function estadoValido(estado: unknown, paineis: readonly string[]): estado is EstadoDaArea {
  if (!estado || typeof estado !== "object") return false;
  const vistos = new Set<string>();
  for (const grupos of Object.values(estado as Record<string, unknown>)) {
    if (!Array.isArray(grupos)) return false;
    for (const grupo of grupos as GrupoDaArea[]) {
      if (!grupo || typeof grupo.id !== "string" || !Array.isArray(grupo.abas) || !grupo.abas.length || !grupo.abas.includes(grupo.ativa)) return false;
      for (const aba of grupo.abas) {
        if (!paineis.includes(aba) || vistos.has(aba)) return false;
        vistos.add(aba);
      }
    }
  }
  return true;
}
