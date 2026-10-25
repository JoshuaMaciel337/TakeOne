"use client";

// Camada › Mesclar objetos (ADR 0003, onda 13.16): quantos passos entram entre as duas formas escolhidas.
import { X } from "lucide-react";
import { useState } from "react";

export function JanelaMesclarObjetos({ aoFechar, aoConfirmar }: { aoFechar: () => void; aoConfirmar: (passos: number) => void }) {
  const [passos, setPassos] = useState(5);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoFechar}>
      <div role="dialog" aria-modal aria-label="Mesclar objetos" className="w-full max-w-xs rounded-lg border border-borda bg-painel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-2.5">
          <h2 className="text-sm font-semibold">Mesclar objetos</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="space-y-2 p-4 text-xs">
          <label className="flex items-center gap-2">
            Passos
            <input type="number" aria-label="Passos" className="w-20 rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto" min={1} max={100} value={passos} onChange={(e) => setPassos(Math.min(100, Math.max(1, Math.round(Number(e.currentTarget.value) || 1))))} />
          </label>
          <p className="text-suave">As formas do meio vão do contorno, da cor e da opacidade da de baixo às da de cima, num grupo.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-borda px-4 py-2.5">
          <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="botao-principal px-3 py-1 text-xs" onClick={() => aoConfirmar(passos)}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
