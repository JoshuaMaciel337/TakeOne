import type { Metadata } from "next";

import { Editor } from "@/componentes/editor/Editor";

export const metadata: Metadata = { title: "Editor" };

export default async function PaginaEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Editor key={id} projetoId={id} />;
}
