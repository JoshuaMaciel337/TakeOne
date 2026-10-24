"use client";

// Editar › Distorção de marionete (ADR 0003, onda 13.6): a camada numa cópia pequena com a malha por cima. Clicar na
// malha põe um alfinete, arrastar um alfinete puxa a camada, Alt + clique (ou Delete no escolhido) tira. O OK refaz a
// deformação na resolução cheia.
import { LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { imagemMenor } from "@/lib/selecao/cores";
import type { ImagemRgba } from "@/lib/selecao/varinha";
import { inversaDoMapa } from "@/lib/transformar/deformar";
import { reamostrarPeloMapa } from "@/lib/transformar/livre";
import type { Ponto } from "@/lib/transformar/malha";
import { type Alfinete, caixaDoConteudo, type CaixaDaMarionete, gradeDaMarionete, mapaDaGrade, type ModoDaMarionete } from "@/lib/transformar/marionete";

const DIVISOES = { menos: 24, normal: 48, mais: 96 } as const;
type Densidade = keyof typeof DIVISOES;
const LADO_DE_TRABALHO = 1024;

/** O pedaço da imagem na caixa (a origem da deformação). */
function recortar(imagem: ImagemRgba, caixa: CaixaDaMarionete) {
  const x0 = Math.floor(caixa.x0);
  const y0 = Math.floor(caixa.y0);
  const largura = Math.max(1, Math.ceil(caixa.x1) - x0);
  const altura = Math.max(1, Math.ceil(caixa.y1) - y0);
  const dados = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) dados.set(imagem.dados.subarray(((y + y0) * imagem.largura + x0) * 4, ((y + y0) * imagem.largura + x0 + largura) * 4), y * largura * 4);
  return { dados, largura, altura, caixa: { x0, y0, x1: x0 + largura, y1: y0 + altura } };
}

/** A camada deformada (do tamanho da imagem) pelos alfinetes. */
export function deformarPelaMarionete(imagem: ImagemRgba, alfinetes: Alfinete[], modo: ModoDaMarionete, densidade: Densidade, expansao: number, inverter: boolean, interpolacao: "bilinear" | "bicubica") {
  const saida = new Uint8ClampedArray(imagem.largura * imagem.altura * 4);
  const caixa = caixaDoConteudo(imagem.dados, imagem.largura, imagem.altura, expansao);
  if (!caixa) return { pixels: saida, grade: null, caixa: null };
  const pedaco = recortar(imagem, caixa);
  const divisoes = DIVISOES[densidade];
  const grade = gradeDaMarionete(pedaco.caixa, divisoes, alfinetes, modo);
  const pixels = reamostrarPeloMapa(pedaco, mapaDaGrade(grade, divisoes), imagem, interpolacao, divisoes, inverter);
  return { pixels, grade, caixa: pedaco.caixa };
}

export function JanelaMarionete({ imagem, aoFechar, aoConfirmar }: { imagem: ImagemRgba; aoFechar: () => void; aoConfirmar: (pixels: Uint8ClampedArray<ArrayBuffer>) => void }) {
  const pequena = useMemo(() => imagemMenor(imagem, LADO_DE_TRABALHO), [imagem]);
  const escala = pequena.largura / imagem.largura;
  const [alfinetes, setAlfinetes] = useState<Alfinete[]>([]);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [modo, setModo] = useState<ModoDaMarionete>("normal");
  const [densidade, setDensidade] = useState<Densidade>("normal");
  const [expansao, setExpansao] = useState(2);
  const [mostrarMalha, setMostrarMalha] = useState(true);
  const [inverter, setInverter] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arrasto = useRef<{ indice: number } | null>(null);

  const resultado = useMemo(() => deformarPelaMarionete(pequena, alfinetes, modo, densidade, expansao * escala, inverter, "bilinear"), [pequena, alfinetes, modo, densidade, expansao, escala, inverter]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = pequena.largura;
    canvas.height = pequena.altura;
    canvas.getContext("2d")!.putImageData(new ImageData(resultado.pixels, pequena.largura, pequena.altura), 0, 0);
  }, [resultado, pequena]);

  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
      if ((evento.key === "Delete" || evento.key === "Backspace") && escolhido !== null) {
        setAlfinetes((atual) => atual.filter((_, i) => i !== escolhido));
        setEscolhido(null);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar, escolhido]);

  const naImagem = (evento: React.PointerEvent<Element>) => {
    const r = evento.currentTarget.getBoundingClientRect();
    return { x: ((evento.clientX - r.left) / r.width) * pequena.largura, y: ((evento.clientY - r.top) / r.height) * pequena.altura };
  };
  const proximo = (p: Ponto, larguraNaTela: number) => {
    const k = larguraNaTela / pequena.largura;
    return alfinetes.findIndex((alfinete) => Math.hypot((alfinete.destino.x - p.x) * k, (alfinete.destino.y - p.y) * k) <= 8);
  };
  const confirmar = () => {
    setCalculando(true);
    window.setTimeout(() => {
      const cheios = alfinetes.map((a) => ({ origem: { x: a.origem.x / escala, y: a.origem.y / escala }, destino: { x: a.destino.x / escala, y: a.destino.y / escala } }));
      aoConfirmar(deformarPelaMarionete(imagem, cheios, modo, densidade, expansao, inverter, "bicubica").pixels);
    }, 30);
  };

  // A malha na tela: as linhas da grade deformada e os alfinetes
  const divisoes = DIVISOES[densidade];
  const linhas: string[] = [];
  if (mostrarMalha && resultado.grade) {
    const g = resultado.grade;
    const passo = Math.max(1, Math.round(divisoes / 24));
    for (let j = 0; j <= divisoes; j += passo) linhas.push(Array.from({ length: divisoes + 1 }, (_, i) => g[j * (divisoes + 1) + i]).map((p) => `${p.x},${p.y}`).join(" "));
    for (let i = 0; i <= divisoes; i += passo) linhas.push(Array.from({ length: divisoes + 1 }, (_, j) => g[j * (divisoes + 1) + i]).map((p) => `${p.x},${p.y}`).join(" "));
  }
  const raioDoAlfinete = Math.max(2, 5 * (pequena.largura / 900));
  return (
    <div className="fixed inset-0 z-50 flex bg-fundo text-xs" role="dialog" aria-modal aria-label="Distorção de marionete">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-3 border-b border-borda bg-painel px-3">
          <span className="font-semibold">Distorção de marionete</span>
          <span className="text-suave">Clique na malha para pôr um alfinete e arraste-o; Alt + clique (ou Delete) tira. Ponha alfinetes no que deve ficar parado.</span>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#1b1d22] p-4">
          <div className="relative max-h-full max-w-full" style={{ aspectRatio: `${pequena.largura} / ${pequena.altura}`, height: "100%" }}>
            <canvas ref={canvasRef} className="block size-full" aria-label="Prévia da marionete" style={{ background: "repeating-conic-gradient(#cfcfcf 0 25%, #fff 0 50%) 0 0 / 16px 16px" }} />
            <svg
              className="absolute inset-0 size-full touch-none"
              viewBox={`0 0 ${pequena.largura} ${pequena.altura}`}
              preserveAspectRatio="none"
              onPointerDown={(evento) => {
                if (evento.button !== 0) return;
                const p = naImagem(evento);
                const largura = evento.currentTarget.getBoundingClientRect().width;
                const i = proximo(p, largura);
                if (i >= 0) {
                  if (evento.altKey) {
                    setAlfinetes((atual) => atual.filter((_, k) => k !== i));
                    setEscolhido(null);
                    return;
                  }
                  evento.currentTarget.setPointerCapture(evento.pointerId);
                  arrasto.current = { indice: i };
                  setEscolhido(i);
                  return;
                }
                if (!resultado.caixa || evento.altKey) return;
                // O alfinete vai no ponto da camada que está debaixo do clique (a malha já pode estar deformada)
                const c = resultado.caixa;
                const { u, v } = inversaDoMapa(mapaDaGrade(resultado.grade!, divisoes), p);
                const origem = { x: c.x0 + u * (c.x1 - c.x0), y: c.y0 + v * (c.y1 - c.y0) };
                setAlfinetes((atual) => [...atual, { origem, destino: p }]);
                setEscolhido(alfinetes.length);
              }}
              onPointerMove={(evento) => {
                const atual = arrasto.current;
                if (!atual) return;
                const p = naImagem(evento);
                setAlfinetes((lista) => lista.map((alfinete, k) => (k === atual.indice ? { ...alfinete, destino: p } : alfinete)));
              }}
              onPointerUp={() => {
                arrasto.current = null;
              }}
            >
              {linhas.map((pontos, i) => (
                <polyline key={i} points={pontos} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
              {alfinetes.map((alfinete, i) => (
                <circle key={i} cx={alfinete.destino.x} cy={alfinete.destino.y} r={raioDoAlfinete} fill={i === escolhido ? "#ffcc00" : "#fff"} stroke="#000" strokeWidth={1} vectorEffect="non-scaling-stroke" />
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
      <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-borda bg-painel p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Propriedades</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <label className="flex items-center gap-2">
          Modo:
          <select className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5" value={modo} onChange={(evento) => setModo(evento.currentTarget.value as ModoDaMarionete)} aria-label="Modo">
            <option value="rigido">Rígido</option>
            <option value="normal">Normal</option>
            <option value="distorcer">Distorcer</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Densidade:
          <select className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5" value={densidade} onChange={(evento) => setDensidade(evento.currentTarget.value as Densidade)} aria-label="Densidade">
            <option value="menos">Menos pontos</option>
            <option value="normal">Normal</option>
            <option value="mais">Mais pontos</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="flex justify-between">
            <span>Expansão</span>
            <span className="tabular-nums text-suave">{expansao} px</span>
          </span>
          <input type="range" min={0} max={100} value={expansao} onChange={(evento) => setExpansao(Number(evento.currentTarget.value))} aria-label="Expansão" />
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={mostrarMalha} onChange={(evento) => setMostrarMalha(evento.currentTarget.checked)} />
          Mostrar a malha
        </label>
        <label className="flex items-center gap-1.5" title="Onde a camada dobra sobre si, qual parte fica na frente">
          <input type="checkbox" checked={inverter} onChange={(evento) => setInverter(evento.currentTarget.checked)} />
          Profundidade invertida
        </label>
        <button
          type="button"
          className="botao-secundario px-2 py-1 text-xs"
          disabled={!alfinetes.length}
          onClick={() => {
            setAlfinetes([]);
            setEscolhido(null);
          }}
        >
          Remover todos os alfinetes
        </button>
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
