// As chamadas da API do álbum de fotos (apps/api/rotas/albuns.py).
import { chamarApi } from "@/lib/api";

import type { Album, FotoDoAlbum, Genero, Mudanca } from "./fotos";

export type FotosRemovidas = { apagadas: number; na_biblioteca: number };

export const listarAlbuns = () => chamarApi<Album[]>("/albuns");
export const verAlbum = (id: string) => chamarApi<Album>(`/albuns/${id}`);
export const criarAlbum = (nome: string, genero: Genero) => chamarApi<Album>("/albuns", { metodo: "POST", corpo: { nome, genero } });
export const mudarAlbum = (id: string, campos: { nome?: string; genero?: Genero }) => chamarApi<Album>(`/albuns/${id}`, { metodo: "PATCH", corpo: campos });
export const excluirAlbum = (id: string) => chamarApi<FotosRemovidas>(`/albuns/${id}`, { metodo: "DELETE" });
export const fotosDoAlbum = (id: string) => chamarApi<FotoDoAlbum[]>(`/albuns/${id}/fotos`);
export const mudarFotos = (id: string, midiaIds: string[], mudanca: Mudanca) =>
  chamarApi<void>(`/albuns/${id}/fotos`, { metodo: "PATCH", corpo: { midia_ids: midiaIds, ...mudanca } });
export const removerFotos = (id: string, midiaIds: string[]) =>
  chamarApi<FotosRemovidas>(`/albuns/${id}/fotos/remover`, { metodo: "POST", corpo: { midia_ids: midiaIds } });


export type PastaDoComputador = { disponivel: boolean; caminho: string; pastas: { nome: string; caminho: string; fotos: number }[]; fotos: number };

export const pastaDoComputador = (caminho: string) => chamarApi<PastaDoComputador>(`/albuns/pasta-do-computador?caminho=${encodeURIComponent(caminho)}`);
export const importarPasta = (id: string, caminho: string, subpastas: boolean) =>
  chamarApi<{ job_id: string }>(`/albuns/${id}/importar`, { metodo: "POST", corpo: { caminho, subpastas } });
