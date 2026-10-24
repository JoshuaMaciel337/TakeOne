"use client";

// Editar › Localizar e substituir texto (ADR 0003, onda 13.8): uma janela que fica aberta ao lado da imagem. Localizar
// abre a edição do texto com o trecho achado selecionado; Substituir troca o selecionado e vai para o próximo;
// Substituir tudo troca em todas as camadas de texto num passo só do desfazer.
import { X } from "lucide-react";
import { useEffect, useState } from "react";

import type { OpcoesDaBusca } from "@/lib/texto/localizar";

type Props = {
  aoFechar: () => void;
  aoLocalizar: (busca: string, opcoes: OpcoesDaBusca) => boolean;
  aoSubstituir: (busca: string, troca: string, opcoes: OpcoesDaBusca) => boolean;
  aoSubstituirTudo: (busca: string, troca: string, opcoes: OpcoesDaBusca) => number;
};

const campo = "rounded border border-borda bg-painel-2 px-1.5 py-1 text-xs text-texto";

export function JanelaLocalizarTexto({ aoFechar, aoLocalizar, aoSubstituir, aoSubstituirTudo }: Props) {
  const [busca, setBusca] = useState("");
  const [troca, setTroca] = useState("");
  const [opcoes, setOpcoes] = useState<OpcoesDaBusca>({ maiusculas: false, palavraInteira: false, acentos: true });
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar]);
  return (
    <div role="dialog" aria-label="Localizar e substituir texto" className="fixed right-4 top-24 z-50 w-80 rounded-lg border border-borda bg-painel shadow-2xl">
      <div className="flex items-center justify-between border-b border-borda px-3 py-2">
        <h2 className="text-sm font-semibold">Localizar e substituir texto</h2>
        <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <form
        className="flex flex-col gap-2 p-3 text-xs"
        onSubmit={(evento) => {
          evento.preventDefault();
          setAviso(aoLocalizar(busca, opcoes) ? null : "Nada encontrado.");
        }}
        onKeyDown={(evento) => evento.stopPropagation()}
      >
        <label className="flex flex-col gap-1 text-suave">
          Localizar:
          <input autoFocus aria-label="Localizar" className={campo} value={busca} onChange={(evento) => setBusca(evento.currentTarget.value)} />
        </label>
        <label className="flex flex-col gap-1 text-suave">
          Substituir por:
          <input aria-label="Substituir por" className={campo} value={troca} onChange={(evento) => setTroca(evento.currentTarget.value)} />
        </label>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-texto">
          {(
            [
              ["maiusculas", "Diferenciar maiúsculas"],
              ["acentos", "Diferenciar acentos"],
              ["palavraInteira", "Palavra inteira"],
            ] as const
          ).map(([chave, nome]) => (
            <label key={chave} className="flex items-center gap-1">
              <input type="checkbox" checked={opcoes[chave]} onChange={(evento) => setOpcoes((atual) => ({ ...atual, [chave]: evento.currentTarget.checked }))} />
              {nome}
            </label>
          ))}
        </div>
        {aviso ? <p className="text-suave" role="status">{aviso}</p> : null}
        <div className="flex flex-wrap justify-end gap-1.5 pt-1">
          <button type="submit" className="botao-principal px-2.5 py-1 text-xs" disabled={!busca}>
            Localizar próximo
          </button>
          <button type="button" className="botao-secundario px-2.5 py-1 text-xs" disabled={!busca} onClick={() => setAviso(aoSubstituir(busca, troca, opcoes) ? null : "Nada encontrado.")}>
            Substituir
          </button>
          <button
            type="button"
            className="botao-secundario px-2.5 py-1 text-xs"
            disabled={!busca}
            onClick={() => {
              const quantas = aoSubstituirTudo(busca, troca, opcoes);
              setAviso(quantas ? `${quantas} ${quantas === 1 ? "troca feita" : "trocas feitas"}.` : "Nada encontrado.");
            }}
          >
            Substituir tudo
          </button>
        </div>
      </form>
    </div>
  );
}
