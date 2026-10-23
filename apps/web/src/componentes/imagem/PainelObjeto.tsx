"use client";

import { Brush, Eraser, LoaderCircle, MousePointerClick, Scissors, Trash2 } from "lucide-react";
import { useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import type { Midia } from "@/lib/tipos";

import type { FerramentaObjeto } from "./useObjeto";

type Props = {
  objeto: FerramentaObjeto;
  /** A mídia nova chegou (processando): o editor troca a foto ou põe a camada quando ela ficar pronta. */
  aoPedir: (acao: "apagar" | "recortar", midia: Midia) => void;
};

/** Ferramenta Objeto: marcar com um clique (ou com o pincel) e apagar ou recortar o que foi marcado. */
export function PainelObjeto({ objeto, aoPedir }: Props) {
  const [pedindo, setPedindo] = useState<"apagar" | "recortar" | null>(null);
  if (!objeto.foto) return <p className="text-xs text-suave">Selecione uma camada de foto (na prévia ou na lista de camadas).</p>;
  const marcado = Boolean(objeto.selecao) || objeto.temPincel;

  async function pedir(acao: "apagar" | "recortar") {
    setPedindo(acao);
    const midia = await objeto.pedir(acao);
    setPedindo(null);
    if (midia) {
      aoPedir(acao, midia);
      objeto.limpar();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Como marcar">
        {(
          [
            ["clique", "Um clique", MousePointerClick],
            ["pincel", "Pincel", Brush],
          ] as const
        ).map(([id, nome, Icone]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={objeto.modo === id}
            onClick={() => objeto.setModo(id)}
            className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${objeto.modo === id ? "border-destaque bg-destaque/10" : "border-borda hover:bg-painel-2"}`}
          >
            <Icone className="size-3.5" aria-hidden />
            {nome}
          </button>
        ))}
      </div>
      {objeto.modo === "clique" ? (
        <p className="text-[11px] text-suave">Clique no objeto na prévia. Cada clique ajusta a seleção; com Shift, o clique tira o que está ali.</p>
      ) : (
        <>
          <p className="text-[11px] text-suave">Pinte por cima do que quer apagar ou recortar. O pincel soma com a seleção do clique.</p>
          <label className="flex flex-col gap-1 text-[11px] text-suave">
            Tamanho do pincel
            <input type="range" min={0.01} max={0.2} step={0.005} value={objeto.tamanhoDoPincel} onChange={(evento) => objeto.setTamanhoDoPincel(Number(evento.currentTarget.value))} />
          </label>
        </>
      )}
      <p className="flex items-center gap-1.5 text-[11px] text-apagado" role="status">
        {objeto.selecionando ? <LoaderCircle className="size-3 animate-spin" aria-hidden /> : null}
        {objeto.selecionando ? "Achando o objeto…" : objeto.selecao ? `Selecionado (${objeto.pontos.length} ${objeto.pontos.length === 1 ? "ponto" : "pontos"})` : marcado ? "Pintado com o pincel" : "Nada marcado"}
      </p>
      {objeto.erro ? <AvisoErro>{objeto.erro}</AvisoErro> : null}
      <button type="button" className="botao-principal px-3 py-1.5 text-xs" disabled={!marcado || objeto.selecionando || pedindo !== null} onClick={() => void pedir("apagar")}>
        {pedindo === "apagar" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Eraser className="size-3.5" aria-hidden />}
        Apagar o objeto
      </button>
      <button type="button" className="botao-secundario px-3 py-1.5 text-xs" disabled={!marcado || objeto.selecionando || pedindo !== null} onClick={() => void pedir("recortar")}>
        {pedindo === "recortar" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Scissors className="size-3.5" aria-hidden />}
        Recortar o objeto (nova camada)
      </button>
      <button type="button" className="botao-icone self-start px-2 text-xs" disabled={!marcado && !objeto.pontos.length} onClick={objeto.limpar}>
        <Trash2 className="size-3.5" aria-hidden /> Limpar
      </button>
      <p className="text-[11px] text-suave">A foto apagada e o objeto recortado ficam também na biblioteca; a foto original não muda.</p>
    </div>
  );
}
