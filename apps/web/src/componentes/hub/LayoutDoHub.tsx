"use client";

import { Clock, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { BotaoTema } from "@/componentes/BotaoTema";
import { Logo } from "@/componentes/Logo";
import { itemAtivo, type ItemDoMenu, SECOES_DO_MENU } from "@/lib/hub";
import { useSessao } from "@/lib/sessao";

import { ProvedorAbrirNoEditor, useAbrirNoEditor } from "./AbrirNoEditor";
import { iconeDe } from "./icones";

/** O hub: o menu lateral por seções (gaveta no celular) e a página ao lado. O editor fica fora dele, em tela cheia. */
export function LayoutDoHub({ children }: { children: React.ReactNode }) {
  return (
    <ProvedorAbrirNoEditor>
      <Hub>{children}</Hub>
    </ProvedorAbrirNoEditor>
  );
}

function Hub({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  // Trocar de página fecha a gaveta do celular (o estado acompanha o endereço, sem efeito)
  const [caminhoDaGaveta, setCaminhoDaGaveta] = useState(caminho);
  if (caminhoDaGaveta !== caminho) {
    setCaminhoDaGaveta(caminho);
    setAberto(false);
  }
  useEffect(() => {
    if (!aberto) return;
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberto]);

  return (
    <div className="min-h-dvh min-w-0 overflow-x-clip lg:pl-60">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-borda bg-fundo/90 px-4 backdrop-blur lg:hidden">
        <Link href="/app" aria-label="Início">
          <Logo tamanho={26} />
        </Link>
        <button type="button" className="botao-icone" onClick={() => setAberto(true)} aria-label="Abrir o menu" aria-expanded={aberto}>
          <Menu className="size-5" aria-hidden />
        </button>
      </header>
      {aberto ? <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onPointerDown={() => setAberto(false)} aria-hidden /> : null}
      <aside
        aria-label="Menu"
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-borda bg-painel transition-transform lg:z-20 lg:translate-x-0 ${aberto ? "translate-x-0" : "-translate-x-full"}`}
      >
        <MenuLateral caminho={caminho} aoFechar={() => setAberto(false)} />
      </aside>
      {children}
    </div>
  );
}

function MenuLateral({ caminho, aoFechar }: { caminho: string; aoFechar: () => void }) {
  const { sessao, sair } = useSessao();
  const abrirNoEditor = useAbrirNoEditor();
  const ativo = itemAtivo(caminho);

  function item(entrada: ItemDoMenu) {
    const Icone = iconeDe(entrada.icone);
    const base = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition";
    if ("href" in entrada) {
      const marcado = entrada.href === ativo;
      return (
        <Link
          href={entrada.href}
          aria-current={marcado ? "page" : undefined}
          className={`${base} ${marcado ? "bg-destaque/15 font-medium text-texto" : "text-suave hover:bg-painel-2 hover:text-texto"}`}
        >
          <Icone className={`size-4 ${marcado ? "text-destaque" : ""}`} aria-hidden />
          {entrada.nome}
        </Link>
      );
    }
    if ("acao" in entrada) {
      return (
        <button
          type="button"
          className={`${base} text-suave hover:bg-painel-2 hover:text-texto`}
          onClick={() => {
            aoFechar();
            abrirNoEditor({ titulo: "Editor de vídeo", ferramenta: "midia" });
          }}
        >
          <Icone className="size-4" aria-hidden />
          {entrada.nome}
        </button>
      );
    }
    return (
      <span className={`${base} cursor-default text-apagado`} title="Ainda não existe no TakeOne">
        <Icone className="size-4" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{entrada.nome}</span>
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-borda px-1.5 py-0.5 text-[10px]">
          <Clock className="size-3" aria-hidden />
          Em breve
        </span>
      </span>
    );
  }

  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <Link href="/app" aria-label="Início">
          <Logo tamanho={26} />
        </Link>
        <button type="button" className="botao-icone lg:hidden" onClick={aoFechar} aria-label="Fechar o menu">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {SECOES_DO_MENU.map((secao) => (
          <div key={secao.titulo ?? "inicio"} className="mt-3 first:mt-1">
            {secao.titulo ? <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-apagado">{secao.titulo}</p> : null}
            <ul className="flex flex-col gap-0.5">
              {secao.itens.map((entrada) => (
                <li key={entrada.nome}>{item(entrada)}</li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-2 border-t border-borda p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{sessao.usuario.nome}</p>
          <p className="truncate text-xs text-suave">{sessao.organizacao.nome}</p>
        </div>
        <BotaoTema />
        <button type="button" onClick={() => void sair()} className="botao-icone" aria-label="Sair" title="Sair">
          <LogOut className="size-4" aria-hidden />
        </button>
      </div>
    </>
  );
}
