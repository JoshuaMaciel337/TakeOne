// Os arquivos que a prévia lê de cada clipe (e a exportação no navegador lê os mesmos): a cópia leve da
// imagem (estável, sem ruído ou a de sempre) e o som (a voz no tom, a voz limpa ou o da cópia leve).
import { arquivoDaMidia } from "@/lib/api";
import { chaveDaEstabilizacao, type Clipe } from "@/lib/projeto/modelo";
import { chaveDoTom } from "@/lib/projeto/som";
import type { Midia } from "@/lib/tipos";

import type { ItemDaPrevia } from "./camadas";

/** A cópia leve da imagem estável ou sem ruído, quando o clipe pede e ela está pronta; senão, a de sempre. */
export function arquivoDaImagemDoClipe(clipe: Clipe, midia: Midia): string {
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
  const tom = arquivoDoTom(item);
  if (tom) return arquivoDaMidia(midia.id, tom);
  if (usaVozLimpa(item)) return arquivoDaMidia(midia.id, "voz_limpa.m4a");
  return arquivoDaMidia(midia.id, midia.arquivos.includes("proxy.mp4") ? "proxy.mp4" : "proxy.m4a");
}
