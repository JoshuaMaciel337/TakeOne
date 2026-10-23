"use client";

import { useState } from "react";

import { PainelMarca } from "@/componentes/editor/PainelMarca";
import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { useMidias } from "@/lib/useMidias";

export default function PaginaMarca() {
  const { midias } = useMidias();
  const [aviso, setAviso] = useState("");
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-8">
      <TituloDaPagina
        titulo="Kit de marca"
        descricao="As cores, as fontes e o logo do espaço. Aparecem a um clique em todo projeto; no editor, a ferramenta Kit de marca põe o logo e aplica as fontes."
      />
      <div className="rounded-xl border border-borda bg-painel p-5">
        <PainelMarca midias={midias ?? []} aoAvisar={setAviso} />
      </div>
      {aviso ? (
        <p className="text-sm text-suave" role="status">
          {aviso}
        </p>
      ) : null}
    </main>
  );
}
