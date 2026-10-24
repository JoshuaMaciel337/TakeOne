"use client";

// A barra de menus dos editores (ADR 0002): os menus na ordem dos programas profissionais, abertos por clique e
// trocados passando o mouse com um aberto, com setas, Enter e Esc, os atalhos à direita de cada item e submenus.
// Os mesmos itens servem aos atalhos de teclado (useAtalhosDosMenus), para o menu e a tecla nunca divergirem.
import { Check, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

export type ItemDeMenu =
  | {
      nome: string;
      /** Como aparece à direita e a tecla que dispara: "Ctrl+Shift+Z", "Delete", "V". */
      atalho?: string;
      desativado?: boolean;
      /** Uma marca à esquerda (opção ligada, painel aberto). */
      marcado?: boolean;
      aoEscolher: () => void;
      titulo?: string;
    }
  | { nome: string; itens: ItemDeMenu[]; desativado?: boolean }
  | "-";

export type Menu = { nome: string; itens: ItemDeMenu[] };

function ehSubmenu(item: ItemDeMenu): item is { nome: string; itens: ItemDeMenu[]; desativado?: boolean } {
  return typeof item === "object" && "itens" in item;
}

const COM_SHIFT: Record<string, string> = { "+": "=", "{": "[", "}": "]", "?": "/", "<": ",", ">": ".", "_": "-", '"': "'" };

/** A tecla do evento no formato dos atalhos ("Ctrl+Shift+Z"), ou null para teclas que só modificam. */
export function teclaDoEvento(evento: KeyboardEvent): string | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(evento.key)) return null;
  const partes: string[] = [];
  if (evento.ctrlKey || evento.metaKey) partes.push("Ctrl");
  if (evento.altKey) partes.push("Alt");
  if (evento.shiftKey) partes.push("Shift");
  let tecla = evento.key;
  if (evento.code.startsWith("Digit")) tecla = evento.code.slice(5);
  else if (evento.code.startsWith("Key")) tecla = evento.code.slice(3);
  else if (tecla === " ") tecla = "Espaço";
  // Com Shift, os sinais viram outros ("}" no lugar de "]"): o atalho é escrito com o sinal sem Shift
  else if (tecla in COM_SHIFT) tecla = COM_SHIFT[tecla];
  else if (tecla.length === 1) tecla = tecla.toUpperCase();
  partes.push(tecla);
  return partes.join("+");
}

/** O atalho normalizado (a ordem dos modificadores fixa), para comparar com o do evento. */
export function normalizarAtalho(atalho: string): string {
  const partes = atalho.split("+").map((parte) => parte.trim()).filter(Boolean);
  const tecla = partes.pop() ?? "";
  const mods = ["Ctrl", "Alt", "Shift"].filter((mod) => partes.includes(mod));
  return [...mods, tecla.length === 1 ? tecla.toUpperCase() : tecla].join("+");
}

/** Todos os itens de ação dos menus (com os dos submenus). */
function acoes(itens: ItemDeMenu[]): Exclude<ItemDeMenu, "-" | { itens: ItemDeMenu[] }>[] {
  return itens.flatMap((item) => (item === "-" ? [] : ehSubmenu(item) ? acoes(item.itens) : [item]));
}

/** Liga os atalhos dos itens dos menus ao teclado. Os campos de texto ficam com as teclas deles. */
export function useAtalhosDosMenus(menus: Menu[], ativo = true) {
  const menusRef = useRef(menus);
  useEffect(() => {
    menusRef.current = menus;
  });
  useEffect(() => {
    if (!ativo) return;
    const ouvir = (evento: KeyboardEvent) => {
      const alvo = evento.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, select, [contenteditable='true'], [role='menu']")) return;
      // Já atendido por outro ouvinte do editor (as teclas de sempre): não roda duas vezes
      if (evento.defaultPrevented) return;
      const tecla = teclaDoEvento(evento);
      if (!tecla) return;
      for (const menu of menusRef.current) {
        const item = acoes(menu.itens).find((acao) => acao.atalho && !acao.desativado && acao.atalho.split(" ou ").map(normalizarAtalho).includes(tecla));
        if (item) {
          evento.preventDefault();
          item.aoEscolher();
          return;
        }
      }
    };
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, [ativo]);
}

function ListaDoMenu({ itens, aoFechar, nivel = 0 }: { itens: ItemDeMenu[]; aoFechar: () => void; nivel?: number }) {
  const [aberto, setAberto] = useState<number | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (nivel === 0) listaRef.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
  }, [nivel]);
  function mover(evento: React.KeyboardEvent, passo: number) {
    const lista = [...(listaRef.current?.querySelectorAll<HTMLElement>(":scope > [role=menuitem]:not([disabled])") ?? [])];
    const atual = lista.indexOf(document.activeElement as HTMLElement);
    lista[(atual + passo + lista.length) % lista.length]?.focus();
    evento.preventDefault();
  }
  return (
    <div
      ref={listaRef}
      role="menu"
      className="min-w-60 rounded-md border border-borda bg-painel-2 py-1 text-xs shadow-xl shadow-black/50"
      onKeyDown={(evento) => {
        if (evento.key === "ArrowDown") mover(evento, 1);
        else if (evento.key === "ArrowUp") mover(evento, -1);
      }}
    >
      {itens.map((item, i) => {
        if (item === "-") return <div key={i} role="separator" className="my-1 h-px bg-borda" />;
        if (ehSubmenu(item)) {
          return (
            <div key={i} className="relative" onMouseEnter={() => setAberto(i)} onMouseLeave={() => setAberto((atual) => (atual === i ? null : atual))}>
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={aberto === i}
                disabled={item.desativado}
                onClick={() => setAberto(i)}
                onKeyDown={(evento) => {
                  if (evento.key === "ArrowRight") {
                    setAberto(i);
                    evento.preventDefault();
                  }
                }}
                className="flex w-full items-center gap-2 px-3 py-1 text-left outline-none hover:bg-destaque/20 focus:bg-destaque/20 disabled:opacity-40"
              >
                <span className="w-3.5" />
                <span className="flex-1">{item.nome}</span>
                <ChevronRight className="size-3.5 text-suave" aria-hidden />
              </button>
              {aberto === i ? (
                // No celular o submenu abre embaixo do item, por dentro da lista (para o lado, passaria da tela)
                <div className="absolute left-full top-0 z-10 -mt-1 max-md:static max-md:mt-0 max-md:pl-3">
                  <ListaDoMenu itens={item.itens} aoFechar={aoFechar} nivel={nivel + 1} />
                </div>
              ) : null}
            </div>
          );
        }
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={item.desativado}
            title={item.titulo}
            onMouseEnter={() => setAberto(null)}
            onClick={() => {
              aoFechar();
              item.aoEscolher();
            }}
            className="flex w-full items-center gap-2 px-3 py-1 text-left outline-none hover:bg-destaque/20 focus:bg-destaque/20 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <span className="flex w-3.5 justify-center">{item.marcado ? <Check className="size-3.5" aria-hidden /> : null}</span>
            <span className="flex-1">{item.nome}</span>
            {item.atalho ? <span className="pl-6 text-[11px] text-suave">{item.atalho.split(" ou ")[0]}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** A barra com os menus. Clique abre; com um aberto, passar o mouse troca; Esc ou clique fora fecha. */
export function BarraDeMenus({ menus, className = "" }: { menus: Menu[]; className?: string }) {
  const [aberto, setAberto] = useState<number | null>(null);
  const barraRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (aberto === null) return;
    const fora = (evento: PointerEvent) => {
      if (!barraRef.current?.contains(evento.target as Node)) setAberto(null);
    };
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAberto(null);
      else if (evento.key === "ArrowRight" && !(document.activeElement as HTMLElement)?.getAttribute("aria-haspopup")) setAberto((atual) => (atual === null ? null : (atual + 1) % menus.length));
      else if (evento.key === "ArrowLeft") setAberto((atual) => (atual === null ? null : (atual - 1 + menus.length) % menus.length));
    };
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("pointerdown", fora);
      window.removeEventListener("keydown", tecla);
    };
  }, [aberto, menus.length]);
  return (
    <div ref={barraRef} role="menubar" aria-label="Menus" className={`flex items-center ${className}`}>
      {menus.map((menu, i) => (
        <Fragment key={menu.nome}>
          <div className="relative">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={aberto === i}
              onClick={() => setAberto((atual) => (atual === i ? null : i))}
              onMouseEnter={() => setAberto((atual) => (atual === null ? null : i))}
              className={`rounded px-2 py-1 text-xs outline-none transition ${aberto === i ? "bg-painel-3 text-texto" : "text-suave hover:bg-painel-2 hover:text-texto"}`}
            >
              {menu.nome}
            </button>
            {aberto === i ? (
              <div className="absolute left-0 top-full z-50 mt-0.5">
                <ListaDoMenu itens={menu.itens} aoFechar={() => setAberto(null)} />
              </div>
            ) : null}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
