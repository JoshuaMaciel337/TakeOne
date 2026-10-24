"use client";

// As predefinições de ferramenta do editor de imagem (ADR 0003, onda 13.15): a lista (só as da ferramenta da vez, ou
// todas), escolher (troca a ferramenta e aplica as opções), excluir, guardar as opções de agora com um nome, e
// Redefinir ferramenta e Redefinir todas as ferramentas. Abre no ícone da barra de opções e no painel de mesmo nome.
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";

export type ItemDaPredefinicao = { id: string; nome: string; ferramenta: string };

type Props = {
  ferramenta: string;
  itens: ItemDaPredefinicao[];
  nomeDaFerramenta: (id: string) => string;
  /** A ferramenta da vez tem opções para guardar. */
  podeGuardar: boolean;
  aoEscolher: (item: ItemDaPredefinicao) => void;
  aoCriar: (nome: string) => void;
  aoExcluir: (id: string) => void;
  aoRedefinir: () => void;
  aoRedefinirTodas: () => void;
};

export function PredefinicoesDeFerramenta({ ferramenta, itens, nomeDaFerramenta, podeGuardar, aoEscolher, aoCriar, aoExcluir, aoRedefinir, aoRedefinirTodas }: Props) {
  const [soDaAtual, setSoDaAtual] = useState(true);
  const [nome, setNome] = useState("");
  const lista = soDaAtual ? itens.filter((item) => item.ferramenta === ferramenta) : itens;
  return (
    <div className="flex min-h-0 flex-col gap-1 p-2 text-xs">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={soDaAtual} onChange={(e) => setSoDaAtual(e.currentTarget.checked)} />
        Só a ferramenta atual
      </label>
      <ul aria-label="Predefinições de ferramenta" className="min-h-12 flex-1 overflow-y-auto rounded border border-borda">
        {lista.map((item) => (
          <li key={item.id} className="group flex items-center hover:bg-painel-2">
            <button type="button" className="min-w-0 flex-1 truncate px-2 py-1 text-left" onClick={() => aoEscolher(item)} title={`${nomeDaFerramenta(item.ferramenta)}: ${item.nome}`}>
              {item.nome}
              {!soDaAtual ? <span className="ml-1 text-suave">({nomeDaFerramenta(item.ferramenta)})</span> : null}
            </button>
            <button type="button" className="botao-icone mr-1 size-5 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => aoExcluir(item.id)} aria-label={`Excluir ${item.nome}`} title="Excluir a predefinição">
              <Trash2 className="size-3" aria-hidden />
            </button>
          </li>
        ))}
        {!lista.length ? <li className="px-2 py-1 text-suave">{soDaAtual ? "Nenhuma predefinição desta ferramenta." : "Nenhuma predefinição."}</li> : null}
      </ul>
      <form
        className="flex items-center gap-1"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (!nome.trim() || !podeGuardar) return;
          aoCriar(nome.trim());
          setNome("");
        }}
      >
        <input aria-label="Nome da predefinição" className="min-w-0 flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5" placeholder={podeGuardar ? `${nomeDaFerramenta(ferramenta)} 1` : "Esta ferramenta não tem opções"} disabled={!podeGuardar} maxLength={80} value={nome} onChange={(e) => setNome(e.currentTarget.value)} />
        <button type="submit" className="botao-icone size-6" disabled={!podeGuardar || !nome.trim()} aria-label="Criar a predefinição" title="Guardar as opções de agora com este nome">
          <Plus className="size-3.5" aria-hidden />
        </button>
      </form>
      <div className="flex flex-wrap gap-1">
        <button type="button" className="botao-icone h-6 w-auto gap-1 px-2 text-xs" disabled={!podeGuardar} onClick={aoRedefinir}>
          <RotateCcw className="size-3" aria-hidden />
          Redefinir ferramenta
        </button>
        <button type="button" className="botao-icone h-6 w-auto px-2 text-xs" onClick={aoRedefinirTodas}>
          Redefinir todas as ferramentas
        </button>
      </div>
    </div>
  );
}
