import { ListaDeCortes } from "@/componentes/clipar/ListaDeCortes";

export default async function PaginaDaClipagem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListaDeCortes clipagemId={id} />;
}
