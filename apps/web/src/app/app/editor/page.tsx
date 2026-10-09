import type { Metadata } from "next";

import { Editor } from "@/componentes/editor/Editor";

export const metadata: Metadata = { title: "Editor" };

export default function PaginaEditor() {
  return <Editor />;
}
