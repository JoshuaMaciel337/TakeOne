"use client";

// O painel Comps de camada do editor de imagem (ADR 0003, onda 13.15): a última posição do documento (o estado de
// antes de aplicar uma comp) e as comps, com o ícone que aplica; embaixo, a anterior e a próxima, atualizar, nova e
// excluir. Duplo clique abre as opções (nome, o que vale ao aplicar e o comentário).
import { ChevronLeft, ChevronRight, FilePlus, Layers, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";

import type { CompDeCamada } from "@/lib/imagem/comps";

import { Moldura } from "./JanelasDePixels";

const CAMPO = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";

type OpcoesDaComp = Pick<CompDeCamada, "nome" | "comentario" | "visibilidade" | "posicao" | "aparencia">;

export function JanelaDaComp({ titulo, inicial, aoFechar, aoConfirmar }: { titulo: string; inicial: OpcoesDaComp; aoFechar: () => void; aoConfirmar: (opcoes: OpcoesDaComp) => void }) {
  const [valor, setValor] = useState(inicial);
  const marca = (chave: "visibilidade" | "posicao" | "aparencia", rotulo: string) => (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={valor[chave]} onChange={(e) => setValor({ ...valor, [chave]: e.currentTarget.checked })} />
      {rotulo}
    </label>
  );
  return (
    <Moldura titulo={titulo} aoFechar={aoFechar} aoConfirmar={() => valor.nome.trim() && aoConfirmar({ ...valor, nome: valor.nome.trim() })}>
      <label className="flex items-center gap-2">
        Nome:
        <input aria-label="Nome da comp" className={`${CAMPO} flex-1`} value={valor.nome} maxLength={80} autoFocus onFocus={(e) => e.currentTarget.select()} onChange={(e) => setValor({ ...valor, nome: e.currentTarget.value })} />
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1">Aplicar às camadas:</legend>
        {marca("visibilidade", "Visibilidade")}
        {marca("posicao", "Posição")}
        {marca("aparencia", "Aparência (opacidade, mesclagem, preenchimento e estilo)")}
      </fieldset>
      <label className="flex flex-col gap-1">
        Comentário:
        <textarea aria-label="Comentário da comp" className={`${CAMPO} min-h-16`} value={valor.comentario} maxLength={500} onChange={(e) => setValor({ ...valor, comentario: e.currentTarget.value })} />
      </label>
    </Moldura>
  );
}

type Props = {
  comps: CompDeCamada[];
  /** A comp aplicada por último (na sessão), ou null na última posição do documento. */
  aplicada: string | null;
  temUltimaPosicao: boolean;
  /** Quantas camadas da comp não existem mais. */
  sumidas: (comp: CompDeCamada) => number;
  aoAplicar: (id: string | null) => void;
  aoCriar: (opcoes: OpcoesDaComp) => void;
  aoAtualizar: (id: string) => void;
  aoMudar: (id: string, opcoes: OpcoesDaComp) => void;
  aoExcluir: (id: string) => void;
};

export function PainelComps({ comps, aplicada, temUltimaPosicao, sumidas, aoAplicar, aoCriar, aoAtualizar, aoMudar, aoExcluir }: Props) {
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [janela, setJanela] = useState<"nova" | "opcoes" | null>(null);
  const atual = comps.find((comp) => comp.id === (escolhida ?? aplicada)) ?? null;
  const indice = atual ? comps.indexOf(atual) : -1;
  const ir = (passo: 1 | -1) => {
    if (!comps.length) return;
    const proxima = comps[(indice + passo + comps.length) % comps.length];
    setEscolhida(proxima.id);
    aoAplicar(proxima.id);
  };
  const linha = (ativa: boolean) => `flex w-full items-center gap-2 px-2 py-1 text-left text-xs ${ativa ? "bg-destaque/25" : "hover:bg-painel-2"}`;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ol aria-label="Comps de camada" className="min-h-0 flex-1 overflow-y-auto py-1">
        <li>
          <button type="button" className={linha(aplicada === null)} onClick={() => aoAplicar(null)} disabled={!temUltimaPosicao} title="Volta ao estado de antes de aplicar uma comp">
            <Layers className="size-3.5 text-suave" aria-hidden />
            <span className="truncate">Última posição do documento</span>
          </button>
        </li>
        {comps.map((comp) => {
          const faltam = sumidas(comp);
          return (
            <li key={comp.id} className={`flex items-center ${escolhida === comp.id ? "ring-1 ring-inset ring-destaque/60" : ""}`}>
              <button
                type="button"
                aria-label={`Aplicar ${comp.nome}`}
                title="Aplicar a comp"
                className={`ml-2 grid size-4 shrink-0 place-items-center rounded-sm border ${aplicada === comp.id ? "border-destaque bg-destaque/40" : "border-borda hover:border-texto"}`}
                onClick={() => {
                  setEscolhida(comp.id);
                  aoAplicar(comp.id);
                }}
              />
              <button type="button" className={`${linha(aplicada === comp.id)} flex-1`} onClick={() => setEscolhida(comp.id)} onDoubleClick={() => (setEscolhida(comp.id), setJanela("opcoes"))} title={comp.comentario || undefined}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{comp.nome}</span>
                  {comp.comentario ? <span className="block truncate text-[10px] text-suave">{comp.comentario}</span> : null}
                </span>
                {faltam ? <TriangleAlert className="size-3.5 shrink-0 text-amber-400" aria-label={`${faltam} ${faltam === 1 ? "camada não existe" : "camadas não existem"} mais`} /> : null}
              </button>
            </li>
          );
        })}
        {!comps.length ? <li className="px-3 py-2 text-[11px] text-suave">Nenhuma comp. Arrume as camadas e crie uma comp para cada versão do layout.</li> : null}
      </ol>
      <div className="flex h-8 shrink-0 items-center gap-0.5 border-t border-borda px-1.5">
        <button type="button" className="botao-icone size-6" disabled={!comps.length} onClick={() => ir(-1)} aria-label="Aplicar a comp anterior" title="Comp anterior">
          <ChevronLeft className="size-3.5" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6" disabled={!comps.length} onClick={() => ir(1)} aria-label="Aplicar a próxima comp" title="Próxima comp">
          <ChevronRight className="size-3.5" aria-hidden />
        </button>
        <span className="ml-auto" />
        <button type="button" className="botao-icone size-6" disabled={!atual} onClick={() => atual && aoAtualizar(atual.id)} aria-label="Atualizar a comp" title="A comp escolhida passa a guardar as camadas como estão agora">
          <RefreshCw className="size-3.5" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6" onClick={() => setJanela("nova")} aria-label="Criar uma comp de camada" title="Nova comp de camada">
          <FilePlus className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="botao-icone size-6"
          disabled={!atual}
          onClick={() => {
            if (!atual) return;
            aoExcluir(atual.id);
            setEscolhida(null);
          }}
          aria-label="Excluir a comp"
          title="Excluir a comp escolhida"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
      {janela === "nova" ? (
        <JanelaDaComp
          titulo="Nova comp de camada"
          inicial={{ nome: `Comp de camada ${comps.length + 1}`, comentario: "", visibilidade: true, posicao: true, aparencia: true }}
          aoFechar={() => setJanela(null)}
          aoConfirmar={(opcoes) => {
            setJanela(null);
            aoCriar(opcoes);
          }}
        />
      ) : null}
      {janela === "opcoes" && atual ? (
        <JanelaDaComp
          titulo="Opções da comp de camada"
          inicial={atual}
          aoFechar={() => setJanela(null)}
          aoConfirmar={(opcoes) => {
            setJanela(null);
            aoMudar(atual.id, opcoes);
          }}
        />
      ) : null}
    </div>
  );
}
