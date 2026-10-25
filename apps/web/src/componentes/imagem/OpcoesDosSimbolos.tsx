"use client";

// As opções dos pincéis de símbolo na barra (ADR 0003, onda 13.16): o símbolo do Borrifar, o raio, a intensidade, a
// densidade e o tamanho, e o estilo do pincel de estilo.
import { ESTILOS_PRONTOS } from "@/lib/imagem/estilosProntos";
import type { FerramentaDeSimbolo, OpcoesDosSimbolos, Simbolo } from "@/lib/vetor/simbolos";

const CAMPO = "w-14 rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto";

type Props = { ferramenta: FerramentaDeSimbolo; opcoes: OpcoesDosSimbolos; simbolos: Simbolo[]; escolhido: string | null; aoEscolher: (id: string) => void; aoMudar: (opcoes: OpcoesDosSimbolos) => void };

export function OpcoesDosSimbolosNaBarra({ ferramenta, opcoes, simbolos, escolhido, aoEscolher, aoMudar }: Props) {
  const numero = (chave: "raio" | "intensidade" | "densidade" | "tamanho", rotulo: string, min: number, max: number, sufixo = "") => (
    <label className="flex items-center gap-1">
      {rotulo}
      <input type="number" aria-label={rotulo} className={CAMPO} min={min} max={max} value={opcoes[chave]} onChange={(e) => aoMudar({ ...opcoes, [chave]: Math.min(max, Math.max(min, Math.round(Number(e.currentTarget.value) || min))) })} />
      {sufixo ? <span className="text-suave">{sufixo}</span> : null}
    </label>
  );
  return (
    <>
      {ferramenta === "borrifar" ? (
        <label className="flex items-center gap-1">
          Símbolo
          <select aria-label="Símbolo do borrifo" className="rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto" value={escolhido ?? ""} onChange={(e) => aoEscolher(e.currentTarget.value)}>
            <option value="" disabled>
              {simbolos.length ? "Escolher…" : "Nenhum símbolo"}
            </option>
            {simbolos.map((simbolo) => (
              <option key={simbolo.id} value={simbolo.id}>
                {simbolo.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {numero("raio", "Raio", 2, 2000, "px")}
      {numero("intensidade", "Intensidade", 1, 100, "%")}
      {ferramenta === "borrifar" ? (
        <>
          {numero("densidade", "Densidade", 1, 100, "%")}
          {numero("tamanho", "Tamanho", 1, 1000, "%")}
        </>
      ) : null}
      {ferramenta === "estilo" ? (
        <label className="flex items-center gap-1">
          Estilo
          <select aria-label="Estilo do pincel" className="rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto" value={opcoes.estilo} onChange={(e) => aoMudar({ ...opcoes, estilo: e.currentTarget.value })}>
            {ESTILOS_PRONTOS.map((estilo) => (
              <option key={estilo.id} value={estilo.id}>
                {estilo.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <span className="text-suave">{ferramenta === "borrifar" ? "Arraste (ou segure) para borrifar; com um conjunto escolhido, as instâncias entram nele" : "Vale nas instâncias do conjunto escolhido (ou em todas); Alt faz o contrário"}</span>
    </>
  );
}
