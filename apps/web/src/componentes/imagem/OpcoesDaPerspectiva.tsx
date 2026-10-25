"use client";

// As opções da grade de perspectiva na barra (ADR 0003, onda 13.16): mostrar, o tipo (um, dois ou três pontos), o plano
// ativo (as formas desenhadas com a grade à vista vão para ele), a célula, a extensão, a distância e redefinir.
import { gradePadrao, type GradeDePerspectiva, type PlanoDaPerspectiva } from "@/lib/vetor/perspectiva";

const CAMPO = "w-16 rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto";
const PLANOS: { id: PlanoDaPerspectiva; nome: string; cor: string }[] = [
  { id: "esquerdo", nome: "Esquerdo", cor: "#3b82f6" },
  { id: "direito", nome: "Direito", cor: "#f97316" },
  { id: "chao", nome: "Chão", cor: "#22c55e" },
];

type Props = { grade: GradeDePerspectiva | null; documento: { largura: number; altura: number }; aoMudar: (grade: GradeDePerspectiva | null, nome: string) => void; levar: boolean };

export function OpcoesDaPerspectivaNaBarra({ grade, documento, aoMudar, levar }: Props) {
  if (!grade) {
    return (
      <button type="button" className="botao-secundario px-2 py-0.5 text-xs" onClick={() => aoMudar(gradePadrao(2, documento.largura, documento.altura), "mostrar a grade de perspectiva")}>
        Mostrar a grade de perspectiva
      </button>
    );
  }
  const numero = (chave: "celula" | "extensao" | "distancia", rotulo: string) => (
    <label className="flex items-center gap-1">
      {rotulo}
      <input type="number" aria-label={rotulo} className={CAMPO} min={1} max={100000} value={Math.round(grade[chave])} onChange={(e) => aoMudar({ ...grade, [chave]: Math.max(1, Number(e.currentTarget.value) || 1) }, "mudar a grade de perspectiva")} />
    </label>
  );
  return (
    <>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={grade.visivel} onChange={(e) => aoMudar({ ...grade, visivel: e.currentTarget.checked }, e.currentTarget.checked ? "mostrar a grade de perspectiva" : "ocultar a grade de perspectiva")} />
        Mostrar
      </label>
      <label className="flex items-center gap-1">
        Tipo
        <select aria-label="Tipo da grade" className="rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto" value={grade.tipo} onChange={(e) => aoMudar({ ...gradePadrao(Number(e.currentTarget.value) as 1 | 2 | 3, documento.largura, documento.altura), celula: grade.celula, extensao: grade.extensao }, "mudar a grade de perspectiva")}>
          <option value={1}>Um ponto</option>
          <option value={2}>Dois pontos</option>
          <option value={3}>Três pontos</option>
        </select>
      </label>
      <div className="flex items-center gap-0.5" role="group" aria-label="Plano ativo">
        {PLANOS.map((plano) => (
          <button key={plano.id} type="button" aria-pressed={grade.plano === plano.id} className={`rounded border px-1.5 py-0.5 text-xs ${grade.plano === plano.id ? "border-transparent text-white" : "border-borda text-suave"}`} style={grade.plano === plano.id ? { background: plano.cor } : undefined} onClick={() => aoMudar({ ...grade, plano: plano.id }, "mudar o plano ativo")}>
            {plano.nome}
          </button>
        ))}
      </div>
      {numero("celula", "Célula")}
      {numero("extensao", "Extensão")}
      {numero("distancia", "Distância")}
      <button type="button" className="botao-secundario px-2 py-0.5 text-xs" onClick={() => aoMudar({ ...gradePadrao(grade.tipo, documento.largura, documento.altura), plano: grade.plano }, "redefinir a grade de perspectiva")}>
        Redefinir
      </button>
      <span className="text-suave">{levar ? "Arraste para levar a camada escolhida ao plano ativo" : "Com a grade à vista, as formas desenhadas vão para o plano ativo"}</span>
    </>
  );
}
