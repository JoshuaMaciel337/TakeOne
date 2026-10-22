"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

import { ATALHOS } from "@/lib/projeto/atalhos";

/** A lista dos atalhos do editor, aberta pela tecla "?". */
export function JanelaAtalhos({ aoFechar }: { aoFechar: () => void }) {
  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" || evento.key === "?") aoFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onPointerDown={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-atalhos"
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60"
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
        <dl className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
          {ATALHOS.map((atalho) => (
            <div key={atalho.teclas} className="grid grid-cols-[9rem_1fr] gap-3 border-b border-borda/50 py-1.5 last:border-0">
              <dt className="font-mono text-xs text-texto">{atalho.teclas}</dt>
              <dd className="text-xs text-suave">{atalho.acao}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
