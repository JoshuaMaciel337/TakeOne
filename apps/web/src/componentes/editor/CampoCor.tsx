"use client";

import { useMarca } from "@/lib/marca";

type Props = {
  rotulo: string;
  cor: string;
  desativado?: boolean;
  /** Enquanto o seletor está aberto: aparece na prévia sem virar passo do desfazer. */
  aoPrever: (cor: string) => void;
  /** Quando a pessoa fecha o seletor. */
  aoConfirmar: (cor: string) => void;
};

/** Seletor de cor com o código ao lado e, embaixo, as cores do kit de marca a um clique. */
export function CampoCor({ rotulo, cor, desativado = false, aoPrever, aoConfirmar }: Props) {
  const { cores } = useMarca();
  return (
    <div className="py-1.5">
      <label className="flex items-center justify-between gap-3 text-xs">
        <span className="text-suave">{rotulo}</span>
        <span className="flex items-center gap-2">
          <span className="font-mono uppercase tabular-nums text-suave">{cor}</span>
          <input
            type="color"
            value={cor}
            disabled={desativado}
            onChange={(evento) => aoPrever(evento.currentTarget.value)}
            // O "change" nativo só vem quando a pessoa fecha o seletor: aí vira um passo do desfazer
            ref={(elemento) => {
              if (!elemento) return;
              const confirmar = () => aoConfirmar(elemento.value);
              elemento.addEventListener("change", confirmar);
              return () => elemento.removeEventListener("change", confirmar);
            }}
            className="h-7 w-10 cursor-pointer rounded border border-borda bg-painel-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </span>
      </label>
      {cores.length ? (
        <div className="mt-1 flex justify-end gap-1" role="group" aria-label={`Cores da marca para ${rotulo.toLowerCase()}`}>
          {cores.map((item) => (
            <button
              key={item}
              type="button"
              disabled={desativado}
              onClick={() => aoConfirmar(item)}
              title={item}
              aria-label={`Usar ${item}`}
              className={`size-4 rounded-full border ${item === cor.toLowerCase() ? "border-texto" : "border-borda"}`}
              style={{ backgroundColor: item }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
