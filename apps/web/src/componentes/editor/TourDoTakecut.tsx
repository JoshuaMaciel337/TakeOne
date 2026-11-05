"use client";

import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";

const CHAVE = "takeone-tour-takecut";

/** Os seis passos do tour (ADR 0007, 17.8): o que cada parte do Takecut faz, apontando para ela na tela. */
const PASSOS: { alvo: string; titulo: string; texto: string }[] = [
  { alvo: "section[aria-label='Materiais']", titulo: "Materiais", texto: "As abas de cima trocam o que aparece aqui: mídias, textos, áudios, efeitos, filtros, transições e mais. Arraste qualquer um até a linha do tempo." },
  { alvo: "section[aria-label='Prévia']", titulo: "Prévia", texto: "O vídeo como vai sair. Clique num clipe para escolher, arraste para mover e use as alças para mudar o tamanho e girar." },
  { alvo: "aside[aria-label='Propriedades']", titulo: "Ajustes", texto: "Os ajustes do clipe escolhido, em abas. Sem nada escolhido, os detalhes do projeto; com vários, o que vale para todos." },
  { alvo: "section[aria-label='Linha do tempo']", titulo: "Linha do tempo", texto: "Corte, apare e organize. O botão direito abre o menu do clipe; arrastar no vazio escolhe vários; o mouse por cima mostra o quadro na prévia." },
  { alvo: "header button.botao-principal", titulo: "Exportar", texto: "O vídeo em 720p, 1080p ou 4K, um GIF, um quadro ou só o som. Ctrl+E também abre." },
  { alvo: "button[aria-label='Abrir o assistente']", titulo: "Assistente", texto: "Peça uma edição em palavras (\"legendas amarelas, tira as pausas\") ou deixe a IA melhorar o projeto inteiro." },
];

export function tourJaVisto(): boolean {
  try {
    return localStorage.getItem(CHAVE) === "visto";
  } catch {
    return true;
  }
}

/** O tour do Takecut: um realce em volta de cada parte e o balão com o texto, com Voltar, Próximo e Pular. */
export function TourDoTakecut({ aoFechar }: { aoFechar: () => void }) {
  const [passo, setPasso] = useState(0);
  const [caixa, setCaixa] = useState<DOMRect | null>(null);
  const atual = PASSOS[passo];
  useLayoutEffect(() => {
    const medir = () => setCaixa(document.querySelector(atual.alvo)?.getBoundingClientRect() ?? null);
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [atual.alvo]);
  const terminar = () => {
    try {
      localStorage.setItem(CHAVE, "visto");
    } catch {
      // Sem armazenamento: o tour volta na próxima vez
    }
    aoFechar();
  };
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") terminar();
      if (evento.key === "ArrowRight") setPasso((p) => Math.min(PASSOS.length - 1, p + 1));
      if (evento.key === "ArrowLeft") setPasso((p) => Math.max(0, p - 1));
      evento.stopImmediatePropagation();
    };
    window.addEventListener("keydown", tecla, { capture: true });
    return () => window.removeEventListener("keydown", tecla, { capture: true });
  });
  // O balão fica embaixo do realce, ou em cima quando não cabe
  const largura = 320;
  const embaixo = caixa ? caixa.bottom + 12 + 180 < window.innerHeight : true;
  const esquerda = caixa ? Math.max(12, Math.min(window.innerWidth - largura - 12, caixa.left + caixa.width / 2 - largura / 2)) : 12;
  const topo = caixa ? (embaixo ? caixa.bottom + 12 : Math.max(12, caixa.top - 12 - 170)) : 12;
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Tour do editor">
      {caixa ? (
        <div className="pointer-events-none absolute rounded-xl ring-2 ring-destaque" style={{ left: caixa.left - 4, top: caixa.top - 4, width: caixa.width + 8, height: caixa.height + 8, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)" }} />
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}
      <div className="absolute rounded-xl border border-borda bg-painel p-4 shadow-2xl" style={{ left: esquerda, top: topo, width: largura }}>
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold">{atual.titulo}</h2>
          <button type="button" className="botao-icone size-6" onClick={terminar} aria-label="Pular o tour">
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-xs text-suave">{atual.texto}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] tabular-nums text-suave">
            {passo + 1} de {PASSOS.length}
          </span>
          <span className="flex gap-1.5">
            {passo > 0 ? (
              <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={() => setPasso(passo - 1)}>
                Voltar
              </button>
            ) : (
              <button type="button" className="rounded-md px-3 py-1 text-xs text-suave hover:text-texto" onClick={terminar}>
                Pular
              </button>
            )}
            <button type="button" className="botao-principal px-3 py-1 text-xs" onClick={() => (passo === PASSOS.length - 1 ? terminar() : setPasso(passo + 1))}>
              {passo === PASSOS.length - 1 ? "Começar" : "Próximo"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
