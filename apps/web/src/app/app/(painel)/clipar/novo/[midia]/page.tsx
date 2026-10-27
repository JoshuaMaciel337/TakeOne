import { OpcoesDoClipar } from "@/componentes/clipar/OpcoesDoClipar";

export default async function PaginaNovaClipagem({ params }: { params: Promise<{ midia: string }> }) {
  const { midia } = await params;
  return <OpcoesDoClipar midiaId={midia} />;
}
