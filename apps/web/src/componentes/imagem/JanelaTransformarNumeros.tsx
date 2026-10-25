"use client";

// Os números das ferramentas Girar, Refletir, Escalar e Inclinar (ADR 0003, onda 13.16), com Alt + clique na prévia:
// o ângulo, o eixo, a escala (por igual ou em cada direção) e a inclinação, em volta do ponto clicado; OK leva as
// camadas escolhidas e Copiar leva cópias delas.
import { X } from "lucide-react";
import { useState } from "react";

import { type Afim, escalaEmVolta, type FerramentaDeTransformar, giroEmVolta, inclinacaoEmVolta, reflexoEmVolta } from "@/lib/transformar/ferramentas";

const CAMPO = "w-20 rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";
const TITULO: Record<FerramentaDeTransformar, string> = { girar: "Girar", refletir: "Refletir", escalar: "Escalar", inclinar: "Inclinar" };

type Props = {
  ferramenta: FerramentaDeTransformar;
  origem: { x: number; y: number };
  aoFechar: () => void;
  aoAplicar: (afim: Afim, copiar: boolean) => void;
};

export function JanelaTransformarNumeros({ ferramenta, origem, aoFechar, aoAplicar }: Props) {
  const [angulo, setAngulo] = useState(ferramenta === "inclinar" ? 15 : 45);
  const [eixo, setEixo] = useState<"horizontal" | "vertical" | "angulo">(ferramenta === "inclinar" ? "horizontal" : "vertical");
  const [anguloDoEixo, setAnguloDoEixo] = useState(0);
  const [uniforme, setUniforme] = useState(true);
  const [escala, setEscala] = useState(100);
  const [escalaH, setEscalaH] = useState(100);
  const [escalaV, setEscalaV] = useState(100);
  const grausDoEixo = eixo === "horizontal" ? 0 : eixo === "vertical" ? 90 : anguloDoEixo;
  const afim = (): Afim => {
    if (ferramenta === "girar") return giroEmVolta(origem, angulo);
    if (ferramenta === "refletir") return reflexoEmVolta(origem, grausDoEixo);
    if (ferramenta === "escalar") return uniforme ? escalaEmVolta(origem, escala / 100, escala / 100) : escalaEmVolta(origem, escalaH / 100, escalaV / 100);
    return inclinacaoEmVolta(origem, angulo, grausDoEixo);
  };
  const numero = (rotulo: string, valor: number, aoMudar: (valor: number) => void, min: number, max: number, sufixo: string) => (
    <label className="flex items-center gap-2">
      <span className="w-32">{rotulo}</span>
      <input type="number" aria-label={rotulo} className={CAMPO} min={min} max={max} value={valor} onChange={(e) => aoMudar(Math.min(max, Math.max(min, Number(e.currentTarget.value) || 0)))} />
      <span className="text-suave">{sufixo}</span>
    </label>
  );
  const eixos = (
    <fieldset className="space-y-1">
      <legend className="mb-1 text-suave">Eixo</legend>
      {(["horizontal", "vertical", "angulo"] as const).map((item) => (
        <label key={item} className="flex items-center gap-2">
          <input type="radio" name="eixo" checked={eixo === item} onChange={() => setEixo(item)} />
          {item === "horizontal" ? "Horizontal" : item === "vertical" ? "Vertical" : "Ângulo"}
          {item === "angulo" ? <input type="number" aria-label="Ângulo do eixo" className={CAMPO} min={-360} max={360} value={anguloDoEixo} disabled={eixo !== "angulo"} onChange={(e) => setAnguloDoEixo(Number(e.currentTarget.value) || 0)} /> : null}
        </label>
      ))}
    </fieldset>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoFechar}>
      <div role="dialog" aria-modal aria-label={TITULO[ferramenta]} className="w-full max-w-xs rounded-lg border border-borda bg-painel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-2.5">
          <h2 className="text-sm font-semibold">{TITULO[ferramenta]}</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="space-y-2 p-4 text-xs">
          {ferramenta === "girar" ? numero("Ângulo", angulo, setAngulo, -360, 360, "°") : null}
          {ferramenta === "refletir" ? eixos : null}
          {ferramenta === "escalar" ? (
            <>
              <label className="flex items-center gap-2">
                <input type="radio" name="escala" checked={uniforme} onChange={() => setUniforme(true)} />
                Por igual
              </label>
              {numero("Escala", escala, setEscala, -10000, 10000, "%")}
              <label className="flex items-center gap-2">
                <input type="radio" name="escala" checked={!uniforme} onChange={() => setUniforme(false)} />
                Em cada direção
              </label>
              {numero("Horizontal", escalaH, setEscalaH, -10000, 10000, "%")}
              {numero("Vertical", escalaV, setEscalaV, -10000, 10000, "%")}
            </>
          ) : null}
          {ferramenta === "inclinar" ? (
            <>
              {numero("Ângulo de inclinação", angulo, setAngulo, -85, 85, "°")}
              {eixos}
            </>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-borda px-4 py-2.5">
          <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={() => aoAplicar(afim(), true)}>
            Copiar
          </button>
          <button type="button" className="botao-principal px-3 py-1 text-xs" onClick={() => aoAplicar(afim(), false)}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
