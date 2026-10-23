"use client";

import { AlertCircle, Loader2, Music, Plus, Trash2 } from "lucide-react";

import { arquivoDaMidia } from "@/lib/api";
import { TIPO_ARRASTO_MIDIA } from "@/lib/arrasto";
import { formatarTempo } from "@/lib/formatar";
import type { Midia } from "@/lib/tipos";

type Props = {
  midia: Midia;
  selecionada?: boolean;
  aoSelecionar?: (midia: Midia) => void;
  aoExcluir?: (midia: Midia) => void;
  /** No editor: o botão "+" e o arrastar levam a mídia para a linha do tempo. */
  aoAdicionar?: (midia: Midia) => void;
  /** Duplo clique: abre a mídia no monitor de origem (a Fonte). */
  aoAbrir?: (midia: Midia) => void;
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
export function CartaoMidia({ midia, selecionada = false, aoSelecionar, aoExcluir, aoAdicionar, aoAbrir }: Props) {
  const temCapa = midia.arquivos.includes("capa.jpg");
  const pronta = midia.status === "pronta";
  const adicionavel = Boolean(aoAdicionar) && pronta;

  return (
    <div
      className={`group relative min-w-0 overflow-hidden rounded-lg border bg-painel-2 transition ${
        selecionada ? "border-destaque ring-1 ring-destaque" : "border-borda hover:border-suave/50"
      }`}
      draggable={adicionavel}
      onDragStart={(evento) => {
        evento.dataTransfer.setData(`${TIPO_ARRASTO_MIDIA}${midia.id}`, midia.id);
        evento.dataTransfer.effectAllowed = "copy";
      }}
    >
      <button
        type="button"
        onClick={() => aoSelecionar?.(midia)}
        onDoubleClick={aoAbrir ? () => aoAbrir(midia) : undefined}
        className="block w-full text-left focus-visible:outline-2 focus-visible:outline-destaque"
        title={midia.nome}
        aria-pressed={selecionada}
      >
        <span className="relative flex aspect-video items-center justify-center bg-painel-3">
          {temCapa ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem da API com a sessão do cookie
            <img src={arquivoDaMidia(midia.id, "capa.jpg")} alt="" className="size-full object-cover" loading="lazy" draggable={false} />
          ) : midia.status === "erro" ? (
            <AlertCircle className="size-6 text-erro" aria-hidden />
          ) : pronta ? (
            <Music className="size-6 text-suave" aria-hidden />
          ) : (
            <Loader2 className="size-6 animate-spin text-suave" aria-hidden />
          )}
          {pronta && midia.imagem ? (
            <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">Imagem</span>
          ) : pronta && midia.duracao ? (
            <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
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
          className="absolute right-1 top-1 hidden size-7 items-center justify-center rounded-md bg-black/70 text-white transition hover:bg-erro group-hover:flex group-focus-within:flex [@media(hover:none)]:flex"
          aria-label={`Excluir ${midia.nome}`}
          title="Excluir"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      ) : null}
      {adicionavel ? (
        <button
          type="button"
          onClick={() => aoAdicionar!(midia)}
          className="absolute left-1 top-1 hidden size-7 items-center justify-center rounded-md bg-destaque text-white shadow transition hover:brightness-110 group-hover:flex group-focus-within:flex [@media(hover:none)]:flex"
          aria-label={`Adicionar ${midia.nome} à linha do tempo`}
          title="Adicionar à linha do tempo"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
