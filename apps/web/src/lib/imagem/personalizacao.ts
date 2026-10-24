// A personalização do editor de imagem (ADR 0003, onda 13.15), guardada no navegador: os atalhos dos comandos dos
// menus, os itens escondidos e coloridos, as teclas das ferramentas, as ferramentas tiradas da caixa e as colunas
// dela. Cada comando é achado pela chave dele (o caminho e o nome, ou a chave fixa dos itens de nome que muda, como
// "Desfazer <passo>").

export type CorDoItem = "vermelho" | "laranja" | "amarelo" | "verde" | "azul" | "violeta" | "cinza";
export const CORES_DOS_ITENS: { id: CorDoItem; nome: string; fundo: string }[] = [
  { id: "vermelho", nome: "Vermelho", fundo: "rgba(255, 69, 58, 0.28)" },
  { id: "laranja", nome: "Laranja", fundo: "rgba(255, 159, 10, 0.28)" },
  { id: "amarelo", nome: "Amarelo", fundo: "rgba(255, 214, 10, 0.28)" },
  { id: "verde", nome: "Verde", fundo: "rgba(50, 215, 75, 0.25)" },
  { id: "azul", nome: "Azul", fundo: "rgba(10, 132, 255, 0.28)" },
  { id: "violeta", nome: "Violeta", fundo: "rgba(191, 90, 242, 0.28)" },
  { id: "cinza", nome: "Cinza", fundo: "rgba(142, 142, 147, 0.3)" },
];

export type Personalizacao = {
  /** Pela chave do comando: o atalho novo ("" tira o atalho). */
  atalhos: Record<string, string>;
  /** Pela ferramenta: a tecla nova ("" tira a tecla). */
  teclas: Record<string, string>;
  ocultos: string[];
  cores: Record<string, CorDoItem>;
  ferramentasOcultas: string[];
  colunas: 1 | 2;
};

export const PERSONALIZACAO_PADRAO: Personalizacao = { atalhos: {}, teclas: {}, ocultos: [], cores: {}, ferramentasOcultas: [], colunas: 1 };

type Item = "-" | { nome: string; chave?: string; atalho?: string; aoEscolher?: () => void; itens?: Item[]; cor?: string; [outro: string]: unknown };
type Menu = { nome: string; itens: Item[] };

export const chaveDoItem = (caminho: string[], item: { nome: string; chave?: string }) => item.chave ?? [...caminho, item.nome].join(" › ");

/**
 * Os menus com a personalização: o atalho trocado, a cor do item e, sem `mostrarTudo`, sem os escondidos (e sem os
 * submenus que ficam vazios). Os separadores que ficariam sobrando saem.
 */
export function personalizarMenus<M extends Menu>(menus: M[], p: Personalizacao, mostrarTudo = false): M[] {
  const ocultos = new Set(p.ocultos);
  const andar = (itens: Item[], caminho: string[]): Item[] => {
    const saida: Item[] = [];
    for (const item of itens) {
      if (item === "-") {
        if (saida.length && saida[saida.length - 1] !== "-") saida.push("-");
        continue;
      }
      const chave = chaveDoItem(caminho, item);
      if (item.itens) {
        const dentro = andar(item.itens, [...caminho, item.nome]);
        if (dentro.some((x) => x !== "-")) saida.push({ ...item, itens: dentro });
        continue;
      }
      if (!mostrarTudo && ocultos.has(chave)) continue;
      const atalho = chave in p.atalhos ? p.atalhos[chave] || undefined : item.atalho;
      const cor = p.cores[chave] ? CORES_DOS_ITENS.find((c) => c.id === p.cores[chave])?.fundo : undefined;
      saida.push({ ...item, atalho, ...(cor ? { cor } : {}) });
    }
    while (saida[saida.length - 1] === "-") saida.pop();
    return saida;
  };
  return menus.map((menu) => ({ ...menu, itens: andar(menu.itens, [menu.nome]) }));
}

/** A tecla da ferramenta com a personalização. */
export function teclaDaFerramenta(item: { id: string; tecla: string }, p: Personalizacao): string {
  return item.id in p.teclas ? p.teclas[item.id] : item.tecla;
}

/** Os atalhos usados por mais de um comando (o aviso da janela), pela tecla normalizada. */
export function atalhosRepetidos(usados: { chave: string; atalho?: string }[]): Map<string, string[]> {
  const por = new Map<string, string[]>();
  for (const { chave, atalho } of usados) {
    for (const parte of (atalho ?? "").split(" ou ").filter(Boolean)) por.set(parte, [...(por.get(parte) ?? []), chave]);
  }
  return new Map([...por].filter(([, chaves]) => chaves.length > 1));
}

/** Os atalhos que o navegador não deixa a página pegar. */
export const ATALHOS_DO_NAVEGADOR = new Set(["Ctrl+N", "Ctrl+T", "Ctrl+W", "Ctrl+Shift+N", "Ctrl+Shift+T", "Ctrl+Shift+W", "Ctrl+Tab", "Ctrl+Shift+Tab", "F11", "F12", "Alt+F4"]);

const CHAVE = "takeone-personalizacao-imagem";

export function lerPersonalizacao(texto: string | null): Personalizacao {
  try {
    const lida = JSON.parse(texto ?? "null") as Partial<Personalizacao> | null;
    if (!lida || typeof lida !== "object") return PERSONALIZACAO_PADRAO;
    const textos = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string")) : {});
    const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    const cores = Object.fromEntries(Object.entries(textos(lida.cores)).filter(([, c]) => CORES_DOS_ITENS.some((cor) => cor.id === c))) as Record<string, CorDoItem>;
    return { atalhos: textos(lida.atalhos), teclas: textos(lida.teclas), ocultos: lista(lida.ocultos), cores, ferramentasOcultas: lista(lida.ferramentasOcultas), colunas: lida.colunas === 2 ? 2 : 1 };
  } catch {
    return PERSONALIZACAO_PADRAO;
  }
}

export function carregarPersonalizacao(): Personalizacao {
  try {
    return lerPersonalizacao(localStorage.getItem(CHAVE));
  } catch {
    return PERSONALIZACAO_PADRAO;
  }
}

export function guardarPersonalizacao(p: Personalizacao) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(p));
  } catch {
    // Sem armazenamento: vale até recarregar
  }
}
