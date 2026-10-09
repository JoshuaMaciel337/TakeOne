"use client";

import { Check, ChevronLeft, CloudOff, Download, LoaderCircle, Redo2, TriangleAlert, Undo2 } from "lucide-react";
import Link from "next/link";

import { Simbolo } from "@/componentes/Logo";

import { NOMES_PROPORCAO, PROPORCOES, type Proporcao } from "./proporcoes";
import type { EstadoSalvamento } from "./useProjeto";

type Props = {
  nome: string;
  aoMudarNome: (nome: string) => void;
  proporcao: Proporcao;
  aoMudarProporcao: (proporcao: Proporcao) => void;
  salvamento: EstadoSalvamento;
  nomeDesfazer: string | null;
  nomeRefazer: string | null;
  aoDesfazer: () => void;
  aoRefazer: () => void;
};

const SALVAMENTO: Record<EstadoSalvamento, { texto: string; icone: typeof Check; cor: string; dica?: string }> = {
  salvo: { texto: "Salvo", icone: Check, cor: "text-suave" },
  pendente: { texto: "Salvando…", icone: LoaderCircle, cor: "text-suave" },
  salvando: { texto: "Salvando…", icone: LoaderCircle, cor: "text-suave" },
  "sem-conexao": {
    texto: "Sem conexão",
    icone: CloudOff,
    cor: "text-aviso",
    dica: "As alterações estão guardadas neste navegador e vão para o servidor quando a conexão voltar.",
  },
  conflito: {
    texto: "Alterado em outra aba",
    icone: TriangleAlert,
    cor: "text-erro",
    dica: "Este projeto foi salvo em outra aba ou por outra pessoa. Recarregue a página para ver a versão mais nova.",
  },
  erro: { texto: "Não foi possível salvar", icone: TriangleAlert, cor: "text-erro", dica: "Desfaça a última alteração ou recarregue a página." },
};

export function BarraSuperior({ nome, aoMudarNome, proporcao, aoMudarProporcao, salvamento, nomeDesfazer, nomeRefazer, aoDesfazer, aoRefazer }: Props) {
  const status = SALVAMENTO[salvamento];
  const Icone = status.icone;
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
          onBlur={() => {
            if (!nome.trim()) aoMudarNome("Projeto sem título");
          }}
          maxLength={120}
          className="w-full min-w-0 max-w-64 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none transition hover:border-borda focus:border-destaque"
        />
        <span className={`flex shrink-0 items-center gap-1 text-xs ${status.cor}`} title={status.dica ?? status.texto} role="status">
          <Icone className={`size-3.5 ${salvamento === "salvando" || salvamento === "pendente" ? "animate-spin" : ""}`} aria-hidden />
          <span className="hidden lg:inline">{status.texto}</span>
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="botao-icone"
          disabled={!nomeDesfazer}
          onClick={aoDesfazer}
          title={nomeDesfazer ? `Desfazer ${nomeDesfazer} (Ctrl+Z)` : "Nada para desfazer"}
          aria-label={nomeDesfazer ? `Desfazer ${nomeDesfazer}` : "Desfazer"}
        >
          <Undo2 className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="botao-icone"
          disabled={!nomeRefazer}
          onClick={aoRefazer}
          title={nomeRefazer ? `Refazer ${nomeRefazer} (Ctrl+Shift+Z)` : "Nada para refazer"}
          aria-label={nomeRefazer ? `Refazer ${nomeRefazer}` : "Refazer"}
        >
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
