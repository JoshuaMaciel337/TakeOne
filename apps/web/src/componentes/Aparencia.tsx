"use client";

import { Check } from "lucide-react";
import { useSyncExternalStore } from "react";

import { type Aparencia, APARENCIAS, assinarAparencia, escolherAparencia, lerAparencia } from "@/lib/aparencia";

/** A aparência dos editores (o Takecut quando a pessoa ainda não escolheu) e se ela já escolheu. */
export function useAparencia(): { aparencia: Aparencia; escolhida: boolean } {
  const lida = useSyncExternalStore(assinarAparencia, lerAparencia, () => "takepro" as const);
  return { aparencia: lida === "nenhuma" ? "takecut" : lida, escolhida: lida !== "nenhuma" };
}

/** Os dois nomes lado a lado, no topo dos editores: um clique troca o layout. */
export function BotaoAparencia({ className = "" }: { className?: string }) {
  const { aparencia } = useAparencia();
  return (
    <div role="radiogroup" aria-label="Aparência do editor" className={`flex shrink-0 rounded-md border border-borda bg-painel-2 p-0.5 text-[11px] ${className}`}>
      {APARENCIAS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={aparencia === item.id}
          title={item.descricao}
          onClick={() => aparencia !== item.id && escolherAparencia(item.id)}
          className={`rounded px-1.5 py-0.5 font-medium transition ${aparencia === item.id ? "bg-painel-3 text-texto shadow-sm" : "text-suave hover:text-texto"}`}
        >
          {item.nome}
        </button>
      ))}
    </div>
  );
}

/** O desenho de cada aparência, em blocos, para a pessoa ver a diferença antes de escolher. */
function Esboco({ aparencia }: { aparencia: Aparencia }) {
  const bloco = "rounded-[3px] bg-white/10";
  if (aparencia === "takecut") {
    return (
      <div className="flex aspect-[16/10] flex-col gap-1 rounded-md bg-black/50 p-1.5" aria-hidden>
        <div className={`${bloco} h-2.5`} />
        <div className="flex min-h-0 flex-1 gap-1">
          <div className="flex w-4 flex-col gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`size-4 rounded-[4px] ${i === 0 ? "bg-destaque/70" : "bg-white/15"}`} />
            ))}
          </div>
          <div className={`${bloco} w-1/4`} />
          <div className="flex-1 rounded-[3px] bg-black/60 ring-1 ring-white/10" />
          <div className={`${bloco} w-1/5`} />
        </div>
        <div className="flex h-1/4 flex-col justify-center gap-1 rounded-[3px] bg-white/5 px-1">
          <div className="h-2 w-2/3 rounded-full bg-destaque/60" />
          <div className="h-1.5 w-1/3 rounded-full bg-white/20" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex aspect-[16/10] flex-col gap-px rounded-md bg-black/50 p-1.5" aria-hidden>
      <div className="flex h-2 gap-1">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-1 w-3 self-center rounded-full bg-white/25" />
        ))}
      </div>
      <div className="flex min-h-0 flex-1 gap-px">
        <div className="flex w-1/4 flex-col gap-px">
          <div className="h-1.5 w-full bg-white/20" />
          <div className="flex-1 bg-white/10" />
        </div>
        <div className="flex-1 bg-black/60 ring-1 ring-white/10" />
        <div className="flex w-1/4 flex-col gap-px">
          <div className="h-1.5 w-full bg-white/20" />
          <div className="flex-1 bg-white/10" />
        </div>
      </div>
      <div className="flex h-2/5 gap-px">
        <div className="w-1/4 bg-white/10" />
        <div className="w-1.5 bg-white/15" />
        <div className="flex flex-1 flex-col justify-center gap-px bg-white/5 px-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`h-1.5 rounded-[1px] ${i < 2 ? "bg-sky-400/50" : "bg-emerald-400/40"}`} style={{ width: `${70 - i * 12}%` }} />
          ))}
        </div>
        <div className="w-1.5 bg-white/15" />
      </div>
    </div>
  );
}

/** Na primeira vez num editor: a pessoa escolhe entre o Takecut e o Takepro (dá para trocar depois, no topo). */
export function JanelaDaAparencia() {
  const { escolhida } = useAparencia();
  if (escolhida) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-aparencia">
      <div className="flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-xl border border-borda bg-painel p-5 shadow-2xl shadow-black/50">
        <div>
          <h2 id="titulo-aparencia" className="font-display text-lg font-bold">
            Como você prefere editar?
          </h2>
          <p className="mt-1 text-sm text-suave">As funções são as mesmas nos dois; muda o jeito de chegar a elas. Dá para trocar a qualquer hora, no topo do editor.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {APARENCIAS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => escolherAparencia(item.id)}
              className="group flex flex-col gap-2.5 rounded-lg border border-borda bg-painel-2 p-3 text-left transition hover:border-destaque focus-visible:border-destaque"
            >
              <Esboco aparencia={item.id} />
              <span className="flex items-center justify-between gap-2">
                <span className="font-display text-base font-bold">{item.nome}</span>
                <span className="flex items-center gap-1 text-xs text-destaque opacity-0 transition group-hover:opacity-100">
                  <Check className="size-3.5" aria-hidden /> Usar
                </span>
              </span>
              <span className="text-xs leading-relaxed text-suave">{item.descricao}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
