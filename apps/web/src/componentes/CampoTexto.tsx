import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  rotulo: string;
  dica?: string;
};

export function CampoTexto({ rotulo, dica, id, className, ...resto }: Props) {
  const campoId = id ?? resto.name;
  return (
    <label htmlFor={campoId} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-texto">{rotulo}</span>
      <input
        id={campoId}
        className={`rounded-lg border border-borda bg-fundo px-3.5 py-2.5 text-texto outline-none transition placeholder:text-suave/60 focus:border-destaque focus:ring-2 focus:ring-destaque/25 ${className ?? ""}`}
        {...resto}
      />
      {dica ? <span className="text-xs text-suave">{dica}</span> : null}
    </label>
  );
}
