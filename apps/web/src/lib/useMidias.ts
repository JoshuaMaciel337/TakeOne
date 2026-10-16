"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { chamarApi, ErroApi } from "@/lib/api";
import { useEnvios } from "@/lib/envios";
import { useEventosJobs } from "@/lib/eventos";
import type { Midia } from "@/lib/tipos";

const LIMITE_MIDIAS = 60;

/**
 * Biblioteca de mídias do espaço. Recarrega quando um envio começa ou termina
 * e quando a ingestão de alguma mídia acaba; no meio dela, só atualiza o progresso.
 */
export function useMidias() {
  const { versao } = useEnvios();
  const [midias, setMidias] = useState<Midia[] | null>(null);
  const [erro, setErro] = useState("");
  const pedido = useRef(0);

  const recarregar = useCallback(() => {
    const numero = ++pedido.current;
    return chamarApi<Midia[]>(`/midias?limite=${LIMITE_MIDIAS}`)
      .then((lista) => {
        if (numero !== pedido.current) return;
        setMidias(lista);
        setErro("");
      })
      .catch((e) => {
        if (numero === pedido.current) setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar as mídias.");
      });
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar, versao]);

  useEventosJobs((job) => {
    const midiaId = String(job.entrada.midia_id ?? "");
    if (job.tipo === "limpeza_voz") {
      if (job.status === "concluido" || job.status === "erro") {
        void recarregar();
        return;
      }
      setMidias((lista) =>
        lista?.map((midia) => (midia.id === midiaId ? { ...midia, voz_limpa: { status: "processando", erro: null, progresso: job.progresso } } : midia)) ?? lista,
      );
      return;
    }
    // A geração com IA mostra o progresso na própria mídia, como a ingestão que vem depois dela
    if (job.tipo !== "ingestao" && job.tipo !== "geracao_video") return;
    if (job.status === "concluido" || job.status === "erro") {
      void recarregar();
      return;
    }
    setMidias((lista) =>
      lista?.map((midia) =>
        midia.id === midiaId
          ? {
              ...midia,
              status: "processando",
              processamento: { status: job.status, progresso: job.progresso, mensagem: job.mensagem },
            }
          : midia,
      ) ?? lista,
    );
  });

  const excluir = useCallback(
    async (midiaId: string) => {
      await chamarApi(`/midias/${midiaId}`, { metodo: "DELETE" });
      setMidias((lista) => lista?.filter((midia) => midia.id !== midiaId) ?? lista);
    },
    [],
  );

  return { midias, erro, recarregar, excluir };
}
