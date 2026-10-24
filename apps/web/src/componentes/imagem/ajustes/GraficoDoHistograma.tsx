"use client";

// O desenho de um histograma (256 colunas), na cor do canal, para os Níveis, as Curvas, o Limiar e o painel
// Histograma. A altura é relativa à maior coluna sem as duas pontas (o preto e o branco puros costumam ser picos que
// achatariam o resto).
import { useEffect, useRef } from "react";

export const CORES_DOS_CANAIS = { luma: "#9aa0aa", r: "#ef4444", g: "#22c55e", b: "#3b82f6" } as const;

export function GraficoDoHistograma({
  contagens,
  altura = 96,
  intervalo,
  className = "",
  preencher = false,
}: {
  /** Um histograma, ou vários sobrepostos (as cores do painel Histograma). */
  contagens: { contagem: Uint32Array; cor: string }[];
  altura?: number;
  /** O trecho escolhido (de, até), em destaque. */
  intervalo?: [number, number] | null;
  className?: string;
  /** Ocupa a altura de quem o contém (o fundo do gráfico das Curvas). */
  preencher?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const largura = 256;
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, largura, altura);
    let maximo = 1;
    for (const { contagem } of contagens) for (let i = 1; i < 255; i++) maximo = Math.max(maximo, contagem[i]);
    // Com vários, a mistura "tela" faz o amarelo, o ciano e o branco onde os canais se cobrem
    ctx.globalCompositeOperation = contagens.length > 1 ? "screen" : "source-over";
    for (const { contagem, cor } of contagens) {
      ctx.fillStyle = cor;
      for (let i = 0; i < 256; i++) {
        const h = Math.min(altura, (contagem[i] / maximo) * altura);
        if (h > 0) ctx.fillRect(i, altura - h, 1, h);
      }
    }
    ctx.globalCompositeOperation = "source-over";
    if (intervalo) {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(intervalo[0], 0, intervalo[1] - intervalo[0] + 1, altura);
    }
  }, [contagens, altura, intervalo]);
  return <canvas ref={canvasRef} className={`block w-full ${className}`} style={{ height: preencher ? "100%" : altura, imageRendering: "pixelated" }} aria-hidden />;
}
