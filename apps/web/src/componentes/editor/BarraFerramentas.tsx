"use client";

import { FERRAMENTAS, type IdFerramenta } from "./ferramentas";

type Props = {
  ativa: IdFerramenta;
  aoEscolher: (id: IdFerramenta) => void;
  /** O projeto veio de um corte do Clipar: a ferramenta Corte aparece. */
  comCorte?: boolean;
  className?: string;
};

/**
 * A barra das ferramentas da tela simples (abaixo de 1024 px): uma faixa embaixo que rola para o lado, com a
 * ponta esmaecida para mostrar que há mais; com o celular deitado, em pé à esquerda.
 */
export function BarraFerramentas({ ativa, aoEscolher, comCorte = false, className = "" }: Props) {
  return (
    <nav
      aria-label="Ferramentas"
      className={`flex h-16 shrink-0 gap-0.5 overflow-auto border-t border-borda bg-painel p-1 pr-8 [mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] deitado:h-auto deitado:w-[4.5rem] deitado:flex-col deitado:border-r deitado:border-t-0 deitado:pb-8 deitado:pr-1 deitado:[mask-image:linear-gradient(to_bottom,#000_calc(100%-2.5rem),transparent)] ${className}`}
    >
      {FERRAMENTAS.filter((item) => comCorte || !item.soNoCorte).map(({ id, nome, icone: Icone }) => {
        const selecionada = id === ativa;
        return (
          <button
            key={id}
            type="button"
            onClick={() => aoEscolher(id)}
            aria-pressed={selecionada}
            className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium leading-tight transition w-[4.5rem] deitado:w-full deitado:py-1.5 ${
              selecionada ? "bg-painel-3 text-texto" : "text-suave hover:bg-painel-2 hover:text-texto"
            }`}
          >
            <Icone className={`size-5 ${selecionada ? "text-destaque" : ""}`} aria-hidden />
            <span className="w-full truncate text-center">{nome}</span>
          </button>
        );
      })}
    </nav>
  );
}
