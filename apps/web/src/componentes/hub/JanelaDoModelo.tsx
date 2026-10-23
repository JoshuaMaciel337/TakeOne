"use client";

import { Bookmark, LoaderCircle, Trash2, WandSparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { PreviaDaAnimacao } from "@/componentes/editor/PainelAnimacoes";
import { ErroApi } from "@/lib/api";
import type { ItemDaBiblioteca } from "@/lib/biblioteca";

import { DesenhoDoModelo, enderecoDaPrevia, resumoDoItem } from "./CartaoModelo";

type Props = {
  item: ItemDaBiblioteca;
  aoUsar: (item: ItemDaBiblioteca) => Promise<string | null>;
  aoSalvar: (item: ItemDaBiblioteca) => void;
  aoExcluir?: (item: ItemDaBiblioteca) => Promise<void>;
  aoFechar: () => void;
};

const COMO_USA: Record<ItemDaBiblioteca["tipo"], string> = {
  projeto: "Escolha um projeto (ou crie um no formato do modelo): no editor, você põe as mídias de cada cena e os textos, e o modelo entra no fim da linha do tempo.",
  espaco: "Cria um projeto igual a este. No editor, a ferramenta Modelos mostra o que trocar: as mídias e os textos marcados por quem criou.",
  animacao: "Abre o editor com a animação escolhida: você muda os textos e as cores, e ela entra no cursor, com fundo transparente.",
};

/** "Usar este modelo": a prévia grande, o que ele é e os botões de usar, salvar e (do espaço) excluir. */
export function JanelaDoModelo({ item, aoUsar, aoSalvar, aoExcluir, aoFechar }: Props) {
  const [usando, setUsando] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => {
    const fechar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  function usar() {
    setUsando(true);
    setErro("");
    void aoUsar(item).then((problema) => {
      if (problema) setErro(problema);
      else if (item.tipo !== "espaco") aoFechar();
      setUsando(false);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[6vh]" onPointerDown={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-do-modelo"
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60"
        onPointerDown={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 className="font-display text-base font-semibold">Usar este modelo</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex h-72 items-center justify-center bg-painel-3 p-4 sm:h-80">
          {item.tipo === "animacao" ? <PreviaDaAnimacao endereco={enderecoDaPrevia(item)} proporcao="16:9" alturaMaxima={288} /> : <DesenhoDoModelo item={item} grande />}
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div>
            <h3 id="titulo-do-modelo" className="font-display text-xl font-semibold">
              {item.nome}
            </h3>
            <p className="mt-1 text-sm text-suave">{item.descricao}</p>
          </div>
          <p className="text-xs text-apagado">{resumoDoItem(item)}</p>
          <p className="rounded-lg border border-borda bg-painel-2 p-3 text-xs text-suave">{COMO_USA[item.tipo]}</p>
          {erro ? <AvisoErro>{erro}</AvisoErro> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="botao-principal flex-1 px-4 py-2.5" onClick={usar} disabled={usando}>
              {usando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <WandSparkles className="size-4" aria-hidden />}
              Usar este modelo
            </button>
            <button type="button" className="botao-secundario px-4 py-2.5" onClick={() => aoSalvar(item)} aria-pressed={item.salvo}>
              <Bookmark className={`size-4 ${item.salvo ? "fill-current" : ""}`} aria-hidden />
              {item.salvo ? "Salvo" : "Salvar"}
            </button>
            {aoExcluir && item.tipo === "espaco" ? (
              <button
                type="button"
                className="botao-secundario px-4 py-2.5 text-erro"
                onClick={() => {
                  if (!window.confirm(`Excluir o modelo “${item.nome}”? Os projetos já criados com ele continuam.`)) return;
                  aoExcluir(item).then(aoFechar, (e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível excluir o modelo."));
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                Excluir
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
