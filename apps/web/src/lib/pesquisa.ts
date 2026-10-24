// Pesquisar (Ctrl+F) do editor de imagem (ADR 0003, onda 13.15): todos os comandos dos menus (com o caminho até eles)
// e as ferramentas numa lista só, procurados sem acento e sem diferença de maiúsculas, pelo começo das palavras; o que
// começa pela busca vem primeiro, depois o que tem todas as palavras no nome, depois no caminho.

export type ItemPesquisavel = { nome: string; caminho: string; atalho?: string; desativado?: boolean; tipo: "comando" | "ferramenta"; acao: () => void; /** A chave do comando (a personalização dos atalhos e dos menus). */ chave?: string };

type ItemDoMenu = "-" | { nome: string; chave?: string; atalho?: string; desativado?: boolean; aoEscolher?: () => void; itens?: ItemDoMenu[] };
type MenuSimples = { nome: string; itens: ItemDoMenu[] };

/** Os comandos dos menus, um por item que faz algo, com o caminho ("Imagem › Ajustes"). */
export function achatarMenus(menus: MenuSimples[]): ItemPesquisavel[] {
  const itens: ItemPesquisavel[] = [];
  const andar = (lista: ItemDoMenu[], caminho: string[], desligado: boolean) => {
    for (const item of lista) {
      if (item === "-") continue;
      if (item.itens) andar(item.itens, [...caminho, item.nome], desligado || Boolean(item.desativado));
      else if (item.aoEscolher) itens.push({ nome: item.nome, caminho: caminho.join(" › "), atalho: item.atalho, desativado: desligado || Boolean(item.desativado), tipo: "comando", acao: item.aoEscolher, chave: item.chave ?? [...caminho, item.nome].join(" › ") });
    }
  };
  for (const menu of menus) andar(menu.itens, [menu.nome], false);
  return itens;
}

export const semAcento = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function procurar(itens: ItemPesquisavel[], busca: string, limite = 60): ItemPesquisavel[] {
  const texto = semAcento(busca.trim());
  if (!texto) return itens.slice(0, limite);
  const palavras = texto.split(/\s+/);
  // Cada palavra da busca casa com o começo de uma palavra (no meio, "matiz" acharia "automatizar")
  const comecos = (texto: string) => texto.split(/[^a-z0-9]+/).filter(Boolean);
  const casa = (lista: string[]) => palavras.every((palavra) => lista.some((p) => p.startsWith(palavra)));
  const notados = itens.flatMap((item) => {
    const nome = semAcento(item.nome);
    const doNome = comecos(nome);
    if (!casa([...doNome, ...comecos(semAcento(item.caminho))])) return [];
    const nota = nome.startsWith(texto) ? 0 : casa(doNome) ? 1 : 3;
    return [{ item, nota }];
  });
  // Os desligados no fim; na mesma nota, os nomes mais curtos primeiro
  notados.sort((a, b) => Number(Boolean(a.item.desativado)) - Number(Boolean(b.item.desativado)) || a.nota - b.nota || a.item.nome.length - b.item.nome.length);
  return notados.slice(0, limite).map(({ item }) => item);
}
