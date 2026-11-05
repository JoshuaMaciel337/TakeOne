"use client";

import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { paraBusca } from "@/lib/materiais";
import { ATALHOS, GRUPOS_DE_ATALHO, type GrupoDeAtalho } from "@/lib/projeto/atalhos";

/** A lista dos atalhos do editor, aberta pela tecla "?" (ADR 0007, 17.8): em abas por grupo, com a busca. */
export function JanelaAtalhos({ aoFechar }: { aoFechar: () => void }) {
  const [grupo, setGrupo] = useState<GrupoDeAtalho | "todos">("todos");
  const [busca, setBusca] = useState("");
  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" || (evento.key === "?" && !(evento.target instanceof HTMLInputElement))) aoFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);
  const termo = paraBusca(busca.trim());
  const lista = ATALHOS.filter((atalho) => (grupo === "todos" || atalho.grupo === grupo) && (!termo || paraBusca(`${atalho.teclas} ${atalho.acao}`).includes(termo)));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onPointerDown={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-atalhos"
        className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60"
        onPointerDown={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-atalhos" className="font-display text-base font-semibold">
            Atalhos do teclado
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-2 border-b border-borda px-4 py-3">
          <label className="flex items-center gap-2 rounded-md border border-borda bg-painel-2 px-2 py-1">
            <Search className="size-4 text-suave" aria-hidden />
            <input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar um atalho ou uma ação" aria-label="Buscar atalhos" className="min-w-0 flex-1 bg-transparent text-sm outline-none" autoFocus />
          </label>
          <div className="flex flex-wrap gap-1 text-xs" role="tablist" aria-label="Grupos de atalhos">
            {(["todos", ...GRUPOS_DE_ATALHO] as const).map((id) => (
              <button key={id} type="button" role="tab" aria-selected={grupo === id} onClick={() => setGrupo(id)} className={`rounded-full px-2.5 py-0.5 ${grupo === id ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`}>
                {id === "todos" ? "Todos" : id}
              </button>
            ))}
          </div>
        </div>
        <dl className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
          {lista.map((atalho) => (
            <div key={atalho.teclas} className="grid grid-cols-[10rem_1fr] gap-3 border-b border-borda/50 py-1.5 last:border-0">
              <dt className="font-mono text-xs text-texto">{atalho.teclas}</dt>
              <dd className="text-xs text-suave">{atalho.acao}</dd>
            </div>
          ))}
          {!lista.length ? <p className="py-4 text-center text-xs text-suave">Nenhum atalho com isso.</p> : null}
        </dl>
      </div>
    </div>
  );
}
