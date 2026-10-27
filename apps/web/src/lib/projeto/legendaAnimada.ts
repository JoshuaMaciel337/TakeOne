// Legendas animadas (o Clipar, ADR 0004, 14.12a). A trilha sai das legendas que o projeto já tem (as da fala, com o
// tempo de cada palavra e as palavras-chave da ênfase): as palavras vão para a API em segundos desde o começo da
// trilha, o worker grava o vídeo com transparência (core/legendas/motor.js) e o clipe dele entra numa faixa por cima,
// com a faixa de legendas escondida (as duas juntas mostrariam o texto duas vezes). Funções puras.
import { TICKS_POR_SEGUNDO, type Tick, quadroMaisProximo } from "../tempo.ts";
import { adicionarClipe, type Contexto, ErroEdicao } from "./edicao.ts";
import { type Faixa, fimDoClipe, type Projeto } from "./modelo.ts";
import { palavrasDoTexto } from "./texto.ts";

/** Os estilos do motor (core/modelos/legenda_animada.py, ESTILOS): o id e o nome na tela. */
export const ESTILOS_ANIMADOS: { id: string; nome: string }[] = [
  { id: "editorial", nome: "Editorial" },
  { id: "uma_palavra", nome: "Uma palavra por vez" },
  { id: "minusculas", nome: "Minúsculas" },
  { id: "pulando", nome: "Palavra pulando" },
  { id: "caixa_falada", nome: "Caixa na palavra falada" },
  { id: "caixas", nome: "Caixas coloridas" },
  { id: "digitacao", nome: "Digitação" },
  { id: "contorno", nome: "Contorno grosso" },
  { id: "neon", nome: "Néon" },
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
  cores: { texto?: string; enfase?: string };
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
 * palavras-chave. As cores e o lugar vêm da primeira legenda, para a trilha manter o estilo que a pessoa escolheu.
 */
export function pedidoDasLegendas(projeto: Projeto): PedidoDaLegenda {
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
  const posicao = Math.min(0.9, Math.max(0.1, 0.5 + primeira.transformacao.y));
  return { faixaId: faixa.id, inicio, duracao, palavras, cores, posicao: Math.round(posicao * 1000) / 1000 };
}

/** O clipe da trilha numa faixa nova, por cima, e a faixa das legendas escondida: um passo só do desfazer. */
export function animarLegendas(projeto: Projeto, ctx: Contexto, midiaId: string, inicio: Tick, faixaId: string): { projeto: Projeto; clipeId: string } {
  const { projeto: novo, clipeId } = adicionarClipe(projeto, ctx, midiaId, { inicio, novaFaixa: true });
  return { projeto: { ...novo, faixas: novo.faixas.map((faixa) => (faixa.id === faixaId ? { ...faixa, oculta: true } : faixa)) }, clipeId };
}
