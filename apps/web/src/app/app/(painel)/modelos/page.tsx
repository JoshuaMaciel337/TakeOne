"use client";

import { Search } from "lucide-react";
import { useState } from "react";

import { CartaoModelo } from "@/componentes/hub/CartaoModelo";
import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { MODELOS_DE_PROJETO } from "@/lib/projeto/modelos";

const CATEGORIAS = ["Todos", ...new Set(MODELOS_DE_PROJETO.map((modelo) => modelo.categoria))];

export default function PaginaModelos() {
  const [categoria, setCategoria] = useState("Todos");
  const [busca, setBusca] = useState("");
  const procurado = busca.trim().toLowerCase();
  const modelos = MODELOS_DE_PROJETO.filter(
    (modelo) =>
      (categoria === "Todos" || modelo.categoria === categoria) &&
      (!procurado || `${modelo.nome} ${modelo.descricao} ${modelo.categoria}`.toLowerCase().includes(procurado)),
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8">
      <TituloDaPagina titulo="Modelos" descricao="Projetos prontos: escolha um, troque as mídias e os textos no editor." />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-borda bg-painel-2 px-3 py-2 sm:max-w-sm">
          <Search className="size-4 text-suave" aria-hidden />
          <input
            value={busca}
            onChange={(evento) => setBusca(evento.currentTarget.value)}
            placeholder="Buscar modelos…"
            aria-label="Buscar modelos"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Categorias">
          {CATEGORIAS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={item === categoria}
              onClick={() => setCategoria(item)}
              className={`rounded-full border px-3 py-1 text-xs transition ${item === categoria ? "border-destaque bg-destaque/15 text-texto" : "border-borda text-suave hover:text-texto"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      {modelos.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-4">
          {modelos.map((modelo) => (
            <CartaoModelo key={modelo.id} modelo={modelo} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-suave">Nenhum modelo com “{busca.trim()}”.</p>
      )}
    </main>
  );
}
