"use client";

import { ListaAlbuns } from "@/componentes/album/ListaAlbuns";
import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";

export default function PaginaAlbuns() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8">
      <TituloDaPagina
        titulo="Álbuns de fotos"
        descricao="Envie a pasta de um ensaio, dê notas e cores e separe as melhores fotos, com o teclado ou pela tela."
      />
      <ListaAlbuns />
    </main>
  );
}
