"use client";

// O traço livre dos pincéis e do lápis do editor vetorial (ADR 0003, onda 13.16): o arrasto vira uma lista de pontos
// em pixels da imagem, mostrada na tela enquanto anda (grosso no Pincel de bolha), com o círculo do raio nas ferramentas
// que trabalham numa área e o contorno do caminho que o Suavizar, a Borracha de caminho e o Unir editam.
import { useState } from "react";

import type { Tamanho } from "@/lib/projeto/geometria";
import { svgDosCaminhos } from "@/lib/vetor/contorno";
import type { Subcaminho } from "@/lib/vetor/modelo";
import { pontoNoElemento } from "./pontoNaVista";

type Ponto = { x: number; y: number };

type Props = {
  quadro: Tamanho;
  documento: Tamanho;
  /** O caminho que a ferramenta edita, em pixels da imagem (o contorno azul), ou nenhum. */
  caminhos: Subcaminho[] | null;
  /** A largura do traço mostrado, em pixels da imagem. */
  largura: number;
  cor: string;
  /** O raio do círculo do cursor, em pixels da imagem (nas ferramentas que trabalham numa área). */
  raio?: number;
  /** Com Alt, o traço vira um retângulo (a Borracha vetorial) ou uma linha reta (a Faca) do começo até o ponteiro. */
  comAlt?: "retangulo" | "linha";
  /**
   * Os pontos do traço (pixels da imagem) a cada movimento e no fim; `escala` é quantos pixels da tela vale um da
   * imagem, e `reto`, que o Alt fez dele os dois cantos do retângulo ou as pontas da linha.
   */
  aoTraco: (pontos: Ponto[], final: boolean, escala: number, reto: boolean) => void;
};

export function TracoLivreNaPrevia({ quadro, documento, caminhos, largura, cor, raio, comAlt, aoTraco }: Props) {
  const escala = quadro.largura / documento.largura;
  const [pontos, setPontos] = useState<Ponto[] | null>(null);
  const [cursor, setCursor] = useState<Ponto | null>(null);
  const [reto, setReto] = useState(false);
  const noDocumento = (evento: React.PointerEvent<HTMLDivElement>) => {
    const p = pontoNoElemento(evento, evento.currentTarget);
    return { x: p.x / escala, y: p.y / escala };
  };
  return (
    <div
      className="absolute inset-0 touch-none"
      style={{ cursor: raio ? "none" : "crosshair" }}
      data-traco-livre
      onPointerDown={(evento) => {
        if (evento.button !== 0) return;
        // O clique é só do traço (a prévia, embaixo, escolheria ou soltaria a camada)
        evento.stopPropagation();
        evento.currentTarget.setPointerCapture(evento.pointerId);
        const p = noDocumento(evento);
        setPontos([p]);
        const comReta = Boolean(comAlt && evento.altKey);
        setReto(comReta);
        aoTraco([p], false, escala, comReta);
      }}
      onPointerMove={(evento) => {
        const p = noDocumento(evento);
        setCursor(p);
        if (!pontos) return;
        if (reto) {
          // Com Alt, só o começo e o ponto de agora
          const novos = [pontos[0], p];
          setPontos(novos);
          aoTraco(novos, false, escala, true);
          return;
        }
        const ultimo = pontos[pontos.length - 1];
        // Um ponto novo a cada pixel da tela andado
        if (Math.hypot(p.x - ultimo.x, p.y - ultimo.y) * escala < 1) return;
        const novos = [...pontos, p];
        setPontos(novos);
        aoTraco(novos, false, escala, false);
      }}
      onPointerUp={() => {
        if (pontos) aoTraco(pontos, true, escala, reto);
        setPontos(null);
      }}
      onPointerCancel={() => setPontos(null)}
      onPointerLeave={() => setCursor(null)}
    >
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        <g transform={`scale(${escala})`}>
          {caminhos?.length ? (
            <>
              <path d={svgDosCaminhos(caminhos)} fill="none" stroke="#000000" strokeOpacity={0.5} strokeWidth={3} vectorEffect="non-scaling-stroke" />
              <path d={svgDosCaminhos(caminhos)} fill="none" stroke="#2f80ff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </>
          ) : null}
          {pontos && reto && comAlt === "retangulo" && pontos.length > 1 ? (
            <rect x={Math.min(pontos[0].x, pontos[1].x)} y={Math.min(pontos[0].y, pontos[1].y)} width={Math.abs(pontos[1].x - pontos[0].x)} height={Math.abs(pontos[1].y - pontos[0].y)} fill="#2f80ff" fillOpacity={0.15} stroke="#2f80ff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ) : pontos && pontos.length > 1 ? (
            <polyline points={pontos.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={cor} strokeOpacity={0.8} strokeWidth={Math.max(1 / escala, largura)} strokeLinecap="round" strokeLinejoin="round" data-traco-em-andamento />
          ) : null}
          {raio && cursor ? <circle cx={cursor.x} cy={cursor.y} r={raio} fill="none" stroke="#ffffff" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ filter: "drop-shadow(0 0 1px #000)" }} /> : null}
        </g>
      </svg>
    </div>
  );
}
