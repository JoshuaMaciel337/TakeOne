"use client";

import { Brush, Camera, FilePlus, History, ImageIcon, type LucideIcon, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";

/** Os instantâneos e a fonte dos pincéis do histórico (só no editor de imagem). */
export type ExtrasDoHistorico = {
  instantaneos: { id: string; nome: string }[];
  /** Com Alt (ou pelas opções), abre a janela do instantâneo novo. */
  aoCriarInstantaneo: (comJanela: boolean) => void;
  aoRestaurarInstantaneo: (id: string) => void;
  aoRenomearInstantaneo: (id: string, nome: string) => void;
  aoExcluirInstantaneo: (id: string) => void;
  /** Um documento novo com o estado de agora, ou com o instantâneo dado. */
  aoDocumentoNovo: (instantaneo?: string) => void;
  aoExcluirEstado: () => void;
  aoOpcoes: () => void;
  /** A fonte do pincel do histórico: "passo:<n>" (0 é o de abertura) ou "instantaneo:<id>". */
  fonte: string;
  aoEscolherFonte: (fonte: string) => void;
};

/**
 * Histórico: o estado de abertura e os passos; clicar volta (ou avança) até ele. Os desfeitos ficam apagados. No
 * editor de imagem, também os instantâneos (em cima) e a coluna da fonte do pincel do histórico (à esquerda).
 */
export function PainelHistorico({
  nome,
  feitos,
  desfeitos,
  aoIr,
  Icone = ImageIcon,
  extras,
}: {
  nome: string;
  feitos: string[];
  desfeitos: string[];
  aoIr: (desfazer: number, refazer: number) => void;
  Icone?: LucideIcon;
  extras?: ExtrasDoHistorico;
}) {
  const linha = "flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-painel-2";
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const fonte = (chave: string, rotulo: string) =>
    extras ? (
      <button
        type="button"
        className={`grid w-6 shrink-0 place-items-center ${extras.fonte === chave ? "text-texto" : "text-suave/30 hover:text-suave"}`}
        aria-pressed={extras.fonte === chave}
        aria-label={`Fonte do pincel do histórico: ${rotulo}`}
        title="Marcar como a fonte do pincel do histórico"
        onClick={() => extras.aoEscolherFonte(chave)}
      >
        <Brush className="size-3" aria-hidden />
      </button>
    ) : null;
  return (
    <div className="flex h-full min-h-0 flex-col">
    <ol aria-label="Histórico" className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1">
      {extras?.instantaneos.map((instantaneo) => (
        <li key={instantaneo.id} className="group flex items-center border-b border-borda/50">
          {fonte(`instantaneo:${instantaneo.id}`, instantaneo.nome)}
          {renomeando === instantaneo.id ? (
            <input
              aria-label="Nome do instantâneo"
              className="mx-2 my-0.5 min-w-0 flex-1 rounded border border-borda bg-painel-2 px-1 text-xs"
              defaultValue={instantaneo.nome}
              maxLength={60}
              autoFocus
              onFocus={(evento) => evento.currentTarget.select()}
              onBlur={(evento) => {
                if (evento.currentTarget.value.trim()) extras.aoRenomearInstantaneo(instantaneo.id, evento.currentTarget.value.trim());
                setRenomeando(null);
              }}
              onKeyDown={(evento) => {
                if (evento.key === "Enter") evento.currentTarget.blur();
                if (evento.key === "Escape") setRenomeando(null);
              }}
            />
          ) : (
            <button type="button" className={linha} onClick={() => extras.aoRestaurarInstantaneo(instantaneo.id)} onDoubleClick={() => setRenomeando(instantaneo.id)} title="Restaurar este instantâneo (vira um passo, que se desfaz); duplo clique renomeia">
              <Camera className="size-3.5 text-suave" aria-hidden />
              <span className="truncate">{instantaneo.nome}</span>
            </button>
          )}
          <button type="button" className="botao-icone size-5 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => extras.aoDocumentoNovo(instantaneo.id)} aria-label={`Documento novo a partir de ${instantaneo.nome}`} title="Documento novo a partir deste instantâneo">
            <FilePlus className="size-3" aria-hidden />
          </button>
          <button type="button" className="botao-icone mr-1 size-5 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => extras.aoExcluirInstantaneo(instantaneo.id)} aria-label={`Excluir ${instantaneo.nome}`} title="Excluir o instantâneo">
            <Trash2 className="size-3" aria-hidden />
          </button>
        </li>
      ))}
      <li className="flex items-center">
        {fonte("passo:0", nome || "abertura")}
        <button type="button" className={`${linha} ${feitos.length ? "" : "bg-destaque/25"}`} onClick={() => aoIr(feitos.length, 0)}>
          <Icone className="size-3.5 text-suave" aria-hidden />
          <span className="truncate font-medium">{nome || "Sem nome"}</span>
        </button>
      </li>
      {feitos.map((passo, i) => (
        <li key={`f${i}`} className="flex items-center">
          {fonte(`passo:${i + 1}`, passo)}
          <button type="button" className={`${linha} ${i === feitos.length - 1 ? "bg-destaque/25" : ""}`} onClick={() => aoIr(feitos.length - 1 - i, 0)}>
            <History className="size-3.5 text-suave" aria-hidden />
            <span className="truncate first-letter:uppercase">{passo}</span>
          </button>
        </li>
      ))}
      {desfeitos.map((passo, i) => (
        <li key={`d${i}`} className="flex items-center">
          {extras ? <span className="w-6 shrink-0" /> : null}
          <button type="button" className={`${linha} text-apagado`} onClick={() => aoIr(0, i + 1)}>
            <History className="size-3.5" aria-hidden />
            <span className="truncate first-letter:uppercase">{passo}</span>
          </button>
        </li>
      ))}
    </ol>
      {extras ? (
        <div className="flex h-8 shrink-0 items-center justify-end gap-0.5 border-t border-borda px-1.5">
          <button type="button" className="botao-icone mr-auto size-6" onClick={extras.aoOpcoes} aria-label="Opções do histórico" title="Opções do histórico">
            <Settings2 className="size-3.5" aria-hidden />
          </button>
          <button type="button" className="botao-icone size-6" onClick={() => extras.aoDocumentoNovo()} aria-label="Documento novo a partir do estado atual" title="Documento novo a partir do estado atual">
            <FilePlus className="size-3.5" aria-hidden />
          </button>
          <button type="button" className="botao-icone h-6 w-auto gap-1 px-2 text-xs" onClick={(evento) => extras.aoCriarInstantaneo(evento.altKey)} title="Criar um instantâneo do estado de agora (com Alt, escolha o nome e o que entra)">
            <Camera className="size-3.5" aria-hidden />
            Novo instantâneo
          </button>
          <button type="button" className="botao-icone size-6" onClick={extras.aoExcluirEstado} disabled={!feitos.length} aria-label="Excluir o estado atual" title="Excluir o estado atual (e, no histórico linear, os que vieram depois)">
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}
