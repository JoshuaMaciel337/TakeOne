"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { chamarApi, ErroApi, mensagemPadrao } from "@/lib/api";
import { aoGuardarLut, guardarLut, lutGuardada } from "@/lib/projeto/lutImportada";

/** Uma LUT do espaço, como a API lista (apps/api/rotas/luts.py). */
export type LutDoEspaco = { id: string; nome: string; tamanho: number; minimo: [number, number, number]; maximo: [number, number, number]; criado_em: string };

let versao = 0;
const assinar = (aviso: () => void) =>
  aoGuardarLut(() => {
    versao += 1;
    aviso();
  });

/** Um número que muda quando chega uma tabela nova: quem desenha com as LUTs chama para redesenhar. */
export function useVersaoDasLuts(): number {
  return useSyncExternalStore(
    assinar,
    () => versao,
    () => 0,
  );
}

const baixando = new Set<string>();

/** Baixa a tabela de cada LUT (pelos dados da lista) que ainda não está guardada. */
async function baixarTabelas(luts: LutDoEspaco[]) {
  await Promise.all(
    luts
      .filter((lut) => !lutGuardada(lut.id) && !baixando.has(lut.id))
      .map(async (lut) => {
        baixando.add(lut.id);
        try {
          const resposta = await fetch(`/api/luts/${lut.id}/dados`, { credentials: "same-origin" });
          if (!resposta.ok) return;
          const dados = new Float32Array(await resposta.arrayBuffer());
          if (dados.length === lut.tamanho ** 3 * 3) guardarLut(lut.id, { tamanho: lut.tamanho, dados, minimo: lut.minimo, maximo: lut.maximo });
        } finally {
          baixando.delete(lut.id);
        }
      }),
  );
}

/** Garante as tabelas das LUTs que o projeto usa (a prévia e a exportação no navegador leem delas). */
export function useTabelasDasLuts(ids: string[]) {
  const chave = ids.filter((id) => !lutGuardada(id)).join(",");
  useEffect(() => {
    if (!chave) return;
    const faltando = new Set(chave.split(","));
    chamarApi<LutDoEspaco[]>("/luts")
      .then((lista) => baixarTabelas(lista.filter((lut) => faltando.has(lut.id))))
      .catch(() => undefined);
  }, [chave]);
  return useVersaoDasLuts();
}

/** As LUTs do espaço, para a aba Cor: listar, importar um .cube e excluir. */
export function useLuts() {
  const [luts, setLuts] = useState<LutDoEspaco[] | null>(null);
  const [erro, setErro] = useState("");

  const recarregar = useCallback(
    () =>
      chamarApi<LutDoEspaco[]>("/luts")
        .then((lista) => {
          setLuts(lista);
          setErro("");
        })
        .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar as LUTs.")),
    [],
  );

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  /** Envia o .cube como texto; devolve a LUT nova, já com a tabela guardada. */
  const importar = useCallback(async (arquivo: File): Promise<LutDoEspaco> => {
    if (arquivo.size > 10 * 1024 * 1024) throw new ErroApi(413, "O arquivo passa de 10 MB.");
    let resposta: Response;
    try {
      resposta = await fetch(`/api/luts?nome=${encodeURIComponent(arquivo.name.slice(0, 120))}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: await arquivo.text(),
        credentials: "same-origin",
      });
    } catch {
      throw new ErroApi(0, "Sem conexão com o servidor. Verifique sua internet.");
    }
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) throw new ErroApi(resposta.status, typeof dados?.detail === "string" ? dados.detail : mensagemPadrao(resposta.status));
    const nova = dados as LutDoEspaco;
    await baixarTabelas([nova]);
    setLuts((lista) => [nova, ...(lista ?? [])]);
    return nova;
  }, []);

  const excluir = useCallback(async (id: string) => {
    await chamarApi(`/luts/${id}`, { metodo: "DELETE" });
    setLuts((lista) => lista?.filter((lut) => lut.id !== id) ?? lista);
  }, []);

  return { luts, erro, importar, excluir };
}
