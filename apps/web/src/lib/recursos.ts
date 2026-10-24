"use client";

// Os degradês e os padrões do espaço (api/rotas/recursos.py): os salvos pela pessoa no Editor de degradês e em
// Editar › Definir padrão. Os dados são do editor; a API só guarda.
import { useCallback, useEffect, useState } from "react";

import { chamarApi } from "./api";

export type Recurso<T = Record<string, unknown>> = {
  id: string;
  tipo: "degrade" | "padrao";
  nome: string;
  dados: T;
  imagem: { largura: number; altura: number } | null;
  criado_em: string;
};

export function criarRecurso<T>(dados: { tipo: "degrade" | "padrao"; nome: string; dados?: T; imagem_png?: string }): Promise<Recurso<T>> {
  return chamarApi<Recurso<T>>("/recursos", { metodo: "POST", corpo: dados });
}

export function excluirRecurso(id: string): Promise<void> {
  return chamarApi<void>(`/recursos/${id}`, { metodo: "DELETE" });
}

/** Os recursos do espaço de um tipo, e um jeito de recarregar depois de criar ou excluir. */
export function useRecursos<T>(tipo: "degrade" | "padrao") {
  const [recursos, setRecursos] = useState<Recurso<T>[]>([]);
  const [vez, setVez] = useState(0);
  const recarregar = useCallback(() => setVez((atual) => atual + 1), []);
  useEffect(() => {
    let ativo = true;
    chamarApi<Recurso<T>[]>(`/recursos?tipo=${tipo}`)
      .then((lista) => {
        if (ativo) setRecursos(lista);
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [tipo, vez]);
  return { recursos, recarregar };
}
