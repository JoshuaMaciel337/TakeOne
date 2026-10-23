"use client";

import { useEffect, useRef } from "react";

import type { Caixa } from "@/lib/projeto/geometria";
import type { Recorte, Virar } from "@/lib/projeto/modelo";

import type { FerramentaObjeto } from "./useObjeto";

type Props = {
  caixa: Caixa;
  recorte: Recorte;
  virar: Virar | null | undefined;
  objeto: FerramentaObjeto;
  /** O fim de um traço do pincel (a ferramenta Remover apaga logo depois de cada traço). */
  aoTerminarTraco?: () => void;
};

type Ponto = { x: number; y: number };

/**
 * Por cima da camada escolhida: a seleção da IA pintada, os pontos clicados e o pincel da ferramenta Remover. Fica
 * girada com a camada, então o clique e o traço já vêm nas coordenadas dela (offsetX e offsetY ignoram o giro do CSS).
 * Os letreiros e os laços desenham a seleção do documento (SelecaoNaPrevia).
 */
export function ObjetoNaPrevia({ caixa, recorte, virar, objeto, aoTerminarTraco }: Props) {
  const desenhando = useRef<Ponto | null>(null);
  const largura = Math.max(1, Math.round(caixa.largura));
  const altura = Math.max(1, Math.round(caixa.altura));
  const { pincelRef, modo } = objeto;

  // O canvas do pincel acompanha o tamanho da caixa (mudar o tamanho apaga o que estava pintado)
  useEffect(() => {
    const canvas = pincelRef.current;
    if (canvas && (canvas.width !== largura || canvas.height !== altura)) {
      canvas.width = largura;
      canvas.height = altura;
    }
  }, [largura, altura, pincelRef]);

  function tracar(x: number, y: number) {
    const ctx = pincelRef.current?.getContext("2d");
    if (!ctx) return;
    const anterior = desenhando.current ?? { x, y };
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(255,255,255,1)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = objeto.tamanhoDoPincel * Math.min(largura, altura);
    ctx.beginPath();
    ctx.moveTo(anterior.x, anterior.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    desenhando.current = { x, y };
  }

  return (
    <div
      className="absolute z-20 cursor-crosshair overflow-hidden"
      style={{ left: caixa.cx - caixa.largura / 2, top: caixa.cy - caixa.altura / 2, width: caixa.largura, height: caixa.altura, transform: `rotate(${caixa.rotacao}deg)` }}
      onPointerDown={(evento) => {
        evento.stopPropagation();
        if (evento.button !== 0) return;
        const { offsetX, offsetY } = evento.nativeEvent;
        if (modo === "clique") {
          objeto.clicar(offsetX / caixa.largura, offsetY / caixa.altura, !evento.shiftKey && !evento.altKey);
          return;
        }
        (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
        desenhando.current = null;
        tracar(offsetX, offsetY);
        objeto.marcarPincel();
      }}
      onPointerMove={(evento) => {
        const { offsetX, offsetY } = evento.nativeEvent;
        if (modo === "pincel" && desenhando.current) tracar(offsetX, offsetY);
      }}
      onPointerUp={() => {
        if (modo === "pincel" && desenhando.current) {
          desenhando.current = null;
          aoTerminarTraco?.();
        }
      }}
    >
      {objeto.selecao ? (
        // A máscara é da foto inteira: aparece só o pedaço do recorte, virado como a camada
        <div className="pointer-events-none absolute inset-0" style={{ transform: `scale(${virar?.horizontal ? -1 : 1}, ${virar?.vertical ? -1 : 1})` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- desenhada no navegador (data:) */}
          <img
            src={objeto.selecao.ver}
            alt=""
            className="absolute max-w-none"
            style={{
              width: `${100 / recorte.largura}%`,
              height: `${100 / recorte.altura}%`,
              left: `${(-(virar?.horizontal ? 1 - recorte.x - recorte.largura : recorte.x) / recorte.largura) * 100}%`,
              top: `${(-(virar?.vertical ? 1 - recorte.y - recorte.altura : recorte.y) / recorte.altura) * 100}%`,
            }}
          />
        </div>
      ) : null}
      <canvas ref={pincelRef} className="pointer-events-none absolute inset-0 size-full opacity-50 mix-blend-screen" style={{ filter: "drop-shadow(0 0 0 #ff28aa)" }} />
      {objeto.pontos.map((ponto, i) => (
        <span
          key={i}
          className={`pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${ponto.incluir ? "bg-emerald-500" : "bg-red-500"}`}
          style={{ left: `${ponto.u * 100}%`, top: `${ponto.v * 100}%` }}
        />
      ))}
    </div>
  );
}
