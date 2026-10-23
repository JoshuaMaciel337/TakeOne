"use client";

import { Brush, Camera, History, ImageIcon, type LucideIcon } from "lucide-react";

/** Os instantâneos e a fonte dos pincéis do histórico (só no editor de imagem). */
export type ExtrasDoHistorico = {
  instantaneos: { id: string; nome: string }[];
  aoCriarInstantaneo: () => void;
  aoRestaurarInstantaneo: (id: string) => void;
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
        <li key={instantaneo.id} className="flex items-center border-b border-borda/50">
          {fonte(`instantaneo:${instantaneo.id}`, instantaneo.nome)}
          <button type="button" className={linha} onClick={() => extras.aoRestaurarInstantaneo(instantaneo.id)} title="Restaurar este instantâneo (vira um passo, que se desfaz)">
            <Camera className="size-3.5 text-suave" aria-hidden />
            <span className="truncate">{instantaneo.nome}</span>
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
        <div className="flex h-8 shrink-0 items-center justify-end border-t border-borda px-1.5">
          <button type="button" className="botao-icone h-6 w-auto gap-1 px-2 text-xs" onClick={extras.aoCriarInstantaneo} title="Criar um instantâneo do estado de agora">
            <Camera className="size-3.5" aria-hidden />
            Novo instantâneo
          </button>
        </div>
      ) : null}
    </div>
  );
}
