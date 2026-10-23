"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Troca o endereço sem guardar o de agora no histórico (o projeto de imagem aberto no editor de vídeo e o contrário). */
export function Redirecionar({ para }: { para: string }) {
  const router = useRouter();
  useEffect(() => router.replace(para), [router, para]);
  return (
    <div className="flex h-dvh items-center justify-center gap-2 bg-fundo text-sm text-suave">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      Abrindo…
    </div>
  );
}
