// Os gráficos de pregação escolhidos pelas palavras da fala (o Clipar, ADR 0004, 14.12e). Cada gráfico da categoria
// "pregacao" da biblioteca de animações tem as palavras que o chamam; quando uma delas é dita, o gráfico entra um
// pouco antes dela, com a palavra dita (ou as palavras do mesmo assunto, no coração) nos campos. Um gráfico não se
// repete e fica longe do anterior, para o vídeo não virar um desfile de desenhos. Conta pura.
import type { PalavraNoTempo } from "../projeto/fala.ts";
import { TICKS_POR_SEGUNDO, type Tick } from "../tempo.ts";

export type GraficoDaFala = { modelo: string; inicio: Tick; duracao: Tick; campos: Record<string, string>; palavra: string };

const semAcento = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** As palavras (sem acento) que chamam cada gráfico; um "*" no fim aceita o que vier depois ("pecad*": pecado, pecados). */
export const GATILHOS: Record<string, string[]> = {
  pregacao_coracao: ["coracao", "coracoes", "pecad*", "inveja", "ira", "orgulho", "magoa*", "rancor", "culpa"],
  pregacao_mente: ["mente", "mentes", "pensament*", "cabeca", "cerebro", "ansiedade"],
  pregacao_biblia: ["biblia", "palavra", "escritura*", "versiculo*", "evangelho"],
  pregacao_cruz: ["cruz", "calvario", "crucific*", "sangue", "salvacao", "salvou"],
  pregacao_chama: ["fogo", "chama", "avivamento", "arder", "arde", "queima*"],
  pregacao_pomba: ["espirito", "paz", "consolador"],
  pregacao_corrente: ["liberdade", "livre", "libert*", "prisao", "preso", "presos", "corrente*", "vicio*", "escravo*", "cadeia*"],
  pregacao_ceu: ["ceu", "ceus", "gloria", "eternidade", "eterno", "paraiso"],
};

/** As palavras que entram no coração quando são ditas perto da palavra que o chamou. */
const DORES = ["inveja", "ira", "orgulho", "magoa", "rancor", "culpa", "medo", "mentira", "odio", "vaidade", "imoralidade", "ganancia"];

/** O campo de texto de cada gráfico que recebe a palavra dita (o coração recebe a lista das dores). */
const CAMPO_DA_PALAVRA: Record<string, string> = {
  pregacao_mente: "texto",
  pregacao_biblia: "texto",
  pregacao_cruz: "texto",
  pregacao_chama: "texto",
  pregacao_pomba: "texto",
  pregacao_corrente: "texto",
  pregacao_ceu: "texto",
};

export type OpcoesDosGraficos = { maximo?: number; distancia?: number; duracao?: number; antes?: number };

function casa(palavra: string, gatilho: string): boolean {
  return gatilho.endsWith("*") ? palavra.startsWith(gatilho.slice(0, -1)) && palavra.length >= gatilho.length - 1 : palavra === gatilho;
}

export function graficoDaPalavra(texto: string): string | null {
  const palavra = semAcento(texto);
  if (palavra.length < 2) return null;
  for (const [modelo, gatilhos] of Object.entries(GATILHOS)) if (gatilhos.some((g) => casa(palavra, g))) return modelo;
  return null;
}

/**
 * Os gráficos da fala, em ordem: no máximo `maximo` (4), com pelo menos `distancia` segundos (8) entre o começo de
 * um e o do outro, cada gráfico uma vez só, `duracao` segundos (3,5) de tela e começando `antes` segundos (0,2)
 * antes da palavra.
 */
export function graficosDaFala(palavras: PalavraNoTempo[], opcoes: OpcoesDosGraficos = {}): GraficoDaFala[] {
  const { maximo = 4, distancia = 8, duracao = 3.5, antes = 0.2 } = opcoes;
  const S = TICKS_POR_SEGUNDO;
  const saida: GraficoDaFala[] = [];
  const usados = new Set<string>();
  let ultimo = Number.NEGATIVE_INFINITY;
  palavras.forEach((palavra, i) => {
    if (saida.length >= maximo || palavra.inicio - ultimo < distancia * S) return;
    const modelo = graficoDaPalavra(palavra.texto);
    if (!modelo || usados.has(modelo)) return;
    const campos: Record<string, string> = {};
    if (modelo === "pregacao_coracao") {
      // As dores ditas até 6 s antes ou depois, na ordem, sem repetir
      const perto = palavras
        .filter((p) => Math.abs(p.inicio - palavra.inicio) <= 6 * S)
        .map((p) => semAcento(p.texto))
        .filter((p, j, lista) => DORES.includes(p) && lista.indexOf(p) === j);
      if (perto.length >= 2) campos.palavras = perto.slice(0, 5).map((p) => p.toUpperCase()).join("\n");
    } else if (CAMPO_DA_PALAVRA[modelo]) {
      // A palavra dita, limpa da pontuação; no espírito, "Espírito Santo" quando o santo vem logo depois
      let dita = palavra.texto.replace(/[^\p{L}\p{N}-]/gu, "");
      if (modelo === "pregacao_pomba" && semAcento(palavras[i + 1]?.texto ?? "") === "santo") dita = `${dita} Santo`;
      campos[CAMPO_DA_PALAVRA[modelo]] = dita.toLocaleUpperCase("pt-BR").slice(0, 22);
    }
    const inicio = Math.max(0, palavra.inicio - antes * S);
    saida.push({ modelo, inicio, duracao: duracao * S, campos, palavra: palavra.texto });
    usados.add(modelo);
    ultimo = palavra.inicio;
  });
  return saida;
}
