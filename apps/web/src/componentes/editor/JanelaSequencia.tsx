"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

import type { Comando } from "@/lib/projeto/comandos";
import type { Projeto } from "@/lib/projeto/modelo";
import { formatarTimecodeLongo } from "@/lib/tempo";

import { CampoCor } from "./CampoCor";
import { NOMES_PROPORCAO, PROPORCOES, type Proporcao } from "./proporcoes";

/** Sequência > Configurações da sequência: o formato do quadro e a cor de fundo, e a taxa e a duração para consulta. */
export function JanelaSequencia({ projeto, aoPrever, aoExecutar, aoFechar }: { projeto: Projeto; aoPrever: (comando: Comando | null) => void; aoExecutar: (comando: Comando) => void; aoFechar: () => void }) {
  useEffect(() => {
    const esc = (evento: KeyboardEvent) => evento.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);
  const quadros = projeto.taxa.num / projeto.taxa.den;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoFechar}>
      <div role="dialog" aria-modal aria-label="Configurações da sequência" className="flex w-full max-w-md flex-col rounded-lg border border-borda bg-painel shadow-2xl" onClick={(evento) => evento.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-2.5">
          <h2 className="text-sm font-semibold">Configurações da sequência</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-4 p-4 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-suave">Formato do quadro</span>
            <select
              value={projeto.proporcao}
              onChange={(evento) => aoExecutar({ comando: "projeto.proporcao", parametros: { proporcao: evento.currentTarget.value as Proporcao } })}
              className="rounded border border-borda bg-painel-2 px-2 py-1.5"
            >
              {PROPORCOES.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {NOMES_PROPORCAO[opcao]}
                </option>
              ))}
            </select>
          </label>
          <CampoCor
            rotulo="Cor de fundo"
            cor={projeto.fundo.cor}
            aoPrever={(cor) => aoPrever({ comando: "projeto.fundo", parametros: { cor } })}
            aoConfirmar={(cor) => aoExecutar({ comando: "projeto.fundo", parametros: { cor } })}
          />
          <dl className="grid grid-cols-2 gap-y-1 text-suave">
            <dt>Quadros por segundo</dt>
            <dd className="text-right tabular-nums text-texto">{quadros.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</dd>
            <dt>Duração</dt>
            <dd className="text-right font-mono tabular-nums text-texto">{formatarTimecodeLongo(projeto.duracao, projeto.taxa)}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
