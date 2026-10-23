"use client";

import { LayoutTemplate } from "lucide-react";

import { formatarTempo } from "@/lib/formatar";
import type { ModeloDeProjeto } from "@/lib/projeto/modelos";

import { useAbrirNoEditor } from "./AbrirNoEditor";

/** A duração de um modelo: a soma das cenas. */
export function duracaoDoModelo(modelo: ModeloDeProjeto): number {
  return modelo.cenas.reduce((soma, cena) => soma + cena.duracaoS, 0);
}

/**
 * Um modelo de projeto na grade. Por enquanto sem a prévia em vídeo (a onda 2 do plano): o lugar dela fica com
 * o desenho padrão, na proporção do modelo e com as cenas em blocos. "Usar" cria o projeto e abre o editor nele.
 */
export function CartaoModelo({ modelo }: { modelo: ModeloDeProjeto }) {
  const abrirNoEditor = useAbrirNoEditor();
  const total = duracaoDoModelo(modelo);
  const [largura, altura] = modelo.proporcao.split(":").map(Number);
  return (
    <button
      type="button"
      onClick={() => abrirNoEditor({ titulo: `Usar “${modelo.nome}”`, ferramenta: "modelos", modelo: { id: modelo.id, proporcao: modelo.proporcao } })}
      className="group flex flex-col overflow-hidden rounded-xl border border-borda bg-painel-2 text-left transition hover:-translate-y-0.5 hover:border-suave/50 focus-visible:outline-2 focus-visible:outline-destaque"
    >
      <span className="flex h-32 items-center justify-center bg-painel-3 p-3 sm:h-44">
        <span
          className="relative flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-destaque/35 to-destaque-2/10"
          style={{ aspectRatio: `${largura} / ${altura}`, height: largura >= altura ? "auto" : "100%", width: largura >= altura ? "100%" : "auto" }}
        >
          <LayoutTemplate className="size-8 text-texto/80" aria-hidden />
          <span className="absolute inset-x-2 bottom-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {modelo.cenas.map((cena, i) => (
              <span key={cena.id} className="h-full bg-white" style={{ width: `${(cena.duracaoS / total) * 100}%`, opacity: 0.35 + (0.55 * (i + 1)) / modelo.cenas.length }} />
            ))}
          </span>
          <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">{modelo.proporcao}</span>
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-1 p-3">
        <span className="text-sm font-semibold">{modelo.nome}</span>
        <span className="text-xs text-suave">{modelo.descricao}</span>
        <span className="mt-auto pt-1 text-[11px] text-apagado">
          {modelo.categoria} · {modelo.cenas.length} {modelo.cenas.length === 1 ? "cena" : "cenas"} · {formatarTempo(total)}
        </span>
      </span>
    </button>
  );
}
