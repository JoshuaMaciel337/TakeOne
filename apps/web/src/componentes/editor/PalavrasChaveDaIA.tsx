"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { pedirPalavrasChave } from "@/lib/palavrasChave";
import type { Comando } from "@/lib/projeto/comandos";
import type { Projeto } from "@/lib/projeto/modelo";
import { COR_CHAVE } from "@/lib/projeto/texto";

type Props = {
  projeto: Projeto;
  aoExecutar: (comando: Comando) => void;
  aoAvisar: (mensagem: string) => void;
};

/** "Destacar palavras-chave": o LLM local escolhe a palavra mais forte de cada legenda, pintada na cor dada. */
export function PalavrasChaveDaIA({ projeto, aoExecutar, aoAvisar }: Props) {
  const [cor, setCor] = useState(COR_CHAVE);
  const [andamento, setAndamento] = useState<string | null>(null);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);
  const legendas = projeto.faixas
    .filter((faixa) => faixa.tipo === "legenda")
    .flatMap((faixa) => faixa.clipes.flatMap((clipe) => (clipe.texto?.conteudo.trim() ? [{ id: clipe.id, texto: clipe.texto.conteudo }] : [])));
  const temDestaque = projeto.faixas.some((faixa) => faixa.tipo === "legenda" && faixa.clipes.some((clipe) => clipe.texto?.palavras_chave?.length));
  if (!legendas.length) return null;

  function destacar() {
    setAndamento("Pedindo as palavras-chave");
    pedirPalavrasChave(legendas, setAndamento, () => ativo.current)
      .then((chaves) => {
        if (!chaves) return;
        aoExecutar({ comando: "legenda.palavrasChave", parametros: { chaves, cor } });
        const quantas = Object.keys(chaves).length;
        aoAvisar(quantas ? `Palavras-chave em ${quantas} de ${legendas.length} legendas. Ctrl+Z desfaz.` : "O modelo não achou palavras para destacar.");
      })
      .catch((erro: unknown) => aoAvisar(erro instanceof Error ? erro.message : "Não foi possível destacar agora."))
      .finally(() => {
        if (ativo.current) setAndamento(null);
      });
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-borda p-2" aria-label="Palavras-chave">
      <div className="flex items-center gap-2">
        <button type="button" className="botao-secundario flex-1 px-3 py-1.5 text-xs" disabled={!!andamento} onClick={destacar}>
          {andamento ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {andamento ? "Destacando…" : "Destacar palavras-chave"}
        </button>
        <input
          type="color"
          value={cor}
          onChange={(evento) => setCor(evento.currentTarget.value)}
          aria-label="Cor das palavras-chave"
          title="Cor das palavras-chave"
          className="h-8 w-9 cursor-pointer rounded-md border border-borda bg-painel"
        />
      </div>
      {andamento ? (
        <p className="text-[11px] text-suave" role="status">
          {andamento}
        </p>
      ) : (
        <p className="text-[11px] text-suave">Um modelo de IA no servidor escolhe a palavra mais forte de cada legenda. Na aba Texto dá para mudar uma a uma.</p>
      )}
      {temDestaque && !andamento ? (
        <button type="button" className="self-start text-[11px] text-suave underline hover:text-texto" onClick={() => aoExecutar({ comando: "legenda.palavrasChave", parametros: { chaves: {}, cor: null } })}>
          Tirar os destaques
        </button>
      ) : null}
    </section>
  );
}
