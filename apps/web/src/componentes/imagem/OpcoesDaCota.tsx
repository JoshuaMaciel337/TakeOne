"use client";

// As opções da ferramenta Cota na barra (ADR 0003, onda 13.16): a cor, a espessura, o tamanho do número, o afastamento
// e as casas, com a escala de medida em que o número sai.
import { type EscalaDeMedida, textoDaEscala } from "@/lib/imagem/medicao";
import type { OpcoesDaCota } from "@/lib/vetor/cota";

const CAMPO = "w-14 rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto";

export function OpcoesDaCotaNaBarra({ opcoes, escala, aoMudar }: { opcoes: OpcoesDaCota; escala: EscalaDeMedida | null; aoMudar: (opcoes: OpcoesDaCota) => void }) {
  const numero = (chave: "espessura" | "tamanhoDoTexto" | "afastamento" | "casas", rotulo: string, min: number, max: number, sufixo = "") => (
    <label className="flex items-center gap-1">
      {rotulo}
      <input type="number" aria-label={rotulo} className={CAMPO} min={min} max={max} value={opcoes[chave]} onChange={(e) => aoMudar({ ...opcoes, [chave]: Math.min(max, Math.max(min, Number(e.currentTarget.value) || 0)) })} />
      {sufixo ? <span className="text-suave">{sufixo}</span> : null}
    </label>
  );
  return (
    <>
      <label className="flex items-center gap-1">
        Cor
        <input type="color" aria-label="Cor da cota" className="h-5 w-8 cursor-pointer rounded border border-borda bg-transparent" value={opcoes.cor} onChange={(e) => aoMudar({ ...opcoes, cor: e.currentTarget.value })} />
      </label>
      {numero("espessura", "Espessura", 0.5, 50, "px")}
      {numero("tamanhoDoTexto", "Texto", 4, 500, "px")}
      {numero("afastamento", "Afastamento", -1000, 1000, "px")}
      {numero("casas", "Casas", 0, 4)}
      <span className="text-suave">Escala: {textoDaEscala(escala)} (Imagem › Análise › Definir escala de medida)</span>
    </>
  );
}
