"use client";

// Os dados do gráfico (ADR 0003, onda 13.16): a tabela (as categorias nas linhas, as séries nas colunas), que também se
// cola de uma planilha, o tipo do gráfico e a legenda. Abre ao desenhar com a ferramenta Gráfico e em Camada › Dados do
// gráfico, com o grupo do gráfico escolhido.
import { Minus, Plus, X } from "lucide-react";
import { useState } from "react";

import { dadosDoTexto, type Grafico, TIPOS_DE_GRAFICO, type TipoDeGrafico } from "@/lib/imagem/graficos";

const CELULA = "w-20 rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto";

export function JanelaDadosDoGrafico({ inicial, aoFechar, aoConfirmar }: { inicial: Grafico; aoFechar: () => void; aoConfirmar: (grafico: Grafico) => void }) {
  const [g, setG] = useState(inicial);
  const [colado, setColado] = useState("");
  const mudarValor = (serie: number, linha: number, valor: string) =>
    setG((atual) => ({ ...atual, series: atual.series.map((s, j) => (j === serie ? { ...s, valores: atual.rotulos.map((_, i) => (i === linha ? Number(valor.replace(",", ".")) || 0 : (s.valores[i] ?? 0))) } : s)) }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoFechar}>
      <div role="dialog" aria-modal aria-label="Dados do gráfico" className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-borda bg-painel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-2.5">
          <h2 className="text-sm font-semibold">Dados do gráfico</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1">
              Tipo
              <select aria-label="Tipo do gráfico" className="rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto" value={g.tipo} onChange={(e) => setG({ ...g, tipo: e.currentTarget.value as TipoDeGrafico })}>
                {TIPOS_DE_GRAFICO.map((tipo) => (
                  <option key={tipo.id} value={tipo.id}>
                    {tipo.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={g.legenda} onChange={(e) => setG({ ...g, legenda: e.currentTarget.checked })} />
              Legenda
            </label>
            <span className="text-suave">{g.tipo === "dispersao" ? "Na dispersão, a primeira série é o x e as outras, os y." : g.tipo === "pizza" ? "Na pizza, cada série é uma pizza e as categorias são as fatias." : ""}</span>
          </div>
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>
                <th />
                {g.series.map((serie, j) => (
                  <th key={j}>
                    <input aria-label={`Nome da série ${j + 1}`} className={CELULA} value={serie.nome} onChange={(e) => setG({ ...g, series: g.series.map((s, k) => (k === j ? { ...s, nome: e.currentTarget.value } : s)) })} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.rotulos.map((rotulo, i) => (
                <tr key={i}>
                  <td>
                    <input aria-label={`Categoria ${i + 1}`} className={CELULA} value={rotulo} onChange={(e) => setG({ ...g, rotulos: g.rotulos.map((r, k) => (k === i ? e.currentTarget.value : r)) })} />
                  </td>
                  {g.series.map((serie, j) => (
                    <td key={j}>
                      <input aria-label={`Valor ${i + 1} da série ${j + 1}`} type="number" className={CELULA} value={serie.valores[i] ?? 0} onChange={(e) => mudarValor(j, i, e.currentTarget.value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-1">
            <button type="button" className="botao-secundario flex items-center gap-1 px-2 py-0.5 text-xs" disabled={g.rotulos.length >= 100} onClick={() => setG({ ...g, rotulos: [...g.rotulos, `Categoria ${g.rotulos.length + 1}`], series: g.series.map((s) => ({ ...s, valores: [...s.valores, 0] })) })}>
              <Plus className="size-3" aria-hidden /> Categoria
            </button>
            <button type="button" className="botao-secundario flex items-center gap-1 px-2 py-0.5 text-xs" disabled={g.rotulos.length <= 1} onClick={() => setG({ ...g, rotulos: g.rotulos.slice(0, -1), series: g.series.map((s) => ({ ...s, valores: s.valores.slice(0, -1) })) })}>
              <Minus className="size-3" aria-hidden /> Categoria
            </button>
            <button type="button" className="botao-secundario flex items-center gap-1 px-2 py-0.5 text-xs" disabled={g.series.length >= 20} onClick={() => setG({ ...g, series: [...g.series, { nome: `Série ${g.series.length + 1}`, valores: g.rotulos.map(() => 0) }] })}>
              <Plus className="size-3" aria-hidden /> Série
            </button>
            <button type="button" className="botao-secundario flex items-center gap-1 px-2 py-0.5 text-xs" disabled={g.series.length <= 1} onClick={() => setG({ ...g, series: g.series.slice(0, -1) })}>
              <Minus className="size-3" aria-hidden /> Série
            </button>
          </div>
          <label className="block space-y-1">
            <span>Colar uma tabela (a primeira linha com os nomes das séries, a primeira coluna com as categorias)</span>
            <textarea aria-label="Colar uma tabela" className="h-20 w-full rounded border border-borda bg-painel-2 p-1.5 font-mono text-xs text-texto" value={colado} onChange={(e) => setColado(e.currentTarget.value)} />
            <button
              type="button"
              className="botao-secundario px-2 py-0.5 text-xs"
              disabled={!colado.trim()}
              onClick={() => {
                const dados = dadosDoTexto(colado);
                if (dados.rotulos.length && dados.series.length) setG({ ...g, rotulos: dados.rotulos.slice(0, 100), series: dados.series.slice(0, 20) });
              }}
            >
              Usar a tabela colada
            </button>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-borda px-4 py-2.5">
          <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="botao-principal px-3 py-1 text-xs" onClick={() => aoConfirmar(g)}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
