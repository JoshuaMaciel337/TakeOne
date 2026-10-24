"use client";

// A Contagem (I) e as notas (Nota, I) na prévia do editor de imagem (ADR 0003, onda 13.14). Os pontos e as notas ficam
// em pixels do documento; os desenhos têm o tamanho da tela (não crescem com o zoom), como as marcas de lá.
// Contagem: o clique conta no grupo ativo, arrastar um ponto o leva e Alt + clique o tira. Notas: o clique no vazio
// põe uma nota, o clique numa nota a abre (com qualquer ferramenta), arrastar a leva e Alt + clique a tira.
import { useRef, useState } from "react";

import { type Contagem, moverPonto, type Nota, pontoPerto, somarPonto, tirarPonto } from "@/lib/imagem/medicao";

import { pontoNoElemento } from "./pontoNaVista";

type Ponto = { x: number; y: number };

type PropsDaContagem = {
  contagem: Contagem | null;
  escala: number;
  ativo: boolean;
  aoMudar: (contagem: Contagem, nome: string) => void;
  aoErro: (mensagem: string) => void;
  novoId: () => string;
};

export function ContagemNaPrevia({ contagem, escala, ativo, aoMudar, aoErro, novoId }: PropsDaContagem) {
  // O ponto que anda: só na tela, até soltar
  const [arrastado, setArrastado] = useState<{ grupo: string; indice: number; ponto: Ponto } | null>(null);
  const paraImagem = (evento: React.PointerEvent) => {
    const p = pontoNoElemento(evento, evento.currentTarget as HTMLElement);
    return { x: Math.round((p.x / escala) * 10) / 10, y: Math.round((p.y / escala) * 10) / 10 };
  };
  function apertar(evento: React.PointerEvent) {
    if (evento.button !== 0) return;
    evento.stopPropagation();
    const p = paraImagem(evento);
    const perto = pontoPerto(contagem, p, 8 / escala);
    if (perto && contagem && evento.altKey) {
      aoMudar(tirarPonto(contagem, perto.grupo, perto.indice), "tirar o ponto da contagem");
      return;
    }
    if (perto) {
      (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
      setArrastado({ ...perto, ponto: p });
      return;
    }
    try {
      aoMudar(somarPonto(contagem, p, novoId()), "contar");
    } catch (e) {
      aoErro(e instanceof Error ? e.message : "Não foi possível contar.");
    }
  }
  function mover(evento: React.PointerEvent) {
    if (arrastado) setArrastado({ ...arrastado, ponto: paraImagem(evento) });
  }
  function soltar() {
    if (arrastado && contagem) aoMudar(moverPonto(contagem, arrastado.grupo, arrastado.indice, arrastado.ponto), "mover o ponto da contagem");
    setArrastado(null);
  }
  const grupos = contagem?.grupos.filter((grupo) => grupo.visivel) ?? [];
  return (
    <div
      className={`absolute inset-0 z-20 touch-none ${ativo ? "cursor-crosshair" : "pointer-events-none"}`}
      onPointerDown={ativo ? apertar : undefined}
      onPointerMove={ativo ? mover : undefined}
      onPointerUp={soltar}
      onPointerCancel={() => setArrastado(null)}
      aria-label={ativo ? "Contagem" : undefined}
    >
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        {grupos.map((grupo) =>
          grupo.pontos.map((ponto, i) => {
            const p = arrastado?.grupo === grupo.id && arrastado.indice === i ? arrastado.ponto : ponto;
            const raio = grupo.tamanho_do_marcador ? 1 + grupo.tamanho_do_marcador * 1.5 : 0;
            return (
              <g key={`${grupo.id}-${i}`} transform={`translate(${p.x * escala} ${p.y * escala})`} data-ponto-da-contagem={`${grupo.nome}:${i + 1}`}>
                {raio ? <circle r={raio} fill={grupo.cor} stroke="#000" strokeOpacity={0.5} strokeWidth={1} /> : null}
                <text x={raio + 2} y={-raio - 1} fontSize={grupo.tamanho_do_rotulo} fontWeight={600} fill={grupo.cor} stroke="#000" strokeOpacity={0.6} strokeWidth={2.5} paintOrder="stroke">
                  {i + 1}
                </text>
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}

type PropsDasNotas = {
  notas: Nota[];
  escala: number;
  /** A ferramenta Nota: o clique no vazio põe uma nota. */
  ativo: boolean;
  escolhida: string | null;
  autor: string;
  cor: string;
  aoEscolher: (id: string | null) => void;
  aoMudar: (notas: Nota[], escolhida?: string) => void;
  novoId: () => string;
};

export function NotasNaPrevia({ notas, escala, ativo, escolhida, autor, cor, aoEscolher, aoMudar, novoId }: PropsDasNotas) {
  const [arrastada, setArrastada] = useState<{ id: string; ponto: Ponto; andou: boolean } | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const paraImagem = (evento: React.PointerEvent) => {
    const p = pontoNoElemento(evento, caixaRef.current!);
    return { x: Math.round(p.x / escala), y: Math.round(p.y / escala) };
  };
  function apertarNoVazio(evento: React.PointerEvent) {
    if (evento.button !== 0) return;
    evento.stopPropagation();
    const id = novoId();
    aoMudar([...notas, { id, ...paraImagem(evento), autor, texto: "", cor }], id);
  }
  function apertarNaNota(evento: React.PointerEvent, nota: Nota) {
    if (evento.button !== 0) return;
    evento.stopPropagation();
    if (evento.altKey) {
      aoMudar(
        notas.filter((n) => n.id !== nota.id),
        escolhida === nota.id ? undefined : (escolhida ?? undefined),
      );
      return;
    }
    (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
    setArrastada({ id: nota.id, ponto: { x: nota.x, y: nota.y }, andou: false });
    aoEscolher(nota.id);
  }
  function moverNota(evento: React.PointerEvent) {
    if (!arrastada) return;
    const ponto = paraImagem(evento);
    if (ponto.x !== arrastada.ponto.x || ponto.y !== arrastada.ponto.y) setArrastada({ ...arrastada, ponto, andou: true });
  }
  function soltarNota() {
    if (arrastada?.andou) aoMudar(notas.map((n) => (n.id === arrastada.id ? { ...n, ...arrastada.ponto } : n)), arrastada.id);
    setArrastada(null);
  }
  return (
    <div ref={caixaRef} className={`absolute inset-0 z-20 touch-none ${ativo ? "cursor-crosshair" : "pointer-events-none"}`} onPointerDown={ativo ? apertarNoVazio : undefined} aria-label={ativo ? "Notas" : undefined}>
      {notas.map((nota) => {
        const p = arrastada?.id === nota.id ? arrastada.ponto : nota;
        return (
          <button
            key={nota.id}
            type="button"
            className={`pointer-events-auto absolute flex size-4 -translate-x-1/2 -translate-y-1/2 items-start justify-end rounded-[2px] border shadow ${escolhida === nota.id ? "border-white ring-2 ring-white/70" : "border-black/50"}`}
            style={{ left: p.x * escala, top: p.y * escala, background: nota.cor }}
            title={`${nota.autor ? `${nota.autor}: ` : ""}${nota.texto || "Nota sem texto"}`}
            aria-label={`Nota${nota.autor ? ` de ${nota.autor}` : ""}`}
            data-nota={nota.id}
            onPointerDown={(evento) => apertarNaNota(evento, nota)}
            onPointerMove={moverNota}
            onPointerUp={soltarNota}
            onPointerCancel={() => setArrastada(null)}
          >
            <span className="size-1.5 bg-black/30" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
