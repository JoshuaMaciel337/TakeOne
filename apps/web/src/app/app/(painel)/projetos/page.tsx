"use client";

import { Plus } from "lucide-react";

import { useAbrirNoEditor } from "@/componentes/hub/AbrirNoEditor";
import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { ListaProjetos } from "@/componentes/projeto/ListaProjetos";

export default function PaginaProjetos() {
  const abrirNoEditor = useAbrirNoEditor();
  const novo = () => abrirNoEditor({ titulo: "Editor de vídeo", ferramenta: "midia" });
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8">
      <TituloDaPagina titulo="Projetos" descricao="Todos os projetos do espaço, do mais recente ao mais antigo.">
        <button type="button" className="botao-principal px-5 py-2.5" onClick={novo}>
          <Plus className="size-4" aria-hidden />
          Novo projeto
        </button>
      </TituloDaPagina>
      <ListaProjetos aoCriar={novo} criando={false} />
    </main>
  );
}
