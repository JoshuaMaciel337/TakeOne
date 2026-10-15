"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { assinarTema, temaAtual, trocarTema, type Tema } from "@/lib/tema";

/** Troca entre o tema escuro e o claro. */
export function BotaoTema({ className = "botao-icone" }: { className?: string }) {
  const tema = useSyncExternalStore<Tema>(assinarTema, temaAtual, () => "escuro");
  const proximo: Tema = tema === "claro" ? "escuro" : "claro";
  const rotulo = proximo === "claro" ? "Usar o tema claro" : "Usar o tema escuro";
  const Icone = proximo === "claro" ? Sun : Moon;
  return (
    <button type="button" className={className} onClick={() => trocarTema(proximo)} aria-label={rotulo} title={rotulo}>
      <Icone className="size-4" aria-hidden />
    </button>
  );
}
