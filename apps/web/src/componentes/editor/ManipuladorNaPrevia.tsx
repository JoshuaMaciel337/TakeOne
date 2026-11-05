"use client";

// Gestos de mover, aumentar e girar adaptados da CamadaSobreposta do HolyCut: durante o gesto, a
// mudança só aparece na prévia; ao soltar, vira um comando (e um passo do desfazer).
import { useEffect, useRef } from "react";

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
  /** O dedo que começou o gesto (no toque, o segundo dedo vira a pinça). */
  dedo: number | null;
  /** O último ponto do dedo (a pinça começa dele). */
  ultimoPonto?: Ponto;
  /** A pinça com dois dedos: os dois pontos no começo dela. */
  pinca?: { a: number; b: number; a0: Ponto; b0: Ponto; atual: Map<number, Ponto> };
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
  /** Um clique (ou toque) parado dentro da caixa, no ponto do quadro: quem usa pode escolher outra camada ali. */
  aoTocar?: (ponto: Ponto, toque: boolean) => void;
};

function giroComIma(graus: number): number {
  const perto = ANGULOS_IMA.find((angulo) => Math.abs(angulo - graus) <= ALCANCE_GIRO);
  return perto ?? graus;
}

/** A caixa do clipe selecionado na prévia, com as alças. */
export function ManipuladorNaPrevia({ caixa, quadro, transformacao, travado, alvos, aoMudar, aoSoltar, aoTocar }: Props) {
  const elementoRef = useRef<HTMLDivElement>(null);
  const partida = useRef<Partida | null>(null);
  const ultima = useRef<Partial<Transformacao> | null>(null);
  const tirarOuvintes = useRef<(() => void) | null>(null);

  useEffect(() => () => tirarOuvintes.current?.(), []);

  /** Ponto do ponteiro em pixels do quadro (a moldura é o elemento pai do manipulador). */
  function pontoNoQuadro(evento: { clientX: number; clientY: number }): Ponto {
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
    const toque = evento.pointerType === "touch";
    partida.current = { modo, ponteiro: pontoNoQuadro(evento), caixa, transformacao, moveu: false, dedo: toque ? evento.pointerId : null };
    ultima.current = null;
    if (toque) ouvirOSegundoDedo();
  }

  /**
   * No toque, um segundo dedo vira a pinça: os dois juntos aumentam, giram e levam a camada, como nos
   * editores de celular. Os ouvintes ficam na janela (na captura), porque o segundo dedo pode cair fora da caixa.
   */
  function ouvirOSegundoDedo() {
    tirarOuvintes.current?.();
    const aoApertar = (evento: PointerEvent) => {
      const inicio = partida.current;
      if (!inicio || evento.pointerType !== "touch" || inicio.dedo === null || evento.pointerId === inicio.dedo || inicio.pinca) return;
      evento.stopPropagation();
      evento.preventDefault();
      const ultimaAgora = ultima.current ?? {};
      // A pinça parte de onde o arrasto de um dedo deixou a camada
      const base = { ...inicio.transformacao, ...ultimaAgora };
      const centro = ultimaAgora.x !== undefined || ultimaAgora.y !== undefined
        ? { x: quadro.largura / 2 + base.x * quadro.largura, y: quadro.altura / 2 + base.y * quadro.altura }
        : { x: inicio.caixa.cx, y: inicio.caixa.cy };
      const a0 = inicio.ultimoPonto ?? inicio.ponteiro;
      const b0 = pontoNoQuadro(evento);
      partida.current = {
        ...inicio,
        transformacao: base,
        caixa: { ...inicio.caixa, cx: centro.x, cy: centro.y },
        moveu: true,
        pinca: { a: inicio.dedo, b: evento.pointerId, a0, b0, atual: new Map([[inicio.dedo, a0], [evento.pointerId, b0]]) },
      };
    };
    const aoMover = (evento: PointerEvent) => {
      const inicio = partida.current;
      const pinca = inicio?.pinca;
      if (!inicio || !pinca || !pinca.atual.has(evento.pointerId)) return;
      pinca.atual.set(evento.pointerId, pontoNoQuadro(evento));
      const a = pinca.atual.get(pinca.a)!;
      const b = pinca.atual.get(pinca.b)!;
      const antes = Math.max(1, Math.hypot(pinca.b0.x - pinca.a0.x, pinca.b0.y - pinca.a0.y));
      const agora = Math.hypot(b.x - a.x, b.y - a.y);
      const giro = (Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(pinca.b0.y - pinca.a0.y, pinca.b0.x - pinca.a0.x)) * (180 / Math.PI);
      const graus = ((((inicio.transformacao.rotacao + giro + 180) % 360) + 360) % 360) - 180;
      const centro = {
        x: inicio.caixa.cx + (a.x + b.x) / 2 - (pinca.a0.x + pinca.b0.x) / 2,
        y: inicio.caixa.cy + (a.y + b.y) / 2 - (pinca.a0.y + pinca.b0.y) / 2,
      };
      const mudanca = { ...deslocamentoDoCentro(centro, quadro), escala: inicio.transformacao.escala * (agora / antes), rotacao: giroComIma(graus) };
      ultima.current = mudanca;
      aoMudar(mudanca, { verticais: [], horizontais: [] });
    };
    const aoSoltarDedo = (evento: PointerEvent) => {
      const inicio = partida.current;
      if (!inicio || (evento.pointerId !== inicio.dedo && !inicio.pinca?.atual.has(evento.pointerId))) return;
      soltar(evento);
    };
    window.addEventListener("pointerdown", aoApertar, true);
    window.addEventListener("pointermove", aoMover, true);
    window.addEventListener("pointerup", aoSoltarDedo, true);
    window.addEventListener("pointercancel", aoSoltarDedo, true);
    tirarOuvintes.current = () => {
      window.removeEventListener("pointerdown", aoApertar, true);
      window.removeEventListener("pointermove", aoMover, true);
      window.removeEventListener("pointerup", aoSoltarDedo, true);
      window.removeEventListener("pointercancel", aoSoltarDedo, true);
      tirarOuvintes.current = null;
    };
  }

  function mover(evento: React.PointerEvent) {
    const inicio = partida.current;
    if (!inicio || inicio.pinca) return;
    const ponto = pontoNoQuadro(evento);
    inicio.ultimoPonto = ponto;
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

  function soltar(evento?: { type: string; pointerType: string }) {
    const inicio = partida.current;
    partida.current = null;
    tirarOuvintes.current?.();
    if (!inicio) return;
    if (!inicio.moveu && inicio.modo === "mover" && aoTocar && evento?.type === "pointerup") {
      aoSoltar(null);
      aoTocar(inicio.ponteiro, evento.pointerType === "touch");
      return;
    }
    aoSoltar(inicio.moveu ? ultima.current : null);
  }

  // As alças: no toque, maiores e com uma área de toque além do desenho (o dedo não acerta 12 px)
  const alca =
    "absolute size-3 touch-none rounded-sm border-2 border-white bg-destaque shadow shadow-black/50 before:absolute before:-inset-2 before:content-[''] pointer-coarse:size-4 pointer-coarse:before:-inset-3.5";
  const cantos = [
    ["-left-1.5 -top-1.5 pointer-coarse:-left-2 pointer-coarse:-top-2", "cursor-nwse-resize", "Canto de cima à esquerda"],
    ["-right-1.5 -top-1.5 pointer-coarse:-right-2 pointer-coarse:-top-2", "cursor-nesw-resize", "Canto de cima à direita"],
    ["-bottom-1.5 -right-1.5 pointer-coarse:-bottom-2 pointer-coarse:-right-2", "cursor-nwse-resize", "Canto de baixo à direita"],
    ["-bottom-1.5 -left-1.5 pointer-coarse:-bottom-2 pointer-coarse:-left-2", "cursor-nesw-resize", "Canto de baixo à esquerda"],
  ] as const;
  // Com a caixa encostada no alto do quadro, a alça de giro vai para baixo (no alto, a moldura a cortava)
  const giroEmBaixo = caixa.cy - caixa.altura / 2 < 40;

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
          <span aria-hidden className={`pointer-events-none absolute left-1/2 h-6 w-px -translate-x-1/2 bg-white/80 ${giroEmBaixo ? "-bottom-6" : "-top-6"}`} />
          <span
            role="presentation"
            title="Arraste para girar (Shift: de 15 em 15 graus)"
            onPointerDown={(evento) => comecar(evento, "girar")}
            onPointerMove={mover}
            onPointerUp={soltar}
            onPointerCancel={soltar}
            className={`absolute left-1/2 size-4 -translate-x-1/2 cursor-grab touch-none rounded-full border-2 border-white bg-destaque-2 shadow shadow-black/50 before:absolute before:-inset-2 before:rounded-full before:content-[''] pointer-coarse:size-5 pointer-coarse:before:-inset-3 ${giroEmBaixo ? "-bottom-8" : "-top-8"}`}
          />
        </>
      )}
    </div>
  );
}
