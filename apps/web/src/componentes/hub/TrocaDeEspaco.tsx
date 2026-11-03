"use client";

import { Check, ChevronsUpDown, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { chamarApi, ErroApi } from "@/lib/api";
import { useSessao } from "@/lib/sessao";
import type { Espaco } from "@/lib/tipos";

/** O nome e o espaço no rodapé do menu; o clique lista os espaços da pessoa para trocar. */
export function TrocaDeEspaco({ aoNavegar }: { aoNavegar: () => void }) {
  const { sessao } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [espacos, setEspacos] = useState<Espaco[] | null>(null);
  const [erro, setErro] = useState("");
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    chamarApi<Espaco[]>("/espacos")
      .then(setEspacos)
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível listar os espaços."));
    const fora = (evento: PointerEvent) => {
      if (!caixa.current?.contains(evento.target as Node)) setAberto(false);
    };
    const esc = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAberto(false);
    };
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  function usar(espaco: Espaco) {
    if (espaco.atual) {
      setAberto(false);
      return;
    }
    chamarApi(`/espacos/${espaco.id}/usar`, { metodo: "POST" })
      // Recarrega: o kit de marca e as listas guardadas no navegador são do espaço de antes
      .then(() => window.location.replace("/app"))
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível trocar de espaço."));
  }

  return (
    <div ref={caixa} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setAberto((valor) => !valor)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        className="flex w-full min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left hover:bg-painel-2"
        title="Trocar de espaço"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{sessao.usuario.nome}</span>
          <span className="block truncate text-xs text-suave">{sessao.organizacao.nome}</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-suave" aria-hidden />
      </button>
      {aberto ? (
        <div role="menu" className="absolute bottom-full left-0 z-50 mb-2 w-60 rounded-lg border border-borda bg-painel p-1 shadow-xl shadow-black/40">
          <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-apagado">Espaços</p>
          {espacos === null && !erro ? <p className="px-2 py-1.5 text-xs text-suave">Carregando…</p> : null}
          {espacos?.map((espaco) => (
            <button key={espaco.id} type="button" role="menuitem" onClick={() => usar(espaco)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-painel-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{espaco.nome}</span>
                <span className="block text-[11px] text-suave">{espaco.papel === "dono" ? "Seu espaço" : "Membro"}</span>
              </span>
              {espaco.atual ? <Check className="size-4 shrink-0 text-destaque" aria-label="Espaço atual" /> : null}
            </button>
          ))}
          {erro ? <p className="px-2 py-1.5 text-xs text-erro">{erro}</p> : null}
          <div className="my-1 border-t border-borda" />
          <Link
            href="/app/equipe"
            role="menuitem"
            onClick={() => {
              setAberto(false);
              aoNavegar();
            }}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-suave hover:bg-painel-2 hover:text-texto"
          >
            <Users className="size-4" aria-hidden /> Equipe deste espaço
          </Link>
        </div>
      ) : null}
    </div>
  );
}
