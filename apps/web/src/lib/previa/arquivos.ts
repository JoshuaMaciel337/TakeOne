// Os arquivos que a prévia lê de cada clipe (e a exportação no navegador lê os mesmos): a cópia leve da
// imagem (estável, sem ruído ou a de sempre) e o som (a voz no tom, a voz limpa ou o da cópia leve).
import { arquivoDaMidia } from "@/lib/api";
import { chaveDaEstabilizacao, chaveDoFluido, type Clipe, zeroDoFluido } from "@/lib/projeto/modelo";
import { chaveDoTom } from "@/lib/projeto/som";
import { type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

import type { ItemDaPrevia } from "./camadas";

/** O clipe ao contrário com o vídeo invertido pronto (sem ele, a prévia mostra o original até ficar pronto). */
export function tocaAoContrario(clipe: Pick<Clipe, "inverter">, midia: Midia): boolean {
  return Boolean(clipe.inverter) && midia.arquivos.includes("invertido_proxy.mp4");
}

/**
 * A entrada do clipe no vídeo ao contrário: o fim do trecho no original vira o começo (entrada_invertida no
 * render). A duração é a da imagem, onde o vídeo invertido começa.
 */
export function entradaInvertida(clipe: Pick<Clipe, "entrada" | "duracao" | "velocidade">, midia: Midia): Tick {
  const duracao = (midia.video?.duracao || midia.duracao || 0) * TICKS_POR_SEGUNDO;
  return Math.max(0, Math.round(duracao - (clipe.entrada + clipe.duracao * clipe.velocidade)));
}

/**
 * O clipe como a fonte o lê: o ao contrário com a entrada espelhada no vídeo invertido; a imagem da câmera lenta
 * suave com a entrada contada do começo do arquivo dela (`som`: o som continua no original). Fora do trecho
 * pronto, a câmera lenta suave sai (a imagem volta ao original).
 */
export function clipeNaFonte(clipe: Clipe, midia: Midia, som = false): Clipe {
  if (tocaAoContrario(clipe, midia)) return { ...clipe, entrada: entradaInvertida(clipe, midia) };
  if (!clipe.fluido) return clipe;
  const zero = zeroDoFluido(clipe, midia);
  if (zero === null) return { ...clipe, fluido: null };
  return som ? clipe : { ...clipe, entrada: clipe.entrada - Math.round(zero * TICKS_POR_SEGUNDO) };
}

/** A cópia leve da imagem estável ou sem ruído, quando o clipe pede e ela está pronta; senão, a de sempre. */
export function arquivoDaImagemDoClipe(clipe: Clipe, midia: Midia): string {
  if (tocaAoContrario(clipe, midia)) return "invertido_proxy.mp4";
  // A câmera lenta suave (o clipe já passou por clipeNaFonte, que tira o `fluido` fora do trecho pronto)
  if (clipe.fluido && midia.fluidos?.[chaveDoFluido(clipe.fluido.de, clipe.fluido.ate)]?.status === "pronta") {
    return `${chaveDoFluido(clipe.fluido.de, clipe.fluido.ate)}_proxy.mp4`;
  }
  const estavel = `${chaveDaEstabilizacao(Boolean(clipe.imagem_limpa))}_proxy.mp4`;
  if (clipe.estabilizar && midia.arquivos.includes(estavel)) return estavel;
  return clipe.imagem_limpa && midia.arquivos.includes("limpo_proxy.mp4") ? "limpo_proxy.mp4" : "proxy.mp4";
}

/** A voz limpa, quando o clipe pede e ela já está pronta (o mesmo tempo do original); senão, o som do proxy. */
export function usaVozLimpa(item: ItemDaPrevia): boolean {
  return Boolean(item.clipe.voz_limpa) && item.midia.arquivos.includes("voz_limpa.m4a");
}

/** O arquivo da voz no tom do clipe, quando ele pede e o arquivo já está pronto; senão, null. */
export function arquivoDoTom(item: ItemDaPrevia): string | null {
  const tom = item.clipe.tom ?? 0;
  if (!tom) return null;
  const nome = `${chaveDoTom(tom, usaVozLimpa(item))}.m4a`;
  return item.midia.arquivos.includes(nome) ? nome : null;
}

/** O arquivo do som do clipe: a voz no tom, a voz limpa ou o som da cópia leve (a exportação no navegador usa o mesmo). */
export function arquivoDoSom(item: ItemDaPrevia): string {
  const { midia } = item;
  if (tocaAoContrario(item.clipe, midia)) return arquivoDaMidia(midia.id, "invertido_proxy.mp4");
  const tom = arquivoDoTom(item);
  if (tom) return arquivoDaMidia(midia.id, tom);
  if (usaVozLimpa(item)) return arquivoDaMidia(midia.id, "voz_limpa.m4a");
  return arquivoDaMidia(midia.id, midia.arquivos.includes("proxy.mp4") ? "proxy.mp4" : "proxy.m4a");
}
