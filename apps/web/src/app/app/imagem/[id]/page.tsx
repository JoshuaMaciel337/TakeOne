import type { Metadata } from "next";

import { EditorDeImagem } from "@/componentes/imagem/EditorDeImagem";

export const metadata: Metadata = { title: "Editor de imagem" };

export default async function PaginaEditorDeImagem({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ modelo?: string }> }) {
  const { id } = await params;
  const { modelo } = await searchParams;
  return <EditorDeImagem key={id} projetoId={id} modeloInicial={typeof modelo === "string" ? modelo : undefined} />;
}
