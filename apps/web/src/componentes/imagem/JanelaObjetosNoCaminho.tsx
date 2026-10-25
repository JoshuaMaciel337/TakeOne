"use client";

// Camada › Objetos no caminho (ADR 0003, onda 13.16): quantas cópias da camada escolhida vão ao longo do caminho e se
// elas giram com ele.
import { X } from "lucide-react";
import { useState } from "react";

export function JanelaObjetosNoCaminho({ origem, aoFechar, aoConfirmar }: { origem: string; aoFechar: () => void; aoConfirmar: (quantidade: number, girar: boolean) => void }) {
  const [quantidade, setQuantidade] = useState(8);
  const [girar, setGirar] = useState(true);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoFechar}>
      <div role="dialog" aria-modal aria-label="Objetos no caminho" className="w-full max-w-xs rounded-lg border border-borda bg-painel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-2.5">
          <h2 className="text-sm font-semibold">Objetos no caminho</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="space-y-2 p-4 text-xs">
          <p className="text-suave">O caminho: {origem}.</p>
          <label className="flex items-center gap-2">
            Cópias
            <input type="number" aria-label="Cópias" className="w-20 rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto" min={1} max={200} value={quantidade} onChange={(e) => setQuantidade(Math.min(200, Math.max(1, Math.round(Number(e.currentTarget.value) || 1))))} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={girar} onChange={(e) => setGirar(e.currentTarget.checked)} />
            Girar com o caminho
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-borda px-4 py-2.5">
          <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="botao-principal px-3 py-1 text-xs" onClick={() => aoConfirmar(quantidade, girar)}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
