"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { chamarApi, ErroApi } from "@/lib/api";
import { useEnvios } from "@/lib/envios";
import { useEventosJobs } from "@/lib/eventos";
import type { Midia } from "@/lib/tipos";

const LIMITE_MIDIAS = 60;
// Jobs que geram um arquivo a mais para uma mídia pronta, e o campo da mídia que mostra o andamento.
// null: o andamento fica num dicionário (um por tom ou por versão); só o fim recarrega.
const CAMPO_DO_JOB: Record<string, "voz_limpa" | "imagem_limpa" | "recorte_fundo" | null> = {
  limpeza_voz: "voz_limpa",
  limpeza_imagem: "imagem_limpa",
  recorte_fundo: "recorte_fundo",
  tom: null,
  estabilizacao: null,
};

/**
 * Biblioteca de mídias do espaço. Recarrega quando um envio começa ou termina e quando a ingestão
 * (ou um arquivo gerado para a mídia) acaba; no meio, só atualiza o progresso.
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
    // Arquivos que o worker gera para uma mídia pronta: o progresso vai no campo dela; no fim, recarrega
    const campo = CAMPO_DO_JOB[job.tipo];
    if (campo !== undefined) {
      if (job.status === "concluido" || job.status === "erro") {
        void recarregar();
        return;
      }
      if (campo === null) return;
      setMidias((lista) =>
        lista?.map((midia) => (midia.id === midiaId ? { ...midia, [campo]: { status: "processando", erro: null, progresso: job.progresso } } : midia)) ?? lista,
      );
      return;
    }
    // A geração com IA mostra o progresso na própria mídia, como a ingestão que vem depois dela
    if (!["ingestao", "geracao_video", "animacao_html", "animacao_descrita"].includes(job.tipo)) return;
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
