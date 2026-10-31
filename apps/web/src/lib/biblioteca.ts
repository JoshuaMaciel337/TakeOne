// A biblioteca de modelos do hub: os modelos de projeto prontos (lib/projeto/modelos.ts), os do espaço (o
// projeto de alguém salvo como modelo, na API), os modelos de imagem (lib/projeto/modelosDeImagem.ts) e as animações. Tudo vira um item só, que as abas, a busca,
// os filtros e a ordem tratam igual. Função pura; quem carrega e mostra é a página Modelos.
import { TAMANHOS_PRONTOS } from "./projeto/imagem.ts";
import type { ModeloDeProjeto } from "./projeto/modelos.ts";
import type { ModeloDeImagem } from "./projeto/modelosDeImagem.ts";

export type TipoDeItem = "projeto" | "espaco" | "imagem" | "animacao";

/** Um modelo do espaço, como a API devolve (sem a linha do tempo). */
export type ModeloDoEspaco = {
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  proporcao: string;
  duracao: number;
  capa_midia_id: string | null;
  vagas: { clipe_id: string; tipo: "midia" | "texto"; rotulo: string }[];
  criado_por_nome: string;
  criado_em: string;
};

/** Uma animação da biblioteca, como /api/animacoes/modelos devolve (só o que a biblioteca usa). */
export type AnimacaoDaBiblioteca = { id: string; nome: string; descricao: string; duracao: number; categoria: string; nome_da_categoria: string; temas: { id: string; nome: string }[] };

export type ItemDaBiblioteca = {
  /** O que vai nos salvos e nos usos: o id do modelo, ou "animacao-<id>" (os ids podem coincidir). */
  chave: string;
  tipo: TipoDeItem;
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  /** null nas animações, que se ajustam a qualquer formato. Nos modelos de imagem, o nome do tamanho. */
  proporcao: string | null;
  duracaoS: number;
  usos: number;
  salvo: boolean;
  destaque: boolean;
  /** Para "Novos": a posição de entrada (maior é mais novo). */
  ordemDeEntrada: number;
  /** Texto a mais que a busca encontra (temas das animações, quem criou o modelo). */
  palavras: string;
  /** Do espaço: a capa e quantas coisas trocar. Das animações: a categoria das ferramentas do editor. */
  capaMidiaId?: string | null;
  vagas?: number;
  cenas?: number;
  grupo?: "texto" | "elementos";
};

export type Aba = "todos" | "espaco" | "salvos" | "destaques";
export type Ordem = "populares" | "novos" | "nome";
export type Filtros = { aba: Aba; busca: string; formato: string; categoria: string; ordem: Ordem };

export const ABAS: { id: Aba; nome: string }[] = [
  { id: "todos", nome: "Todos" },
  { id: "espaco", nome: "Criados no espaço" },
  { id: "salvos", nome: "Salvos" },
  { id: "destaques", nome: "Destaques" },
];

export const ORDENS: { id: Ordem; nome: string }[] = [
  { id: "populares", nome: "Populares" },
  { id: "novos", nome: "Novos" },
  { id: "nome", nome: "Nome" },
];

/** As categorias de animação que ficam na ferramenta Texto do editor (o resto fica em Elementos). */
export const CATEGORIAS_DE_TEXTO = new Set(["titulos", "ganchos", "tarjas", "citacoes"]);

export function chaveDaAnimacao(id: string): string {
  return `animacao-${id}`;
}

type Base = { salvos: string[]; usos: Record<string, number> };

/** Os modelos de projeto, os prontos e os do espaço, como itens. Os do espaço são os mais novos. */
export function itensDeProjeto(prontos: ModeloDeProjeto[], doEspaco: ModeloDoEspaco[], { salvos, usos }: Base): ItemDaBiblioteca[] {
  const salvo = new Set(salvos);
  const dePronto = prontos.map<ItemDaBiblioteca>((modelo, i) => ({
    chave: modelo.id,
    tipo: "projeto",
    id: modelo.id,
    nome: modelo.nome,
    descricao: modelo.descricao,
    categoria: modelo.categoria,
    proporcao: modelo.proporcao,
    duracaoS: modelo.cenas.reduce((soma, cena) => soma + cena.duracaoS, 0),
    usos: usos[modelo.id] ?? 0,
    salvo: salvo.has(modelo.id),
    destaque: Boolean(modelo.destaque),
    ordemDeEntrada: i,
    palavras: "",
    cenas: modelo.cenas.length,
  }));
  // A API manda os do espaço do mais novo para o mais antigo
  const doEspacoItens = doEspaco.map<ItemDaBiblioteca>((modelo, i) => ({
    chave: modelo.id,
    tipo: "espaco",
    id: modelo.id,
    nome: modelo.nome,
    descricao: modelo.descricao,
    categoria: modelo.categoria,
    proporcao: modelo.proporcao,
    duracaoS: modelo.duracao / 254016000000,
    usos: usos[modelo.id] ?? 0,
    salvo: salvo.has(modelo.id),
    destaque: false,
    ordemDeEntrada: prontos.length + doEspaco.length - i,
    palavras: modelo.criado_por_nome,
    capaMidiaId: modelo.capa_midia_id,
    vagas: modelo.vagas.length,
  }));
  return [...doEspacoItens, ...dePronto];
}

/** O nome do tamanho pronto ("Post quadrado"), ou a largura e a altura. */
export function nomeDoTamanho({ largura, altura }: { largura: number; altura: number }): string {
  return TAMANHOS_PRONTOS.find((item) => item.largura === largura && item.altura === altura)?.nome ?? `${largura} × ${altura}`;
}

/** Os modelos de imagem como itens; o formato é o nome do tamanho. */
export function itensDeImagem(modelos: ModeloDeImagem[], { salvos, usos }: Base): ItemDaBiblioteca[] {
  const salvo = new Set(salvos);
  return modelos.map((modelo, i) => ({
    chave: modelo.id,
    tipo: "imagem",
    id: modelo.id,
    nome: modelo.nome,
    descricao: modelo.descricao,
    categoria: modelo.categoria,
    proporcao: nomeDoTamanho(modelo.tamanho),
    duracaoS: 0,
    usos: usos[modelo.id] ?? 0,
    salvo: salvo.has(modelo.id),
    destaque: Boolean(modelo.destaque),
    ordemDeEntrada: i,
    palavras: "",
  }));
}

/** As animações como itens; os desenhos (sem tema) entram como destaque. */
export function itensDeAnimacao(animacoes: AnimacaoDaBiblioteca[], { salvos, usos }: Base): ItemDaBiblioteca[] {
  const salvo = new Set(salvos);
  return animacoes.map((animacao, i) => {
    const chave = chaveDaAnimacao(animacao.id);
    return {
      chave,
      tipo: "animacao",
      id: animacao.id,
      nome: animacao.nome,
      descricao: animacao.descricao,
      categoria: animacao.nome_da_categoria,
      proporcao: null,
      duracaoS: animacao.duracao,
      usos: usos[chave] ?? 0,
      salvo: salvo.has(chave),
      destaque: animacao.temas.length === 0,
      ordemDeEntrada: i,
      palavras: animacao.temas.map((tema) => tema.nome).join(" "),
      grupo: CATEGORIAS_DE_TEXTO.has(animacao.categoria) ? "texto" : "elementos",
    };
  });
}

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Os itens da aba, da busca (sem diferenciar acento nem maiúscula), do formato e da categoria, na ordem pedida. */
export function filtrarItens(itens: ItemDaBiblioteca[], filtros: Filtros): ItemDaBiblioteca[] {
  const busca = normalizar(filtros.busca.trim());
  const ficam = itens.filter(
    (item) =>
      (filtros.aba === "todos" ||
        (filtros.aba === "espaco" && item.tipo === "espaco") ||
        (filtros.aba === "salvos" && item.salvo) ||
        (filtros.aba === "destaques" && item.destaque)) &&
      (!filtros.formato || item.proporcao === filtros.formato) &&
      (!filtros.categoria || item.categoria === filtros.categoria) &&
      (!busca || normalizar(`${item.nome} ${item.descricao} ${item.categoria} ${item.palavras}`).includes(busca)),
  );
  const desempate = (a: ItemDaBiblioteca, b: ItemDaBiblioteca) => a.nome.localeCompare(b.nome, "pt-BR");
  const ordenar: Record<Ordem, (a: ItemDaBiblioteca, b: ItemDaBiblioteca) => number> = {
    // Sem uso nenhum, os destaques vêm primeiro, e a ordem do catálogo depois
    populares: (a, b) => b.usos - a.usos || Number(b.destaque) - Number(a.destaque) || a.ordemDeEntrada - b.ordemDeEntrada,
    novos: (a, b) => b.ordemDeEntrada - a.ordemDeEntrada || desempate(a, b),
    nome: desempate,
  };
  return [...ficam].sort(ordenar[filtros.ordem]);
}

/** As categorias dos itens, na ordem em que aparecem. */
export function categoriasDos(itens: ItemDaBiblioteca[]): string[] {
  return [...new Set(itens.map((item) => item.categoria))];
}

/** Guarda ou tira dos salvos; o mais recente vem primeiro. */
export function alternarSalvo(salvos: string[], chave: string): string[] {
  return salvos.includes(chave) ? salvos.filter((item) => item !== chave) : [chave, ...salvos];
}

/** "1 uso", "12 usos", "1,2 mil usos". */
export function textoDeUsos(usos: number): string {
  if (usos >= 1000) return `${(usos / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil usos`;
  return `${usos} ${usos === 1 ? "uso" : "usos"}`;
}
