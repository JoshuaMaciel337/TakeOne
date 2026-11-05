"use client";

// Os favoritos e os recentes dos materiais do editor de vídeo (filtros, efeitos, transições), guardados no navegador
// (ADR 0007, 17.3). Uma lista por tipo de material; os recentes vão até 12, o mais novo primeiro.
import { useSyncExternalStore } from "react";

const CHAVE = "takeone-materiais";
const RECENTES_MAXIMOS = 12;

type Guardado = Record<string, { favoritos: string[]; recentes: string[] }>;

const ouvintes = new Set<() => void>();
let cache: Guardado | null = null;

function ler(): Guardado {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(CHAVE) ?? "{}") as Guardado;
  } catch {
    cache = {};
  }
  return cache;
}

function gravar(novo: Guardado) {
  cache = novo;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(novo));
  } catch {
    // Sem armazenamento: vale até fechar a página
  }
  for (const ouvinte of ouvintes) ouvinte();
}

const VAZIO = { favoritos: [] as string[], recentes: [] as string[] };

/** Os favoritos e os recentes de um tipo de material, com o que muda cada um. */
export function useMateriais(tipo: string) {
  const dados = useSyncExternalStore(
    (avisar) => {
      ouvintes.add(avisar);
      return () => ouvintes.delete(avisar);
    },
    () => ler()[tipo] ?? VAZIO,
    () => VAZIO,
  );
  return {
    favoritos: dados.favoritos,
    recentes: dados.recentes,
    alternarFavorito: (id: string) => {
      const atual = ler()[tipo] ?? VAZIO;
      const favoritos = atual.favoritos.includes(id) ? atual.favoritos.filter((f) => f !== id) : [...atual.favoritos, id];
      gravar({ ...ler(), [tipo]: { ...atual, favoritos } });
    },
    usar: (id: string) => {
      const atual = ler()[tipo] ?? VAZIO;
      gravar({ ...ler(), [tipo]: { ...atual, recentes: [id, ...atual.recentes.filter((r) => r !== id)].slice(0, RECENTES_MAXIMOS) } });
    },
  };
}

/** Sem acento e em minúsculas, para a busca. */
export function paraBusca(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
