"use client";

// O painel Canais do editor de imagem (ADR 0003, onda 13.3): o composto e os canais de cor (clicar mostra só aquele,
// em cinza) e os canais alfa, as seleções guardadas. Clicar num canal alfa mostra e pinta nele; Ctrl + clique o
// carrega como seleção (Shift soma, Alt subtrai); duplo clique no nome renomeia. Embaixo, carregar, salvar, novo e
// excluir, como nos editores de imagem.
import { CircleDashed, FilePlus2, Save, Trash2 } from "lucide-react";
import { useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import { arquivoDaVersao } from "@/lib/pixels";
import type { Canal } from "@/lib/projeto/modelo";
import type { ModoDaSelecao } from "@/lib/selecao/mascara";

export type CorDoCanal = "r" | "g" | "b";

const CORES: { id: CorDoCanal | null; nome: string; amostra: string }[] = [
  { id: null, nome: "RGB", amostra: "linear-gradient(90deg, #e33 0 33%, #3c3 33% 66%, #36e 66%)" },
  { id: "r", nome: "Vermelho", amostra: "#e33" },
  { id: "g", nome: "Verde", amostra: "#3c3" },
  { id: "b", nome: "Azul", amostra: "#36e" },
];

type Props = {
  canais: Canal[];
  /** O canal de cor à vista (null: o composto). */
  corAVista: CorDoCanal | null;
  aoVerCor: (cor: CorDoCanal | null) => void;
  /** O canal alfa à vista e pintado (null: a imagem). */
  canalAtivo: string | null;
  aoAtivar: (id: string | null) => void;
  aoCarregar: (id: string, modo: ModoDaSelecao) => void;
  aoSalvar: () => void;
  aoNovo: () => void;
  aoApagar: (id: string) => void;
  aoRenomear: (id: string, nome: string) => void;
  temSelecao: boolean;
};

export function PainelCanais({ canais, corAVista, aoVerCor, canalAtivo, aoAtivar, aoCarregar, aoSalvar, aoNovo, aoApagar, aoRenomear, temSelecao }: Props) {
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const linha = "flex w-full items-center gap-2 px-2 py-1 text-left text-xs";
  return (
    <div className="flex h-full flex-col" data-painel-canais>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {CORES.map((cor) => {
          const marcada = !canalAtivo && corAVista === cor.id;
          return (
            <li key={cor.nome}>
              <button
                type="button"
                className={`${linha} ${marcada ? "bg-destaque/20" : "hover:bg-painel-2"}`}
                aria-pressed={marcada}
                onClick={() => {
                  aoAtivar(null);
                  aoVerCor(cor.id);
                }}
              >
                <span className="size-6 shrink-0 rounded-sm border border-borda" style={{ background: cor.amostra }} aria-hidden />
                <span className="flex-1">{cor.nome}</span>
              </button>
            </li>
          );
        })}
        {canais.map((canal) => {
          const marcada = canalAtivo === canal.id;
          return (
            <li key={canal.id}>
              <div
                role="button"
                tabIndex={0}
                className={`${linha} cursor-default ${marcada ? "bg-destaque/20" : "hover:bg-painel-2"}`}
                aria-pressed={marcada}
                title="Clique para ver e pintar o canal; Ctrl + clique carrega como seleção (Shift soma, Alt subtrai)"
                onClick={(evento) => {
                  if (evento.ctrlKey || evento.metaKey) aoCarregar(canal.id, evento.shiftKey && evento.altKey ? "intersectar" : evento.shiftKey ? "somar" : evento.altKey ? "subtrair" : "nova");
                  else {
                    aoVerCor(null);
                    aoAtivar(marcada ? null : canal.id);
                  }
                }}
                onKeyDown={(evento) => {
                  if (evento.key === "Enter") aoAtivar(marcada ? null : canal.id);
                }}
                onDoubleClick={() => setRenomeando(canal.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a versão da API com a sessão do cookie */}
                <img src={arquivoDaMidia(canal.midia_id, arquivoDaVersao(canal.versao))} alt="" className="size-6 shrink-0 rounded-sm border border-borda bg-black object-contain" />
                {renomeando === canal.id ? (
                  <input
                    autoFocus
                    defaultValue={canal.nome}
                    aria-label="Nome do canal"
                    maxLength={60}
                    className="min-w-0 flex-1 rounded border border-destaque bg-painel-2 px-1 py-0.5 outline-none"
                    onClick={(evento) => evento.stopPropagation()}
                    onBlur={(evento) => {
                      const nome = evento.currentTarget.value.trim();
                      setRenomeando(null);
                      if (nome && nome !== canal.nome) aoRenomear(canal.id, nome);
                    }}
                    onKeyDown={(evento) => {
                      evento.stopPropagation();
                      if (evento.key === "Enter") evento.currentTarget.blur();
                      else if (evento.key === "Escape") {
                        evento.currentTarget.value = canal.nome;
                        evento.currentTarget.blur();
                      }
                    }}
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate">{canal.nome}</span>
                )}
              </div>
            </li>
          );
        })}
        {!canais.length ? <li className="px-2 py-2 text-[11px] text-suave">Nenhuma seleção guardada. Faça uma seleção e use “Salvar a seleção como canal”.</li> : null}
      </ul>
      <div className="flex shrink-0 items-center justify-end gap-1 border-t border-borda px-2 py-1">
        <button type="button" className="botao-icone size-6" disabled={!canalAtivo} title="Carregar o canal como seleção" aria-label="Carregar o canal como seleção" onClick={() => canalAtivo && aoCarregar(canalAtivo, "nova")}>
          <CircleDashed className="size-4" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6" disabled={!temSelecao} title="Salvar a seleção como canal" aria-label="Salvar a seleção como canal" onClick={aoSalvar}>
          <Save className="size-4" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6" title="Novo canal" aria-label="Novo canal" onClick={aoNovo}>
          <FilePlus2 className="size-4" aria-hidden />
        </button>
        <button type="button" className="botao-icone size-6" disabled={!canalAtivo} title="Excluir o canal" aria-label="Excluir o canal" onClick={() => canalAtivo && aoApagar(canalAtivo)}>
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
