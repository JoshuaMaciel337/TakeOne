"use client";

import { useState } from "react";

import { CartaoFerramenta } from "@/componentes/hub/CartaoFerramenta";
import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { CATEGORIAS, type CategoriaDaFerramenta, ferramentasDaCategoria } from "@/lib/hub";

export default function PaginaFerramentas() {
  const [categoria, setCategoria] = useState<CategoriaDaFerramenta | "todas">("todas");
  const ferramentas = ferramentasDaCategoria(categoria);
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8">
      <TituloDaPagina titulo="Todas as ferramentas" descricao="Tudo o que o TakeOne faz, em um lugar. As do editor abrem nele, já na ferramenta." />
      <div className="flex gap-1 overflow-x-auto border-b border-borda" role="tablist" aria-label="Tipo de ferramenta">
        {CATEGORIAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === categoria}
            onClick={() => setCategoria(item.id)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm transition ${item.id === categoria ? "border-destaque font-medium text-texto" : "border-transparent text-suave hover:text-texto"}`}
          >
            {item.nome}
            <span className="ml-1.5 text-xs text-apagado">{ferramentasDaCategoria(item.id).length}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {ferramentas.map((ferramenta) => (
          <CartaoFerramenta key={ferramenta.id} ferramenta={ferramenta} />
        ))}
      </div>
    </main>
  );
}
