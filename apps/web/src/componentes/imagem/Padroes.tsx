"use client";

// O painel Padrões (ADR 0003, onda 13.5): os prontos (nas cores de primeiro plano e de fundo) e os do espaço, para o
// Balde de tinta, o Carimbo de padrão e Editar › Preencher; Definir padrão e importar um .pat.
import { FileUp, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef } from "react";

import { type IdDoPadrao, ladrilhoDoPadrao, PADROES } from "@/lib/pintura/padroes";

export function PainelPadroes({
  doEspaco,
  escolhido,
  primeiroPlano,
  fundo,
  importando,
  aoEscolher,
  aoExcluir,
  aoDefinir,
  aoImportar,
}: {
  doEspaco: { id: string; nome: string }[];
  escolhido: IdDoPadrao;
  primeiroPlano: string;
  fundo: string;
  importando: boolean;
  aoEscolher: (id: IdDoPadrao) => void;
  aoExcluir: (id: string) => void;
  aoDefinir: () => void;
  aoImportar: (arquivo: File) => void;
}) {
  const arquivo = useRef<HTMLInputElement>(null);
  // As miniaturas dos prontos, nas cores da vez
  const prontos = useMemo(() => PADROES.map((padrao) => ({ ...padrao, imagem: ladrilhoDoPadrao(padrao.id, primeiroPlano, fundo).toDataURL() })), [primeiroPlano, fundo]);
  const item = (id: IdDoPadrao, nome: string, imagem: string, excluir?: () => void) => (
    <li key={id} className="group relative">
      <button
        type="button"
        className={`flex w-full flex-col items-center gap-0.5 rounded p-1 hover:bg-painel-2 ${escolhido === id ? "ring-1 ring-destaque" : ""}`}
        onClick={() => aoEscolher(id)}
        title={nome}
        aria-pressed={escolhido === id}
      >
        <span className="block size-12 rounded border border-borda" style={{ backgroundImage: `url(${imagem})`, backgroundRepeat: "repeat", imageRendering: "pixelated" }} aria-hidden />
        <span className="w-full truncate text-center text-[11px] text-suave">{nome}</span>
      </button>
      {excluir ? (
        <button type="button" className="botao-icone absolute right-1 top-1 hidden size-5 group-hover:grid" aria-label={`Excluir ${nome}`} onClick={excluir}>
          <Trash2 className="size-3" aria-hidden />
        </button>
      ) : null}
    </li>
  );
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-xs" data-painel-padroes>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="flex items-center gap-1 rounded border border-borda px-2 py-1 hover:bg-painel-2" onClick={aoDefinir} title="A seleção retangular (ou a imagem inteira) vira um padrão do espaço">
          <Plus className="size-3.5" aria-hidden />
          Definir padrão
        </button>
        <button type="button" className="flex items-center gap-1 rounded border border-borda px-2 py-1 hover:bg-painel-2 disabled:opacity-50" disabled={importando} onClick={() => arquivo.current?.click()}>
          <FileUp className="size-3.5" aria-hidden />
          {importando ? "Importando…" : "Importar .pat"}
        </button>
        <input
          ref={arquivo}
          type="file"
          accept=".pat"
          className="hidden"
          aria-label="Arquivo de padrões"
          onChange={(evento) => {
            const escolhidoNoDisco = evento.currentTarget.files?.[0];
            evento.currentTarget.value = "";
            if (escolhidoNoDisco) aoImportar(escolhidoNoDisco);
          }}
        />
      </div>
      <section>
        <h3 className="mb-1.5 font-semibold">Prontos</h3>
        <ul className="grid grid-cols-3 gap-1.5">{prontos.map((padrao) => item(padrao.id, padrao.nome, padrao.imagem))}</ul>
      </section>
      <section>
        <h3 className="mb-1.5 font-semibold">Do espaço</h3>
        {doEspaco.length ? (
          <ul className="grid grid-cols-3 gap-1.5">{doEspaco.map((padrao) => item(`espaco:${padrao.id}`, padrao.nome, `/api/recursos/${padrao.id}/imagem.png`, () => aoExcluir(padrao.id)))}</ul>
        ) : (
          <p className="text-suave">Nenhum ainda: defina um pela seleção ou importe um arquivo .pat.</p>
        )}
      </section>
    </div>
  );
}
