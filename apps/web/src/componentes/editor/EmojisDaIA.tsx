"use client";

import { LoaderCircle, SmilePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ehMidiaDeEmoji, emojisNoProjeto } from "@/lib/emojis";
import type { Comando } from "@/lib/projeto/comandos";
import { semEmojis } from "@/lib/projeto/emojis";
import type { Projeto } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

type Props = {
  projeto: Projeto;
  midias: Midia[];
  aoExecutar: (comando: Comando) => unknown;
  aoAvisar: (mensagem: string) => void;
};

/** "Pôr emojis" (14.8): o LLM local escolhe o emoji de algumas legendas, e ele entra acima delas, com um pulo. */
export function EmojisDaIA({ projeto, midias, aoExecutar, aoAvisar }: Props) {
  const [andamento, setAndamento] = useState<string | null>(null);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);
  const porId = new Map(midias.map((midia) => [midia.id, midia]));
  const temLegendas = projeto.faixas.some((faixa) => faixa.tipo === "legenda" && faixa.clipes.some((clipe) => clipe.texto?.conteudo.trim()));
  const temEmojis = projeto.faixas.some((faixa) => faixa.clipes.some((clipe) => clipe.midia_id && ehMidiaDeEmoji(porId.get(clipe.midia_id))));
  if (!temLegendas) return null;

  function por() {
    setAndamento("Pedindo os emojis");
    emojisNoProjeto(projeto, porId, setAndamento, () => ativo.current)
      .then((feito) => {
        if (!feito) return;
        if (!feito.quantos) {
          aoAvisar("O modelo não achou legendas que pedissem um emoji.");
          return;
        }
        aoExecutar({ comando: "corte.editar", parametros: { projeto: feito.projeto, nome: "pôr os emojis" } });
        aoAvisar(`Emojis em ${feito.quantos} legendas. Ctrl+Z desfaz.`);
      })
      .catch((erro: unknown) => aoAvisar(erro instanceof Error ? erro.message : "Não foi possível pôr os emojis agora."))
      .finally(() => {
        if (ativo.current) setAndamento(null);
      });
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-borda p-2" aria-label="Emojis">
      <button type="button" className="botao-secundario px-3 py-1.5 text-xs" disabled={!!andamento} onClick={por}>
        {andamento ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <SmilePlus className="size-4" aria-hidden />}
        {andamento ? "Pondo os emojis…" : temEmojis ? "Escolher os emojis de novo" : "Pôr emojis"}
      </button>
      {andamento ? (
        <p className="text-[11px] text-suave" role="status">
          {andamento}
        </p>
      ) : (
        <p className="text-[11px] text-suave">O modelo de IA do servidor põe um emoji acima de algumas legendas, onde ele reforça o que é dito.</p>
      )}
      {temEmojis && !andamento ? (
        <button
          type="button"
          className="self-start text-[11px] text-suave underline hover:text-texto"
          onClick={() => {
            aoExecutar({ comando: "corte.editar", parametros: { projeto: semEmojis(projeto, (id) => ehMidiaDeEmoji(porId.get(id))), nome: "tirar os emojis" } });
            aoAvisar("Os emojis saíram. Ctrl+Z desfaz.");
          }}
        >
          Tirar os emojis
        </button>
      ) : null}
    </section>
  );
}
