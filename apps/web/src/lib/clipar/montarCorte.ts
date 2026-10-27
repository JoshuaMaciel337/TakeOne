// O corte montado (ADR 0004, 14.5): um corte da clipagem vira um projeto de vídeo editado, pelos comandos de
// sempre do editor (lib/projeto/comandos.ts), então a prévia e o render não têm caminho novo. Os trechos da mídia
// original entram em fila na principal (sem copiar o arquivo), o clipe cobre o quadro seguindo o rosto, as pausas
// e as hesitações saem, as legendas da fala entram no estilo escolhido (com as palavras de ênfase pintadas) e o
// título do corte abre o vídeo com as palavras de foco na outra cor. Os zooms curtos caem onde a fala diz as
// palavras de foco. Função pura: o que depende da rede (a fala, o rosto, as palavras de ênfase) chega pronto.
import { type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import { executarComando, type Comando } from "../projeto/comandos.ts";
import type { Contexto } from "../projeto/edicao.ts";
import { falaDosClipes, type Palavra, palavrasDaLinha } from "../projeto/fala.ts";
import { ESTILOS_DE_LEGENDA } from "../projeto/legendas.ts";
import { legendasDaFala, opcoesParaOQuadro } from "../projeto/legendasDaFala.ts";
import { trechosParaLimpar } from "../projeto/limpezaDeFala.ts";
import type { Clipe, Projeto } from "../projeto/modelo.ts";
import { type AmostraDeRosto, reenquadrarPeloRosto } from "../projeto/reenquadrar.ts";
import { ESTILOS_DE_TEXTO, palavrasDoTexto } from "../projeto/texto.ts";

export type CorteParaMontar = { trechos: { inicio: number; fim: number }[]; titulo: string; foco: string[] };

export type OpcoesDaMontagem = {
  /** Tirar as pausas e as hesitações. */
  limpar: boolean;
  /** O id do estilo de legenda (ESTILOS_DE_LEGENDA), ou null para sem legendas. */
  legenda: string | null;
  /** O título nos primeiros segundos. */
  titulo: boolean;
  /** Zoom curto onde a fala diz as palavras de foco. */
  zooms: boolean;
  /** A cor das palavras de foco e de ênfase (a principal do kit de marca, quando há). */
  corDeDestaque: string;
};

export const OPCOES_DA_MONTAGEM: OpcoesDaMontagem = { limpar: true, legenda: "palavra", titulo: true, zooms: true, corDeDestaque: "#ffd60a" };

export type EntradaDaMontagem = {
  /** O projeto vazio, já no formato do corte. */
  projeto: Projeto;
  ctx: Contexto;
  midia: { id: string; largura: number; altura: number };
  corte: CorteParaMontar;
  /** As palavras da fala da mídia (pelo menos as do corte), em segundos da mídia. */
  palavras: Palavra[];
  /** As amostras do rosto da mídia; vazias, o clipe só cobre o quadro, no meio. */
  rosto: AmostraDeRosto[];
  /** O começo (segundos da mídia) das palavras de ênfase, que o LLM escolheu na clipagem. Pelo tempo, valem em
   * qualquer divisão das legendas. */
  enfase?: number[];
  opcoes?: OpcoesDaMontagem;
};

/** O título fica 3 s, com as linhas cabendo no quadro. */
const LINHAS_DO_TITULO = 3;
/** O título fica no alto: o centro a 20% da altura, acima do rosto no enquadramento em pé e longe das legendas. */
const ALTURA_DO_TITULO = -0.3;
/** No máximo tantos zooms, separados por pelo menos tanto tempo. */
const ZOOMS_NO_MAXIMO = 3;
const ESPACO_ENTRE_ZOOMS_S = 6;

const semAcento = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}$]+/gu, "");

/** As palavras em até `maxLinhas` linhas de até `max` letras, gulosas; null se não couberem. */
export function linhasDoTitulo(texto: string, max: number, maxLinhas: number): string[] | null {
  const linhas: string[] = [];
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const atual = linhas.at(-1);
    if (atual !== undefined && (atual + " " + palavra).length <= max) linhas[linhas.length - 1] = `${atual} ${palavra}`;
    else if (palavra.length > max) return null;
    else linhas.push(palavra);
  }
  return linhas.length <= maxLinhas ? linhas : null;
}

/** Os números (palavrasDoTexto) das palavras do texto que fazem parte das palavras de foco. */
export function palavrasDeFoco(conteudo: string, foco: string[]): number[] {
  const alvos = new Set(foco.flatMap((trecho) => trecho.split(/\s+/)).map(semAcento).filter((palavra) => palavra.length > 1));
  return palavrasDoTexto(conteudo).flatMap((palavra, i) => (alvos.has(semAcento(palavra)) ? [i] : []));
}

/**
 * Os trechos de zoom: onde a fala (na linha do tempo, já cortada) diz uma palavra de foco, do começo da palavra
 * a 1,2 s depois dela, no máximo 3 e a 6 s um do outro, nunca no primeiro segundo (o título está lá).
 */
export function zoomsNasPalavrasDeFoco(palavras: { texto: string; inicio: Tick; fim: Tick }[], foco: string[]): { inicio: Tick; fim: Tick }[] {
  const alvos = new Set(foco.flatMap((trecho) => trecho.split(/\s+/)).map(semAcento).filter((palavra) => palavra.length > 3));
  const trechos: { inicio: Tick; fim: Tick }[] = [];
  for (const palavra of palavras) {
    if (trechos.length >= ZOOMS_NO_MAXIMO) break;
    if (!alvos.has(semAcento(palavra.texto)) || palavra.inicio < TICKS_POR_SEGUNDO) continue;
    const anterior = trechos.at(-1);
    if (anterior && palavra.inicio - anterior.inicio < ESPACO_ENTRE_ZOOMS_S * TICKS_POR_SEGUNDO) continue;
    trechos.push({ inicio: palavra.inicio, fim: palavra.fim + Math.round(1.2 * TICKS_POR_SEGUNDO) });
  }
  return trechos;
}

const principalDe = (projeto: Projeto): Clipe[] => projeto.faixas.find((faixa) => faixa.tipo === "principal")?.clipes ?? [];

/** O projeto do corte montado e o nome de cada passo (para o aviso do que foi feito). */
export function montarCorte(entrada: EntradaDaMontagem): { projeto: Projeto; feitos: string[] } {
  const { ctx, midia, corte } = entrada;
  const opcoes = entrada.opcoes ?? OPCOES_DA_MONTAGEM;
  const s = TICKS_POR_SEGUNDO;
  let projeto = entrada.projeto;
  const feitos: string[] = [];
  const aplicar = (comando: Comando) => {
    projeto = executarComando(projeto, comando, ctx).projeto;
  };
  const [largura, altura] = projeto.proporcao.split(":").map(Number);
  const quadro = { largura, altura };

  // Os trechos, em fila na principal
  for (const trecho of corte.trechos) {
    aplicar({
      comando: "clipe.inserirTrecho",
      parametros: { midiaId: midia.id, de: Math.round(trecho.inicio * s), ate: Math.round(trecho.fim * s), tempo: projeto.duracao, modo: "inserir" },
    });
  }
  // Cada clipe cobre o quadro, seguindo o rosto quando ele aparece no trecho (antes da limpeza: um clipe por trecho)
  let seguiu = false;
  for (const clipe of principalDe(projeto)) {
    const pelo = reenquadrarPeloRosto(clipe, entrada.rosto, midia, quadro);
    const reenquadramento = pelo ?? reenquadrarPeloRosto(clipe, [{ t: clipe.entrada / s, x: 0.5, y: 0.5, a: 1 }], midia, quadro);
    seguiu ||= Boolean(pelo);
    if (reenquadramento && (reenquadramento.escala > 1.001 || pelo)) aplicar({ comando: "clipe.reenquadrar", parametros: { clipeId: clipe.id, reenquadramento } });
  }
  if (seguiu) feitos.push("enquadrado no rosto");

  const mapa = new Map([[midia.id, entrada.palavras]]);
  if (opcoes.limpar) {
    const trechos = trechosParaLimpar(principalDe(projeto), mapa);
    if (trechos.length) {
      aplicar({ comando: "linha.removerIntervalos", parametros: { intervalos: trechos.map(({ inicio, fim }) => ({ inicio, fim })) } });
      feitos.push(trechos.length === 1 ? "1 pausa tirada" : `${trechos.length} pausas e hesitações tiradas`);
    }
  }

  const estiloDaLegenda = ESTILOS_DE_LEGENDA.find((estilo) => estilo.id === opcoes.legenda)?.texto;
  if (estiloDaLegenda) {
    const estilo = { ...estiloDaLegenda, cor_chave: opcoes.corDeDestaque };
    let legendas = legendasDaFala(principalDe(projeto), mapa, opcoesParaOQuadro(projeto.proporcao, estilo));
    if (entrada.enfase?.length) {
      // As palavras de ênfase levadas à linha do tempo (o mesmo caminho das legendas): o começo de cada uma
      const marcadas = new Set(entrada.enfase.map((t) => Math.round(t * 1000)));
      const daEnfase = entrada.palavras.filter((palavra) => marcadas.has(Math.round(palavra.inicio * 1000)));
      const naLinha = new Set(palavrasDaLinha(falaDosClipes(principalDe(projeto), new Map([[midia.id, daEnfase]]))).map((palavra) => palavra.inicio));
      legendas = legendas.map((legenda) => {
        const numeros = (legenda.tempos ?? []).flatMap((tempo, j) => (naLinha.has(tempo) ? [j] : []));
        return { ...legenda, palavras_chave: numeros.length ? numeros : null };
      });
    }
    if (legendas.length) {
      aplicar({ comando: "legenda.importar", parametros: { legendas, estilo } });
      feitos.push(`${legendas.length} legendas`);
    }
  }

  if (opcoes.titulo && corte.titulo.trim()) {
    const base = ESTILOS_DE_TEXTO.find((estilo) => estilo.id === "titulo")!.texto;
    // Do tamanho do estilo para baixo, até o título caber em 3 linhas
    let tamanho = base.tamanho;
    let linhas: string[] | null = null;
    while (tamanho >= 0.045) {
      linhas = linhasDoTitulo(corte.titulo.trim().toUpperCase(), opcoesParaOQuadro(projeto.proporcao, { ...base, tamanho }).maxCaracteres, LINHAS_DO_TITULO);
      if (linhas) break;
      tamanho -= 0.01;
    }
    if (linhas) {
      const conteudo = linhas.join("\n");
      const chaves = palavrasDeFoco(conteudo, corte.foco);
      aplicar({
        comando: "texto.adicionar",
        parametros: {
          inicio: 0,
          texto: { ...base, conteudo, tamanho, caixa_alta: true, palavras_chave: chaves.length ? chaves : null, cor_chave: opcoes.corDeDestaque },
          transformacao: { y: ALTURA_DO_TITULO },
        },
      });
      const titulo = projeto.faixas.find((faixa) => faixa.tipo === "texto")?.clipes.at(-1);
      if (titulo) {
        aplicar({
          comando: "clipe.animar",
          parametros: { clipeIds: [titulo.id], animacao: { entrada: { tipo: "palavras", duracao: Math.round(0.6 * s) }, saida: { tipo: "aparecer", duracao: Math.round(0.3 * s) } } },
        });
      }
      feitos.push("título");
    }
  }

  if (opcoes.zooms && corte.foco.length) {
    const trechos = zoomsNasPalavrasDeFoco(palavrasDaLinha(falaDosClipes(principalDe(projeto), mapa)), corte.foco);
    if (trechos.length) {
      aplicar({ comando: "linha.zoomNosTrechos", parametros: { trechos } });
      feitos.push(trechos.length === 1 ? "1 zoom" : `${trechos.length} zooms`);
    }
  }
  return { projeto, feitos };
}
