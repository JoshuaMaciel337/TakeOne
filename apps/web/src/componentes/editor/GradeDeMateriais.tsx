"use client";

import { Check, Search, Star } from "lucide-react";
import { useState } from "react";

import { type TipoDeMaterial, tipoDoMaterial } from "@/lib/arrasto";
import { paraBusca, useMateriais } from "@/lib/materiais";

export type Material = { id: string; nome: string; descricao?: string; categoria?: string };

/**
 * A grade dos materiais do Takecut (ADR 0007, 17.3): a busca, as abas Todos, Favoritos, Recentes e as categorias, e os
 * cartões com a miniatura, a estrela e o arrasto para um clipe da linha do tempo. O primeiro cartão ("Nenhum") fica
 * sempre no começo.
 */
export function GradeDeMateriais({
  tipo,
  itens,
  atual,
  nenhum,
  desativado,
  miniatura,
  aoEscolher,
  aoPassar,
  colunas = 2,
}: {
  tipo: TipoDeMaterial;
  itens: Material[];
  atual: string | null;
  /** O cartão que tira o material (o "Original", o "Nenhum", o "Corte seco"). */
  nenhum: { nome: string; descricao?: string };
  desativado?: (id: string | null) => boolean;
  miniatura?: (id: string | null) => React.ReactNode;
  aoEscolher: (id: string | null) => void;
  /** O mouse em cima de um cartão: a prévia mostra o material no clipe escolhido (null: volta ao de antes). */
  aoPassar?: (id: string | null) => void;
  colunas?: 2 | 3;
}) {
  const { favoritos, recentes, alternarFavorito, usar } = useMateriais(tipo);
  const [aba, setAba] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const categorias = [...new Set(itens.map((item) => item.categoria).filter((c): c is string => Boolean(c)))];
  const termo = paraBusca(busca.trim());
  let visiveis = itens;
  if (aba === "favoritos") visiveis = itens.filter((item) => favoritos.includes(item.id));
  else if (aba === "recentes") visiveis = recentes.map((id) => itens.find((item) => item.id === id)).filter((item): item is Material => Boolean(item));
  else if (aba !== "todos") visiveis = itens.filter((item) => item.categoria === aba);
  if (termo) visiveis = visiveis.filter((item) => paraBusca(`${item.nome} ${item.descricao ?? ""}`).includes(termo));
  const escolher = (id: string | null) => {
    if (id) usar(id);
    aoPassar?.(null);
    aoEscolher(id);
  };
  const cartao = (escolhido: boolean) =>
    `group relative flex flex-col gap-1 rounded-lg border p-1.5 text-left text-xs transition disabled:opacity-50 ${escolhido ? "border-destaque" : "border-borda hover:border-suave"}`;
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-1.5 rounded-md border border-borda bg-painel-2 px-2 py-1">
        <Search className="size-3.5 text-suave" aria-hidden />
        <input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar" className="min-w-0 flex-1 bg-transparent text-xs outline-none" aria-label="Buscar" />
      </label>
      <div className="flex flex-wrap gap-1 text-[11px]" role="tablist" aria-label="Categorias">
        {[
          ["todos", "Todos"],
          ["favoritos", `Favoritos${favoritos.length ? ` (${favoritos.length})` : ""}`],
          ["recentes", "Recentes"],
          ...categorias.map((c) => [c, c]),
        ].map(([id, nome]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)} className={`rounded-full px-2 py-0.5 ${aba === id ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`}>
            {nome}
          </button>
        ))}
      </div>
      <div className={`grid gap-2 ${colunas === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {aba === "todos" && !termo ? (
          <button type="button" disabled={desativado?.(null)} onClick={() => escolher(null)} aria-pressed={atual === null} className={cartao(atual === null)}>
            {miniatura?.(null)}
            <span className="flex items-center gap-1 font-medium">
              {atual === null ? <Check className="size-3" aria-hidden /> : null}
              {nenhum.nome}
            </span>
            {nenhum.descricao ? <span className="text-[11px] text-suave">{nenhum.descricao}</span> : null}
          </button>
        ) : null}
        {visiveis.map((item) => {
          const favorito = favoritos.includes(item.id);
          return (
            <div key={item.id} className="relative">
              <button
                type="button"
                draggable
                onDragStart={(evento) => {
                  evento.dataTransfer.setData(tipoDoMaterial(tipo, item.id), item.id);
                  evento.dataTransfer.setData("text/plain", item.nome);
                  evento.dataTransfer.effectAllowed = "copy";
                }}
                disabled={desativado?.(item.id)}
                onClick={() => escolher(item.id)}
                onMouseEnter={() => aoPassar?.(item.id)}
                onMouseLeave={() => aoPassar?.(null)}
                aria-pressed={atual === item.id}
                title={`${item.descricao ?? item.nome}. Clique para aplicar no clipe escolhido, ou arraste até um clipe da linha do tempo.`}
                className={`${cartao(atual === item.id)} w-full`}
              >
                {miniatura?.(item.id)}
                <span className="flex items-center gap-1 pr-4 font-medium">
                  {atual === item.id ? <Check className="size-3 shrink-0" aria-hidden /> : null}
                  <span className="truncate">{item.nome}</span>
                </span>
                {item.descricao && !miniatura ? <span className="text-[11px] text-suave">{item.descricao}</span> : null}
              </button>
              <button
                type="button"
                onClick={() => alternarFavorito(item.id)}
                aria-pressed={favorito}
                aria-label={favorito ? `Tirar ${item.nome} dos favoritos` : `Favoritar ${item.nome}`}
                title={favorito ? "Tirar dos favoritos" : "Favoritar"}
                className={`absolute bottom-1.5 right-1.5 grid size-5 place-items-center rounded ${favorito ? "text-aviso" : "text-suave/60 hover:text-texto"}`}
              >
                <Star className={`size-3.5 ${favorito ? "fill-current" : ""}`} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
      {!visiveis.length ? (
        <p className="py-3 text-center text-xs text-suave">{aba === "favoritos" ? "Nenhum favorito ainda: toque na estrela de um cartão." : aba === "recentes" ? "Os que você usar aparecem aqui." : "Nada com esse nome."}</p>
      ) : null}
    </div>
  );
}
