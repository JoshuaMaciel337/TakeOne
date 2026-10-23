"use client";

import { useRef } from "react";

import type { RetanguloDaImagem, TamanhoDaImagem } from "@/lib/projeto/imagem";

type Props = {
  /** O retângulo, em pixels da imagem. */
  retangulo: RetanguloDaImagem;
  imagem: TamanhoDaImagem;
  /** Pixels da tela por pixel da imagem. */
  escala: number;
  /** Largura sobre altura presa; null é livre. */
  proporcao: number | null;
  aoMudar: (retangulo: RetanguloDaImagem) => void;
};

type Pegada = "meio" | "nw" | "ne" | "sw" | "se";
const MINIMO = 16;
const CANTOS: Pegada[] = ["nw", "ne", "sw", "se"];

/** O retângulo do recorte sobre a prévia: fora dele escurece; o meio arrasta e os cantos mudam o tamanho. */
export function RecorteNaPrevia({ retangulo, imagem, escala, proporcao, aoMudar }: Props) {
  const inicio = useRef<{ x: number; y: number; retangulo: RetanguloDaImagem; pegada: Pegada } | null>(null);

  function apertar(evento: React.PointerEvent, pegada: Pegada) {
    evento.stopPropagation();
    evento.preventDefault();
    (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
    inicio.current = { x: evento.clientX, y: evento.clientY, retangulo, pegada };
  }

  function mover(evento: React.PointerEvent) {
    const atual = inicio.current;
    if (!atual) return;
    const dx = (evento.clientX - atual.x) / escala;
    const dy = (evento.clientY - atual.y) / escala;
    const r = atual.retangulo;
    if (atual.pegada === "meio") {
      aoMudar({ ...r, x: limitar(r.x + dx, 0, imagem.largura - r.largura), y: limitar(r.y + dy, 0, imagem.altura - r.altura) });
      return;
    }
    // O canto oposto fica parado
    const fixoX = atual.pegada.includes("w") ? r.x + r.largura : r.x;
    const fixoY = atual.pegada.includes("n") ? r.y + r.altura : r.y;
    const pontaX = limitar((atual.pegada.includes("w") ? r.x : r.x + r.largura) + dx, 0, imagem.largura);
    const pontaY = limitar((atual.pegada.includes("n") ? r.y : r.y + r.altura) + dy, 0, imagem.altura);
    let largura = Math.max(MINIMO, Math.abs(pontaX - fixoX));
    let altura = Math.max(MINIMO, Math.abs(pontaY - fixoY));
    if (proporcao) {
      // Com a proporção presa, o lado que mais andou manda e o outro segue, sem sair da imagem
      if (largura / altura > proporcao) altura = largura / proporcao;
      else largura = altura * proporcao;
      const maximoL = atual.pegada.includes("w") ? fixoX : imagem.largura - fixoX;
      const maximoA = atual.pegada.includes("n") ? fixoY : imagem.altura - fixoY;
      const fator = Math.min(1, maximoL / largura, maximoA / altura);
      largura *= fator;
      altura *= fator;
    }
    aoMudar({
      x: atual.pegada.includes("w") ? fixoX - largura : fixoX,
      y: atual.pegada.includes("n") ? fixoY - altura : fixoY,
      largura,
      altura,
    });
  }

  const soltar = () => {
    inicio.current = null;
  };
  const estilo = { left: retangulo.x * escala, top: retangulo.y * escala, width: retangulo.largura * escala, height: retangulo.altura * escala };
  return (
    <div className="absolute inset-0 z-20" onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
      <div
        className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
        style={estilo}
        onPointerDown={(evento) => apertar(evento, "meio")}
        aria-label="Área que fica"
      >
        {/* Os terços, para enquadrar */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="border border-white/25" />
          ))}
        </div>
        {CANTOS.map((canto) => (
          <span
            key={canto}
            onPointerDown={(evento) => apertar(evento, canto)}
            className={`absolute size-4 rounded-sm border-2 border-destaque bg-white ${canto.includes("n") ? "-top-2" : "-bottom-2"} ${canto.includes("w") ? "-left-2" : "-right-2"} ${
              canto === "nw" || canto === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"
            }`}
            aria-label={`Canto ${canto}`}
          />
        ))}
      </div>
    </div>
  );
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}
