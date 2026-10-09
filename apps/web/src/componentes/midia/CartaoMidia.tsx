"use client";

import { AlertCircle, Loader2, Music, Trash2 } from "lucide-react";

import { arquivoDaMidia } from "@/lib/api";
import { formatarTempo } from "@/lib/formatar";
import type { Midia } from "@/lib/tipos";

type Props = {
  midia: Midia;
  selecionada?: boolean;
  aoSelecionar?: (midia: Midia) => void;
  aoExcluir?: (midia: Midia) => void;
};

function situacao(midia: Midia): string {
  if (midia.status === "enviando") return "Enviando";
  if (midia.status === "processando") {
    const processamento = midia.processamento;
    if (!processamento || processamento.status === "pendente") return "Na fila";
    return `${processamento.mensagem || "Preparando"} · ${processamento.progresso}%`;
  }
  return "";
}

/** Miniatura com nome e duração. A capa aparece quando a ingestão termina. */
export function CartaoMidia({ midia, selecionada = false, aoSelecionar, aoExcluir }: Props) {
  const temCapa = midia.arquivos.includes("capa.jpg");
  const pronta = midia.status === "pronta";

  return (
    <div
      className={`group relative min-w-0 overflow-hidden rounded-lg border bg-painel-2 transition ${
        selecionada ? "border-destaque ring-1 ring-destaque" : "border-borda hover:border-suave/50"
      }`}
    >
      <button
        type="button"
        onClick={() => aoSelecionar?.(midia)}
        className="block w-full text-left focus-visible:outline-2 focus-visible:outline-destaque"
        title={midia.nome}
        aria-pressed={selecionada}
      >
        <span className="relative flex aspect-video items-center justify-center bg-painel-3">
          {temCapa ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem da API com a sessão do cookie
            <img src={arquivoDaMidia(midia.id, "capa.jpg")} alt="" className="size-full object-cover" loading="lazy" />
          ) : midia.status === "erro" ? (
            <AlertCircle className="size-6 text-erro" aria-hidden />
          ) : pronta ? (
            <Music className="size-6 text-suave" aria-hidden />
          ) : (
            <Loader2 className="size-6 animate-spin text-suave" aria-hidden />
          )}
          {pronta && midia.duracao ? (
            <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
              {formatarTempo(midia.duracao)}
            </span>
          ) : null}
        </span>
        <span className="block px-2 py-1.5">
          <span className="block truncate text-xs font-medium">{midia.nome}</span>
          {midia.status === "erro" ? (
            <span className="block truncate text-[11px] text-erro" title={midia.erro ?? undefined}>
              {midia.erro || "Não foi possível preparar este arquivo."}
            </span>
          ) : !pronta ? (
            <span className="block truncate text-[11px] text-suave">{situacao(midia)}</span>
          ) : null}
        </span>
      </button>
      {aoExcluir ? (
        <button
          type="button"
          onClick={() => aoExcluir(midia)}
          className="absolute right-1 top-1 hidden size-7 items-center justify-center rounded-md bg-black/70 text-white transition hover:bg-erro group-hover:flex group-focus-within:flex"
          aria-label={`Excluir ${midia.nome}`}
          title="Excluir"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
