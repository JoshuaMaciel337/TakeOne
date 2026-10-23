"use client";

import { Clock } from "lucide-react";
import Link from "next/link";

import type { CategoriaDaFerramenta, FerramentaDoHub } from "@/lib/hub";

import { useAbrirNoEditor } from "./AbrirNoEditor";
import { IconeDe } from "./icones";

// Um fundo por categoria, na paleta da marca: sem imagem própria, o cartão fica reconhecível pela cor e pelo ícone
const FUNDOS: Record<CategoriaDaFerramenta, string> = {
  video: "from-destaque/30 to-destaque-2/10",
  imagem: "from-sky-500/25 to-violet-500/10",
  audio: "from-emerald-500/25 to-teal-500/10",
  ia: "from-fuchsia-500/25 to-destaque/10",
};

const SELOS = { novo: "Novo", popular: "Popular" } as const;

/** O cartão de uma ferramenta: abre a página dela, o editor na ferramenta, ou avisa que ainda vem. */
export function CartaoFerramenta({ ferramenta, compacto = false }: { ferramenta: FerramentaDoHub; compacto?: boolean }) {
  const abrirNoEditor = useAbrirNoEditor();
  const { destino } = ferramenta;
  const emBreve = destino.tipo === "em-breve";
  const conteudo = (
    <>
      <span className={`relative flex items-center justify-center bg-gradient-to-br ${FUNDOS[ferramenta.categorias[0]]} ${compacto ? "h-20" : "h-28"}`}>
        <IconeDe id={ferramenta.id} className={`${compacto ? "size-8" : "size-10"} text-texto/90`} />
        {ferramenta.selo && !emBreve ? (
          <span className="absolute left-2 top-2 rounded-full bg-destaque px-2 py-0.5 text-[10px] font-semibold text-white">{SELOS[ferramenta.selo]}</span>
        ) : null}
        {emBreve ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-borda bg-painel/80 px-2 py-0.5 text-[10px] font-medium text-suave">
            <Clock className="size-3" aria-hidden />
            Em breve
          </span>
        ) : null}
      </span>
      <span className="flex flex-1 flex-col gap-1 p-3 text-left">
        <span className="text-sm font-semibold">{ferramenta.nome}</span>
        {compacto ? null : <span className="text-xs text-suave">{ferramenta.descricao}</span>}
        {emBreve && !compacto ? <span className="mt-auto pt-1 text-[11px] text-apagado">{destino.quando}</span> : null}
      </span>
    </>
  );
  const classe = `flex h-full flex-col overflow-hidden rounded-xl border border-borda bg-painel-2 transition focus-visible:outline-2 focus-visible:outline-destaque ${
    emBreve ? "cursor-default opacity-70" : "hover:-translate-y-0.5 hover:border-suave/50"
  }`;

  if (destino.tipo === "pagina") {
    return (
      <Link href={destino.href} className={classe} title={compacto ? ferramenta.descricao : undefined}>
        {conteudo}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={classe}
      disabled={emBreve}
      title={compacto ? ferramenta.descricao : undefined}
      onClick={() => {
        if (destino.tipo === "editor") abrirNoEditor({ titulo: ferramenta.nome, ferramenta: destino.ferramenta, ondeFica: destino.ondeFica });
      }}
    >
      {conteudo}
    </button>
  );
}
