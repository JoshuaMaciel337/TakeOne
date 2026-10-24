"use client";

// Janela › Estilos (ADR 0003, onda 13.9): os estilos de camada prontos e os do espaço, com a miniatura de cada um. O
// clique aplica o estilo nas camadas escolhidas (no lugar do que elas tinham); o "+" guarda o estilo da camada
// escolhida no espaço; a lixeira exclui um do espaço.
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { EstiloDeCamada } from "@/lib/imagem/estiloDeCamada";
import { ESTILOS_PRONTOS } from "@/lib/imagem/estilosProntos";
import { miniaturaDoEstilo } from "@/lib/imagem/miniaturaDoEstilo";

export type EstiloDoEspaco = { id: string; nome: string; estilo: EstiloDeCamada; preenchimento: number };

type Props = {
  doEspaco: EstiloDoEspaco[];
  /** Há camada escolhida para aplicar (e com estilo, para guardar). */
  podeAplicar: boolean;
  podeGuardar: boolean;
  aoAplicar: (estilo: EstiloDeCamada, preenchimento: number) => void;
  aoGuardar: (nome: string) => void;
  aoExcluir: (id: string) => void;
};

function Miniatura({ nome, estilo, preenchimento, desativado, aoEscolher, aoExcluir }: { nome: string; estilo: EstiloDeCamada; preenchimento: number; desativado: boolean; aoEscolher: () => void; aoExcluir?: () => void }) {
  return (
    <div className="group relative">
      <button type="button" disabled={desativado} title={desativado ? `${nome} (escolha uma camada)` : `Aplicar o estilo ${nome}`} aria-label={`Estilo ${nome}`} className="block rounded border border-borda bg-white p-0.5 hover:border-destaque disabled:opacity-60" onClick={aoEscolher}>
        {/* A miniatura é um PNG desenhado na hora pelo compositor */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={miniaturaDoEstilo(estilo, preenchimento)} alt="" width={48} height={48} className="block size-12" />
      </button>
      {aoExcluir ? (
        <button type="button" className="botao-icone absolute -right-1 -top-1 size-5 bg-painel opacity-0 group-hover:opacity-100" title={`Excluir o estilo ${nome}`} aria-label={`Excluir o estilo ${nome}`} onClick={aoExcluir}>
          <Trash2 className="size-3" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function PainelEstilosDeCamada({ doEspaco, podeAplicar, podeGuardar, aoAplicar, aoGuardar, aoExcluir }: Props) {
  const [nome, setNome] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-suave">{podeAplicar ? "Clique para aplicar na camada escolhida." : "Escolha uma camada para aplicar um estilo."}</span>
        <button type="button" className="botao-icone size-6" disabled={!podeGuardar} title="Novo estilo com o da camada escolhida" aria-label="Novo estilo" onClick={() => setNome(`Estilo ${doEspaco.length + 1}`)}>
          <Plus className="size-3.5" aria-hidden />
        </button>
      </div>
      {nome !== null ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(evento) => {
            evento.preventDefault();
            if (nome.trim()) aoGuardar(nome.trim());
            setNome(null);
          }}
        >
          <input autoFocus aria-label="Nome do estilo de camada" className="min-w-0 flex-1 rounded border border-borda bg-fundo px-1.5 py-0.5 text-texto" value={nome} maxLength={80} onChange={(evento) => setNome(evento.currentTarget.value)} onKeyDown={(evento) => evento.stopPropagation()} />
          <button type="submit" className="botao-principal px-2 py-0.5 text-xs">
            Salvar
          </button>
        </form>
      ) : null}
      {doEspaco.length ? (
        <section aria-label="Estilos do espaço" className="flex flex-col gap-1">
          <h3 className="text-[11px] font-semibold text-suave">Do espaço</h3>
          <div className="flex flex-wrap gap-1.5">
            {doEspaco.map((item) => (
              <Miniatura key={item.id} nome={item.nome} estilo={item.estilo} preenchimento={item.preenchimento} desativado={!podeAplicar} aoEscolher={() => aoAplicar(item.estilo, item.preenchimento)} aoExcluir={() => aoExcluir(item.id)} />
            ))}
          </div>
        </section>
      ) : null}
      <section aria-label="Estilos prontos" className="flex flex-col gap-1">
        <h3 className="text-[11px] font-semibold text-suave">Prontos</h3>
        <div className="flex flex-wrap gap-1.5">
          {ESTILOS_PRONTOS.map((item) => (
            <Miniatura key={item.id} nome={item.nome} estilo={item.estilo} preenchimento={item.preenchimento} desativado={!podeAplicar} aoEscolher={() => aoAplicar(item.estilo, item.preenchimento)} />
          ))}
        </div>
      </section>
    </div>
  );
}
