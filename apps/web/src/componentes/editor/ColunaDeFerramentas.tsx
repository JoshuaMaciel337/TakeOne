"use client";

import { FERRAMENTAS_DA_LINHA, type IdFerramentaDaLinha } from "./ferramentasDaLinha";

/** A coluna de ferramentas entre os painéis de baixo e a linha do tempo, como nos editores de vídeo profissionais. */
export function ColunaDeFerramentas({ ativa, aoEscolher }: { ativa: IdFerramentaDaLinha; aoEscolher: (id: IdFerramentaDaLinha) => void }) {
  return (
    <nav aria-label="Ferramentas da linha do tempo" className="flex w-9 shrink-0 flex-col items-center gap-0.5 bg-painel py-1.5">
      {FERRAMENTAS_DA_LINHA.map((item) => {
        const Icone = item.icone;
        const ligada = item.id === ativa;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={ligada}
            aria-label={item.nome}
            title={`${item.nome} (${item.tecla})\n${item.dica}`}
            onClick={() => aoEscolher(item.id)}
            className={`grid size-7 place-items-center rounded transition ${ligada ? "bg-codigo/30 text-texto" : "text-suave hover:bg-painel-3 hover:text-texto"}`}
          >
            <Icone className="size-4" aria-hidden />
          </button>
        );
      })}
    </nav>
  );
}
