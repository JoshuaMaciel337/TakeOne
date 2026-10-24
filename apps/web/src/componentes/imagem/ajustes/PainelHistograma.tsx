"use client";

// O painel Histograma do editor de imagem (ADR 0003, onda 13.10): o canal (as cores sobrepostas, a luminosidade ou um
// canal), a origem (a imagem inteira ou a camada escolhida), só a seleção quando há uma, e as estatísticas de lá:
// média, desvio, mediana e pixels; com o mouse em cima, o nível, a contagem e o percentil; arrastando, as do trecho.
import { useMemo, useRef, useState } from "react";

import { type CanalDoHistograma, estatisticas, histogramas } from "@/lib/imagem/histograma";
import type { Selecao } from "@/lib/selecao/mascara";
import type { ImagemRgba } from "@/lib/selecao/varinha";

import { CORES_DOS_CANAIS, GraficoDoHistograma } from "./GraficoDoHistograma";

type Canal = CanalDoHistograma | "cores";
const CANAIS: { id: Canal; nome: string }[] = [
  { id: "cores", nome: "Cores" },
  { id: "luma", nome: "Luminosidade" },
  { id: "r", nome: "Vermelho" },
  { id: "g", nome: "Verde" },
  { id: "b", nome: "Azul" },
];
const caixa = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-texto";
const numero = (v: number, casas = 2) => v.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas });

/** Os pixels de fora da seleção ficam transparentes (o histograma só conta os de dentro). */
function soNaSelecao(imagem: ImagemRgba, selecao: Selecao | null): Uint8ClampedArray | Uint8Array {
  if (!selecao) return imagem.dados;
  const dados = new Uint8ClampedArray(imagem.dados);
  for (let y = 0; y < imagem.altura; y++) {
    const sy = Math.min(selecao.altura - 1, Math.floor(((y + 0.5) / imagem.altura) * selecao.altura));
    for (let x = 0; x < imagem.largura; x++) {
      const sx = Math.min(selecao.largura - 1, Math.floor(((x + 0.5) / imagem.largura) * selecao.largura));
      if (selecao.dados[sy * selecao.largura + sx] < 128) dados[(y * imagem.largura + x) * 4 + 3] = 0;
    }
  }
  return dados;
}

export function PainelHistograma({
  imagem,
  selecao,
  origem,
  temCamada,
  aoMudarOrigem,
}: {
  imagem: ImagemRgba | null;
  selecao: Selecao | null;
  origem: "imagem" | "camada";
  temCamada: boolean;
  aoMudarOrigem: (origem: "imagem" | "camada") => void;
}) {
  const [canal, setCanal] = useState<Canal>("cores");
  const [sobre, setSobre] = useState<number | null>(null);
  const [trecho, setTrecho] = useState<[number, number] | null>(null);
  const arrasto = useRef<number | null>(null);
  const grafico = useRef<HTMLDivElement>(null);
  const hist = useMemo(() => (imagem ? histogramas(soNaSelecao(imagem, selecao)) : null), [imagem, selecao]);
  const contagem = hist ? (canal === "cores" ? hist.luma : hist[canal]) : null;
  const geral = contagem ? estatisticas(contagem) : null;
  const doTrecho = contagem && trecho ? estatisticas(contagem, Math.min(...trecho), Math.max(...trecho)) : null;
  const nivelDo = (evento: React.PointerEvent) => {
    const r = grafico.current!.getBoundingClientRect();
    return Math.min(255, Math.max(0, Math.floor(((evento.clientX - r.left) / r.width) * 256)));
  };
  const acumulado = (nivel: number) => {
    if (!contagem || !geral?.pixels) return 0;
    let soma = 0;
    for (let i = 0; i <= nivel; i++) soma += contagem[i];
    return (soma / geral.pixels) * 100;
  };
  const contagens = hist
    ? canal === "cores"
      ? [
          { contagem: hist.r, cor: CORES_DOS_CANAIS.r },
          { contagem: hist.g, cor: CORES_DOS_CANAIS.g },
          { contagem: hist.b, cor: CORES_DOS_CANAIS.b },
        ]
      : [{ contagem: contagem!, cor: CORES_DOS_CANAIS[canal] }]
    : [];
  const mostrar = doTrecho ?? geral;
  return (
    <div className="flex flex-col gap-2 p-3 text-xs">
      <div className="flex gap-2">
        <label className="flex flex-1 items-center gap-1.5 text-suave">
          Canal:
          <select className={`${caixa} flex-1`} value={canal} onChange={(evento) => setCanal(evento.currentTarget.value as Canal)} aria-label="Canal do histograma">
            {CANAIS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>
        <select className={caixa} value={origem} onChange={(evento) => aoMudarOrigem(evento.currentTarget.value as "imagem" | "camada")} aria-label="Origem do histograma">
          <option value="imagem">Imagem inteira</option>
          <option value="camada" disabled={!temCamada}>
            Camada escolhida
          </option>
        </select>
      </div>
      <div
        ref={grafico}
        className="relative cursor-crosshair touch-none select-none rounded border border-borda bg-black/40"
        aria-label="Histograma"
        role="img"
        onPointerMove={(evento) => {
          const nivel = nivelDo(evento);
          setSobre(nivel);
          if (arrasto.current !== null) setTrecho([arrasto.current, nivel]);
        }}
        onPointerLeave={() => setSobre(null)}
        onPointerDown={(evento) => {
          if (evento.button !== 0) return;
          evento.currentTarget.setPointerCapture(evento.pointerId);
          arrasto.current = nivelDo(evento);
          setTrecho(null);
        }}
        onPointerUp={(evento) => {
          const de = arrasto.current;
          arrasto.current = null;
          // Um clique parado tira o trecho
          if (de !== null && de === nivelDo(evento)) setTrecho(null);
        }}
      >
        {hist ? <GraficoDoHistograma contagens={contagens} altura={110} intervalo={trecho ? [Math.min(...trecho), Math.max(...trecho)] : null} /> : <div className="grid h-[110px] place-items-center text-suave">Lendo a imagem…</div>}
      </div>
      {mostrar ? (
        <dl className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-0.5 tabular-nums">
          <dt className="text-suave">Média:</dt>
          <dd>{numero(mostrar.media)}</dd>
          <dt className="text-suave">Nível:</dt>
          <dd>{trecho ? `${Math.min(...trecho)}..${Math.max(...trecho)}` : (sobre ?? "")}</dd>
          <dt className="text-suave">Desvio:</dt>
          <dd>{numero(mostrar.desvio)}</dd>
          <dt className="text-suave">Contagem:</dt>
          <dd>{trecho ? mostrar.pixels.toLocaleString("pt-BR") : sobre !== null && contagem ? contagem[sobre].toLocaleString("pt-BR") : ""}</dd>
          <dt className="text-suave">Mediana:</dt>
          <dd>{mostrar.mediana}</dd>
          <dt className="text-suave">Percentil:</dt>
          <dd>{trecho && geral?.pixels ? numero((mostrar.pixels / geral.pixels) * 100) : sobre !== null ? numero(acumulado(sobre)) : ""}</dd>
          <dt className="text-suave">Pixels:</dt>
          <dd>{(geral?.pixels ?? 0).toLocaleString("pt-BR")}</dd>
        </dl>
      ) : null}
      <p className="text-[11px] text-suave">Contado numa cópia de até 512 pixels de lado{selecao ? ", só dentro da seleção" : ""}. Arraste no gráfico para ver um trecho.</p>
    </div>
  );
}
