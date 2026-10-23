"use client";

import { Bookmark, Trash2 } from "lucide-react";

import type { Comando } from "@/lib/projeto/comandos";
import { CORES_DOS_MARCADORES, type Projeto } from "@/lib/projeto/modelo";
import { formatarTimecodeLongo, type Tick } from "@/lib/tempo";

type Props = {
  projeto: Projeto;
  tempo: Tick;
  aoBuscar: (tempo: Tick) => void;
  aoExecutar: (comando: Comando) => void;
};

/**
 * Marcadores: a lista dos marcadores da sequência, em ordem, com a cor, o nome e o código de tempo, como no painel dos
 * editores profissionais. Clicar leva o cursor até ele; o nome se muda ali mesmo.
 */
export function PainelMarcadores({ projeto, tempo, aoBuscar, aoExecutar }: Props) {
  const marcadores = projeto.marcadores ?? [];
  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-borda px-2 text-suave">
        <span>{marcadores.length === 1 ? "1 marcador" : `${marcadores.length} marcadores`}</span>
        <button type="button" className="botao-icone size-6" onClick={() => aoExecutar({ comando: "marcador.adicionar", parametros: { tempo } })} title="Adicionar marcador no cursor (M)" aria-label="Adicionar marcador">
          <Bookmark className="size-3.5" aria-hidden />
        </button>
      </div>
      {marcadores.length === 0 ? (
        <p className="p-4 text-center text-suave">Aperte M na linha do tempo para marcar um instante. Os marcadores viram capítulos na exportação.</p>
      ) : (
        <ol aria-label="Marcadores" className="min-h-0 flex-1 overflow-y-auto">
          {marcadores.map((marcador) => (
            <li key={marcador.id} className="group flex items-center gap-2 border-b border-borda/60 px-2 py-1.5 hover:bg-painel-2">
              <select
                aria-label={`Cor de ${marcador.nome}`}
                value={marcador.cor}
                onChange={(evento) => aoExecutar({ comando: "marcador.mudar", parametros: { id: marcador.id, cor: evento.currentTarget.value } })}
                className="size-4 shrink-0 cursor-pointer appearance-none rounded-sm border border-black/30 text-transparent"
                style={{ background: marcador.cor }}
              >
                {CORES_DOS_MARCADORES.map((cor) => (
                  <option key={cor} value={cor} style={{ background: cor, color: "#000" }}>
                    {cor}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => aoBuscar(marcador.t)} className="shrink-0 font-mono tabular-nums text-codigo hover:underline" title="Levar o cursor até o marcador">
                {formatarTimecodeLongo(marcador.t, projeto.taxa)}
              </button>
              <input
                key={marcador.nome}
                defaultValue={marcador.nome}
                aria-label="Nome do marcador"
                maxLength={80}
                onBlur={(evento) => {
                  const nome = evento.currentTarget.value.trim();
                  if (nome && nome !== marcador.nome) aoExecutar({ comando: "marcador.mudar", parametros: { id: marcador.id, nome } });
                }}
                onKeyDown={(evento) => evento.key === "Enter" && evento.currentTarget.blur()}
                className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 outline-none focus:bg-painel-3"
              />
              <button
                type="button"
                className="botao-icone size-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={() => aoExecutar({ comando: "marcador.apagar", parametros: { id: marcador.id } })}
                aria-label={`Apagar ${marcador.nome}`}
                title="Apagar o marcador"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
