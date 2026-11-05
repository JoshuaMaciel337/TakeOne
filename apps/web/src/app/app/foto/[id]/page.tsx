import type { Metadata } from "next";

import { EdicaoDeUmaFoto } from "@/componentes/album/EdicaoDeUmaFoto";

export const metadata: Metadata = { title: "Edição de uma foto" };

export default async function PaginaDaFoto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EdicaoDeUmaFoto key={id} albumId={id} />;
}
