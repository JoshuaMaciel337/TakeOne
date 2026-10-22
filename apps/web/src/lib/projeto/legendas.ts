// Legendas: ler e escrever SRT e WebVTT, e o estilo padrão das legendas. Funções puras.
//
// Cada legenda vira um clipe de texto numa faixa "legenda" (lib/projeto/edicao.ts), então aparece
// na prévia e sai no vídeo pelo mesmo caminho dos textos. Os tempos ficam em ticks.
import { type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import type { Faixa } from "./modelo.ts";
import { type Texto, TEXTO_PADRAO } from "./texto.ts";

/**
 * tempos: quando cada palavra começa, na linha do tempo (só nas legendas da fala).
 * palavras_chave: as palavras para pintar (números de palavrasDoTexto), quando o LLM já escolheu.
 */
export type Legenda = { inicio: Tick; fim: Tick; conteudo: string; tempos?: Tick[]; palavras_chave?: number[] | null };

/** Centro das legendas, em fração da altura do quadro a partir do meio: perto da borda de baixo. */
export const POSICAO_LEGENDA = 0.35;

export const ESTILO_LEGENDA: Texto = {
  ...TEXTO_PADRAO,
  conteudo: "",
  fonte: "texto",
  tamanho: 0.05,
  contorno_espessura: 0.12,
  sombra: 0.3,
};

/** Estilos prontos do painel de legendas. Os nomes e os valores são do TakeOne. */
export const ESTILOS_DE_LEGENDA: { id: string; nome: string; texto: Texto }[] = [
  { id: "contorno", nome: "Contorno", texto: ESTILO_LEGENDA },
  { id: "caixa", nome: "Caixa escura", texto: { ...ESTILO_LEGENDA, contorno_espessura: 0, sombra: 0, fundo_opacidade: 0.65 } },
  { id: "amarela", nome: "Amarela", texto: { ...ESTILO_LEGENDA, cor: "#ffd60a" } },
  { id: "destaque", nome: "Destaque", texto: { ...ESTILO_LEGENDA, fonte: "display", contorno_espessura: 0, sombra: 0, fundo_cor: "#ff3d77", fundo_opacidade: 1 } },
  // Com destaque, a palavra falada muda de cor (lib/projeto/letras.ts)
  { id: "karaoke", nome: "Karaokê", texto: { ...ESTILO_LEGENDA, fonte: "display", destaque: { modo: "karaoke", cor: "#ffd60a" } } },
  {
    id: "palavra",
    nome: "Palavra falada",
    texto: { ...ESTILO_LEGENDA, fonte: "display", caixa_alta: true, tamanho: 0.06, destaque: { modo: "palavra", cor: "#2ee6a6" } },
  },
];

// -----------------------------------------------
// Leitura
// -----------------------------------------------
/** "00:01:02,500", "00:01:02.500" ou "01:02.500" → segundos. null se não for um tempo. */
export function lerTempo(texto: string): number | null {
  const partes = texto.trim().replace(",", ".").split(":");
  if (partes.length < 2 || partes.length > 3) return null;
  const numeros = partes.map(Number);
  if (numeros.some((numero) => !Number.isFinite(numero) || numero < 0)) return null;
  const [horas, minutos, segundos] = partes.length === 3 ? numeros : [0, ...numeros];
  return horas * 3600 + minutos * 60 + segundos;
}

/** Tira as marcações de estilo (<i>, <b>, <c.cor>, {\an8}) e os espaços sobrando. */
function limparTexto(linhas: string[]): string {
  return linhas
    .map((linha) => linha.replace(/<[^>]*>/g, "").replace(/\{\\[^}]*\}/g, "").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * O texto de um arquivo de legendas, na codificação dele: UTF-8 (com ou sem BOM), UTF-16 (com BOM ou pelos
 * zeros entre as letras) ou, por último, Windows-1252, a de muito SRT brasileiro antigo. Lido como UTF-8, um
 * arquivo em Windows-1252 entrava com "Ã©" no lugar do "é". O Windows-1252 nunca falha ao decodificar, por
 * isso é a última tentativa, depois do UTF-8 estrito.
 */
export function lerTextoDeLegenda(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  // UTF-16 sem BOM: texto latino tem um zero em quase todo byte par (ou ímpar)
  const amostra = bytes.subarray(0, 2000);
  let zerosPares = 0;
  let zerosImpares = 0;
  for (let i = 0; i < amostra.length; i++) {
    if (amostra[i] !== 0) continue;
    if (i % 2) zerosImpares++;
    else zerosPares++;
  }
  const metade = amostra.length / 2;
  if (metade >= 4 && zerosImpares > 0.4 * metade) return new TextDecoder("utf-16le").decode(bytes);
  if (metade >= 4 && zerosPares > 0.4 * metade) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * Lê um arquivo SRT ou WebVTT. Blocos sem tempo válido são ignorados. As legendas saem em ordem e
 * sem uma por cima da outra: se uma começa antes da anterior acabar, a anterior termina ali. Cada linha de
 * tempo começa uma legenda, mesmo sem a linha em branco antes (arquivos feitos à mão); o número que o SRT põe
 * antes do tempo sai do texto da anterior, e depois de uma linha em branco nada mais entra nela (as notas
 * do WebVTT, por exemplo).
 */
export function lerLegendas(arquivo: string): Legenda[] {
  const linhas = arquivo.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n").split("\n");
  const blocos: { tempo: string; texto: string[]; fechado: boolean }[] = [];
  for (const linha of linhas) {
    const atual = blocos.at(-1);
    if (linha.includes("-->")) {
      if (atual && !atual.fechado && /^\s*\d+\s*$/.test(atual.texto.at(-1) ?? "")) atual.texto.pop();
      blocos.push({ tempo: linha, texto: [], fechado: false });
    } else if (atual && !atual.fechado) {
      if (linha.trim()) atual.texto.push(linha);
      else if (atual.texto.length) atual.fechado = true;
    }
  }
  const lidas: Legenda[] = [];
  for (const bloco of blocos) {
    const [antes, depois] = bloco.tempo.split("-->");
    // No WebVTT, depois do tempo final podem vir ajustes de posição ("line:90%"): ficam de fora
    const inicio = lerTempo(antes);
    const fim = lerTempo(depois.trim().split(/\s+/)[0] ?? "");
    const conteudo = limparTexto(bloco.texto);
    if (inicio === null || fim === null || fim <= inicio || !conteudo) continue;
    lidas.push({ inicio: Math.round(inicio * TICKS_POR_SEGUNDO), fim: Math.round(fim * TICKS_POR_SEGUNDO), conteudo });
  }
  lidas.sort((a, b) => a.inicio - b.inicio);
  const resultado: Legenda[] = [];
  for (const legenda of lidas) {
    const anterior = resultado.at(-1);
    if (anterior && legenda.inicio < anterior.fim) {
      anterior.fim = legenda.inicio;
      if (anterior.fim <= anterior.inicio) resultado.pop();
    }
    resultado.push({ ...legenda });
  }
  return resultado;
}

// -----------------------------------------------
// Escrita
// -----------------------------------------------
function formatarTempo(t: Tick, separador: "," | "."): string {
  const ms = Math.max(0, Math.round((t * 1000) / TICKS_POR_SEGUNDO));
  const horas = Math.floor(ms / 3_600_000);
  const minutos = Math.floor((ms % 3_600_000) / 60_000);
  const segundos = Math.floor((ms % 60_000) / 1000);
  const duas = (n: number) => String(n).padStart(2, "0");
  return `${duas(horas)}:${duas(minutos)}:${duas(segundos)}${separador}${String(ms % 1000).padStart(3, "0")}`;
}

export function escreverSrt(legendas: Legenda[]): string {
  return legendas
    .map((legenda, i) => `${i + 1}\n${formatarTempo(legenda.inicio, ",")} --> ${formatarTempo(legenda.fim, ",")}\n${legenda.conteudo}\n`)
    .join("\n");
}

export function escreverVtt(legendas: Legenda[]): string {
  const blocos = legendas.map((legenda) => `${formatarTempo(legenda.inicio, ".")} --> ${formatarTempo(legenda.fim, ".")}\n${legenda.conteudo}\n`);
  return ["WEBVTT\n", ...blocos].join("\n");
}

/** As legendas de todas as faixas de legenda, em ordem. */
export function legendasDasFaixas(faixas: Faixa[]): Legenda[] {
  return faixas
    .filter((faixa) => faixa.tipo === "legenda")
    .flatMap((faixa) => faixa.clipes)
    .filter((clipe) => clipe.texto)
    .map((clipe) => ({ inicio: clipe.inicio, fim: clipe.inicio + clipe.duracao, conteudo: clipe.texto!.conteudo }))
    .sort((a, b) => a.inicio - b.inicio);
}
