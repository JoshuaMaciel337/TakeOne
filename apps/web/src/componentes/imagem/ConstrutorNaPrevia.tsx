"use client";

// O Construtor de formas e a Pintura viva na prévia (ADR 0003, onda 13.16): as faces das formas escolhidas aparecem
// tracejadas, a que está debaixo do ponteiro fica marcada, e o arrasto do Construtor marca as que vai juntar (com Alt,
// apagar). Na Pintura viva, o clique enche a face com a cor de primeiro plano.
import { useState } from "react";

import type { Tamanho } from "@/lib/projeto/geometria";
import { type Face, faceNoPonto, facesDoArrasto } from "@/lib/vetor/construtor";
import { pontoNoElemento } from "./pontoNaVista";

type Ponto = { x: number; y: number };

type Props = {
  modo: "construtor" | "pinturaViva";
  quadro: Tamanho;
  documento: Tamanho;
  faces: Face[];
  cor: string;
  aoConstruir: (juntar: number[], apagar: number[]) => void;
  aoPintar: (face: number) => void;
};

const svgDaRegiao = (face: Face) => face.regiao.flatMap((poligono) => poligono.map((anel) => `M ${anel.map(([x, y]) => `${x} ${y}`).join(" L ")} Z`)).join(" ");

export function ConstrutorNaPrevia({ modo, quadro, documento, faces, cor, aoConstruir, aoPintar }: Props) {
  const escala = quadro.largura / documento.largura;
  const [sobre, setSobre] = useState(-1);
  const [arrasto, setArrasto] = useState<{ pontos: Ponto[]; alt: boolean } | null>(null);
  const noDocumento = (evento: React.PointerEvent<HTMLDivElement>) => {
    const p = pontoNoElemento(evento, evento.currentTarget);
    return { x: p.x / escala, y: p.y / escala };
  };
  const marcadas = arrasto ? facesDoArrasto(faces, arrasto.pontos) : sobre >= 0 ? [sobre] : [];
  return (
    <div
      className="absolute inset-0 touch-none"
      style={{ cursor: "crosshair" }}
      data-construtor={modo}
      onPointerDown={(evento) => {
        if (evento.button !== 0) return;
        evento.stopPropagation();
        const p = noDocumento(evento);
        if (modo === "pinturaViva") {
          const face = faceNoPonto(faces, p);
          if (face >= 0) aoPintar(face);
          return;
        }
        evento.currentTarget.setPointerCapture(evento.pointerId);
        setArrasto({ pontos: [p], alt: evento.altKey });
      }}
      onPointerMove={(evento) => {
        const p = noDocumento(evento);
        if (arrasto) setArrasto({ ...arrasto, pontos: [...arrasto.pontos, p] });
        else setSobre(faceNoPonto(faces, p));
      }}
      onPointerUp={() => {
        if (!arrasto) return;
        const tocadas = facesDoArrasto(faces, arrasto.pontos);
        setArrasto(null);
        if (tocadas.length) aoConstruir(arrasto.alt ? [] : tocadas, arrasto.alt ? tocadas : []);
      }}
      onPointerLeave={() => setSobre(-1)}
    >
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        <g transform={`scale(${escala})`}>
          {faces.map((face, i) => (
            <path key={i} d={svgDaRegiao(face)} fill="none" stroke="#2f80ff" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" data-face />
          ))}
          {marcadas.map((i) => (
            <path key={`m${i}`} d={svgDaRegiao(faces[i])} fillRule="evenodd" fill={modo === "pinturaViva" ? cor : arrasto?.alt ? "#e5484d" : "#8a8f98"} fillOpacity={0.45} stroke="none" data-face-marcada />
          ))}
          {arrasto && arrasto.pontos.length > 1 ? (
            <polyline points={arrasto.pontos.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={arrasto.alt ? "#e5484d" : "#2f80ff"} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ) : null}
        </g>
      </svg>
    </div>
  );
}
