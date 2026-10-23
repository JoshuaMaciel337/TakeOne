"use client";

import { LoaderCircle, X } from "lucide-react";
import { useEffect } from "react";

import { ListaEnvios } from "@/componentes/midia/ListaEnvios";
import { ZonaDeEnvio } from "@/componentes/midia/ZonaDeEnvio";
import { arquivoDaMidia } from "@/lib/api";
import type { Midia } from "@/lib/tipos";

type Props = { imagens: Midia[]; aoEscolher: (midia: Midia) => void; aoFechar: () => void };

/** "Trocar a imagem": as imagens da biblioteca (e o envio de outras); a escolhida fica no lugar da camada. */
export function JanelaEscolherImagem({ imagens, aoEscolher, aoFechar }: Props) {
  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh]" onPointerDown={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-trocar-imagem"
        className="flex w-full max-w-lg flex-col rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60"
        onPointerDown={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-trocar-imagem" className="font-display text-base font-semibold">
            Trocar a imagem
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto p-4">
          <ZonaDeEnvio compacta />
          <ListaEnvios />
          {imagens.length ? <p className="text-xs text-suave">A imagem escolhida cobre o mesmo lugar, cortada no meio.</p> : <p className="text-xs text-suave">Envie uma foto para escolher.</p>}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {imagens.map((midia) => (
              <button
                key={midia.id}
                type="button"
                disabled={midia.status !== "pronta"}
                onClick={() => aoEscolher(midia)}
                title={midia.nome}
                className="aspect-square overflow-hidden rounded-md border border-borda bg-painel-3 transition hover:border-destaque disabled:opacity-50"
              >
                {midia.status === "pronta" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- capa da API com a sessão do cookie
                  <img src={arquivoDaMidia(midia.id, "capa.jpg")} alt={midia.nome} className="size-full object-cover" loading="lazy" />
                ) : (
                  <LoaderCircle className="m-auto size-4 animate-spin text-suave" aria-label="Preparando" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
