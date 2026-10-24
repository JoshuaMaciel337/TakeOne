// Os tipos e as ajudas dos efeitos da Galeria de filtros (ADR 0003, onda 13.11).
import type { Opcao, Valores } from "../catalogo.ts";
import type { ContextoDoFiltro, ImagemDoFiltro } from "../comum.ts";
import { DIRECOES_DA_LUZ, TEXTURAS_DA_GALERIA } from "./base.ts";

export type CategoriaDaGaleria = "artisticos" | "pinceis" | "distorcao" | "esboco" | "estilizacao" | "textura";
export const CATEGORIAS_DA_GALERIA: { id: CategoriaDaGaleria; nome: string }[] = [
  { id: "artisticos", nome: "Artísticos" },
  { id: "pinceis", nome: "Traçados de pincel" },
  { id: "distorcao", nome: "Distorção" },
  { id: "esboco", nome: "Esboço" },
  { id: "estilizacao", nome: "Estilização" },
  { id: "textura", nome: "Textura" },
];

export type EfeitoDaGaleria = {
  id: string;
  nome: string;
  categoria: CategoriaDaGaleria;
  /** Só números, escolhas, marcar e cores (o texto da pilha guarda os valores na ordem delas). */
  opcoes: Opcao[];
  aplicar: (imagem: ImagemDoFiltro, v: Valores, ctx: ContextoDoFiltro) => ImagemDoFiltro;
};

export const numero = (id: string, nome: string, minimo: number, maximo: number, padrao: number, sufixo = ""): Opcao => ({ id, nome, tipo: "numero", minimo, maximo, padrao, sufixo, passo: 1 });
export const escolha = (id: string, nome: string, opcoes: [string, string][], padrao?: string): Opcao => ({ id, nome, tipo: "escolha", opcoes: opcoes.map(([valor, rotulo]) => ({ id: valor, nome: rotulo })), padrao: padrao ?? opcoes[0][0] });
export const marcar = (id: string, nome: string, padrao = false): Opcao => ({ id, nome, tipo: "marcar", padrao });
export const n = (v: Valores, id: string) => Number(v[id]);
export const s = (v: Valores, id: string) => String(v[id]);

export const LUZ = escolha("luz", "Luz", DIRECOES_DA_LUZ);
export const TEXTURA = escolha("textura", "Textura", TEXTURAS_DA_GALERIA);
