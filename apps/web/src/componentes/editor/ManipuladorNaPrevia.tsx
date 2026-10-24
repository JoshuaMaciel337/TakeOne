"use client";

// Gestos de mover, aumentar e girar adaptados da CamadaSobreposta do HolyCut: durante o gesto, a
// mudança só aparece na prévia; ao soltar, vira um comando (e um passo do desfazer).
import { useRef } from "react";

import { ajustarAsGuias, type Caixa, deslocamentoDoCentro, type Guias, type Ponto, type Tamanho } from "@/lib/projeto/geometria";
import type { Transformacao } from "@/lib/projeto/modelo";
import { pontoNoElemento } from "@/componentes/imagem/pontoNaVista";

/** Distância, em pixels da tela, em que o ímã da prévia puxa a caixa. */
const ALCANCE_IMA = 6;
/** Ângulos em que o giro encosta, e a distância em graus em que ele puxa. */
const ANGULOS_IMA = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
const ALCANCE_GIRO = 3;

type Modo = "mover" | "escala" | "girar";

type Partida = {
  modo: Modo;
  ponteiro: Ponto;
  caixa: Caixa;
  transformacao: Transformacao;
  moveu: boolean;
};

type Props = {
  caixa: Caixa;
  quadro: Tamanho;
  transformacao: Transformacao;
  travado: boolean;
  /** Onde a caixa encosta ao andar (pixels do quadro); sem eles, as bordas e o meio do quadro. */
  alvos?: Guias;
  /** Durante o gesto: a mudança e as guias para mostrar. */
  aoMudar: (mudanca: Partial<Transformacao>, guias: Guias) => void;
  /** Ao soltar. `null` quando foi só um clique. */
  aoSoltar: (mudanca: Partial<Transformacao> | null) => void;
};

function giroComIma(graus: number): number {
  const perto = ANGULOS_IMA.find((angulo) => Math.abs(angulo - graus) <= ALCANCE_GIRO);
  return perto ?? graus;
}

/** A caixa do clipe selecionado na prévia, com as alças. */
export function ManipuladorNaPrevia({ caixa, quadro, transformacao, travado, alvos, aoMudar, aoSoltar }: Props) {
  const elementoRef = useRef<HTMLDivElement>(null);
  const partida = useRef<Partida | null>(null);
  const ultima = useRef<Partial<Transformacao> | null>(null);

  /** Ponto do ponteiro em pixels do quadro (a moldura é o elemento pai do manipulador). */
  function pontoNoQuadro(evento: React.PointerEvent): Ponto {
    // A moldura pode estar girada (a vista do editor de imagem): o ponto vem no espaço dela
    return pontoNoElemento(evento, elementoRef.current!.parentElement!);
  }

  function comecar(evento: React.PointerEvent, modo: Modo) {
    if (evento.button !== 0) return;
    evento.stopPropagation();
    evento.preventDefault();
    if (travado) {
      aoSoltar(null);
      return;
    }
    (evento.currentTarget as Element).setPointerCapture(evento.pointerId);
    partida.current = { modo, ponteiro: pontoNoQuadro(evento), caixa, transformacao, moveu: false };
    ultima.current = null;
  }

  function mover(evento: React.PointerEvent) {
    const inicio = partida.current;
    if (!inicio) return;
    const ponto = pontoNoQuadro(evento);
    if (!inicio.moveu && Math.hypot(ponto.x - inicio.ponteiro.x, ponto.y - inicio.ponteiro.y) < 3) return;
    inicio.moveu = true;
    const centro = { x: inicio.caixa.cx, y: inicio.caixa.cy };

    let mudanca: Partial<Transformacao>;
    let guias: Guias = { verticais: [], horizontais: [] };
    if (inicio.modo === "mover") {
      const movida = { ...inicio.caixa, cx: centro.x + ponto.x - inicio.ponteiro.x, cy: centro.y + ponto.y - inicio.ponteiro.y };
      // Alt solto o ímã, como nos editores de imagem
      const ima = evento.altKey ? { dx: 0, dy: 0, guias } : ajustarAsGuias(movida, quadro, ALCANCE_IMA, alvos);
      guias = ima.guias;
      mudanca = deslocamentoDoCentro({ x: movida.cx + ima.dx, y: movida.cy + ima.dy }, quadro);
    } else if (inicio.modo === "escala") {
      const antes = Math.max(Math.hypot(inicio.ponteiro.x - centro.x, inicio.ponteiro.y - centro.y), 1);
      const agora = Math.hypot(ponto.x - centro.x, ponto.y - centro.y);
      mudanca = { escala: inicio.transformacao.escala * (agora / antes) };
    } else {
      const antes = Math.atan2(inicio.ponteiro.y - centro.y, inicio.ponteiro.x - centro.x);
      const agora = Math.atan2(ponto.y - centro.y, ponto.x - centro.x);
      const graus = inicio.transformacao.rotacao + ((agora - antes) * 180) / Math.PI;
      const normalizado = ((((graus + 180) % 360) + 360) % 360) - 180;
      mudanca = { rotacao: evento.shiftKey ? Math.round(normalizado / 15) * 15 : giroComIma(normalizado) };
    }
    ultima.current = mudanca;
    aoMudar(mudanca, guias);
  }

  function soltar() {
    const inicio = partida.current;
    partida.current = null;
    if (!inicio) return;
    aoSoltar(inicio.moveu ? ultima.current : null);
  }

  const alca = "absolute size-3 touch-none rounded-sm border-2 border-white bg-destaque shadow shadow-black/50";
  const cantos = [
    ["-left-1.5 -top-1.5", "cursor-nwse-resize", "Canto de cima à esquerda"],
    ["-right-1.5 -top-1.5", "cursor-nesw-resize", "Canto de cima à direita"],
    ["-bottom-1.5 -right-1.5", "cursor-nwse-resize", "Canto de baixo à direita"],
    ["-bottom-1.5 -left-1.5", "cursor-nesw-resize", "Canto de baixo à esquerda"],
  ] as const;

  return (
    <div
      ref={elementoRef}
      role="group"
      aria-label={travado ? "Clipe selecionado (faixa travada)" : "Clipe selecionado: arraste para mover"}
      onPointerDown={(evento) => comecar(evento, "mover")}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      className={`absolute touch-none outline outline-2 ${travado ? "cursor-not-allowed outline-white/40 outline-dashed" : "cursor-move outline-white/90"}`}
      style={{
        left: caixa.cx - caixa.largura / 2,
        top: caixa.cy - caixa.altura / 2,
        width: caixa.largura,
        height: caixa.altura,
        transform: `rotate(${caixa.rotacao}deg)`,
      }}
    >
      {travado ? null : (
        <>
          {cantos.map(([posicao, cursor, rotulo]) => (
            <span
              key={rotulo}
              role="presentation"
              title={`${rotulo}: arraste para aumentar ou diminuir`}
              onPointerDown={(evento) => comecar(evento, "escala")}
              onPointerMove={mover}
              onPointerUp={soltar}
              onPointerCancel={soltar}
              className={`${alca} ${posicao} ${cursor}`}
            />
          ))}
          <span aria-hidden className="pointer-events-none absolute -top-6 left-1/2 h-6 w-px -translate-x-1/2 bg-white/80" />
          <span
            role="presentation"
            title="Arraste para girar (Shift: de 15 em 15 graus)"
            onPointerDown={(evento) => comecar(evento, "girar")}
            onPointerMove={mover}
            onPointerUp={soltar}
            onPointerCancel={soltar}
            className="absolute -top-8 left-1/2 size-4 -translate-x-1/2 cursor-grab touch-none rounded-full border-2 border-white bg-destaque-2 shadow shadow-black/50"
          />
        </>
      )}
    </div>
  );
}
