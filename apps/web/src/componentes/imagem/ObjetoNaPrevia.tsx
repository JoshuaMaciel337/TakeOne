"use client";

import { useEffect, useRef, useState } from "react";

import { cercaUmObjeto } from "@/lib/pintura/cercado";
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
  /** O localizador de objetos (o realce em azul com o ponteiro parado). */
  localizador?: boolean;
  /** O Remover: o traço que fecha uma volta enche o que cerca. */
  preencherCercado?: boolean;
};

type Ponto = { x: number; y: number };

/** A máscara é da foto inteira: aparece só o pedaço do recorte, virado como a camada. */
function MascaraDaFoto({ ver, recorte, virar }: { ver: string; recorte: Recorte; virar: Virar | null | undefined }) {
  return (
    <div className="pointer-events-none absolute inset-0" style={{ transform: `scale(${virar?.horizontal ? -1 : 1}, ${virar?.vertical ? -1 : 1})` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- desenhada no navegador (data:) */}
      <img
        src={ver}
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
  );
}

/** Quanto tempo o ponteiro fica parado antes do localizador procurar o objeto. */
const ESPERA_DO_LOCALIZADOR = 450;

/**
 * Por cima da camada escolhida: a seleção da IA pintada, os pontos clicados, o retângulo e o pincel da ferramenta
 * Remover. Fica girada com a camada, então o clique e o traço já vêm nas coordenadas dela (offsetX e offsetY ignoram o
 * giro do CSS). Na seleção de objeto, arrastar desenha um retângulo em volta do objeto e, com o ponteiro parado, o
 * localizador mostra em azul o objeto que um clique pegaria. Os letreiros e os laços desenham a seleção do documento.
 */
export function ObjetoNaPrevia({ caixa, recorte, virar, objeto, aoTerminarTraco, localizador = true, preencherCercado = false }: Props) {
  const desenhando = useRef<Ponto | null>(null);
  // Os pontos do traço da vez (o Remover enche o que ele cerca)
  const caminho = useRef<Ponto[]>([]);
  // O arrasto do retângulo (frações da camada) e o relógio do localizador
  const [arrasto, setArrasto] = useState<{ inicio: Ponto; fim: Ponto } | null>(null);
  const relogio = useRef<number | null>(null);
  useEffect(() => () => {
    if (relogio.current) window.clearTimeout(relogio.current);
  }, []);
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
    caminho.current.push({ x, y });
  }

  /** O traço fechou uma volta: o miolo entra no pincel. */
  function encherSeCercou() {
    const ctx = pincelRef.current?.getContext("2d");
    const pontos = caminho.current;
    caminho.current = [];
    if (!ctx || !preencherCercado || !cercaUmObjeto(pontos, objeto.tamanhoDoPincel * Math.min(largura, altura))) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.beginPath();
    pontos.forEach((ponto, i) => (i ? ctx.lineTo(ponto.x, ponto.y) : ctx.moveTo(ponto.x, ponto.y)));
    ctx.closePath();
    ctx.fill();
  }

  return (
    <div
      className="absolute z-20 cursor-crosshair overflow-hidden"
      style={{ left: caixa.cx - caixa.largura / 2, top: caixa.cy - caixa.altura / 2, width: caixa.largura, height: caixa.altura, transform: `rotate(${caixa.rotacao}deg)` }}
      onPointerDown={(evento) => {
        evento.stopPropagation();
        if (evento.button !== 0) return;
        const { offsetX, offsetY } = evento.nativeEvent;
        (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
        if (modo === "clique") {
          // O localizador que ia procurar o ponto de antes não procura mais
          if (relogio.current) window.clearTimeout(relogio.current);
          const ponto = { x: offsetX / caixa.largura, y: offsetY / caixa.altura };
          setArrasto({ inicio: ponto, fim: ponto });
          objeto.esquecerRealce();
          return;
        }
        desenhando.current = null;
        caminho.current = [];
        tracar(offsetX, offsetY);
        objeto.marcarPincel();
      }}
      onPointerMove={(evento) => {
        const { offsetX, offsetY } = evento.nativeEvent;
        if (modo === "pincel" && desenhando.current) tracar(offsetX, offsetY);
        if (modo !== "clique") return;
        const ponto = { x: offsetX / caixa.largura, y: offsetY / caixa.altura };
        if (arrasto) {
          setArrasto({ ...arrasto, fim: ponto });
          return;
        }
        // O localizador: parado por um instante, procura o objeto do ponto
        if (relogio.current) window.clearTimeout(relogio.current);
        if (objeto.realce) objeto.esquecerRealce();
        if (localizador && !objeto.selecionando) relogio.current = window.setTimeout(() => objeto.realcar(ponto.x, ponto.y), ESPERA_DO_LOCALIZADOR);
      }}
      onPointerLeave={() => {
        if (relogio.current) window.clearTimeout(relogio.current);
        objeto.esquecerRealce();
      }}
      onPointerUp={(evento) => {
        if (modo === "pincel" && desenhando.current) {
          desenhando.current = null;
          encherSeCercou();
          aoTerminarTraco?.();
        }
        if (modo !== "clique" || !arrasto) return;
        setArrasto(null);
        const { inicio, fim } = arrasto;
        // Arrastou (mais de 4 px da tela): o retângulo; senão, um clique (Shift ou Alt tiram a parte)
        if (Math.abs(fim.x - inicio.x) * caixa.largura > 4 && Math.abs(fim.y - inicio.y) * caixa.altura > 4) {
          objeto.arrastar({ u0: Math.min(inicio.x, fim.x), v0: Math.min(inicio.y, fim.y), u1: Math.max(inicio.x, fim.x), v1: Math.max(inicio.y, fim.y) });
        } else objeto.clicar(inicio.x, inicio.y, evento.altKey ? "subtrair" : evento.shiftKey ? "somar" : "nova");
      }}
    >
      {objeto.realce && !objeto.selecionando ? <MascaraDaFoto ver={objeto.realce} recorte={recorte} virar={virar} /> : null}
      {objeto.selecao ? <MascaraDaFoto ver={objeto.selecao.ver} recorte={recorte} virar={virar} /> : null}
      {arrasto || objeto.caixa ? (
        <div
          className="pointer-events-none absolute border border-dashed border-white outline outline-1 outline-black/60"
          style={
            arrasto
              ? { left: `${Math.min(arrasto.inicio.x, arrasto.fim.x) * 100}%`, top: `${Math.min(arrasto.inicio.y, arrasto.fim.y) * 100}%`, width: `${Math.abs(arrasto.fim.x - arrasto.inicio.x) * 100}%`, height: `${Math.abs(arrasto.fim.y - arrasto.inicio.y) * 100}%` }
              : { left: `${objeto.caixa!.u0 * 100}%`, top: `${objeto.caixa!.v0 * 100}%`, width: `${(objeto.caixa!.u1 - objeto.caixa!.u0) * 100}%`, height: `${(objeto.caixa!.v1 - objeto.caixa!.v0) * 100}%` }
          }
          aria-hidden
        />
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
