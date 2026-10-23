"use client";

// A máscara rápida (Q) na prévia (ADR 0003, onda 13.3): a seleção vira uma imagem cinza do tamanho do documento que os
// pincéis pintam (branco seleciona, preto tira) e aparece como um véu vermelho por cima do que não está selecionado.
// O véu é a mesma imagem passada por um filtro SVG: a luz vira transparência e a cor vira vermelho.
import { useEffect, useRef } from "react";

import type { Tamanho } from "@/lib/projeto/geometria";
import { type Selecao } from "@/lib/selecao/mascara";

/** O canvas cinza (opaco) de uma seleção, para o motor da máscara rápida carregar. */
export function selecaoEmCinza(selecao: Selecao | null, largura: number, altura: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d")!;
  const dados = ctx.createImageData(largura, altura);
  for (let i = 0; i < largura * altura; i++) {
    const valor = selecao?.dados[i] ?? 0;
    dados.data[i * 4] = valor;
    dados.data[i * 4 + 1] = valor;
    dados.data[i * 4 + 2] = valor;
    dados.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(dados, 0, 0);
  return canvas;
}

/**
 * O véu sobre a prévia, redesenhado a cada quadro do traço (`quadro` muda): o vermelho da máscara rápida, ou o canal
 * alfa à vista em cinza, opaco (`cinza`), como nos editores de imagem quando só ele está visível.
 */
export function VeuDaMascaraRapida({ fonte, tamanho, quadro, cinza = false }: { fonte: CanvasImageSource; tamanho: Tamanho; quadro: number; cinza?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = Math.max(1, Math.round(tamanho.largura));
    canvas.height = Math.max(1, Math.round(tamanho.altura));
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(fonte, 0, 0, canvas.width, canvas.height);
  }, [fonte, tamanho.largura, tamanho.altura, quadro]);
  return (
    <>
      <svg width="0" height="0" className="absolute" aria-hidden>
        <filter id="to-mascara-rapida" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
          {/* Vermelho puro, com a transparência 1 − luz (o branco, que está selecionado, some); a região do filtro é só o canvas: na folga padrão de 10%, o transparente também viraria vermelho */}
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 0 1" />
        </filter>
      </svg>
      <canvas
        ref={ref}
        className={`pointer-events-none absolute inset-0 size-full ${cinza ? "" : "opacity-50"}`}
        style={cinza ? undefined : { filter: "url(#to-mascara-rapida)" }}
        aria-label={cinza ? "Canal alfa" : "Máscara rápida"}
      />
    </>
  );
}
