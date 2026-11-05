"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type ItemDoContexto = { nome: string; atalho?: string; desativado?: boolean; aoEscolher: () => void } | "-";

/**
 * O menu do botão direito (ADR 0007, 17.2): abre no ponteiro, fica dentro da tela, e fecha com Esc, com o clique fora
 * ou depois de escolher. As setas andam pelos itens e o Enter escolhe.
 */
export function MenuDeContexto({ x, y, itens, aoFechar }: { x: number; y: number; itens: ItemDoContexto[]; aoFechar: () => void }) {
  const lista = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState({ x, y });
  useLayoutEffect(() => {
    const caixa = lista.current?.getBoundingClientRect();
    if (!caixa) return;
    // Medido antes de pintar, para o menu não sair da tela
    setPosicao({ x: Math.max(4, Math.min(x, window.innerWidth - caixa.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - caixa.height - 4)) });
    lista.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
  }, [x, y]);
  useEffect(() => {
    const fora = (evento: PointerEvent) => {
      if (!lista.current?.contains(evento.target as Node)) aoFechar();
    };
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        aoFechar();
      }
    };
    window.addEventListener("pointerdown", fora, true);
    window.addEventListener("keydown", tecla, true);
    window.addEventListener("blur", aoFechar);
    return () => {
      window.removeEventListener("pointerdown", fora, true);
      window.removeEventListener("keydown", tecla, true);
      window.removeEventListener("blur", aoFechar);
    };
  }, [aoFechar]);
  return (
    <div
      ref={lista}
      role="menu"
      className="fixed z-[60] min-w-52 rounded-lg border border-borda bg-painel-2 py-1 text-xs shadow-2xl shadow-black/50"
      style={{ left: posicao.x, top: posicao.y }}
      onContextMenu={(evento) => evento.preventDefault()}
      onKeyDown={(evento) => {
        if (evento.key !== "ArrowDown" && evento.key !== "ArrowUp") return;
        evento.preventDefault();
        const botoes = [...(lista.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? [])];
        const atual = botoes.indexOf(document.activeElement as HTMLElement);
        botoes[(atual + (evento.key === "ArrowDown" ? 1 : -1) + botoes.length) % botoes.length]?.focus();
      }}
    >
      {itens.map((item, i) =>
        item === "-" ? (
          <div key={`-${i}`} className="my-1 h-px bg-borda" role="separator" />
        ) : (
          <button
            key={item.nome}
            type="button"
            role="menuitem"
            disabled={item.desativado}
            onClick={() => {
              aoFechar();
              item.aoEscolher();
            }}
            className="flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left outline-none hover:bg-painel-3 focus:bg-painel-3 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <span>{item.nome}</span>
            {item.atalho ? <span className="text-suave">{item.atalho}</span> : null}
          </button>
        ),
      )}
    </div>
  );
}
