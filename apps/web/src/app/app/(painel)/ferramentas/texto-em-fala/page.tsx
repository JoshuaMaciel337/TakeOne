"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PainelAudio } from "@/componentes/editor/PainelAudio";
import { TituloDaPagina } from "@/componentes/hub/TituloDaPagina";

export default function PaginaTextoEmFala() {
  const [pedidos, setPedidos] = useState(0);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-8">
      <TituloDaPagina titulo="Texto em fala" descricao="Escreva o texto e escolha a voz. A fala é gerada na sua máquina e entra em Mídias, pronta para qualquer projeto." />
      <PainelAudio aoPedir={() => setPedidos((n) => n + 1)} soNaBiblioteca />
      {pedidos ? (
        <Link href="/app/midias" className="inline-flex items-center gap-1 text-sm font-medium text-destaque">
          Acompanhar em Mídias <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </main>
  );
}
