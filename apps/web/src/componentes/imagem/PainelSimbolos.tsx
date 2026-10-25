"use client";

// O painel Símbolos do editor de imagem (ADR 0003, onda 13.16): os símbolos do documento, com o desenho de cada um;
// o clique escolhe (o Borrifar usa o escolhido), o clique duplo renomeia, e os botões criam um símbolo da forma
// escolhida, põem uma instância no meio, redefinem o símbolo pela forma escolhida, rompem o vínculo e excluem.
import { Link2Off, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useState } from "react";

import { svgDosCaminhos } from "@/lib/vetor/contorno";
import type { Simbolo } from "@/lib/vetor/simbolos";

type Props = {
  simbolos: Simbolo[];
  escolhido: string | null;
  aoEscolher: (id: string) => void;
  /** Há uma forma escolhida (para criar ou redefinir), e instâncias escolhidas (para romper o vínculo). */
  comForma: boolean;
  comInstancias: boolean;
  aoCriar: () => void;
  aoPor: () => void;
  aoRedefinir: () => void;
  aoRomper: () => void;
  aoExcluir: (id: string) => void;
  aoRenomear: (id: string, nome: string) => void;
};

function Desenho({ simbolo }: { simbolo: Simbolo }) {
  const { largura, altura } = simbolo.vetor.caixa;
  const tinta = simbolo.vetor.preenchimento;
  const cor = tinta.tipo === "cor" ? tinta.cor : tinta.tipo === "malha" ? (tinta.pontos[0]?.cor ?? "#888888") : "#888888";
  const traco = simbolo.vetor.traco?.tinta.tipo === "cor" ? simbolo.vetor.traco.tinta.cor : "none";
  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className="size-9 shrink-0 rounded border border-borda bg-white" aria-hidden>
      <path d={svgDosCaminhos(simbolo.vetor.subcaminhos)} fill={tinta.tipo === "nenhuma" ? "none" : cor} fillRule="evenodd" stroke={traco} strokeWidth={simbolo.vetor.traco?.largura ?? 0} />
    </svg>
  );
}

export function PainelSimbolos({ simbolos, escolhido, aoEscolher, comForma, comInstancias, aoCriar, aoPor, aoRedefinir, aoRomper, aoExcluir, aoRenomear }: Props) {
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const botao = "botao-icone disabled:opacity-40";
  return (
    <div className="flex h-full flex-col text-xs" data-painel-simbolos>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1" aria-label="Símbolos">
        {simbolos.length === 0 ? <li className="p-2 text-suave">Nenhum símbolo. Escolha uma forma e clique em Novo símbolo.</li> : null}
        {simbolos.map((simbolo) => (
          <li key={simbolo.id}>
            <button
              type="button"
              aria-pressed={escolhido === simbolo.id}
              className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left ${escolhido === simbolo.id ? "bg-destaque/25 text-texto" : "hover:bg-painel-2"}`}
              onClick={() => aoEscolher(simbolo.id)}
              onDoubleClick={() => setRenomeando(simbolo.id)}
            >
              <Desenho simbolo={simbolo} />
              {renomeando === simbolo.id ? (
                <input
                  autoFocus
                  aria-label="Nome do símbolo"
                  defaultValue={simbolo.nome}
                  className="min-w-0 flex-1 rounded border border-borda bg-painel-2 px-1 py-0.5"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setRenomeando(null);
                  }}
                  onBlur={(e) => {
                    const nome = e.currentTarget.value.trim().slice(0, 80);
                    if (nome && nome !== simbolo.nome) aoRenomear(simbolo.id, nome);
                    setRenomeando(null);
                  }}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate">{simbolo.nome}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-0.5 border-t border-borda p-1">
        <button type="button" className={botao} disabled={!escolhido} onClick={aoPor} title="Pôr uma instância no meio" aria-label="Pôr uma instância no meio">
          <Upload className="size-3.5" aria-hidden />
        </button>
        <button type="button" className={botao} disabled={!escolhido || !comForma} onClick={aoRedefinir} title="Redefinir o símbolo pela forma escolhida" aria-label="Redefinir o símbolo">
          <RefreshCw className="size-3.5" aria-hidden />
        </button>
        <button type="button" className={botao} disabled={!comInstancias} onClick={aoRomper} title="Romper o vínculo das instâncias escolhidas" aria-label="Romper o vínculo">
          <Link2Off className="size-3.5" aria-hidden />
        </button>
        <button type="button" className={botao} disabled={!comForma} onClick={aoCriar} title="Novo símbolo da forma escolhida" aria-label="Novo símbolo">
          <Plus className="size-3.5" aria-hidden />
        </button>
        <button type="button" className={botao} disabled={!escolhido} onClick={() => escolhido && aoExcluir(escolhido)} title="Excluir o símbolo (as instâncias viram formas comuns)" aria-label="Excluir o símbolo">
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
