"use client";

import { useEffect, useRef, useState } from "react";

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
 * Por cima da camada escolhida: a seleção pintada, os pontos clicados, o pincel, os letreiros e os laços. Fica girada
 * com a camada, então o clique e o traço já vêm nas coordenadas dela (offsetX e offsetY ignoram o giro do CSS). Os
 * letreiros e os laços pintam na mesma máscara do pincel: sem tecla, a seleção recomeça; com Shift, soma; com Alt,
 * subtrai, como no editor de imagem profissional.
 */
export function ObjetoNaPrevia({ caixa, recorte, virar, objeto, aoTerminarTraco }: Props) {
  const desenhando = useRef<Ponto | null>(null);
  const [arrasto, setArrasto] = useState<{ inicio: Ponto; fim: Ponto; jeito: "nova" | "somar" | "tirar" } | null>(null);
  const [caminho, setCaminho] = useState<Ponto[]>([]);
  const jeitoDoCaminho = useRef<"nova" | "somar" | "tirar">("nova");
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

  // Trocar de ferramenta no meio de um laço poligonal desiste dele
  useEffect(() => {
    void Promise.resolve().then(() => setCaminho([]));
  }, [modo]);

  function contexto(jeito: "nova" | "somar" | "tirar"): CanvasRenderingContext2D | null {
    const canvas = pincelRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return null;
    if (jeito === "nova") objeto.limpar();
    ctx.globalCompositeOperation = jeito === "tirar" ? "destination-out" : "source-over";
    ctx.fillStyle = "rgba(255,255,255,1)";
    return ctx;
  }

  function preencher(jeito: "nova" | "somar" | "tirar", desenhar: (ctx: CanvasRenderingContext2D) => void) {
    const ctx = contexto(jeito);
    if (!ctx) return;
    ctx.beginPath();
    desenhar(ctx);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    objeto.marcarPincel();
  }

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

  function fecharPoligono(pontos: Ponto[], jeito: "nova" | "somar" | "tirar") {
    if (pontos.length >= 3) {
      preencher(jeito, (ctx) => {
        ctx.moveTo(pontos[0].x, pontos[0].y);
        for (const ponto of pontos.slice(1)) ctx.lineTo(ponto.x, ponto.y);
        ctx.closePath();
      });
    }
    setCaminho([]);
  }

  const jeitoDoEvento = (evento: React.PointerEvent | React.MouseEvent) => (evento.altKey ? "tirar" : evento.shiftKey ? "somar" : "nova");
  const retangulo = arrasto
    ? {
        left: Math.min(arrasto.inicio.x, arrasto.fim.x),
        top: Math.min(arrasto.inicio.y, arrasto.fim.y),
        width: Math.abs(arrasto.fim.x - arrasto.inicio.x),
        height: Math.abs(arrasto.fim.y - arrasto.inicio.y),
      }
    : null;

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
        if (modo === "poligonal") {
          // Clique perto do primeiro ponto fecha; os outros somam um canto
          if (!caminho.length) jeitoDoCaminho.current = jeitoDoEvento(evento);
          const primeiro = caminho[0];
          if (primeiro && caminho.length >= 3 && Math.hypot(primeiro.x - offsetX, primeiro.y - offsetY) < 8) fecharPoligono(caminho, jeitoDoCaminho.current);
          else setCaminho([...caminho, { x: offsetX, y: offsetY }]);
          return;
        }
        (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
        if (modo === "pincel") {
          desenhando.current = null;
          tracar(offsetX, offsetY);
          objeto.marcarPincel();
        } else if (modo === "laco") {
          jeitoDoCaminho.current = jeitoDoEvento(evento);
          setCaminho([{ x: offsetX, y: offsetY }]);
          desenhando.current = { x: offsetX, y: offsetY };
        } else {
          setArrasto({ inicio: { x: offsetX, y: offsetY }, fim: { x: offsetX, y: offsetY }, jeito: jeitoDoEvento(evento) });
        }
      }}
      onPointerMove={(evento) => {
        const { offsetX, offsetY } = evento.nativeEvent;
        if (modo === "pincel" && desenhando.current) tracar(offsetX, offsetY);
        else if (modo === "laco" && desenhando.current) setCaminho((atual) => [...atual, { x: offsetX, y: offsetY }]);
        else if (arrasto) setArrasto({ ...arrasto, fim: { x: offsetX, y: offsetY } });
      }}
      onPointerUp={() => {
        if (modo === "pincel" && desenhando.current) {
          desenhando.current = null;
          aoTerminarTraco?.();
        } else if (modo === "laco" && desenhando.current) {
          desenhando.current = null;
          fecharPoligono(caminho, jeitoDoCaminho.current);
        } else if (arrasto && retangulo) {
          setArrasto(null);
          if (retangulo.width < 2 || retangulo.height < 2) {
            if (arrasto.jeito === "nova") objeto.limpar();
            return;
          }
          preencher(arrasto.jeito, (ctx) =>
            modo === "elipse"
              ? ctx.ellipse(retangulo.left + retangulo.width / 2, retangulo.top + retangulo.height / 2, retangulo.width / 2, retangulo.height / 2, 0, 0, Math.PI * 2)
              : ctx.rect(retangulo.left, retangulo.top, retangulo.width, retangulo.height),
          );
        }
      }}
      onDoubleClick={() => {
        if (modo === "poligonal") fecharPoligono(caminho, jeitoDoCaminho.current);
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
      {retangulo ? (
        <div
          className={`pointer-events-none absolute border border-dashed border-white outline outline-1 outline-black/60 ${modo === "elipse" ? "rounded-[50%]" : ""}`}
          style={retangulo}
          aria-hidden
        />
      ) : null}
      {caminho.length > 1 ? (
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
          <polyline points={caminho.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="black" strokeWidth={2} strokeOpacity={0.6} />
          <polyline points={caminho.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="white" strokeWidth={1} strokeDasharray="4 3" />
        </svg>
      ) : null}
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
