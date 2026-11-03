"use client";

// Adaptado do AprovacaoDoVideo do HolyCut, com as anotações nos instantes do vídeo.
import { Check, CircleAlert, Clock, Copy, Flag, MessageCircle, Send } from "lucide-react";
import { useState } from "react";

import { chamarApi, ErroApi } from "@/lib/api";
import { formatarTempo } from "@/lib/formatar";
import type { Anotacao, Aprovacao, Exportacao } from "@/lib/tipos";

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

type Props = {
  exportacao: Exportacao;
  aoMudar: (aprovacao: Aprovacao | null) => void;
  /** No editor: leva as anotações para a linha do tempo, como marcadores. */
  aoMarcar?: (anotacoes: Anotacao[]) => void;
};

/**
 * Pedir ao cliente que aprove a exportação: gera um link (vale 7 dias) para mandar por mensagem, e mostra a resposta
 * e as anotações que ele deixou nos instantes do vídeo.
 */
export function AprovacaoDoVideo({ exportacao, aoMudar, aoMarcar }: Props) {
  const [link, setLink] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState("");
  const [marcadas, setMarcadas] = useState(false);
  const aprovacao = exportacao.aprovacao ?? null;
  const anotacoes = aprovacao?.anotacoes ?? [];

  async function pedir() {
    setErro("");
    setCopiado(false);
    setMarcadas(false);
    try {
      const criada = await chamarApi<{ token: string; aprovacao: Aprovacao }>(`/exportacoes/${exportacao.id}/aprovacao`, { metodo: "POST", corpo: {} });
      setLink(`${window.location.origin}/aprovar/${criada.token}`);
      aoMudar(criada.aprovacao);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível pedir a aprovação.");
    }
  }

  async function cancelar() {
    setErro("");
    try {
      await chamarApi(`/exportacoes/${exportacao.id}/aprovacao`, { metodo: "DELETE" });
      setLink("");
      aoMudar(null);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Não foi possível cancelar o pedido.");
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch {
      setErro("Não foi possível copiar. Selecione o link e copie.");
    }
  }

  const mensagem = `Pode assistir e aprovar este vídeo antes de publicarmos? ${link}`;

  return (
    <div className="col-span-full flex flex-col gap-2 text-xs" data-aprovacao={aprovacao?.status ?? "nenhuma"}>
      {!aprovacao ? (
        <button type="button" onClick={() => void pedir()} className="botao-secundario self-start px-3 py-1.5 text-xs">
          <Send className="size-3.5" aria-hidden /> Pedir aprovação
        </button>
      ) : aprovacao.status === "aprovado" ? (
        <p className="flex items-start gap-1.5 text-sucesso">
          <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Aprovado por {aprovacao.respondido_por}
          {aprovacao.respondido_em ? `, ${formatarData(aprovacao.respondido_em)}` : ""}
        </p>
      ) : aprovacao.status === "ajustes" ? (
        <p className="flex items-start gap-1.5 font-medium">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-aviso" aria-hidden /> {aprovacao.respondido_por} pediu ajustes
        </p>
      ) : aprovacao.expirada ? (
        <p className="flex items-start gap-1.5 text-suave">
          <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> O link expirou sem resposta.
        </p>
      ) : (
        <p className="flex items-start gap-1.5 text-suave">
          <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Esperando a resposta{aprovacao.para ? ` de ${aprovacao.para}` : ""}
          {anotacoes.length ? ` (${anotacoes.length} anotaç${anotacoes.length === 1 ? "ão" : "ões"} até agora)` : ""}.
        </p>
      )}

      {aprovacao?.comentario ? <p className="whitespace-pre-line rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-texto">{aprovacao.comentario}</p> : null}

      {anotacoes.length ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-borda bg-painel-2 p-2">
          <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {anotacoes.map((anotacao) => (
              <li key={anotacao.id} className="flex gap-2">
                <span className="shrink-0 font-mono text-suave">{formatarTempo(anotacao.tempo)}</span>
                <span className="min-w-0">
                  <span className="text-suave">{anotacao.nome}: </span>
                  {anotacao.texto}
                </span>
              </li>
            ))}
          </ul>
          {aoMarcar ? (
            <button
              type="button"
              disabled={marcadas}
              onClick={() => {
                aoMarcar(anotacoes);
                setMarcadas(true);
              }}
              className="botao-secundario self-start px-2.5 py-1 text-xs"
              title="Um marcador amarelo em cada instante, nos tempos do vídeo exportado"
            >
              <Flag className="size-3.5" aria-hidden /> {marcadas ? "Na linha do tempo" : "Pôr na linha do tempo"}
            </button>
          ) : null}
        </div>
      ) : null}

      {link && aprovacao?.status === "pendente" ? (
        <div className="flex flex-col gap-2 rounded-md border border-borda bg-painel-2 p-2">
          <code className="break-all text-[11px]" data-link-aprovacao>
            {link}
          </code>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copiar()} className="botao-secundario px-2.5 py-1 text-xs">
              {copiado ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {copiado ? "Copiado" : "Copiar o link"}
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noopener noreferrer" className="botao-secundario px-2.5 py-1 text-xs">
              <MessageCircle className="size-3.5" aria-hidden /> Mandar pelo WhatsApp
            </a>
          </div>
          <p className="text-[11px] text-suave">Quem abrir o link assiste, anota nos instantes e aprova, sem precisar de conta. Vale por 7 dias e só mostra esta exportação.</p>
        </div>
      ) : null}

      {aprovacao ? (
        <div className="flex flex-wrap gap-3 text-[11px] text-suave">
          {aprovacao.status !== "pendente" || aprovacao.expirada || !link ? (
            <button type="button" onClick={() => void pedir()} className="underline hover:text-texto">
              {aprovacao.status === "ajustes" ? "Ajustei: pedir de novo" : aprovacao.status === "pendente" && !aprovacao.expirada ? "Gerar outro link" : "Pedir de novo"}
            </button>
          ) : null}
          {aprovacao.status === "pendente" ? (
            <button type="button" onClick={() => void cancelar()} className="underline hover:text-texto">
              Cancelar o pedido
            </button>
          ) : null}
        </div>
      ) : null}
      {erro ? <p className="text-erro">{erro}</p> : null}
    </div>
  );
}
