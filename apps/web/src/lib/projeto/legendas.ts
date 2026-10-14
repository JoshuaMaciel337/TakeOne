// Legendas: ler e escrever SRT e WebVTT, e o estilo padrão das legendas. Funções puras.
//
// Cada legenda vira um clipe de texto numa faixa "legenda" (lib/projeto/edicao.ts), então aparece
// na prévia e sai no vídeo pelo mesmo caminho dos textos. Os tempos ficam em ticks.
import { type Tick, TICKS_POR_SEGUNDO } from "../tempo.ts";
import type { Faixa } from "./modelo.ts";
import { type Texto, TEXTO_PADRAO } from "./texto.ts";

export type Legenda = { inicio: Tick; fim: Tick; conteudo: string };

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
 * Lê um arquivo SRT ou WebVTT. Blocos sem tempo válido são ignorados. As legendas saem em ordem e
 * sem uma por cima da outra: se uma começa antes da anterior acabar, a anterior termina ali.
 */
export function lerLegendas(arquivo: string): Legenda[] {
  const blocos = arquivo
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/);
  const lidas: Legenda[] = [];
  for (const bloco of blocos) {
    const linhas = bloco.split("\n");
    const indice = linhas.findIndex((linha) => linha.includes("-->"));
    if (indice < 0) continue;
    const [antes, depois] = linhas[indice].split("-->");
    // No WebVTT, depois do tempo final podem vir ajustes de posição ("line:90%"): ficam de fora
    const inicio = lerTempo(antes);
    const fim = lerTempo(depois.trim().split(/\s+/)[0] ?? "");
    const conteudo = limparTexto(linhas.slice(indice + 1));
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
