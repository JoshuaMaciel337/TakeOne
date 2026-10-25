"use client";

// As opções das ferramentas de deformar do editor vetorial na barra (ADR 0003, onda 13.16): o raio, a intensidade, o
// sentido do Torcer e o detalhe do Recortar e do Cristalizar.
import type { FerramentaDeLiquefazer, OpcoesDoLiquefazer } from "@/lib/vetor/liquefazer";

const CAMPO = "w-14 rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto";

export function OpcoesDoLiquefazerNaBarra({ ferramenta, opcoes, aoMudar }: { ferramenta: FerramentaDeLiquefazer; opcoes: OpcoesDoLiquefazer; aoMudar: (opcoes: OpcoesDoLiquefazer) => void }) {
  const numero = (chave: "raio" | "intensidade" | "detalhe", rotulo: string, min: number, max: number, sufixo = "") => (
    <label className="flex items-center gap-1">
      {rotulo}
      <input type="number" aria-label={rotulo} className={CAMPO} min={min} max={max} value={opcoes[chave]} onChange={(e) => aoMudar({ ...opcoes, [chave]: Math.min(max, Math.max(min, Math.round(Number(e.currentTarget.value) || min))) })} />
      {sufixo ? <span className="text-suave">{sufixo}</span> : null}
    </label>
  );
  return (
    <>
      {numero("raio", "Raio", 2, 2000, "px")}
      {numero("intensidade", "Intensidade", 1, 100, "%")}
      {ferramenta === "torcer" ? (
        <label className="flex items-center gap-1">
          Sentido
          <select aria-label="Sentido do giro" className="rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto" value={opcoes.sentido} onChange={(e) => aoMudar({ ...opcoes, sentido: e.currentTarget.value as OpcoesDoLiquefazer["sentido"] })}>
            <option value="antiHorario">Anti-horário</option>
            <option value="horario">Horário</option>
          </select>
        </label>
      ) : null}
      {ferramenta === "recortar" || ferramenta === "cristalizar" ? numero("detalhe", "Detalhe", 2, 40) : null}
      <span className="text-suave">Vale na forma ou no caminho escolhido; segure parado para mais efeito</span>
    </>
  );
}
