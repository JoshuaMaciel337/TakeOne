"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { FERRAMENTAS, type IdFerramenta } from "./ferramentas";

/**
 * As ferramentas do Takecut na tela larga (ADR 0007, 17.1): uma faixa de abas deitadas em cima do painel de conteúdo,
 * com o ícone sobre o nome. Quando não cabem, a faixa rola para o lado (pela roda do mouse ou pelas setas das pontas).
 */
export function AbasDeFerramentas({ ativa, aoEscolher, comCorte = false }: { ativa: IdFerramenta; aoEscolher: (id: IdFerramenta) => void; comCorte?: boolean }) {
  const faixa = useRef<HTMLDivElement>(null);
  const [sobra, setSobra] = useState({ antes: false, depois: false });
  const medir = useCallback(() => {
    const el = faixa.current;
    if (!el) return;
    setSobra({ antes: el.scrollLeft > 2, depois: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    const el = faixa.current;
    if (!el) return;
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    // A roda do mouse em pé anda a faixa para o lado (o ouvinte nativo, porque o do React é passivo)
    const roda = (evento: WheelEvent) => {
      if (Math.abs(evento.deltaY) <= Math.abs(evento.deltaX) || el.scrollWidth <= el.clientWidth) return;
      evento.preventDefault();
      el.scrollLeft += evento.deltaY;
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => {
      observador.disconnect();
      el.removeEventListener("wheel", roda);
    };
  }, [medir]);
  // A aba escolhida fica à vista (pelo atalho do hub ou por um pedido de fora)
  useEffect(() => {
    faixa.current?.querySelector<HTMLElement>("[aria-pressed=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [ativa]);
  const andar = (sentido: number) => faixa.current?.scrollBy({ left: sentido * 180, behavior: "smooth" });
  const seta = "absolute inset-y-0 z-10 flex w-6 items-center justify-center bg-painel/90 text-suave hover:text-texto";
  return (
    <nav aria-label="Ferramentas" className="relative shrink-0 border-b border-borda">
      {sobra.antes ? (
        <button type="button" className={`${seta} left-0`} onClick={() => andar(-1)} aria-label="Ferramentas anteriores">
          <ChevronLeft className="size-4" aria-hidden />
        </button>
      ) : null}
      <div ref={faixa} onScroll={medir} className="flex gap-0.5 overflow-x-auto px-1.5 pt-1.5 [scrollbar-width:none]">
        {FERRAMENTAS.filter((item) => comCorte || !item.soNoCorte).map(({ id, nome, icone: Icone }) => {
          const selecionada = id === ativa;
          return (
            <button
              key={id}
              type="button"
              onClick={() => aoEscolher(id)}
              aria-pressed={selecionada}
              title={nome}
              className={`relative flex min-w-14 shrink-0 flex-col items-center gap-0.5 rounded-t-md px-2 pb-1.5 pt-1 text-[10px] font-medium leading-tight transition ${
                selecionada ? "text-texto" : "text-suave hover:bg-painel-2 hover:text-texto"
              }`}
            >
              <Icone className={`size-[18px] ${selecionada ? "text-destaque" : ""}`} aria-hidden />
              <span className="whitespace-nowrap">{nome}</span>
              {selecionada ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-destaque" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      {sobra.depois ? (
        <button type="button" className={`${seta} right-0`} onClick={() => andar(1)} aria-label="Mais ferramentas">
          <ChevronRight className="size-4" aria-hidden />
        </button>
      ) : null}
    </nav>
  );
}
