import type { Metadata } from "next";

import { EditorDeImagem } from "@/componentes/imagem/EditorDeImagem";

export const metadata: Metadata = { title: "Editor de imagem" };

export default async function PaginaEditorDeImagem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorDeImagem key={id} projetoId={id} />;
}
