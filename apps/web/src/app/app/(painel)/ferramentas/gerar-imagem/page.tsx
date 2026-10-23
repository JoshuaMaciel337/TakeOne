"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";
import { GerarImagem } from "@/componentes/midia/GerarImagem";

export default function PaginaGerarImagem() {
  const [pedidos, setPedidos] = useState(0);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-8">
      <TituloDaPagina
        titulo="Gerar imagem com IA"
        descricao="Descreva a imagem. Ela é gerada na sua máquina e entra em Mídias quando fica pronta, para usar no vídeo ou no editor de imagem."
      />
      <GerarImagem formato="1:1" aoPedir={() => setPedidos((n) => n + 1)} abertoDeInicio />
      {pedidos ? (
        <Link href="/app/midias" className="inline-flex items-center gap-1 text-sm font-medium text-destaque">
          Acompanhar em Mídias <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </main>
  );
}
