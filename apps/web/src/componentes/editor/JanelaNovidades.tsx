"use client";

import { Sparkles, X } from "lucide-react";
import { useEffect } from "react";

/** O que chegou ao editor de vídeo, do mais novo para o mais antigo (ADR 0007, 17.8). */
const NOVIDADES: { titulo: string; texto: string }[] = [
  { titulo: "Atalhos em abas e o tour", texto: "A janela de atalhos (?) com busca e grupos, Ctrl+E para exportar, Shift+Z para ver o projeto inteiro e o tour pelo editor (Menu › Ajuda)." },
  { titulo: "Projetos com lixeira", texto: "Excluir leva o projeto para a lixeira por 30 dias; a lista busca, ordena, renomeia e duplica, e soltar vídeos na página cria um projeto com eles." },
  { titulo: "Melhorar o projeto e o assistente", texto: "A IA acha o que dá para melhorar (volume, cor, legendas, voz e cenas) e aplica em todos; o botão redondo abre o pedido em palavras." },
  { titulo: "Cor animada", texto: "Na aba Cor, a cor do clipe pode ir até outra ao longo dele, com keyframes." },
  { titulo: "Ajustes em grupos", texto: "Caber, cobrir e alinhar, vários clipes ajustados de uma vez, a duração da velocidade editável e as fontes livres no texto." },
  { titulo: "Materiais com favoritos", texto: "Filtros, efeitos e transições com busca, favoritos, recentes, a prévia ao passar o mouse e o arrasto até um clipe." },
  { titulo: "Linha do tempo nova", texto: "O menu do botão direito, a seleção em caixa, o fade e o volume no próprio clipe e a prévia seguindo o mouse." },
];

export function JanelaNovidades({ aoFechar }: { aoFechar: () => void }) {
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      evento.stopImmediatePropagation();
      aoFechar();
    };
    window.addEventListener("keydown", tecla, { capture: true });
    return () => window.removeEventListener("keydown", tecla, { capture: true });
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onPointerDown={aoFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-novidades" className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-borda bg-painel shadow-2xl shadow-black/60" onPointerDown={(evento) => evento.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 id="titulo-novidades" className="flex items-center gap-2 font-display text-base font-semibold">
            <Sparkles className="size-4 text-destaque" aria-hidden />
            Novidades
          </h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {NOVIDADES.map((novidade) => (
            <li key={novidade.titulo}>
              <p className="text-sm font-medium">{novidade.titulo}</p>
              <p className="text-xs text-suave">{novidade.texto}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
