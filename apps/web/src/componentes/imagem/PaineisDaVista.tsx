"use client";

// Os painéis Informações e Navegador do editor de imagem (ADR 0003, onda 13.14). Informações: a cor sob o ponteiro (a
// média da amostra, em RGB e numa segunda leitura), o X e o Y do ponteiro e a largura e a altura da seleção na unidade
// das réguas, as cores dos amostradores e o documento. Navegador: a imagem pequena com o retângulo do que aparece na
// prévia (arrastar leva a vista) e o zoom.
import { Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { corNoPonto, type ImagemDasInformacoes, type LeiturasDaCor, leiturasDaCor, naUnidade } from "@/lib/imagem/informacoes";
import { type ModoDeCor, NOMES_DOS_MODOS } from "@/lib/imagem/modos";
import type { UnidadeDaRegua } from "@/lib/imagem/vista";

import { DEGRAUS_DO_ZOOM, proximoZoom } from "./PreviaDaImagem";
import { rolarVistaPara, useVistaAoVivo } from "./vistaAoVivo";

type Ponto = { x: number; y: number };
type SegundaLeitura = "cmyk" | "lab" | "hsb" | "cinza" | "hex";
const SEGUNDAS: { id: SegundaLeitura; nome: string }[] = [
  { id: "cmyk", nome: "CMYK" },
  { id: "lab", nome: "Lab" },
  { id: "hsb", nome: "HSB" },
  { id: "cinza", nome: "Cinza" },
  { id: "hex", nome: "Hexadecimal" },
];

function linhasDaSegunda(leitura: LeiturasDaCor | null, qual: SegundaLeitura): [string, string][] {
  const v = (n: number | undefined, sufixo = "") => (leitura && n !== undefined ? `${n}${sufixo}` : "");
  switch (qual) {
    case "cmyk":
      return [
        ["C", v(leitura?.cmyk[0], "%")],
        ["M", v(leitura?.cmyk[1], "%")],
        ["Y", v(leitura?.cmyk[2], "%")],
        ["K", v(leitura?.cmyk[3], "%")],
      ];
    case "lab":
      return [
        ["L", v(leitura?.lab[0])],
        ["a", v(leitura?.lab[1])],
        ["b", v(leitura?.lab[2])],
      ];
    case "hsb":
      return [
        ["H", v(leitura?.hsb[0], "°")],
        ["S", v(leitura?.hsb[1], "%")],
        ["B", v(leitura?.hsb[2], "%")],
      ];
    case "cinza":
      return [["K", v(leitura?.cinza, "%")]];
    case "hex":
      return [["#", leitura ? leitura.hex.slice(1).toUpperCase() : ""]];
  }
}

function Colunas({ pares }: { pares: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-2 tabular-nums">
      {pares.map(([rotulo, valor]) => (
        <div key={rotulo} className="contents">
          <dt className="text-suave">{rotulo}:</dt>
          <dd className="text-right">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

type PropsDasInformacoes = {
  imagem: ImagemDasInformacoes | null;
  modo: ModoDeCor | null | undefined;
  amostra: number;
  unidade: UnidadeDaRegua;
  ppi: number;
  documento: { largura: number; altura: number };
  /** Os limites da seleção do documento, em pixels. */
  selecao: { x0: number; y0: number; x1: number; y1: number } | null;
  amostradores: Ponto[];
  aoLimparAmostradores: () => void;
  aoTirarAmostrador: (indice: number) => void;
  dica: string;
};

export function PainelInformacoes({ imagem, modo, amostra, unidade, ppi, documento, selecao, amostradores, aoLimparAmostradores, aoTirarAmostrador, dica }: PropsDasInformacoes) {
  const { ponteiro } = useVistaAoVivo();
  const [segunda, setSegunda] = useState<SegundaLeitura>(modo?.tipo === "lab" ? "lab" : modo?.tipo === "cinza" ? "cinza" : "cmyk");
  const lida = ponteiro && imagem ? corNoPonto(imagem, ponteiro.x, ponteiro.y, amostra) : null;
  const leitura = lida ? leiturasDaCor(lida, modo) : null;
  const medida = (px: number, lado: number) => naUnidade(px, unidade, ppi, lado);
  const dentro = ponteiro && ponteiro.x >= 0 && ponteiro.y >= 0 && ponteiro.x < documento.largura && ponteiro.y < documento.altura;
  return (
    <div className="space-y-2 p-2 text-[11px]">
      <div className="grid grid-cols-2 gap-3 border-b border-borda pb-2">
        <div>
          <div className="mb-0.5 flex items-center gap-1 text-suave">
            RGB
            {leitura ? <span className="ml-auto size-3 rounded-sm border border-borda" style={{ background: leitura.hex }} aria-hidden /> : null}
          </div>
          <Colunas
            pares={[
              ["R", leitura ? String(leitura.rgb[0]) : ""],
              ["G", leitura ? String(leitura.rgb[1]) : ""],
              ["B", leitura ? String(leitura.rgb[2]) : ""],
              ...(lida && lida.a < 255 ? ([["Alfa", `${Math.round((lida.a / 255) * 100)}%`]] as [string, string][]) : []),
            ]}
          />
        </div>
        <div>
          <select aria-label="Segunda leitura" className="mb-0.5 w-full rounded border border-borda bg-painel-2 px-1 text-[11px]" value={segunda} onChange={(evento) => setSegunda(evento.currentTarget.value as SegundaLeitura)}>
            {SEGUNDAS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
          <Colunas pares={linhasDaSegunda(leitura, segunda)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 border-b border-borda pb-2">
        <Colunas
          pares={[
            ["X", dentro && ponteiro ? medida(Math.floor(ponteiro.x), documento.largura) : ""],
            ["Y", dentro && ponteiro ? medida(Math.floor(ponteiro.y), documento.altura) : ""],
          ]}
        />
        <Colunas
          pares={[
            ["L", selecao ? medida(selecao.x1 - selecao.x0, documento.largura) : ""],
            ["A", selecao ? medida(selecao.y1 - selecao.y0, documento.altura) : ""],
          ]}
        />
      </div>
      {amostradores.length ? (
        <div className="space-y-1 border-b border-borda pb-2">
          <div className="flex items-center text-suave">
            Amostradores de cor
            <button type="button" className="botao-icone ml-auto size-5" onClick={aoLimparAmostradores} title="Limpar todos os amostradores" aria-label="Limpar todos os amostradores">
              <Trash2 className="size-3" aria-hidden />
            </button>
          </div>
          {amostradores.map((p, i) => {
            const cor = imagem ? corNoPonto(imagem, p.x, p.y, amostra) : null;
            return (
              <div key={i} className="flex items-center gap-2 tabular-nums" data-leitura-amostrador={i + 1}>
                <span className="w-5 text-suave">#{i + 1}</span>
                <span className="size-3 shrink-0 rounded-sm border border-borda" style={{ background: cor ? `rgb(${cor.r} ${cor.g} ${cor.b})` : "transparent" }} aria-hidden />
                <span className="flex-1">{cor ? `R ${cor.r}  G ${cor.g}  B ${cor.b}` : "…"}</span>
                <button type="button" className="botao-icone size-5" onClick={() => aoTirarAmostrador(i)} title={`Tirar o amostrador ${i + 1}`} aria-label={`Tirar o amostrador ${i + 1}`}>
                  <Minus className="size-3" aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="space-y-0.5 text-suave">
        <div className="tabular-nums">
          Doc: {documento.largura} × {documento.altura} px · {ppi} ppp · {NOMES_DOS_MODOS[modo?.tipo ?? "rgb"]}
        </div>
        <div>{dica}</div>
        {!imagem ? <div>Lendo a imagem…</div> : null}
      </div>
    </div>
  );
}

// Os mesmos limites e degraus do zoom da prévia
const ZOOM_MINIMO = DEGRAUS_DO_ZOOM[0];
const ZOOM_MAXIMO = DEGRAUS_DO_ZOOM[DEGRAUS_DO_ZOOM.length - 1];

type PropsDoNavegador = {
  miniatura: ImagemDasInformacoes | null;
  documento: { largura: number; altura: number };
  zoom: number;
  aoMudarZoom: (zoom: number) => void;
};

export function PainelNavegador({ miniatura, documento, zoom, aoMudarZoom }: PropsDoNavegador) {
  const { visivel } = useVistaAoVivo();
  const caixaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [largura, setLargura] = useState(260);
  useEffect(() => {
    const elemento = caixaRef.current;
    if (!elemento) return;
    const observador = new ResizeObserver(() => setLargura(Math.max(80, elemento.clientWidth)));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);
  // A miniatura cabe na largura do painel e em 220 px de altura
  const k = Math.min(largura / documento.largura, 220 / documento.altura);
  const w = Math.max(1, Math.round(documento.largura * k));
  const h = Math.max(1, Math.round(documento.altura * k));
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!miniatura) return;
    const fonte = document.createElement("canvas");
    fonte.width = miniatura.largura;
    fonte.height = miniatura.altura;
    fonte.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(miniatura.dados), miniatura.largura, miniatura.altura), 0, 0);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(fonte, 0, 0, canvas.width, canvas.height);
  }, [miniatura, w, h]);
  const andando = useRef(false);
  const irPara = (evento: React.PointerEvent) => {
    const r = evento.currentTarget.getBoundingClientRect();
    rolarVistaPara(((evento.clientX - r.left) / r.width) * documento.largura, ((evento.clientY - r.top) / r.height) * documento.altura);
  };
  // O retângulo do que aparece, preso à miniatura
  const quadro = visivel
    ? (() => {
        const x0 = Math.max(0, visivel.x);
        const y0 = Math.max(0, visivel.y);
        const x1 = Math.min(documento.largura, visivel.x + visivel.largura);
        const y1 = Math.min(documento.altura, visivel.y + visivel.altura);
        return x1 > x0 && y1 > y0 ? { left: x0 * k, top: y0 * k, width: (x1 - x0) * k, height: (y1 - y0) * k } : null;
      })()
    : null;
  const passo = (sentido: 1 | -1) => aoMudarZoom(proximoZoom(zoom, sentido));
  // O controle deslizante anda no logaritmo do zoom, como lá
  const deslizante = Math.log(zoom / ZOOM_MINIMO) / Math.log(ZOOM_MAXIMO / ZOOM_MINIMO);
  const [digitado, setDigitado] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 p-2 text-[11px]">
      <div ref={caixaRef} className="flex w-full justify-center">
        <div
          className="relative cursor-move touch-none bg-painel-2"
          style={{ width: w, height: h }}
          onPointerDown={(evento) => {
            evento.currentTarget.setPointerCapture(evento.pointerId);
            andando.current = true;
            irPara(evento);
          }}
          onPointerMove={(evento) => andando.current && irPara(evento)}
          onPointerUp={() => {
            andando.current = false;
          }}
          aria-label="Miniatura do documento: arraste para andar pela imagem"
        >
          <canvas ref={canvasRef} width={w} height={h} className="absolute inset-0" />
          {quadro ? <div className="pointer-events-none absolute border-2 border-red-500" style={quadro} data-quadro-visivel /> : null}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <input
          aria-label="Zoom do navegador"
          className="w-14 rounded border border-borda bg-painel-2 px-1 py-0.5 text-right tabular-nums"
          value={digitado ?? `${Math.round(zoom * 1000) / 10}`.replace(".", ",")}
          onFocus={(evento) => {
            setDigitado(evento.currentTarget.value);
            evento.currentTarget.select();
          }}
          onChange={(evento) => setDigitado(evento.currentTarget.value)}
          onBlur={() => setDigitado(null)}
          onKeyDown={(evento) => {
            if (evento.key !== "Enter") return;
            const valor = Number((digitado ?? "").replace("%", "").replace(",", "."));
            if (valor > 0) aoMudarZoom(Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, valor / 100)));
            setDigitado(null);
            evento.currentTarget.blur();
          }}
        />
        <span className="text-suave">%</span>
        <button type="button" className="botao-icone size-6" onClick={() => passo(-1)} aria-label="Diminuir o zoom" title="Diminuir o zoom">
          <Minus className="size-3.5" aria-hidden />
        </button>
        <input
          type="range"
          aria-label="Zoom"
          min={0}
          max={1}
          step={0.001}
          value={Math.min(1, Math.max(0, deslizante))}
          className="min-w-0 flex-1"
          onChange={(evento) => aoMudarZoom(ZOOM_MINIMO * (ZOOM_MAXIMO / ZOOM_MINIMO) ** Number(evento.currentTarget.value))}
        />
        <button type="button" className="botao-icone size-6" onClick={() => passo(1)} aria-label="Aumentar o zoom" title="Aumentar o zoom">
          <Plus className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
