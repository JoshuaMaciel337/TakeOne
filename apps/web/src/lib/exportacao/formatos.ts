// Os formatos da exportação no servidor (core/modelos/exportacao.py): o arquivo de cada um e o resumo
// que as listas mostram.
import { TICKS_POR_SEGUNDO } from "../tempo.ts";

export type FormatoExportacao = "mp4" | "gif" | "png" | "m4a" | "wav";

export const ARQUIVOS_DOS_FORMATOS: Record<FormatoExportacao, string> = {
  mp4: "video.mp4",
  gif: "video.gif",
  png: "quadro.png",
  m4a: "som.m4a",
  wav: "som.wav",
};

/** Quadros por segundo que o servidor aceita no lugar dos do projeto. */
export const TAXAS_DO_VIDEO = [24, 25, 30, 50, 60] as const;
export const TAXAS_DO_GIF = [10, 15, 24] as const;
export const TAXA_PADRAO_DO_GIF = 15;
export const GIF_MAXIMO_S = 30;

type Resumivel = {
  formato?: FormatoExportacao | null;
  resolucao: string;
  taxa?: number | null;
  tempo?: number | null;
  largura: number;
  altura: number;
};

const NOMES_DAS_RESOLUCOES: Record<string, string> = { "480p": "480p", "720p": "720p", "1080p": "1080p", "4k": "4K" };

export function arquivoDaExportacao(exportacao: Pick<Resumivel, "formato">): string {
  return ARQUIVOS_DOS_FORMATOS[exportacao.formato ?? "mp4"];
}

/** "1080p · 1920 × 1080 · 60 fps", "GIF · 854 × 480 · 15 fps", "Quadro em 0:12 · PNG 1080p", "Som · M4A". */
export function resumoDaExportacao(exportacao: Resumivel): string {
  const resolucao = NOMES_DAS_RESOLUCOES[exportacao.resolucao] ?? exportacao.resolucao;
  const tamanho = `${exportacao.largura} × ${exportacao.altura}`;
  const taxa = exportacao.taxa ? ` · ${exportacao.taxa} fps` : "";
  switch (exportacao.formato ?? "mp4") {
    case "gif":
      return `GIF · ${tamanho}${taxa}`;
    case "png": {
      const segundos = (exportacao.tempo ?? 0) / TICKS_POR_SEGUNDO;
      const minutos = Math.floor(segundos / 60);
      const resto = (segundos % 60).toFixed(2).padStart(5, "0").replace(".", ",");
      return `Quadro em ${minutos}:${resto} · PNG ${resolucao}`;
    }
    case "m4a":
      return "Som · M4A";
    case "wav":
      return "Som · WAV";
    default:
      return `${resolucao} · ${tamanho}${taxa}`;
  }
}
