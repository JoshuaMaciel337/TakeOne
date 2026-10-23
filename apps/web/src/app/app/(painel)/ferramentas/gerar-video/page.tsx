"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { GerarVideo } from "@/componentes/midia/GerarVideo";
import { useMidias } from "@/lib/useMidias";

export default function PaginaGerarVideo() {
  const { midias } = useMidias();
  const [pedidos, setPedidos] = useState(0);
  const imagens = (midias ?? []).filter((midia) => midia.status === "pronta" && midia.imagem && midia.video && !midia.elemento);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-8">
      <TituloDaPagina
        titulo="Gerar vídeo com IA"
        descricao="Descreva a cena, ou parta de uma imagem da biblioteca. O clipe é gerado na sua máquina e entra em Mídias quando fica pronto."
      />
      <GerarVideo proporcao="9:16" imagens={imagens} aoPedir={() => setPedidos((n) => n + 1)} abertoDeInicio />
      {pedidos ? (
        <Link href="/app/midias" className="inline-flex items-center gap-1 text-sm font-medium text-destaque">
          Acompanhar em Mídias <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </main>
  );
}
