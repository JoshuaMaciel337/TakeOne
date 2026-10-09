"use client";

import { ChevronLeft, Download, Redo2, Undo2 } from "lucide-react";
import Link from "next/link";

import { Simbolo } from "@/componentes/Logo";

import { NOMES_PROPORCAO, PROPORCOES, type Proporcao } from "./proporcoes";

type Props = {
  nome: string;
  aoMudarNome: (nome: string) => void;
  proporcao: Proporcao;
  aoMudarProporcao: (proporcao: Proporcao) => void;
};

export function BarraSuperior({ nome, aoMudarNome, proporcao, aoMudarProporcao }: Props) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-borda bg-painel px-2 sm:px-3">
      <Link href="/app" className="flex shrink-0 items-center gap-1 rounded-md px-1 py-1 text-suave transition hover:text-texto" title="Voltar ao início">
        <ChevronLeft className="size-4" aria-hidden />
        <Simbolo tamanho={24} />
        <span className="sr-only">Voltar ao início</span>
      </Link>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <label className="sr-only" htmlFor="nome-projeto">
          Nome do projeto
        </label>
        <input
          id="nome-projeto"
          value={nome}
          onChange={(evento) => aoMudarNome(evento.target.value)}
          maxLength={120}
          className="w-full min-w-0 max-w-64 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none transition hover:border-borda focus:border-destaque"
        />
        <span className="hidden shrink-0 text-xs text-suave lg:inline">Ainda não salvo</span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button type="button" className="botao-icone" disabled title="Desfazer (Ctrl+Z)" aria-label="Desfazer">
          <Undo2 className="size-4" aria-hidden />
        </button>
        <button type="button" className="botao-icone" disabled title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer">
          <Redo2 className="size-4" aria-hidden />
        </button>
      </div>

      <label className="sr-only" htmlFor="proporcao">
        Proporção do vídeo
      </label>
      <select
        id="proporcao"
        value={proporcao}
        onChange={(evento) => aoMudarProporcao(evento.target.value as Proporcao)}
        className="w-24 shrink-0 rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-xs font-medium outline-none focus:border-destaque sm:w-auto"
        title="Proporção do vídeo"
      >
        {PROPORCOES.map((opcao) => (
          <option key={opcao} value={opcao}>
            {NOMES_PROPORCAO[opcao]}
          </option>
        ))}
      </select>

      <button type="button" className="botao-principal shrink-0 px-3 py-1.5" disabled title="A exportação chega na fase 2">
        <Download className="size-4" aria-hidden />
        <span className="hidden sm:inline">Exportar</span>
      </button>
    </header>
  );
}
