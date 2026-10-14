"use client";

import { useRef, useState } from "react";

type Props = {
  nome: string;
  /** 0 a 360°, com o vermelho em cima e girando no sentido horário. */
  matiz: number;
  /** 0 (centro) a 1 (borda). */
  forca: number;
  desativado?: boolean;
  aoPrever: (matiz: number, forca: number) => void;
  aoConfirmar: (matiz: number, forca: number) => void;
};

const PASSO_MATIZ = 5;
const PASSO_FORCA = 0.05;

function arredondar(matiz: number, forca: number): [number, number] {
  return [Math.round(((matiz % 360) + 360) % 360), Math.round(Math.min(1, Math.max(0, forca)) * 100) / 100];
}

/**
 * Roda de cor: arrastar escolhe o matiz (o ângulo) e a força (a distância do centro).
 * Duplo clique volta ao centro. No teclado, ← → mudam o matiz e ↑ ↓ a força.
 */
export function RodaDeCor({ nome, matiz, forca, desativado, aoPrever, aoConfirmar }: Props) {
  const circuloRef = useRef<HTMLDivElement>(null);
  const [arrastando, setArrastando] = useState<[number, number] | null>(null);
  const [m, f] = arrastando ?? [matiz, forca];
  const angulo = (m * Math.PI) / 180;

  function noPonto(evento: React.PointerEvent): [number, number] {
    const caixa = circuloRef.current!.getBoundingClientRect();
    const raio = caixa.width / 2;
    const dx = evento.clientX - (caixa.left + raio);
    const dy = evento.clientY - (caixa.top + raio);
    return arredondar((Math.atan2(dx, -dy) * 180) / Math.PI, Math.hypot(dx, dy) / raio);
  }

  function mover(evento: React.PointerEvent) {
    if (!arrastando) return;
    const valor = noPonto(evento);
    setArrastando(valor);
    aoPrever(...valor);
  }

  function soltar(evento: React.PointerEvent) {
    if (!arrastando) return;
    const valor = noPonto(evento);
    setArrastando(null);
    aoConfirmar(...valor);
  }

  function teclar(evento: React.KeyboardEvent) {
    const passos: Record<string, [number, number]> = {
      ArrowLeft: [-PASSO_MATIZ, 0],
      ArrowRight: [PASSO_MATIZ, 0],
      ArrowDown: [0, -PASSO_FORCA],
      ArrowUp: [0, PASSO_FORCA],
    };
    const passo = passos[evento.key];
    if (!passo || desativado) return;
    evento.preventDefault();
    aoConfirmar(...arredondar(matiz + passo[0], forca + passo[1]));
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={circuloRef}
        role="slider"
        tabIndex={desativado ? -1 : 0}
        aria-label={`Roda de cor: ${nome}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(f * 100)}
        aria-valuetext={`matiz ${Math.round(m)} graus, força ${Math.round(f * 100)}%`}
        aria-disabled={desativado}
        onPointerDown={(evento) => {
          if (desativado) return;
          evento.currentTarget.setPointerCapture(evento.pointerId);
          const valor = noPonto(evento);
          setArrastando(valor);
          aoPrever(...valor);
        }}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={() => {
          setArrastando(null);
          aoPrever(matiz, forca);
        }}
        onDoubleClick={() => !desativado && aoConfirmar(matiz, 0)}
        onKeyDown={teclar}
        className={`relative size-20 touch-none rounded-full border border-borda outline-none focus-visible:ring-2 focus-visible:ring-destaque ${desativado ? "opacity-50" : "cursor-crosshair"}`}
        style={{
          background:
            "radial-gradient(circle, rgb(128 128 128) 0%, rgb(128 128 128 / 0) 70%), conic-gradient(hsl(0 80% 50%), hsl(60 80% 50%), hsl(120 80% 50%), hsl(180 80% 50%), hsl(240 80% 50%), hsl(300 80% 50%), hsl(360 80% 50%))",
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${50 + 50 * f * Math.sin(angulo)}%`, top: `${50 - 50 * f * Math.cos(angulo)}%` }}
        />
      </div>
      <span className="text-[11px] font-medium">{nome}</span>
      <span className="text-[10px] tabular-nums text-suave">{f > 0 ? `${Math.round(m)}° · ${Math.round(f * 100)}%` : "neutro"}</span>
    </div>
  );
}
