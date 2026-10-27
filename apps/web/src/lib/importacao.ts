// Importar um vídeo pelo link (o começo do Clipar, ADR 0004): os dados antes, depois a mídia processando.
import { chamarApi } from "./api.ts";
import type { Midia } from "./tipos.ts";

/** O vídeo por trás do link, como a API leu: o título, o canal, a duração e a miniatura do próprio site. */
export type DadosDoLink = {
  origem: string;
  id: string;
  url: string;
  site: string;
  titulo: string;
  canal: string | null;
  duracao: number | null;
  miniatura: string | null;
  data: string | null;
  ao_vivo: boolean;
  /** Por que o vídeo não pode entrar (longo demais), ou null. */
  problema: string | null;
};

export function lerDadosDoLink(url: string): Promise<DadosDoLink> {
  return chamarApi<DadosDoLink>("/midias/link/dados", { metodo: "POST", corpo: { url } });
}

export function importarLink(url: string, titulo?: string): Promise<Midia> {
  return chamarApi<Midia>("/midias/link", { metodo: "POST", corpo: { url, titulo } });
}
