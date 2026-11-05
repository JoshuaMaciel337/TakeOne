"use client";

import { BookmarkPlus, Check, ChevronLeft, CloudOff, Download, LoaderCircle, Redo2, TriangleAlert, Undo2, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BotaoAparencia } from "@/componentes/Aparencia";
import { BotaoTema } from "@/componentes/BotaoTema";
import { Simbolo } from "@/componentes/Logo";
import { BarraDeMenus, type Menu } from "@/componentes/area/BarraDeMenus";

import type { EstadoSalvamento } from "./useProjeto";

/** Os tamanhos dos painéis do Takecut na tela larga: o painel de conteúdo, as propriedades e a linha do tempo. */
export type TamanhosDoTakecut = { conteudo: number; propriedades: number; linha: number };

export const LAYOUTS_DO_TAKECUT: { id: string; nome: string; tamanhos: TamanhosDoTakecut }[] = [
  { id: "padrao", nome: "Padrão", tamanhos: { conteudo: 320, propriedades: 300, linha: 260 } },
  { id: "materiais", nome: "Materiais largos", tamanhos: { conteudo: 500, propriedades: 280, linha: 240 } },
  { id: "previa", nome: "Prévia grande", tamanhos: { conteudo: 280, propriedades: 260, linha: 200 } },
  { id: "linha", nome: "Linha do tempo alta", tamanhos: { conteudo: 320, propriedades: 300, linha: 420 } },
];

/** O layout pronto que bate com os tamanhos de agora (nenhum, depois de arrastar um divisor). */
export function layoutAtual(tamanhos: TamanhosDoTakecut): string {
  return LAYOUTS_DO_TAKECUT.find((l) => l.tamanhos.conteudo === tamanhos.conteudo && l.tamanhos.propriedades === tamanhos.propriedades && l.tamanhos.linha === tamanhos.linha)?.id ?? "";
}

function horaCurta(momento: Date): string {
  return momento.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * A barra de cima do Takecut na tela larga (ADR 0007, 17.1): o Menu (os menus do editor num botão só), "Salvo às
 * hh:mm", o nome do projeto no meio, desfazer e refazer, os layouts prontos, o layout, o tema, salvar como modelo e
 * Exportar.
 */
export function BarraDoTakecut({
  nome,
  aoMudarNome,
  salvamento,
  nomeDesfazer,
  nomeRefazer,
  aoDesfazer,
  aoRefazer,
  menus,
  tamanhos,
  aoEscolherLayout,
  aoExportar,
  aoSalvarModelo,
  aoMelhorar,
}: {
  nome: string;
  aoMudarNome: (nome: string) => void;
  salvamento: EstadoSalvamento;
  nomeDesfazer: string | null;
  nomeRefazer: string | null;
  aoDesfazer: () => void;
  aoRefazer: () => void;
  menus: Menu[];
  tamanhos: TamanhosDoTakecut;
  aoEscolherLayout: (tamanhos: TamanhosDoTakecut) => void;
  aoExportar: () => void;
  aoSalvarModelo: () => void;
  aoMelhorar: () => void;
}) {
  // A hora em que o último salvamento terminou (a primeira vez que o estado vira "salvo" depois de outro)
  const [anterior, setAnterior] = useState(salvamento);
  const [salvoAs, setSalvoAs] = useState<string | null>(null);
  if (salvamento !== anterior) {
    setAnterior(salvamento);
    if (salvamento === "salvo") setSalvoAs(horaCurta(new Date()));
  }
  const status =
    salvamento === "salvo"
      ? { texto: salvoAs ? `Salvo às ${salvoAs}` : "Salvo", icone: Check, cor: "text-suave" }
      : salvamento === "sem-conexao"
        ? { texto: "Sem conexão: guardado neste navegador", icone: CloudOff, cor: "text-aviso" }
        : salvamento === "conflito"
          ? { texto: "Alterado em outra aba", icone: TriangleAlert, cor: "text-erro" }
          : salvamento === "erro"
            ? { texto: "Não foi possível salvar", icone: TriangleAlert, cor: "text-erro" }
            : { texto: "Salvando…", icone: LoaderCircle, cor: "text-suave" };
  const Icone = status.icone;
  const escolhido = layoutAtual(tamanhos);
  return (
    <header className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2">
      <div className="flex min-w-0 items-center gap-1">
        <Link href="/app" className="flex shrink-0 items-center gap-0.5 rounded-md px-1 py-1 text-suave transition hover:text-texto" title="Voltar ao início">
          <ChevronLeft className="size-4" aria-hidden />
          <Simbolo tamanho={22} />
          <span className="sr-only">Voltar ao início</span>
        </Link>
        <BarraDeMenus menus={[{ nome: "Menu", itens: menus.map((menu) => ({ nome: menu.nome, itens: menu.itens })) }]} />
        <span className={`flex min-w-0 items-center gap-1 text-xs ${status.cor}`} role="status" title={status.texto}>
          <Icone className={`size-3.5 shrink-0 ${salvamento === "salvando" || salvamento === "pendente" ? "animate-spin" : ""}`} aria-hidden />
          <span className="truncate">{status.texto}</span>
        </span>
      </div>

      <input
        id="nome-projeto"
        value={nome}
        onChange={(evento) => aoMudarNome(evento.target.value)}
        onBlur={() => {
          if (!nome.trim()) aoMudarNome("Projeto sem título");
        }}
        maxLength={120}
        aria-label="Nome do projeto"
        className="w-44 min-w-0 truncate rounded-md xl:w-72 border border-transparent bg-transparent px-2 py-1 text-center text-sm font-medium outline-none transition hover:border-borda focus:border-destaque"
      />

      <div className="flex min-w-0 items-center justify-end gap-1">
        <button type="button" className="botao-icone" disabled={!nomeDesfazer} onClick={aoDesfazer} title={nomeDesfazer ? `Desfazer ${nomeDesfazer} (Ctrl+Z)` : "Nada para desfazer"} aria-label={nomeDesfazer ? `Desfazer ${nomeDesfazer}` : "Desfazer"}>
          <Undo2 className="size-4" aria-hidden />
        </button>
        <button type="button" className="botao-icone" disabled={!nomeRefazer} onClick={aoRefazer} title={nomeRefazer ? `Refazer ${nomeRefazer} (Ctrl+Shift+Z)` : "Nada para refazer"} aria-label={nomeRefazer ? `Refazer ${nomeRefazer}` : "Refazer"}>
          <Redo2 className="size-4" aria-hidden />
        </button>
        <select
          aria-label="Layout dos painéis"
          title="Layout dos painéis"
          value={escolhido}
          onChange={(evento) => {
            const layout = LAYOUTS_DO_TAKECUT.find((l) => l.id === (evento.target.value || "padrao"));
            if (layout) aoEscolherLayout(layout.tamanhos);
          }}
          className="ml-1 rounded-md border border-borda bg-painel-2 px-1.5 py-1 text-xs max-xl:hidden"
        >
          {escolhido ? null : <option value="">Do meu jeito</option>}
          {LAYOUTS_DO_TAKECUT.map((l) => (
            <option key={l.id} value={l.id}>
              {l.id === "padrao" && !escolhido ? "Redefinir (padrão)" : l.nome}
            </option>
          ))}
        </select>
        <button type="button" className="botao-secundario ml-1 px-2 py-1 text-xs" onClick={aoMelhorar} title="O que dá para melhorar no projeto inteiro: o volume, a cor, as legendas, a voz e as cenas">
          <WandSparkles className="size-4 text-destaque" aria-hidden />
          <span className="max-xl:hidden">Melhorar</span>
        </button>
        <BotaoAparencia className="mx-1" />
        <BotaoTema />
        <button type="button" className="botao-icone" onClick={aoSalvarModelo} aria-label="Salvar como modelo" title="Salvar como modelo (fica na biblioteca do espaço)">
          <BookmarkPlus className="size-4" aria-hidden />
        </button>
        <button type="button" className="botao-principal shrink-0 px-3 py-1.5" onClick={aoExportar} title="Exportar o vídeo">
          <Download className="size-4" aria-hidden />
          Exportar
        </button>
      </div>
    </header>
  );
}
