"use client";

// Filtro › Ponto de fuga (Ctrl+Alt+V; ADR 0003, onda 13.6): a imagem inteira numa cópia pequena; "Criar plano" e
// quatro cliques nos cantos de uma face em perspectiva (os cantos depois arrastam); "Colar no plano" põe uma camada
// (ou o que foi copiado) no plano escolhido, que se arrasta dentro dele e muda de tamanho. O OK põe o colado numa
// camada nova, em perspectiva, na resolução cheia.
import { LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { imagemMenor } from "@/lib/selecao/cores";
import type { ImagemRgba } from "@/lib/selecao/varinha";
import { reamostrar } from "@/lib/transformar/livre";
import { homografia, type Ponto, type Quadrilatero } from "@/lib/transformar/malha";
import { inversaDaHomografia } from "@/lib/transformar/perspectiva";
import { type Colado, quadDoColado } from "@/lib/transformar/pontoDeFuga";

const LADO_DE_TRABALHO = 900;

export function JanelaPontoDeFuga({
  fundo,
  fontes,
  carregarFonte,
  aoFechar,
  aoConfirmar,
}: {
  fundo: ImagemRgba;
  fontes: { id: string; nome: string }[];
  carregarFonte: (id: string) => Promise<ImagemRgba | null>;
  aoFechar: () => void;
  aoConfirmar: (pixels: Uint8ClampedArray<ArrayBuffer>) => void;
}) {
  const pequena = useMemo(() => imagemMenor(fundo, LADO_DE_TRABALHO), [fundo]);
  const escala = pequena.largura / fundo.largura;
  const [planos, setPlanos] = useState<Quadrilatero[]>([]);
  const [criando, setCriando] = useState<Ponto[] | null>(null);
  const [grade, setGrade] = useState(8);
  const [fonteId, setFonteId] = useState(fontes[0]?.id ?? "");
  const [colado, setColado] = useState<{ plano: number; colado: Colado; imagem: ImagemRgba; pequena: ImagemRgba } | null>(null);
  const [calculando, setCalculando] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arrasto = useRef<{ tipo: "vertice"; plano: number; canto: number } | { tipo: "colado"; inicio: Ponto; colado: Colado } | null>(null);
  const kTela = useRef(1);

  // A vista: a imagem e o colado em perspectiva por cima
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = pequena.largura;
    canvas.height = pequena.altura;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(new ImageData(Uint8ClampedArray.from(pequena.dados), pequena.largura, pequena.altura), 0, 0);
    if (colado && planos[colado.plano]) {
      const quad = quadDoColado(planos[colado.plano], colado.colado, colado.pequena.largura, colado.pequena.altura);
      const camada = document.createElement("canvas");
      camada.width = pequena.largura;
      camada.height = pequena.altura;
      camada.getContext("2d")!.putImageData(new ImageData(reamostrar(colado.pequena, quad, pequena, "bilinear"), pequena.largura, pequena.altura), 0, 0);
      ctx.drawImage(camada, 0, 0);
    }
  }, [pequena, colado, planos]);
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") return criando ? setCriando(null) : aoFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const naImagem = (evento: React.PointerEvent<Element>) => {
    const r = evento.currentTarget.getBoundingClientRect();
    kTela.current = r.width / pequena.largura;
    return { x: ((evento.clientX - r.left) / r.width) * pequena.largura, y: ((evento.clientY - r.top) / r.height) * pequena.altura };
  };
  const colar = async () => {
    if (!planos.length || !fonteId) return;
    const imagem = await carregarFonte(fonteId);
    if (!imagem) return;
    setColado({ plano: planos.length - 1, colado: { u: 0.5, v: 0.5, largura: 0.5 }, imagem, pequena: imagemMenor(imagem, Math.max(64, Math.round(Math.max(imagem.largura, imagem.altura) * escala))) });
  };
  const confirmar = () => {
    if (!colado) return aoFechar();
    setCalculando(true);
    window.setTimeout(() => {
      const plano = planos[colado.plano].map((p) => ({ x: p.x / escala, y: p.y / escala })) as Quadrilatero;
      aoConfirmar(reamostrar(colado.imagem, quadDoColado(plano, colado.colado, colado.imagem.largura, colado.imagem.altura), fundo, "bicubica"));
    }, 30);
  };
  const linhas = planos.map((q) => {
    const mapa = homografia(q);
    const lista: string[] = [];
    for (let k = 1; k < grade; k++) {
      lista.push([mapa(k / grade, 0), mapa(k / grade, 1)].map((p) => `${p.x},${p.y}`).join(" "));
      lista.push([mapa(0, k / grade), mapa(1, k / grade)].map((p) => `${p.x},${p.y}`).join(" "));
    }
    return lista;
  });
  const quadColado = colado && planos[colado.plano] ? quadDoColado(planos[colado.plano], colado.colado, colado.pequena.largura, colado.pequena.altura) : null;
  const raio = Math.max(2.5, pequena.largura / 220);
  return (
    <div className="fixed inset-0 z-50 flex bg-fundo text-xs" role="dialog" aria-modal aria-label="Ponto de fuga">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-3 border-b border-borda bg-painel px-3">
          <span className="font-semibold">Ponto de fuga</span>
          <button type="button" className={`botao-secundario px-2 py-0.5 text-xs ${criando ? "ring-1 ring-destaque" : ""}`} onClick={() => setCriando(criando ? null : [])}>
            Criar plano
          </button>
          <span className="text-suave">{criando ? `Clique nos cantos da face, em volta (${criando.length} de 4).` : colado ? "Arraste o que foi colado dentro do plano." : "Crie um plano e cole nele."}</span>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#1b1d22] p-4">
          <div className="relative max-h-full max-w-full" style={{ aspectRatio: `${pequena.largura} / ${pequena.altura}`, height: "100%" }}>
            <canvas ref={canvasRef} className="block size-full" aria-label="Prévia do ponto de fuga" />
            <svg
              className="absolute inset-0 size-full touch-none"
              viewBox={`0 0 ${pequena.largura} ${pequena.altura}`}
              preserveAspectRatio="none"
              style={{ cursor: criando ? "crosshair" : "default" }}
              onPointerDown={(evento) => {
                if (evento.button !== 0) return;
                const p = naImagem(evento);
                if (criando) {
                  const pontos = [...criando, p];
                  if (pontos.length === 4) {
                    setPlanos((atual) => [...atual, pontos as Quadrilatero]);
                    setCriando(null);
                  } else setCriando(pontos);
                  return;
                }
                evento.currentTarget.setPointerCapture(evento.pointerId);
                for (let i = 0; i < planos.length; i++) {
                  const canto = planos[i].findIndex((v) => Math.hypot((v.x - p.x) * kTela.current, (v.y - p.y) * kTela.current) <= 9);
                  if (canto >= 0) {
                    arrasto.current = { tipo: "vertice", plano: i, canto };
                    return;
                  }
                }
                if (colado) arrasto.current = { tipo: "colado", inicio: p, colado: colado.colado };
              }}
              onPointerMove={(evento) => {
                const atual = arrasto.current;
                if (!atual) return;
                const p = naImagem(evento);
                if (atual.tipo === "vertice") {
                  setPlanos((lista) => lista.map((q, i) => (i === atual.plano ? (q.map((v, k) => (k === atual.canto ? p : v)) as Quadrilatero) : q)));
                  return;
                }
                if (!colado) return;
                // O arrasto anda no plano: o quanto o ponto mudou de (u, v)
                const inversa = inversaDaHomografia(planos[colado.plano]);
                const de = inversa(atual.inicio);
                const ate = inversa(p);
                setColado({ ...colado, colado: { ...atual.colado, u: atual.colado.u + ate.x - de.x, v: atual.colado.v + ate.y - de.y } });
              }}
              onPointerUp={() => {
                arrasto.current = null;
              }}
            >
              {planos.map((q, i) => (
                <g key={i}>
                  <polygon points={q.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(56,189,248,0.10)" stroke="#38bdf8" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  {linhas[i].map((linha, k) => (
                    <polyline key={k} points={linha} fill="none" stroke="#38bdf8" strokeOpacity={0.45} vectorEffect="non-scaling-stroke" />
                  ))}
                  {q.map((p, k) => (
                    <rect key={k} x={p.x - raio} y={p.y - raio} width={raio * 2} height={raio * 2} fill="#fff" stroke="#000" vectorEffect="non-scaling-stroke" />
                  ))}
                </g>
              ))}
              {criando?.map((p, k) => <circle key={k} cx={p.x} cy={p.y} r={raio} fill="#facc15" stroke="#000" vectorEffect="non-scaling-stroke" />)}
              {quadColado ? <polygon points={quadColado.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#fff" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" /> : null}
            </svg>
          </div>
          {calculando ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
              <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden /> Colando na resolução cheia…
            </div>
          ) : null}
        </div>
      </div>
      <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l border-borda bg-painel p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Planos e colar</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <label className="flex flex-col gap-0.5">
          <span className="flex justify-between">
            <span>Tamanho da grade</span>
            <span className="tabular-nums text-suave">{grade}</span>
          </span>
          <input type="range" min={2} max={32} value={grade} onChange={(evento) => setGrade(Number(evento.currentTarget.value))} aria-label="Tamanho da grade" />
        </label>
        <button
          type="button"
          className="botao-secundario px-2 py-1 text-xs"
          disabled={!planos.length}
          onClick={() => {
            setPlanos([]);
            setColado(null);
          }}
        >
          Remover os planos
        </button>
        <label className="flex flex-col gap-1">
          Colar:
          <select className="rounded border border-borda bg-painel-2 px-1.5 py-0.5" value={fonteId} onChange={(evento) => setFonteId(evento.currentTarget.value)} aria-label="O que colar">
            {fontes.map((fonte) => (
              <option key={fonte.id} value={fonte.id}>
                {fonte.nome}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="botao-secundario px-2 py-1 text-xs" disabled={!planos.length || !fonteId} onClick={() => void colar()}>
          Colar no plano
        </button>
        {colado ? (
          <>
            <label className="flex flex-col gap-0.5">
              <span className="flex justify-between">
                <span>Tamanho no plano</span>
                <span className="tabular-nums text-suave">{Math.round(colado.colado.largura * 100)}%</span>
              </span>
              <input type="range" min={5} max={200} value={Math.round(colado.colado.largura * 100)} onChange={(evento) => setColado({ ...colado, colado: { ...colado.colado, largura: Number(evento.currentTarget.value) / 100 } })} aria-label="Tamanho no plano" />
            </label>
            {planos.length > 1 ? (
              <label className="flex items-center gap-2">
                Plano:
                <select className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5" value={colado.plano} onChange={(evento) => setColado({ ...colado, plano: Number(evento.currentTarget.value) })} aria-label="Plano">
                  {planos.map((_, i) => (
                    <option key={i} value={i}>
                      Plano {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : null}
        <div className="mt-auto flex justify-end gap-2">
          <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="botao-principal px-3 py-1 text-xs" disabled={calculando} onClick={confirmar}>
            OK
          </button>
        </div>
      </aside>
    </div>
  );
}
