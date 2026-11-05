"use client";

import { ListaAlbuns } from "@/componentes/album/ListaAlbuns";
import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";

export default function PaginaAlbuns() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8">
      <TituloDaPagina
        titulo="Edição em massa"
        descricao="Envie a pasta de um ensaio: o TakeOne escolhe as melhores fotos e edita todas no seu estilo. Para uma foto só, use a edição de uma foto."
      />
      <ListaAlbuns />
    </main>
  );
}
