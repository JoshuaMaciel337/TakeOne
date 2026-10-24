"use client";

// As fatias na prévia do editor de imagem (ADR 0003, onda 13.15). As da pessoa aparecem em azul, com o número; as
// automáticas (o resto), em cinza tracejado. Com a ferramenta Fatia, arrastar desenha uma; com a Seleção de fatia, o
// clique escolhe, arrastar dentro move e os cantos mudam o tamanho. Tudo em pixels do documento.
import { useState } from "react";

import { type Fatia, fatiaNoPonto, fatiasAutomaticas, type Retangulo, retanguloDosCantos } from "@/lib/imagem/fatias";

import { pontoNoElemento } from "./pontoNaVista";

type Ponto = { x: number; y: number };
type Arrasto = { tipo: "nova"; de: Ponto; ate: Ponto } | { tipo: "mover" | "canto"; id: string; de: Ponto; ate: Ponto; original: Fatia; canto?: number };

type Props = {
  fatias: Fatia[];
  escala: number;
  documento: { largura: number; altura: number };
  ferramenta: "fatia" | "selecaoDeFatia" | null;
  escolhida: string | null;
  mostrarAutomaticas: boolean;
  aoEscolher: (id: string | null) => void;
  aoCriar: (retangulo: Retangulo) => void;
  aoMudar: (id: string, retangulo: Retangulo) => void;
  aoAbrirOpcoes: (id: string) => void;
};

/** A fatia com o arrasto aplicado (mover tudo, ou um canto: 0 em cima à esquerda, 1 à direita, 2 embaixo à direita, 3 à esquerda). */
function fatiaArrastada(a: Extract<Arrasto, { tipo: "mover" | "canto" }>, documento: Props["documento"]): Retangulo | null {
  const dx = Math.round(a.ate.x - a.de.x);
  const dy = Math.round(a.ate.y - a.de.y);
  const f = a.original;
  if (a.tipo === "mover") {
    const x = Math.min(documento.largura - f.largura, Math.max(0, f.x + dx));
    const y = Math.min(documento.altura - f.altura, Math.max(0, f.y + dy));
    return { x, y, largura: f.largura, altura: f.altura };
  }
  const cantos = [
    { x: f.x, y: f.y },
    { x: f.x + f.largura, y: f.y },
    { x: f.x + f.largura, y: f.y + f.altura },
    { x: f.x, y: f.y + f.altura },
  ];
  const oposto = cantos[(a.canto! + 2) % 4];
  const puxado = { x: cantos[a.canto!].x + dx, y: cantos[a.canto!].y + dy };
  return retanguloDosCantos(oposto, puxado, documento);
}

export function FatiasNaPrevia({ fatias, escala, documento, ferramenta, escolhida, mostrarAutomaticas, aoEscolher, aoCriar, aoMudar, aoAbrirOpcoes }: Props) {
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const k = escala;
  const noDocumento = (evento: React.PointerEvent) => {
    const p = pontoNoElemento(evento, evento.currentTarget as HTMLElement);
    return { x: p.x / k, y: p.y / k };
  };
  const mostradas = fatias.map((f) => (arrasto && arrasto.tipo !== "nova" && arrasto.id === f.id ? { ...f, ...(fatiaArrastada(arrasto, documento) ?? {}) } : f));
  const automaticas = mostrarAutomaticas ? fatiasAutomaticas(mostradas, documento) : [];
  const nova = arrasto?.tipo === "nova" ? retanguloDosCantos(arrasto.de, arrasto.ate, documento) : null;

  function apertar(evento: React.PointerEvent) {
    if (evento.button !== 0 || !ferramenta) return;
    evento.stopPropagation();
    (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
    const p = noDocumento(evento);
    if (ferramenta === "fatia") return setArrasto({ tipo: "nova", de: p, ate: p });
    // Os cantos da escolhida (8 pixels da tela)
    const atual = fatias.find((f) => f.id === escolhida);
    if (atual) {
      const cantos = [
        [atual.x, atual.y],
        [atual.x + atual.largura, atual.y],
        [atual.x + atual.largura, atual.y + atual.altura],
        [atual.x, atual.y + atual.altura],
      ];
      const canto = cantos.findIndex(([x, y]) => Math.hypot((x - p.x) * k, (y - p.y) * k) <= 8);
      if (canto >= 0) return setArrasto({ tipo: "canto", id: atual.id, de: p, ate: p, original: atual, canto });
    }
    const sob = fatiaNoPonto(fatias, p.x, p.y);
    aoEscolher(sob?.id ?? null);
    if (sob) setArrasto({ tipo: "mover", id: sob.id, de: p, ate: p, original: sob });
  }
  function mover(evento: React.PointerEvent) {
    if (arrasto) setArrasto({ ...arrasto, ate: noDocumento(evento) });
  }
  function soltar() {
    if (!arrasto) return;
    if (arrasto.tipo === "nova") {
      const r = retanguloDosCantos(arrasto.de, arrasto.ate, documento);
      // Um clique sem arrastar não cria fatia
      if (r && r.largura * k >= 3 && r.altura * k >= 3) aoCriar(r);
    } else {
      const r = fatiaArrastada(arrasto, documento);
      const f = arrasto.original;
      if (r && (r.x !== f.x || r.y !== f.y || r.largura !== f.largura || r.altura !== f.altura)) aoMudar(arrasto.id, r);
    }
    setArrasto(null);
  }

  const caixa = (r: Retangulo) => ({ left: r.x * k, top: r.y * k, width: r.largura * k, height: r.altura * k });
  return (
    <div
      className={`absolute inset-0 z-20 touch-none ${ferramenta ? "cursor-crosshair" : "pointer-events-none"}`}
      onPointerDown={apertar}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={() => setArrasto(null)}
      onDoubleClick={(evento) => {
        if (ferramenta !== "selecaoDeFatia") return;
        const p = noDocumento(evento as unknown as React.PointerEvent);
        const sob = fatiaNoPonto(fatias, p.x, p.y);
        if (sob) aoAbrirOpcoes(sob.id);
      }}
      aria-label={ferramenta ? "Fatias" : undefined}
    >
      {automaticas.map((r, i) => (
        <div key={`a${i}`} className="pointer-events-none absolute border border-dashed border-white/50 outline outline-1 outline-black/30" style={caixa(r)} data-fatia-automatica>
          <span className="absolute left-0.5 top-0.5 rounded-sm bg-neutral-500/80 px-1 text-[10px] text-white">{fatias.length + i + 1}</span>
        </div>
      ))}
      {mostradas.map((f, i) => (
        <div key={f.id} className={`pointer-events-none absolute border ${f.id === escolhida ? "border-2 border-amber-400" : "border-sky-400"}`} style={caixa(f)} data-fatia={i + 1}>
          <span className="absolute left-0.5 top-0.5 rounded-sm bg-sky-500 px-1 text-[10px] text-white">
            {i + 1}
            {f.nome ? ` ${f.nome}` : ""}
          </span>
          {f.id === escolhida && ferramenta === "selecaoDeFatia"
            ? [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
              ].map(([cx, cy], j) => <span key={j} className="absolute size-2 -translate-x-1/2 -translate-y-1/2 border border-black/60 bg-amber-300" style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }} />)
            : null}
        </div>
      ))}
      {nova ? <div className="pointer-events-none absolute border border-sky-300 bg-sky-400/10" style={caixa(nova)} /> : null}
    </div>
  );
}
