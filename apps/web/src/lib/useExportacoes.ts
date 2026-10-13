"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { chamarApi, ErroApi } from "@/lib/api";
import { useEventosJobs } from "@/lib/eventos";
import type { Exportacao } from "@/lib/tipos";

/**
 * Exportações de um projeto. O progresso de cada render chega pelos eventos dos jobs; quando um
 * termina, a lista é recarregada para pegar o tamanho e a duração do vídeo.
 */
export function useExportacoes(projetoId: string, ativo: boolean) {
  const [exportacoes, setExportacoes] = useState<Exportacao[] | null>(null);
  const [erro, setErro] = useState("");
  const pedido = useRef(0);

  const recarregar = useCallback(() => {
    const numero = ++pedido.current;
    return chamarApi<Exportacao[]>(`/exportacoes?projeto_id=${projetoId}`)
      .then((lista) => {
        if (numero !== pedido.current) return;
        setExportacoes(lista);
        setErro("");
      })
      .catch((e) => {
        if (numero === pedido.current) setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar as exportações.");
      });
  }, [projetoId]);

  useEffect(() => {
    if (ativo) void recarregar();
  }, [ativo, recarregar]);

  useEventosJobs((job) => {
    if (job.tipo !== "renderizacao") return;
    const exportacaoId = String(job.entrada.exportacao_id ?? "");
    if (job.status === "concluido" || job.status === "erro") {
      void recarregar();
      return;
    }
    setExportacoes(
      (lista) =>
        lista?.map((exportacao) =>
          exportacao.id === exportacaoId
            ? { ...exportacao, processamento: { status: job.status, progresso: job.progresso, mensagem: job.mensagem } }
            : exportacao,
        ) ?? lista,
    );
  });

  const exportar = useCallback(
    async (resolucao: Exportacao["resolucao"]) => {
      const nova = await chamarApi<Exportacao>("/exportacoes", { metodo: "POST", corpo: { projeto_id: projetoId, resolucao } });
      setExportacoes((lista) => [nova, ...(lista ?? [])]);
    },
    [projetoId],
  );

  const excluir = useCallback(async (exportacaoId: string) => {
    await chamarApi(`/exportacoes/${exportacaoId}`, { metodo: "DELETE" });
    setExportacoes((lista) => lista?.filter((exportacao) => exportacao.id !== exportacaoId) ?? lista);
  }, []);

  return { exportacoes, erro, exportar, excluir };
}
