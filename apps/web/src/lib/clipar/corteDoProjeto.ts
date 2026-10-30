"use client";

// O corte de onde o projeto veio (ADR 0004, 14.7): o editor pergunta à API pela clipagem que tem um corte montado
// neste projeto. Com ele, o editor mostra a ferramenta Corte.
import { useEffect, useState } from "react";

import { chamarApi } from "@/lib/api";
import type { Clipagem, Corte } from "@/lib/clipagens";

export type CorteDoProjeto = { clipagem: Clipagem; corte: Corte };

/** null enquanto lê e quando o projeto não veio de um corte. */
export function useCorteDoProjeto(projetoId: string): CorteDoProjeto | null {
  const [achado, setAchado] = useState<{ projetoId: string; corte: CorteDoProjeto | null } | null>(null);
  useEffect(() => {
    let ativo = true;
    chamarApi<Clipagem[]>(`/clipagens?projeto_id=${projetoId}`)
      .then((lista) => {
        const clipagem = lista[0];
        const corte = clipagem?.cortes.find((item) => item.projeto_id === projetoId);
        if (ativo) setAchado({ projetoId, corte: clipagem && corte ? { clipagem, corte } : null });
      })
      .catch(() => {
        // Sem o corte (a API fora do ar), o editor fica como o de qualquer projeto
        if (ativo) setAchado({ projetoId, corte: null });
      });
    return () => {
      ativo = false;
    };
  }, [projetoId]);
  return achado?.projetoId === projetoId ? achado.corte : null;
}
