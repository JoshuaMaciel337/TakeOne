"use client";

// Editar › Deformação de perspectiva (ADR 0003, onda 13.6): no Layout, arrastar desenha um plano sobre cada face em
// perspectiva (os cantos perto de outro grudam nele); na Deformação, os cantos andam e a foto vai junto. Os botões
// endireitam as verticais, nivelam as horizontais ou os dois.
import { LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { imagemMenor } from "@/lib/selecao/cores";
import type { ImagemRgba } from "@/lib/selecao/varinha";
import { homografia, type Ponto } from "@/lib/transformar/malha";
import { type DeformacaoDePerspectiva, deformarPelaPerspectiva, endireitar, type Plano } from "@/lib/transformar/perspectiva";

const LADO_DE_TRABALHO = 900;
type Modo = "layout" | "deformar";

export function JanelaPerspectiva({ imagem, aoFechar, aoConfirmar }: { imagem: ImagemRgba; aoFechar: () => void; aoConfirmar: (pixels: Uint8ClampedArray<ArrayBuffer>) => void }) {
  const pequena = useMemo(() => imagemMenor(imagem, LADO_DE_TRABALHO), [imagem]);
  const escala = pequena.largura / imagem.largura;
  const [modo, setModo] = useState<Modo>("layout");
  const [deformacao, setDeformacao] = useState<DeformacaoDePerspectiva>({ origem: [], destino: [], planos: [] });
  const [novo, setNovo] = useState<{ de: Ponto; ate: Ponto } | null>(null);
  const [calculando, setCalculando] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arrasto = useRef<{ tipo: "vertice"; indice: number } | { tipo: "novo"; de: Ponto } | null>(null);
  const kTela = useRef(1);

  const pixels = useMemo(() => (modo === "layout" ? Uint8ClampedArray.from(pequena.dados) : deformarPelaPerspectiva(pequena, deformacao)), [modo, pequena, deformacao]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = pequena.largura;
    canvas.height = pequena.altura;
    canvas.getContext("2d")!.putImageData(new ImageData(pixels, pequena.largura, pequena.altura), 0, 0);
  }, [pixels, pequena]);
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar]);

  const pontos = modo === "layout" ? deformacao.origem : deformacao.destino;
  const verticeEm = (p: Ponto) => pontos.findIndex((v) => Math.hypot((v.x - p.x) * kTela.current, (v.y - p.y) * kTela.current) <= 9);
  const naImagem = (evento: React.PointerEvent<Element>) => {
    const r = evento.currentTarget.getBoundingClientRect();
    kTela.current = r.width / pequena.largura;
    return { x: ((evento.clientX - r.left) / r.width) * pequena.largura, y: ((evento.clientY - r.top) / r.height) * pequena.altura };
  };
  /** O plano novo do retângulo arrastado, com os cantos perto de um vértice grudados nele. */
  const criarPlano = (de: Ponto, ate: Ponto) => {
    if (Math.abs(ate.x - de.x) * kTela.current < 10 || Math.abs(ate.y - de.y) * kTela.current < 10) return;
    const x0 = Math.min(de.x, ate.x);
    const x1 = Math.max(de.x, ate.x);
    const y0 = Math.min(de.y, ate.y);
    const y1 = Math.max(de.y, ate.y);
    const cantos = [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ];
    setDeformacao((atual) => {
      const origem = [...atual.origem];
      const destino = [...atual.destino];
      const indices = cantos.map((canto) => {
        const perto = origem.findIndex((v) => Math.hypot((v.x - canto.x) * kTela.current, (v.y - canto.y) * kTela.current) <= 14);
        if (perto >= 0) return perto;
        origem.push(canto);
        destino.push(canto);
        return origem.length - 1;
      });
      if (new Set(indices).size < 4) return atual;
      return { origem, destino, planos: [...atual.planos, indices as Plano] };
    });
  };

  const confirmar = () => {
    setCalculando(true);
    window.setTimeout(() => {
      const naResolucaoCheia = (lista: Ponto[]) => lista.map((p) => ({ x: p.x / escala, y: p.y / escala }));
      aoConfirmar(deformarPelaPerspectiva(imagem, { origem: naResolucaoCheia(deformacao.origem), destino: naResolucaoCheia(deformacao.destino), planos: deformacao.planos }, "bicubica"));
    }, 30);
  };
  const grades = deformacao.planos.map((plano) => {
    const q = plano.map((i) => pontos[i]) as [Ponto, Ponto, Ponto, Ponto];
    const mapa = homografia(q);
    const linhas: string[] = [];
    for (let k = 1; k < 4; k++) {
      linhas.push(Array.from({ length: 9 }, (_, j) => mapa(k / 4, j / 8)).map((p) => `${p.x},${p.y}`).join(" "));
      linhas.push(Array.from({ length: 9 }, (_, j) => mapa(j / 8, k / 4)).map((p) => `${p.x},${p.y}`).join(" "));
    }
    return { contorno: q.map((p) => `${p.x},${p.y}`).join(" "), linhas };
  });
  return (
    <div className="fixed inset-0 z-50 flex bg-fundo text-xs" role="dialog" aria-modal aria-label="Deformação de perspectiva">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-3 border-b border-borda bg-painel px-3">
          <span className="font-semibold">Deformação de perspectiva</span>
          <span className="flex items-center gap-0.5" role="group" aria-label="Modo">
            {(
              [
                ["layout", "Layout"],
                ["deformar", "Deformar"],
              ] as const
            ).map(([id, nome]) => (
              <button key={id} type="button" className={`rounded px-2 py-0.5 ${modo === id ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`} aria-pressed={modo === id} disabled={id === "deformar" && !deformacao.planos.length} onClick={() => setModo(id)}>
                {nome}
              </button>
            ))}
          </span>
          <span className="text-suave">{modo === "layout" ? "Arraste um plano sobre cada face em perspectiva e leve os cantos aos cantos dela." : "Arraste os cantos: a foto vai junto, plano a plano."}</span>
          {modo === "deformar" ? (
            <span className="ml-auto flex items-center gap-1">
              {(
                [
                  ["verticais", "Endireitar verticais"],
                  ["horizontais", "Nivelar horizontais"],
                  ["ambos", "Os dois"],
                ] as const
              ).map(([quais, nome]) => (
                <button key={quais} type="button" className="botao-secundario px-2 py-0.5 text-xs" onClick={() => setDeformacao((atual) => ({ ...atual, destino: endireitar(atual, quais) }))}>
                  {nome}
                </button>
              ))}
            </span>
          ) : null}
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#1b1d22] p-4">
          <div className="relative max-h-full max-w-full" style={{ aspectRatio: `${pequena.largura} / ${pequena.altura}`, height: "100%" }}>
            <canvas ref={canvasRef} className="block size-full" aria-label="Prévia da perspectiva" style={{ background: "repeating-conic-gradient(#cfcfcf 0 25%, #fff 0 50%) 0 0 / 16px 16px" }} />
            <svg
              className="absolute inset-0 size-full touch-none"
              viewBox={`0 0 ${pequena.largura} ${pequena.altura}`}
              preserveAspectRatio="none"
              onPointerDown={(evento) => {
                if (evento.button !== 0) return;
                evento.currentTarget.setPointerCapture(evento.pointerId);
                const p = naImagem(evento);
                const i = verticeEm(p);
                if (i >= 0) arrasto.current = { tipo: "vertice", indice: i };
                else if (modo === "layout") {
                  arrasto.current = { tipo: "novo", de: p };
                  setNovo({ de: p, ate: p });
                }
              }}
              onPointerMove={(evento) => {
                const atual = arrasto.current;
                if (!atual) return;
                const p = naImagem(evento);
                if (atual.tipo === "novo") return setNovo({ de: atual.de, ate: p });
                setDeformacao((d) => ({
                  ...d,
                  // No layout, o vértice muda nos dois (a deformação parte dele); na deformação, só no destino
                  origem: modo === "layout" ? d.origem.map((v, k) => (k === atual.indice ? p : v)) : d.origem,
                  destino: d.destino.map((v, k) => (k === atual.indice ? p : v)),
                }));
              }}
              onPointerUp={() => {
                const atual = arrasto.current;
                arrasto.current = null;
                if (atual?.tipo === "novo" && novo) criarPlano(novo.de, novo.ate);
                setNovo(null);
              }}
            >
              {grades.map((grade, i) => (
                <g key={i}>
                  <polygon points={grade.contorno} fill={modo === "layout" ? "rgba(56,189,248,0.12)" : "none"} stroke="#38bdf8" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  {grade.linhas.map((linha, k) => (
                    <polyline key={k} points={linha} fill="none" stroke="#38bdf8" strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
                  ))}
                </g>
              ))}
              {novo ? <rect x={Math.min(novo.de.x, novo.ate.x)} y={Math.min(novo.de.y, novo.ate.y)} width={Math.abs(novo.ate.x - novo.de.x)} height={Math.abs(novo.ate.y - novo.de.y)} fill="none" stroke="#fff" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" /> : null}
              {pontos.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={Math.max(2.5, pequena.largura / 220)} fill="#fff" stroke="#000" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
          </div>
          {calculando ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
              <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden /> Deformando na resolução cheia…
            </div>
          ) : null}
        </div>
      </div>
      <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l border-borda bg-painel p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Planos</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <p className="text-suave">{deformacao.planos.length ? `${deformacao.planos.length} plano(s).` : "Nenhum plano ainda."}</p>
        <button
          type="button"
          className="botao-secundario px-2 py-1 text-xs"
          disabled={!deformacao.planos.length}
          onClick={() => {
            setDeformacao({ origem: [], destino: [], planos: [] });
            setModo("layout");
          }}
        >
          Remover os planos
        </button>
        <button type="button" className="botao-secundario px-2 py-1 text-xs" disabled={!deformacao.planos.length} onClick={() => setDeformacao((d) => ({ ...d, destino: d.origem }))}>
          Desfazer a deformação
        </button>
        <div className="mt-auto flex justify-end gap-2">
          <button type="button" className="botao-secundario px-3 py-1 text-xs" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="botao-principal px-3 py-1 text-xs" disabled={calculando || !deformacao.planos.length} onClick={confirmar}>
            OK
          </button>
        </div>
      </aside>
    </div>
  );
}
