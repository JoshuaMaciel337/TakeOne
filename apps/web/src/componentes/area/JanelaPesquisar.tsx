"use client";

// Pesquisar (Ctrl+F): uma caixa que procura em todos os comandos dos menus e nas ferramentas; as setas andam, Enter
// faz, Esc fecha. Os comandos desligados aparecem apagados, no fim, e não fazem nada.
import { Command, Search, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { type ItemPesquisavel, procurar } from "@/lib/pesquisa";

export function JanelaPesquisar({ itens, aoFechar }: { itens: ItemPesquisavel[]; aoFechar: () => void }) {
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState(0);
  const listaRef = useRef<HTMLUListElement>(null);
  const achados = procurar(itens, busca);
  const indice = Math.min(escolhido, Math.max(0, achados.length - 1));
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>(`[data-indice="${indice}"]`)?.scrollIntoView({ block: "nearest" });
  }, [indice]);
  const fazer = (item: ItemPesquisavel | undefined) => {
    if (!item || item.desativado) return;
    aoFechar();
    // Depois de fechar: o comando pode abrir uma janela
    setTimeout(item.acao, 0);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]" onClick={aoFechar}>
      <div role="dialog" aria-modal aria-label="Pesquisar" className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-borda bg-painel shadow-2xl" onClick={(evento) => evento.stopPropagation()}>
        <label className="flex items-center gap-2 border-b border-borda px-3 py-2">
          <Search className="size-4 text-suave" aria-hidden />
          <input
            autoFocus
            aria-label="Procurar um comando ou uma ferramenta"
            placeholder="Procurar um comando ou uma ferramenta"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            value={busca}
            onChange={(evento) => {
              setBusca(evento.currentTarget.value);
              setEscolhido(0);
            }}
            onKeyDown={(evento) => {
              if (evento.key === "ArrowDown") setEscolhido(Math.min(achados.length - 1, indice + 1));
              else if (evento.key === "ArrowUp") setEscolhido(Math.max(0, indice - 1));
              else if (evento.key === "Enter") fazer(achados[indice]);
              else if (evento.key === "Escape") aoFechar();
              else return;
              evento.preventDefault();
            }}
          />
        </label>
        <ul ref={listaRef} aria-label="Resultados" className="min-h-0 flex-1 overflow-y-auto py-1">
          {achados.map((item, i) => (
            <li key={`${item.caminho}/${item.nome}/${i}`}>
              <button
                type="button"
                data-indice={i}
                disabled={item.desativado}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs disabled:opacity-40 ${i === indice ? "bg-destaque/25" : "hover:bg-painel-2"}`}
                onMouseMove={() => setEscolhido(i)}
                onClick={() => fazer(item)}
              >
                {item.tipo === "ferramenta" ? <Wrench className="size-3.5 shrink-0 text-suave" aria-hidden /> : <Command className="size-3.5 shrink-0 text-suave" aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.nome}</span>
                  <span className="block truncate text-[10px] text-suave">{item.caminho}</span>
                </span>
                {item.atalho ? <kbd className="shrink-0 rounded border border-borda px-1 text-[10px] text-suave">{item.atalho}</kbd> : null}
              </button>
            </li>
          ))}
          {!achados.length ? <li className="px-3 py-2 text-xs text-suave">Nada encontrado.</li> : null}
        </ul>
      </div>
    </div>
  );
}
