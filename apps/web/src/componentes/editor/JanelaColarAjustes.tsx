"use client";

import { ClipboardPaste, X } from "lucide-react";
import { useEffect, useState } from "react";

import { GRUPOS_DE_AJUSTES, type GrupoDeAjustes } from "@/lib/projeto/edicao";

type Props = {
  /** Quantos clipes marcados vão receber os ajustes. */
  quantos: number;
  aoColar: (grupos: GrupoDeAjustes[]) => void;
  aoFechar: () => void;
};

/** "Colar ajustes" (Ctrl+Alt+V): escolhe o que vai do clipe copiado para os marcados. */
export function JanelaColarAjustes({ quantos, aoColar, aoFechar }: Props) {
  // A posição e o tamanho ficam desmarcados de saída: quase sempre a pessoa quer levar a cor e os efeitos
  const [grupos, setGrupos] = useState<GrupoDeAjustes[]>(["cor", "efeito", "animacao", "audio"]);
  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onPointerDown={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-colar-ajustes"
        className="w-full max-w-sm rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60"
        onPointerDown={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-colar-ajustes" className="font-display text-base font-semibold">
            Colar ajustes
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <form
          className="flex flex-col gap-2 p-4 text-sm"
          onSubmit={(evento) => {
            evento.preventDefault();
            aoColar(grupos);
          }}
        >
          <p className="text-xs text-suave">Do clipe copiado para {quantos === 1 ? "o clipe marcado" : `os ${quantos} clipes marcados`}. O que não vale para um clipe (som num texto, por exemplo) fica de fora nele.</p>
          {GRUPOS_DE_AJUSTES.map((grupo) => (
            <label key={grupo.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={grupos.includes(grupo.id)}
                onChange={(evento) => setGrupos(evento.currentTarget.checked ? [...grupos, grupo.id] : grupos.filter((item) => item !== grupo.id))}
              />
              {grupo.nome}
            </label>
          ))}
          <button type="submit" className="botao-principal mt-1 px-3 py-2" disabled={!grupos.length}>
            <ClipboardPaste className="size-4" aria-hidden />
            Colar
          </button>
        </form>
      </div>
    </div>
  );
}
