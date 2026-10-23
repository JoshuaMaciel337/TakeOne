"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { urlDaImagemDeTexto } from "@/lib/previa/imagensDeTexto";
import { ESTILOS_DE_TEXTO, type Texto, TEXTO_PADRAO } from "@/lib/projeto/texto";
import type { Midia } from "@/lib/tipos";

import { PainelAnimacoes } from "./PainelAnimacoes";

/** Lado menor das miniaturas dos estilos: pequeno, só para mostrar como fica. */
const LADO_MINIATURA = 360;

/** A miniatura é a imagem que a API desenha, a mesma da prévia e do vídeo. */
function MiniaturaDoEstilo({ texto, nome }: { texto: Texto; nome: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    let criada: string | null = null;
    urlDaImagemDeTexto(texto, LADO_MINIATURA)
      .then((nova) => {
        criada = nova;
        if (ativo) setUrl(nova);
        else URL.revokeObjectURL(nova);
      })
      .catch(() => {});
    return () => {
      ativo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [texto]);

  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- PNG gerado na hora pela API
    <img src={url} alt={nome} className="max-h-12 max-w-full object-contain" />
  ) : (
    <span className="text-xs text-suave">{nome}</span>
  );
}

type Props = {
  aoAdicionar: (texto: Texto) => void;
  proporcao: string;
  /** Um texto animado foi pedido: entra no cursor quando o worker terminar de gravar. */
  aoPedir: (midia: Midia) => void;
};

/**
 * Painel da ferramenta Texto: um texto em branco ou um dos estilos prontos, no cursor, e embaixo os textos
 * animados da biblioteca (títulos, tarjas e citações). Com um texto animado aberto, só ele aparece.
 */
export function PainelTexto({ aoAdicionar, proporcao, aoPedir, animacaoInicial }: Props & { animacaoInicial?: string }) {
  const [animadoAberto, setAnimadoAberto] = useState(false);
  // O painel das animações fica sempre no mesmo lugar da árvore (só o resto some), senão o React o remontaria
  // e o texto animado aberto se perderia
  return (
    <div className="flex flex-col gap-3">
      <button type="button" className="botao-principal w-full" hidden={animadoAberto} onClick={() => aoAdicionar(TEXTO_PADRAO)}>
        <Plus className="size-4" aria-hidden />
        Adicionar texto
      </button>
      <p className="text-xs font-medium text-suave" hidden={animadoAberto}>
        Estilos prontos · entram onde está o cursor
      </p>
      <div className="grid grid-cols-2 gap-2" hidden={animadoAberto}>
        {ESTILOS_DE_TEXTO.map((estilo) => (
          <button
            key={estilo.id}
            type="button"
            onClick={() => aoAdicionar(estilo.texto)}
            title={`Adicionar "${estilo.nome}"`}
            className="flex h-20 flex-col items-center justify-center gap-1 rounded-lg border border-borda bg-[repeating-conic-gradient(#2b2b35_0_25%,#1d1d24_0_50%)] bg-[length:16px_16px] p-2 transition hover:border-destaque"
          >
            <MiniaturaDoEstilo texto={estilo.texto} nome={estilo.nome} />
            <span className="text-[11px] text-suave">{estilo.nome}</span>
          </button>
        ))}
      </div>
      <PainelAnimacoes grupo="texto" proporcao={proporcao} aoPedir={aoPedir} aoAbrir={setAnimadoAberto} inicial={animacaoInicial} />
    </div>
  );
}
