"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { chamarApi, ErroApi } from "@/lib/api";
import { useEnvios } from "@/lib/envios";
import { useEventosJobs } from "@/lib/eventos";
import type { Midia } from "@/lib/tipos";

/** Mídias por página da API; a biblioteca busca todas as páginas (um projeto pode usar uma mídia antiga). */
const POR_PAGINA = 200;
/** Teto de segurança: um espaço com mais que isso mostra só as mais novas. */
const MAXIMO_DE_MIDIAS = 10_000;

async function todasAsMidias(): Promise<Midia[]> {
  const lista: Midia[] = [];
  for (;;) {
    const depois = lista.length ? `&antes=${lista[lista.length - 1].id}` : "";
    const pagina = await chamarApi<Midia[]>(`/midias?limite=${POR_PAGINA}${depois}`);
    lista.push(...pagina);
    if (pagina.length < POR_PAGINA || lista.length >= MAXIMO_DE_MIDIAS) return lista;
  }
}
// Jobs que geram um arquivo a mais para uma mídia pronta, e o campo da mídia que mostra o andamento.
// null: o andamento fica num dicionário (um por tom ou por versão); só o fim recarrega.
const CAMPO_DO_JOB: Record<string, "voz_limpa" | "imagem_limpa" | "recorte_fundo" | "esconder_rostos" | null> = {
  limpeza_voz: "voz_limpa",
  limpeza_imagem: "imagem_limpa",
  recorte_fundo: "recorte_fundo",
  esconder_rostos: "esconder_rostos",
  tom: null,
  estabilizacao: null,
  inversao: null,
  fluido: null,
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
    return todasAsMidias()
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
    // "fala": o texto em fala nasce como mídia processando; sem ele, uma falha deixava o cartão parado para sempre
    // "objeto" e "quadro" também: a foto editada e o quadro congelado nascem processando, como a fala
    if (!["ingestao", "geracao_video", "animacao_html", "animacao_descrita", "fala", "objeto", "quadro"].includes(job.tipo)) return;
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
