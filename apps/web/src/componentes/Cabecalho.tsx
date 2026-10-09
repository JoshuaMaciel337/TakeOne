"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/componentes/Logo";
import { useSessao } from "@/lib/sessao";

export function Cabecalho() {
  const { sessao, sair } = useSessao();
  return (
    <header className="sticky top-0 z-20 border-b border-borda bg-fundo/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/app" aria-label="Início">
          <Logo tamanho={28} />
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden min-w-0 text-right sm:block">
            <p className="truncate text-sm font-medium">{sessao.usuario.nome}</p>
            <p className="truncate text-xs text-suave">{sessao.organizacao.nome}</p>
          </div>
          <button type="button" onClick={() => void sair()} className="botao-icone" aria-label="Sair" title="Sair">
            <LogOut className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
