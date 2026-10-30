"use client";

// Os modelos de corte (ADR 0004, 14.6) para escolher: os prontos e os do espaço (os salvos a partir de um corte aberto
// no editor), cada um com o que faz. Usado na página de opções do Clipar, na lista de cortes e no editor.
import { Check, Trash2 } from "lucide-react";
import { useEffect, useMemo } from "react";

import { MODELOS_PRONTOS, type ModeloDeCorte, type ReceitaDoCorte, receitaValida, resumoDaReceita } from "@/lib/clipar/modelosDeCorte";
import { excluirRecurso, useRecursos } from "@/lib/recursos";

const EVENTO = "takeone-modelos-de-corte";

/** Avisa todas as listas abertas que um modelo do espaço foi salvo ou excluído. */
export function avisarModelosMudaram() {
  window.dispatchEvent(new Event(EVENTO));
}

/** Os modelos prontos e os do espaço (o id dos do espaço começa por "espaco:"). */
export function useModelosDeCorte() {
  const { recursos, recarregar } = useRecursos<{ receita: ReceitaDoCorte }>("modelo_corte");
  useEffect(() => {
    window.addEventListener(EVENTO, recarregar);
    return () => window.removeEventListener(EVENTO, recarregar);
  }, [recarregar]);
  const modelos = useMemo<(ModeloDeCorte & { descricao?: string; doEspaco?: string })[]>(
    () => [...MODELOS_PRONTOS, ...recursos.map((recurso) => ({ id: `espaco:${recurso.id}`, nome: recurso.nome, receita: receitaValida(recurso.dados.receita), doEspaco: recurso.id }))],
    [recursos],
  );
  return { modelos, recarregar };
}

type Props = {
  escolhido: string | null;
  aoEscolher: (modelo: ModeloDeCorte) => void;
  /** Mostra a lixeira nos modelos do espaço. */
  podeExcluir?: boolean;
  compacto?: boolean;
};

export function EscolhaDoModelo({ escolhido, aoEscolher, podeExcluir = false, compacto = false }: Props) {
  const { modelos } = useModelosDeCorte();
  return (
    <ul className={`grid gap-2 ${compacto ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
      {modelos.map((modelo) => {
        const ativo = modelo.id === escolhido;
        return (
          <li key={modelo.id} className="relative">
            <button
              type="button"
              aria-pressed={ativo}
              onClick={() => aoEscolher({ id: modelo.id, nome: modelo.nome, receita: modelo.receita })}
              className={`flex h-full w-full flex-col gap-1 rounded-lg border p-3 text-left transition ${ativo ? "border-destaque bg-destaque/10" : "border-borda hover:border-suave"}`}
            >
              <span className="flex items-center gap-1.5 pr-6 text-sm font-semibold">
                {ativo ? <Check className="size-4 text-destaque" aria-hidden /> : null}
                {modelo.nome}
                {modelo.doEspaco ? <span className="rounded bg-painel-3 px-1.5 text-[10px] font-normal text-suave">do espaço</span> : null}
              </span>
              {modelo.descricao && !compacto ? <span className="text-xs text-suave">{modelo.descricao}</span> : null}
              <span className="text-[11px] text-apagado">{resumoDaReceita(modelo.receita).join(" · ")}</span>
            </button>
            {podeExcluir && modelo.doEspaco ? (
              <button
                type="button"
                className="botao-icone absolute right-1.5 top-1.5 size-7"
                aria-label={`Excluir o modelo “${modelo.nome}”`}
                title="Excluir o modelo"
                onClick={() => {
                  if (window.confirm(`Excluir o modelo “${modelo.nome}”? Os cortes já montados com ele não mudam.`)) void excluirRecurso(modelo.doEspaco!).then(avisarModelosMudaram);
                }}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
