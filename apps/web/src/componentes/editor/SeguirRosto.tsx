"use client";

import { LoaderCircle, ScanFace } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Comando } from "@/lib/projeto/comandos";
import type { Clipe, Faixa } from "@/lib/projeto/modelo";
import { reenquadrarPeloRosto } from "@/lib/projeto/reenquadrar";
import { buscarRosto } from "@/lib/rosto";
import type { Midia } from "@/lib/tipos";

type Props = {
  clipe: Clipe;
  faixa: Faixa;
  midia: Midia;
  /** "9:16", "16:9"... do projeto. */
  proporcao: string;
  aoExecutar: (comando: Comando) => void;
  aoAvisar: (mensagem: string) => void;
};

/** Reenquadrar seguindo o rosto: amplia o clipe até cobrir o quadro e grava o movimento como keyframes. */
export function SeguirRosto({ clipe, faixa, midia, proporcao, aoExecutar, aoAvisar }: Props) {
  const [andamento, setAndamento] = useState<string | null>(null);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);

  async function seguir() {
    if (!midia.video) return;
    try {
      const amostras = await buscarRosto(midia.id, setAndamento, () => ativo.current);
      if (!amostras) return;
      const [largura, altura] = proporcao.split(":").map(Number);
      const reenquadramento = reenquadrarPeloRosto(clipe, amostras, { largura: midia.video.largura, altura: midia.video.altura }, { largura, altura });
      if (!reenquadramento) {
        aoAvisar("Não achei rosto no trecho deste clipe.");
        return;
      }
      aoExecutar({ comando: "clipe.reenquadrar", parametros: { clipeId: clipe.id, reenquadramento } });
      const pontos = (reenquadramento.keyframes.x?.length ?? 0) + (reenquadramento.keyframes.y?.length ?? 0);
      aoAvisar(pontos ? `O clipe agora segue o rosto (${pontos} keyframes). Ctrl+Z desfaz.` : "Rosto enquadrado no centro. Ctrl+Z desfaz.");
    } catch (erro) {
      if (ativo.current) aoAvisar(erro instanceof Error ? erro.message : "Não foi possível procurar o rosto agora.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  return (
    <button type="button" className="botao-secundario mt-2 w-full px-3 py-1.5 text-xs" disabled={faixa.travada || andamento !== null} onClick={() => void seguir()}>
      {andamento ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ScanFace className="size-4" aria-hidden />}
      {andamento ?? "Seguir o rosto"}
    </button>
  );
}
