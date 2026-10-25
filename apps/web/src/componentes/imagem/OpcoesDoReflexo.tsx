"use client";

// As opções da ferramenta Reflexo na barra (ADR 0003, onda 13.16): o centro, a cor, os raios e os anéis.
import type { OpcoesDoReflexo } from "@/lib/vetor/reflexo";

const CAMPO = "w-14 rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto";

export function OpcoesDoReflexoNaBarra({ opcoes, aoMudar }: { opcoes: OpcoesDoReflexo; aoMudar: (opcoes: OpcoesDoReflexo) => void }) {
  const numero = (chave: Exclude<keyof OpcoesDoReflexo, "cor">, rotulo: string, min: number, max: number, sufixo = "") => (
    <label className="flex items-center gap-1">
      {rotulo}
      <input type="number" aria-label={rotulo} className={CAMPO} min={min} max={max} value={opcoes[chave]} onChange={(e) => aoMudar({ ...opcoes, [chave]: Math.min(max, Math.max(min, Math.round(Number(e.currentTarget.value) || 0))) })} />
      {sufixo ? <span className="text-suave">{sufixo}</span> : null}
    </label>
  );
  return (
    <>
      {numero("diametro", "Diâmetro do centro", 2, 5000, "px")}
      <label className="flex items-center gap-1">
        Cor
        <input type="color" aria-label="Cor do reflexo" className="h-5 w-8 cursor-pointer rounded border border-borda bg-transparent" value={opcoes.cor} onChange={(e) => aoMudar({ ...opcoes, cor: e.currentTarget.value })} />
      </label>
      {numero("raios", "Raios", 0, 100)}
      {numero("comprimento", "Comprimento", 100, 1000, "%")}
      {numero("aneis", "Anéis", 0, 50)}
      {numero("maiorAnel", "Maior anel", 1, 1000, "%")}
      {numero("semente", "Sorteio", 1, 9999)}
      <button type="button" className="botao-secundario px-2 py-0.5 text-xs" onClick={() => aoMudar({ ...opcoes, semente: (opcoes.semente % 9999) + 1 })}>
        Outro
      </button>
      <span className="text-suave">Arraste do meio do brilho até onde vão os anéis</span>
    </>
  );
}
