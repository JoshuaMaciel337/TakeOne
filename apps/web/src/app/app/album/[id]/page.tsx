import type { Metadata } from "next";

import { Album } from "@/componentes/album/Album";

export const metadata: Metadata = { title: "Álbum de fotos" };

export default async function PaginaAlbum({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Album key={id} albumId={id} />;
}
