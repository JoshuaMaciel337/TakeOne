// As chamadas da API do álbum de fotos (apps/api/rotas/albuns.py).
import { chamarApi } from "@/lib/api";

import type { EdicaoDaFoto } from "./edicao";
import type { Album, FotoDoAlbum, Genero, Mudanca, PessoaDoAlbum } from "./fotos";

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

export const analisarAlbum = (id: string) => chamarApi<{ job_id: string }>(`/albuns/${id}/analisar`, { metodo: "POST" });

export type OpcoesDaEscolha = {
  quantas: "minima" | "poucas" | "padrao" | "muitas";
  alvo: number;
  rigor: "tolerante" | "moderado" | "rigido";
  olhos_fechados: boolean;
  grupos: "pequeno" | "padrao" | "grande" | "muito_grande";
  aplicar: boolean;
  manter_feitas_a_mao: boolean;
};

export const OPCOES_DA_ESCOLHA: OpcoesDaEscolha = { quantas: "padrao", alvo: 0, rigor: "moderado", olhos_fechados: true, grupos: "padrao", aplicar: true, manter_feitas_a_mao: true };

export const escolherMelhores = (id: string, opcoes: OpcoesDaEscolha) =>
  chamarApi<{ categorias: Record<string, number>; sem_analise: number }>(`/albuns/${id}/escolher`, { metodo: "POST", corpo: opcoes });

export const pessoasDoAlbum = (id: string) => chamarApi<PessoaDoAlbum[]>(`/albuns/${id}/pessoas`);
export const nomearPessoa = (id: string, numero: number, nome: string) =>
  chamarApi<PessoaDoAlbum>(`/albuns/${id}/pessoas/${numero}`, { metodo: "PATCH", corpo: { nome } });

/** Guarda a edição de cada foto (null tira) e põe o desenho na fila do worker. */
export const editarFotos = (id: string, edicoes: { midia_id: string; edicao: EdicaoDaFoto | null }[]) =>
  chamarApi<{ job_id: string }>(`/albuns/${id}/edicoes`, { metodo: "PUT", corpo: { edicoes } });

/** Um estilo pessoal do espaço (apps/api/rotas/estilos_pessoais.py): quantas fotos o ensinaram e como ele prevê. */
export type EstiloPessoal = { id: string; nome: string; pares: number; modelo: "vizinhos" | "boosting"; treinado_em: string | null; criado_em: string };

export const estilosPessoais = () => chamarApi<EstiloPessoal[]>("/estilos-pessoais");
export const criarEstiloPessoal = (nome: string) => chamarApi<EstiloPessoal>("/estilos-pessoais", { metodo: "POST", corpo: { nome } });
export const excluirEstiloPessoal = (id: string) => chamarApi<void>(`/estilos-pessoais/${id}`, { metodo: "DELETE" });
export const ensinarEstilo = (id: string, albumId: string, midiaIds: string[], origem: "takeone" | "xmp") =>
  chamarApi<{ job_id: string }>(`/estilos-pessoais/${id}/ensinar`, { metodo: "POST", corpo: { album_id: albumId, midia_ids: midiaIds, origem } });
export const aplicarEstiloPessoal = (id: string, albumId: string, midiaIds: string[], intensidade: number) =>
  chamarApi<{ job_id: string }>(`/estilos-pessoais/${id}/aplicar`, { metodo: "POST", corpo: { album_id: albumId, midia_ids: midiaIds, intensidade } });
export const parecidasDoEstilo = (id: string, midiaId: string) =>
  chamarApi<{ midia_id: string; semelhanca: number }[]>(`/estilos-pessoais/${id}/parecidas?midia_id=${midiaId}`);
