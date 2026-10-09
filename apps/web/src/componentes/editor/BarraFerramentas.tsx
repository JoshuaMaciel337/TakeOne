"use client";

import { FERRAMENTAS, type IdFerramenta } from "./ferramentas";

type Props = {
  ativa: IdFerramenta;
  aoEscolher: (id: IdFerramenta) => void;
  className?: string;
};

/** No computador fica em pé à esquerda. No celular vira uma faixa embaixo que rola para o lado. */
export function BarraFerramentas({ ativa, aoEscolher, className = "" }: Props) {
  return (
    <nav
      aria-label="Ferramentas"
      className={`flex shrink-0 gap-0.5 overflow-auto border-borda bg-painel p-1 max-md:h-16 max-md:border-t md:w-20 md:flex-col md:border-r ${className}`}
    >
      {FERRAMENTAS.map(({ id, nome, icone: Icone }) => {
        const selecionada = id === ativa;
        return (
          <button
            key={id}
            type="button"
            onClick={() => aoEscolher(id)}
            aria-pressed={selecionada}
            className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium leading-tight transition max-md:w-[4.5rem] ${
              selecionada ? "bg-painel-3 text-texto" : "text-suave hover:bg-painel-2 hover:text-texto"
            }`}
          >
            <Icone className={`size-5 ${selecionada ? "text-destaque" : ""}`} aria-hidden />
            <span className="w-full text-center max-md:truncate">{nome}</span>
          </button>
        );
      })}
    </nav>
  );
}
