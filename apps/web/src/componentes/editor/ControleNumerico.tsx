"use client";

type Props = {
  rotulo: string;
  valor: number;
  minimo: number;
  maximo: number;
  /** O campo de número aceita além do controle deslizante (ex.: escala até 2000%). */
  minimoDigitado?: number;
  maximoDigitado?: number;
  passo?: number;
  sufixo: string;
  desativado?: boolean;
  /** Enquanto arrasta o controle: aparece na prévia sem virar passo do desfazer. */
  aoPrever: (valor: number) => void;
  /** Ao soltar o controle ou confirmar o número. */
  aoConfirmar: (valor: number) => void;
  /** Um botão ao lado do rótulo (o keyframe da propriedade). */
  acao?: React.ReactNode;
};

function arredondar(valor: number, passo: number): number {
  return Math.round(valor / passo) * passo;
}

/** Controle deslizante com o valor em número ao lado, para ajustar fino. */
export function ControleNumerico({
  rotulo,
  valor,
  minimo,
  maximo,
  minimoDigitado = minimo,
  maximoDigitado = maximo,
  passo = 1,
  sufixo,
  desativado = false,
  aoPrever,
  aoConfirmar,
  acao,
}: Props) {
  const exibido = Number(arredondar(valor, passo).toFixed(4));

  function confirmarTexto(elemento: HTMLInputElement) {
    const numero = Number(elemento.value.replace(",", "."));
    if (!elemento.value.trim() || !Number.isFinite(numero)) {
      elemento.value = String(exibido);
      return;
    }
    const limitado = Math.min(maximoDigitado, Math.max(minimoDigitado, numero));
    if (limitado !== exibido) aoConfirmar(limitado);
    else elemento.value = String(exibido);
  }

  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-1.5 text-xs">
      <span className="flex items-center gap-1 text-suave">
        {acao}
        {rotulo}
      </span>
      <span className="flex items-center gap-1">
        <input
          // Remonta quando o valor muda por fora (arrasto na prévia, desfazer)
          key={exibido}
          type="text"
          inputMode="decimal"
          defaultValue={exibido}
          disabled={desativado}
          aria-label={`${rotulo} (${sufixo})`}
          onBlur={(evento) => confirmarTexto(evento.currentTarget)}
          onKeyDown={(evento) => {
            if (evento.key === "Enter") evento.currentTarget.blur();
            if (evento.key === "Escape") {
              evento.currentTarget.value = String(exibido);
              evento.currentTarget.blur();
            }
          }}
          className="w-14 rounded-md border border-borda bg-painel-2 px-1.5 py-1 text-right tabular-nums outline-none focus:border-destaque disabled:opacity-50"
        />
        <span className="w-3 text-suave">{sufixo}</span>
      </span>
      <input
        type="range"
        min={minimo}
        max={maximo}
        step={passo}
        value={Math.min(maximo, Math.max(minimo, valor))}
        disabled={desativado}
        aria-label={rotulo}
        onChange={(evento) => aoPrever(evento.currentTarget.valueAsNumber)}
        onPointerUp={(evento) => aoConfirmar(evento.currentTarget.valueAsNumber)}
        onKeyUp={(evento) => aoConfirmar(evento.currentTarget.valueAsNumber)}
        className="col-span-2 h-1.5 w-full cursor-pointer accent-destaque disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}
