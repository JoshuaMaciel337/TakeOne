"use client";

// As pranchetas na prévia (ADR 0003, onda 13.7): o nome de cada uma em cima dela (o clique escolhe) e, com a
// ferramenta Prancheta, arrastar no vazio desenha uma nova, o clique dentro escolhe e arrastar dentro move a prancheta
// com o que está nela.
import { useRef, useState } from "react";

import type { RetanguloDaImagem } from "@/lib/projeto/imagem";

export type PranchetaNaTela = { clipeId: string; nome: string; retangulo: RetanguloDaImagem; escolhida: boolean };

export function PranchetasNaPrevia({
  pranchetas,
  escala,
  ativa,
  aoEscolher,
  aoCriar,
  aoPreverDeslocamento,
  aoDeslocar,
  quadro,
}: {
  pranchetas: PranchetaNaTela[];
  /** Pixels da tela por pixel do documento. */
  escala: number;
  /** A ferramenta Prancheta está escolhida (sem ela, só os nomes aparecem). */
  ativa: boolean;
  aoEscolher: (clipeId: string) => void;
  aoCriar: (retangulo: RetanguloDaImagem) => void;
  /** O arrasto da prancheta escolhida, em frações do quadro (como o das camadas). */
  aoPreverDeslocamento: (deslocamento: { dx: number; dy: number } | null) => void;
  aoDeslocar: (dx: number, dy: number) => void;
  quadro: { largura: number; altura: number };
}) {
  const arrasto = useRef<{ tipo: "mover" | "criar"; x: number; y: number; dx: number; dy: number } | null>(null);
  const [novo, setNovo] = useState<RetanguloDaImagem | null>(null);
  const noDocumento = (evento: React.PointerEvent, elemento: Element) => {
    const r = elemento.getBoundingClientRect();
    return { x: (evento.clientX - r.left) / escala, y: (evento.clientY - r.top) / escala };
  };
  const pranchetaNoPonto = (p: { x: number; y: number }) => [...pranchetas].find((item) => p.x >= item.retangulo.x && p.x <= item.retangulo.x + item.retangulo.largura && p.y >= item.retangulo.y && p.y <= item.retangulo.y + item.retangulo.altura);
  return (
    <div
      className={`absolute inset-0 ${ativa ? "touch-none" : "pointer-events-none"}`}
      style={{ cursor: ativa ? "crosshair" : undefined }}
      aria-label={ativa ? "Pranchetas" : undefined}
      onPointerDown={(evento) => {
        if (!ativa || evento.button !== 0) return;
        evento.stopPropagation();
        evento.currentTarget.setPointerCapture(evento.pointerId);
        const p = noDocumento(evento, evento.currentTarget);
        const alvo = pranchetaNoPonto(p);
        if (alvo) aoEscolher(alvo.clipeId);
        arrasto.current = { tipo: alvo ? "mover" : "criar", x: p.x, y: p.y, dx: 0, dy: 0 };
      }}
      onPointerMove={(evento) => {
        const a = arrasto.current;
        if (!a) return;
        const p = noDocumento(evento, evento.currentTarget);
        let dx = p.x - a.x;
        let dy = p.y - a.y;
        if (evento.shiftKey && a.tipo === "mover") [dx, dy] = Math.abs(dx) > Math.abs(dy) ? [dx, 0] : [0, dy];
        a.dx = dx;
        a.dy = dy;
        if (a.tipo === "mover") aoPreverDeslocamento({ dx: dx / quadro.largura, dy: dy / quadro.altura });
        else setNovo({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), largura: Math.abs(dx), altura: Math.abs(dy) });
      }}
      onPointerUp={() => {
        const a = arrasto.current;
        arrasto.current = null;
        if (!a) return;
        if (a.tipo === "mover") {
          aoPreverDeslocamento(null);
          if (a.dx || a.dy) aoDeslocar(a.dx / quadro.largura, a.dy / quadro.altura);
        } else {
          setNovo(null);
          // Um clique sem arrastar não cria nada (o menu Camada › Novo › Prancheta põe uma com o tamanho escolhido)
          if (Math.abs(a.dx) * escala > 4 && Math.abs(a.dy) * escala > 4) aoCriar({ x: Math.min(a.x, a.x + a.dx), y: Math.min(a.y, a.y + a.dy), largura: Math.abs(a.dx), altura: Math.abs(a.dy) });
        }
      }}
    >
      {pranchetas.map((item) => (
        <div key={item.clipeId}>
          <div
            className={`pointer-events-none absolute border ${item.escolhida ? "border-destaque" : "border-white/0"}`}
            style={{ left: item.retangulo.x * escala, top: item.retangulo.y * escala, width: item.retangulo.largura * escala, height: item.retangulo.altura * escala }}
            aria-hidden
          />
          <button
            type="button"
            className={`pointer-events-auto absolute max-w-[40%] -translate-y-full truncate rounded-sm px-1 text-[11px] leading-4 ${item.escolhida ? "bg-destaque text-white" : "bg-black/45 text-white hover:bg-black/70"}`}
            style={{ left: item.retangulo.x * escala, top: item.retangulo.y * escala - 2 }}
            title={`${item.nome} (${Math.round(item.retangulo.largura)} × ${Math.round(item.retangulo.altura)})`}
            onPointerDown={(evento) => evento.stopPropagation()}
            onClick={() => aoEscolher(item.clipeId)}
          >
            {item.nome}
          </button>
        </div>
      ))}
      {novo ? <div className="pointer-events-none absolute border border-dashed border-white outline outline-1 outline-black/60" style={{ left: novo.x * escala, top: novo.y * escala, width: novo.largura * escala, height: novo.altura * escala }} aria-hidden /> : null}
    </div>
  );
}
