import type { Metadata } from "next";

import { Editor } from "@/componentes/editor/Editor";

export const metadata: Metadata = { title: "Editor" };

type Busca = { ferramenta?: string | string[]; modelo?: string | string[] };

export default async function PaginaEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Busca> }) {
  const { id } = await params;
  const { ferramenta, modelo } = await searchParams;
  const um = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor);
  return <Editor key={id} projetoId={id} ferramentaInicial={um(ferramenta)} modeloInicial={um(modelo)} />;
}
