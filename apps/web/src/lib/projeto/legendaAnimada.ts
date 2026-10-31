// Legendas animadas (o Clipar, ADR 0004, 14.12a). A trilha sai das legendas que o projeto já tem (as da fala, com o
// tempo de cada palavra e as palavras-chave da ênfase): as palavras vão para a API em segundos desde o começo da
// trilha, o worker grava o vídeo com transparência (core/legendas/motor.js) e o clipe dele entra numa faixa por cima,
// com a faixa de legendas escondida (as duas juntas mostrariam o texto duas vezes). Funções puras.
import { TICKS_POR_SEGUNDO, type Tick, quadroMaisProximo } from "../tempo.ts";
import { adicionarClipe, type Contexto, ErroEdicao } from "./edicao.ts";
import { type Faixa, fimDoClipe, type Projeto } from "./modelo.ts";
import { palavrasDoTexto } from "./texto.ts";

/** As categorias da biblioteca de legendas animadas (core/legendas/estilos.json). */
export const CATEGORIAS_ANIMADAS: { id: string; nome: string }[] = [
  { id: "editorial", nome: "Editorial" },
  { id: "palavra", nome: "Uma palavra por vez" },
  { id: "fala", nome: "Destaque da fala" },
  { id: "caixas", nome: "Caixas e fundos" },
  { id: "efeitos", nome: "Efeitos" },
];

/** Os estilos do motor (core/legendas/estilos.json, lidos pelo Python e pelo motor): o id, o nome, a categoria e a
 * descrição na tela. O teste confere que a lista é a mesma do arquivo. */
export const ESTILOS_ANIMADOS: { id: string; nome: string; categoria: string; descricao: string }[] = [
  { id: "editorial", nome: "Editorial", categoria: "editorial", descricao: "Serifada condensada em caixa alta, a palavra forte em itálico dourado." },
  { id: "assinatura", nome: "Assinatura", categoria: "editorial", descricao: "Caixa alta limpa e a palavra forte escrita à mão, grande, na cor de destaque." },
  { id: "revista", nome: "Revista", categoria: "editorial", descricao: "Letras altas e estreitas; os conectivos pequenos em serifada itálica; os números contam." },
  { id: "manchete", nome: "Manchete", categoria: "editorial", descricao: "Linhas desencontradas, a palavra forte numa serifada pesada e enorme." },
  { id: "enfase_gigante", nome: "Ênfase gigante", categoria: "editorial", descricao: "A frase pequena e a palavra forte enorme, sozinha na linha, entrando com mola." },
  { id: "serifa_apoio", nome: "Serifada de apoio", categoria: "editorial", descricao: "Palavras pesadas em caixa alta, com os conectivos em serifada itálica pequena entre elas." },
  { id: "empilhado", nome: "Empilhado", categoria: "editorial", descricao: "Uma palavra por linha, apertadas umas nas outras, a forte maior e colorida." },
  { id: "desencontrado", nome: "Desencontrado", categoria: "editorial", descricao: "Linhas puxadas para um lado e para o outro, em letras altas, subindo uma a uma." },
  { id: "classico", nome: "Clássico", categoria: "editorial", descricao: "Serifada de livro, em letras normais, entrando devagar." },
  { id: "suave", nome: "Suave", categoria: "editorial", descricao: "Serifada itálica em minúsculas, discreta, para falas calmas." },
  { id: "uma_palavra", nome: "Uma palavra por vez", categoria: "palavra", descricao: "Só a palavra falada, em negrito, entrando com um pulo curto." },
  { id: "minusculas", nome: "Minúsculas", categoria: "palavra", descricao: "Uma palavra por vez, em minúsculas, discreta." },
  { id: "palavra_gigante", nome: "Palavra gigante", categoria: "palavra", descricao: "Uma palavra por vez, enorme, chegando de perto, com contorno fino." },
  { id: "palavra_desfoque", nome: "Desfoque", categoria: "palavra", descricao: "Uma palavra por vez, saindo do desfoque." },
  { id: "palavra_lado", nome: "Deslizando", categoria: "palavra", descricao: "Uma palavra por vez, deslizando da esquerda." },
  { id: "palavra_girando", nome: "Girando", categoria: "palavra", descricao: "Uma palavra por vez, entrando girada e parando com mola." },
  { id: "palavra_caindo", nome: "Caindo", categoria: "palavra", descricao: "Uma palavra por vez, caindo de cima e quicando." },
  { id: "palavra_caixa", nome: "Palavra na caixa", categoria: "palavra", descricao: "Uma palavra por vez, numa caixa de cor que muda a cada palavra." },
  { id: "pulando", nome: "Palavra pulando", categoria: "fala", descricao: "A frase inteira, com a palavra falada pulando e na cor de destaque." },
  { id: "caixa_falada", nome: "Caixa na palavra falada", categoria: "fala", descricao: "A palavra falada ganha uma caixa colorida atrás." },
  { id: "karaoke", nome: "Karaokê", categoria: "fala", descricao: "A frase inteira, e a cor vai preenchendo cada palavra no ritmo da fala." },
  { id: "karaoke_caixa", nome: "Karaokê em caixa", categoria: "fala", descricao: "A frase numa caixa escura, com as palavras acendendo na cor de destaque conforme são ditas." },
  { id: "marca_texto", nome: "Marca-texto", categoria: "fala", descricao: "A palavra falada é riscada por um marca-texto que cresce enquanto ela é dita." },
  { id: "falada_maior", nome: "Palavra falada maior", categoria: "fala", descricao: "A frase inteira; a palavra falada cresce e muda de cor." },
  { id: "acendendo", nome: "Acendendo", categoria: "fala", descricao: "A frase aparece apagada e cada palavra acende quando é dita." },
  { id: "sublinhado", nome: "Sublinhado", categoria: "fala", descricao: "Um traço grosso corre embaixo da palavra falada." },
  { id: "caixas", nome: "Caixas coloridas", categoria: "caixas", descricao: "Cada palavra numa caixa, que entra girando um pouco." },
  { id: "etiqueta", nome: "Etiqueta", categoria: "caixas", descricao: "Cada linha numa faixa branca, com as letras pretas; a palavra forte na cor de destaque." },
  { id: "faixa", nome: "Faixa", categoria: "caixas", descricao: "Uma faixa de cor de lado a lado atrás da frase, com as letras brancas deslizando." },
  { id: "cinema", nome: "Cinema", categoria: "caixas", descricao: "Legenda de filme: letras normais numa caixa escura e translúcida." },
  { id: "pilulas", nome: "Pílulas", categoria: "caixas", descricao: "Cada palavra numa pílula da cor da marca, que entra crescendo; a forte em outra cor." },
  { id: "digitacao", nome: "Digitação", categoria: "caixas", descricao: "As letras aparecem no ritmo da fala, com o cursor piscando." },
  { id: "terminal", nome: "Terminal", categoria: "caixas", descricao: "Letras verdes de computador numa tela preta, digitadas com o cursor." },
  { id: "contorno", nome: "Contorno grosso", categoria: "efeitos", descricao: "Letras grossas com contorno preto; a palavra falada em amarelo." },
  { id: "neon", nome: "Néon", categoria: "efeitos", descricao: "Letras com brilho de néon, acendendo uma a uma." },
  { id: "vazado", nome: "Vazado", categoria: "efeitos", descricao: "Só o contorno das letras; a palavra falada se enche de cor." },
  { id: "sombra_dura", nome: "Sombra dura", categoria: "efeitos", descricao: "Letras redondas e grossas com uma sombra sólida deslocada, como um adesivo." },
  { id: "quadrinhos", nome: "Quadrinhos", categoria: "efeitos", descricao: "Letras de gibi com contorno e sombra, cada palavra entrando torta." },
  { id: "degrade", nome: "Degradê", categoria: "efeitos", descricao: "Letras pesadas pintadas num degradê das cores da marca." },
  { id: "glitch", nome: "Falha digital", categoria: "efeitos", descricao: "Cada palavra chega tremendo em vermelho e azul, como uma tela com defeito." },
  { id: "marcador", nome: "Escrito à mão", categoria: "efeitos", descricao: "Letras de pincel atômico, um pouco tortas, aparecendo letra a letra." },
  { id: "letreiro", nome: "Letreiro", categoria: "efeitos", descricao: "Letras grandes que sobem letra a letra, com os números contando." },
];

/** A trilha vai até 5 minutos (DURACAO_MAXIMA do Python). */
export const DURACAO_MAXIMA_S = 300;
/** A última palavra fica um pouco na tela depois do fim da última legenda. */
const SOBRA_NO_FIM_S = 0.3;

export type PalavraAnimada = { texto: string; inicio: number; fim: number; enfase: boolean };

export type PedidoDaLegenda = {
  faixaId: string;
  /** Onde a trilha começa na linha do tempo (um quadro). */
  inicio: Tick;
  duracao: number;
  palavras: PalavraAnimada[];
  /** O texto e a ênfase vêm da primeira legenda; a caixa e o néon, do kit de marca. */
  cores: { texto?: string; enfase?: string; caixa?: string; neon?: string };
  /** O centro do bloco, em fração da altura (de cima para baixo). */
  posicao: number;
};

const COR = /^#[0-9a-fA-F]{6}$/;

/** A faixa de legendas que vira trilha: a primeira que está à vista e tem legendas. */
export function faixaDasLegendas(projeto: Projeto): Faixa | null {
  return projeto.faixas.find((faixa) => faixa.tipo === "legenda" && !faixa.oculta && faixa.clipes.some((clipe) => clipe.texto)) ?? null;
}

/**
 * As palavras das legendas no tempo da trilha. Cada palavra começa no tempo dela (os tempos da fala; sem eles, as
 * palavras dividem a legenda pelo número de letras) e vai até a seguinte ou até o fim da legenda; a ênfase são as
 * palavras-chave. O texto, a ênfase e o lugar vêm da primeira legenda, para a trilha manter o estilo que a pessoa
 * escolheu; as caixas e o néon, das cores do kit de marca (a segunda e a terceira, ou a principal), quando há.
 */
export function pedidoDasLegendas(projeto: Projeto, coresDaMarca: string[] = []): PedidoDaLegenda {
  const faixa = faixaDasLegendas(projeto);
  if (!faixa) throw new ErroEdicao("O projeto não tem legendas para animar. Crie as legendas da fala antes.");
  const clipes = [...faixa.clipes].filter((clipe) => clipe.texto).sort((a, b) => a.inicio - b.inicio);
  const inicio = quadroMaisProximo(projeto.taxa, clipes[0].inicio);
  const fim = Math.max(...clipes.map(fimDoClipe));
  const duracao = Math.round(((fim - inicio) / TICKS_POR_SEGUNDO + SOBRA_NO_FIM_S) * 1000) / 1000;
  if (duracao > DURACAO_MAXIMA_S) throw new ErroEdicao("A legenda animada vai até 5 minutos. Divida o vídeo ou anime um trecho menor.");
  const segundos = (t: Tick) => Math.round(((t - inicio) / TICKS_POR_SEGUNDO) * 1000) / 1000;
  const palavras: PalavraAnimada[] = [];
  for (const clipe of clipes) {
    const texto = clipe.texto!;
    const lista = palavrasDoTexto(texto.conteudo);
    if (!lista.length) continue;
    const letras = lista.reduce((soma, p) => soma + p.length, 0);
    let andado = 0;
    const tempos =
      texto.tempos && texto.tempos.length === lista.length
        ? texto.tempos
        : lista.map((p) => {
            const t = (clipe.duracao * andado) / letras;
            andado += p.length;
            return t;
          });
    const chave = new Set(texto.palavras_chave ?? []);
    lista.forEach((p, i) => {
      const de = clipe.inicio + tempos[i];
      const ate = i + 1 < lista.length ? clipe.inicio + tempos[i + 1] : fimDoClipe(clipe);
      palavras.push({ texto: p, inicio: segundos(de), fim: segundos(Math.max(ate, de + TICKS_POR_SEGUNDO / 20)), enfase: chave.has(i) });
    });
  }
  if (!palavras.length) throw new ErroEdicao("As legendas estão vazias.");
  const primeira = clipes[0];
  const cores: PedidoDaLegenda["cores"] = {};
  if (COR.test(primeira.texto!.cor)) cores.texto = primeira.texto!.cor;
  if (primeira.texto!.cor_chave && COR.test(primeira.texto!.cor_chave)) cores.enfase = primeira.texto!.cor_chave;
  const marca = coresDaMarca.filter((c) => COR.test(c));
  if (marca.length) cores.caixa = marca[1] ?? marca[0];
  if (marca.length > 2) cores.neon = marca[2];
  const posicao = Math.min(0.9, Math.max(0.1, 0.5 + primeira.transformacao.y));
  return { faixaId: faixa.id, inicio, duracao, palavras, cores, posicao: Math.round(posicao * 1000) / 1000 };
}

/** O clipe da trilha numa faixa nova, por cima, e a faixa das legendas escondida: um passo só do desfazer. */
export function animarLegendas(projeto: Projeto, ctx: Contexto, midiaId: string, inicio: Tick, faixaId: string): { projeto: Projeto; clipeId: string } {
  const { projeto: novo, clipeId } = adicionarClipe(projeto, ctx, midiaId, { inicio, novaFaixa: true });
  return { projeto: { ...novo, faixas: novo.faixas.map((faixa) => (faixa.id === faixaId ? { ...faixa, oculta: true } : faixa)) }, clipeId };
}
