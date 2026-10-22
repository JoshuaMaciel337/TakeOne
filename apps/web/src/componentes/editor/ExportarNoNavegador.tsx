"use client";

import { Download, MonitorDown, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { exportarNoNavegador, foiCancelado, motivoParaOServidor, tamanhoNoNavegador } from "@/lib/exportacao/noNavegador";
import { formatarBytes } from "@/lib/formatar";
import type { Projeto } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

type Props = {
  projeto: Projeto;
  midias: ReadonlyMap<string, Midia>;
  salvo: boolean;
};

/**
 * Exportar no navegador, sem esperar a fila do servidor: o mesmo desenho da prévia, em 720p, para vídeos
 * curtos. O arquivo fica só no computador (não entra na lista de exportações do projeto).
 */
export function ExportarNoNavegador({ projeto, midias, salvo }: Props) {
  const [andamento, setAndamento] = useState<{ fracao: number; etapa: string } | null>(null);
  const [pronto, setPronto] = useState<{ url: string; tamanho: number } | null>(null);
  const [erro, setErro] = useState("");
  const cancelar = useRef<AbortController | null>(null);
  const urlPronta = useRef<string | null>(null);
  const motivo = motivoParaOServidor(projeto, midias);
  const { largura, altura } = tamanhoNoNavegador(projeto.proporcao);
  const nomeDoArquivo = `${(projeto.nome || "Projeto").replace(/[\\/:*?"<>|]/g, "").trim() || "Projeto"} 720p.mp4`;

  // Ao fechar a janela: para a exportação e solta o arquivo pronto, que ocupa memória. Só ao desmontar:
  // dependendo do `pronto`, a limpeza rodava no segundo clique e abortava a exportação que acabava de começar
  useEffect(
    () => () => {
      cancelar.current?.abort();
      if (urlPronta.current) URL.revokeObjectURL(urlPronta.current);
    },
    [],
  );

  function exportar() {
    const controle = new AbortController();
    cancelar.current = controle;
    if (urlPronta.current) URL.revokeObjectURL(urlPronta.current);
    urlPronta.current = null;
    setErro("");
    setPronto(null);
    setAndamento({ fracao: 0, etapa: "Começando" });
    exportarNoNavegador(projeto, midias, (fracao, etapa) => setAndamento({ fracao, etapa }), controle.signal)
      .then((arquivo) => {
        const url = URL.createObjectURL(arquivo);
        urlPronta.current = url;
        setPronto({ url, tamanho: arquivo.size });
        // Já baixa, como o botão do servidor faz quando o vídeo fica pronto
        const link = document.createElement("a");
        link.href = url;
        link.download = nomeDoArquivo;
        link.click();
      })
      .catch((e: unknown) => {
        if (foiCancelado(e)) return;
        console.error("Exportação no navegador:", e);
        setErro(e instanceof Error ? e.message : "Não foi possível exportar no navegador.");
      })
      .finally(() => setAndamento(null));
  }

  return (
    <div className="space-y-2 border-b border-borda p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Rápido, no navegador</h3>
      <p className="text-[11px] text-suave">
        {largura} × {altura}, sem esperar a fila: o vídeo é montado neste computador, com o mesmo desenho da prévia. O arquivo fica só aqui.
      </p>
      {motivo ? (
        <p className="text-[11px] text-aviso">{motivo} Use a exportação acima.</p>
      ) : andamento ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-suave">
            <span>{andamento.etapa}</span>
            <span className="tabular-nums">{Math.round(andamento.fracao * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-painel-3">
            <div className="h-full bg-destaque transition-[width]" style={{ width: `${andamento.fracao * 100}%` }} />
          </div>
          <button type="button" className="botao-secundario px-2 py-1 text-xs" onClick={() => cancelar.current?.abort()}>
            <X className="size-3.5" aria-hidden /> Cancelar
          </button>
        </div>
      ) : (
        <button type="button" className="botao-secundario w-full px-3 py-1.5 text-xs" disabled={!salvo} onClick={exportar}>
          <MonitorDown className="size-4" aria-hidden />
          {salvo ? "Exportar no navegador" : "Esperando salvar…"}
        </button>
      )}
      {pronto ? (
        <a href={pronto.url} download={nomeDoArquivo} className="flex items-center gap-2 text-xs font-semibold text-destaque">
          <Download className="size-4" aria-hidden /> Baixar de novo ({formatarBytes(pronto.tamanho)})
        </a>
      ) : null}
      {erro ? <p className="text-xs text-erro">{erro}</p> : null}
    </div>
  );
}
