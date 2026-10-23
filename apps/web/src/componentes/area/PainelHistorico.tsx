"use client";

import { History, ImageIcon, type LucideIcon } from "lucide-react";

/** Histórico: o estado de abertura e os passos; clicar volta (ou avança) até ele. Os desfeitos ficam apagados. */
export function PainelHistorico({ nome, feitos, desfeitos, aoIr, Icone = ImageIcon }: { nome: string; feitos: string[]; desfeitos: string[]; aoIr: (desfazer: number, refazer: number) => void; Icone?: LucideIcon }) {
  const linha = "flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-painel-2";
  return (
    <ol aria-label="Histórico" className="flex flex-col py-1">
      <li>
        <button type="button" className={`${linha} ${feitos.length ? "" : "bg-destaque/25"}`} onClick={() => aoIr(feitos.length, 0)}>
          <Icone className="size-3.5 text-suave" aria-hidden />
          <span className="truncate font-medium">{nome || "Sem nome"}</span>
        </button>
      </li>
      {feitos.map((passo, i) => (
        <li key={`f${i}`}>
          <button type="button" className={`${linha} ${i === feitos.length - 1 ? "bg-destaque/25" : ""}`} onClick={() => aoIr(feitos.length - 1 - i, 0)}>
            <History className="size-3.5 text-suave" aria-hidden />
            <span className="truncate first-letter:uppercase">{passo}</span>
          </button>
        </li>
      ))}
      {desfeitos.map((passo, i) => (
        <li key={`d${i}`}>
          <button type="button" className={`${linha} text-apagado`} onClick={() => aoIr(0, i + 1)}>
            <History className="size-3.5" aria-hidden />
            <span className="truncate first-letter:uppercase">{passo}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
