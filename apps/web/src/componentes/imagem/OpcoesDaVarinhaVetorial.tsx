"use client";

// As opções da Varinha mágica vetorial na barra (ADR 0003, onda 13.16): cada medida que conta, com a tolerância dela.
import type { OpcoesDaVarinhaVetorial } from "@/lib/vetor/varinhaVetorial";

const CAMPO = "w-12 rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto";

export function OpcoesDaVarinhaVetorialNaBarra({ opcoes, aoMudar }: { opcoes: OpcoesDaVarinhaVetorial; aoMudar: (opcoes: OpcoesDaVarinhaVetorial) => void }) {
  const medida = (chave: "preenchimento" | "traco" | "largura" | "opacidade", rotulo: string, maximo: number, sufixo: string) => (
    <label className="flex items-center gap-1">
      <input type="checkbox" checked={opcoes[chave].usar} onChange={(e) => aoMudar({ ...opcoes, [chave]: { ...opcoes[chave], usar: e.currentTarget.checked } })} />
      {rotulo}
      <input
        type="number"
        aria-label={`Tolerância: ${rotulo}`}
        className={CAMPO}
        min={0}
        max={maximo}
        disabled={!opcoes[chave].usar}
        value={opcoes[chave].tolerancia}
        onChange={(e) => aoMudar({ ...opcoes, [chave]: { ...opcoes[chave], tolerancia: Math.min(maximo, Math.max(0, Number(e.currentTarget.value) || 0)) } })}
      />
      <span className="text-suave">{sufixo}</span>
    </label>
  );
  return (
    <>
      {medida("preenchimento", "Cor do preenchimento", 255, "")}
      {medida("traco", "Cor do traço", 255, "")}
      {medida("largura", "Largura do traço", 1000, "px")}
      {medida("opacidade", "Opacidade", 100, "%")}
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={opcoes.mesclagem.usar} onChange={(e) => aoMudar({ ...opcoes, mesclagem: { usar: e.currentTarget.checked } })} />
        Mesclagem
      </label>
    </>
  );
}
