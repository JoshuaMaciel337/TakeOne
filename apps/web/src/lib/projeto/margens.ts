// Guias da prévia: as margens seguras, os terços e as áreas que os aplicativos de vídeo em pé cobrem com
// botões e textos. Só ajudam a pôr as coisas no lugar; nunca saem no vídeo. Tudo em frações do quadro.

export type ModoDasGuias = "desligadas" | "seguras" | "tercos" | "em-pe";

export const MODOS_DAS_GUIAS: { id: ModoDasGuias; nome: string }[] = [
  { id: "desligadas", nome: "Sem guias" },
  { id: "seguras", nome: "Margens seguras" },
  { id: "tercos", nome: "Terços" },
  { id: "em-pe", nome: "Áreas cobertas no celular" },
];

/** Um retângulo em frações do quadro (0 a 1). */
export type Area = { x: number; y: number; largura: number; altura: number };

export type DesenhoDasGuias = {
  /** Linhas tracejadas (as bordas das margens). */
  contornos: Area[];
  /** Linhas retas de um ponto a outro, em frações. */
  linhas: { x1: number; y1: number; x2: number; y2: number }[];
  /** Áreas escurecidas, com o nome do que costuma ficar ali. */
  cobertas: (Area & { nome: string })[];
};

/** Margem da ação (5% de cada lado) e do texto (10%): o padrão de televisão, que vale para qualquer tela. */
export const MARGEM_DA_ACAO = 0.05;
export const MARGEM_DO_TEXTO = 0.1;

/**
 * As áreas que os aplicativos de vídeo curto em pé costumam cobrir: o topo (abas e busca), a coluna de botões à
 * direita e a faixa de baixo (nome, legenda do post e música). São médias de vários aplicativos, com folga; o
 * que fica de fora delas aparece em todos.
 */
export const AREAS_COBERTAS_EM_PE: (Area & { nome: string })[] = [
  { nome: "Abas e busca", x: 0, y: 0, largura: 1, altura: 0.1 },
  { nome: "Botões", x: 0.86, y: 0.42, largura: 0.14, altura: 0.38 },
  { nome: "Nome e descrição", x: 0, y: 0.8, largura: 1, altura: 0.2 },
];

function recuada(margem: number): Area {
  return { x: margem, y: margem, largura: 1 - 2 * margem, altura: 1 - 2 * margem };
}

/** O que desenhar para cada modo. As áreas do celular só fazem sentido em pé; nas outras proporções, as margens. */
export function desenhoDasGuias(modo: ModoDasGuias, emPe: boolean): DesenhoDasGuias {
  const vazio: DesenhoDasGuias = { contornos: [], linhas: [], cobertas: [] };
  if (modo === "seguras" || (modo === "em-pe" && !emPe)) return { ...vazio, contornos: [recuada(MARGEM_DA_ACAO), recuada(MARGEM_DO_TEXTO)] };
  if (modo === "tercos") {
    const tercos = [1 / 3, 2 / 3];
    return {
      ...vazio,
      linhas: [...tercos.map((x) => ({ x1: x, y1: 0, x2: x, y2: 1 })), ...tercos.map((y) => ({ x1: 0, y1: y, x2: 1, y2: y }))],
    };
  }
  if (modo === "em-pe") return { ...vazio, cobertas: AREAS_COBERTAS_EM_PE };
  return vazio;
}

/** O modo seguinte, para o botão que alterna. */
export function proximoModo(modo: ModoDasGuias): ModoDasGuias {
  const indice = MODOS_DAS_GUIAS.findIndex((item) => item.id === modo);
  return MODOS_DAS_GUIAS[(indice + 1) % MODOS_DAS_GUIAS.length].id;
}

export function modoValido(valor: unknown): ModoDasGuias {
  return MODOS_DAS_GUIAS.some((item) => item.id === valor) ? (valor as ModoDasGuias) : "desligadas";
}
