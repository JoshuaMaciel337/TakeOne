"use client";

// Filtro › Correção de lente (Shift+Ctrl+R) e Filtro › Grande-angular adaptável (Alt+Shift+Ctrl+A) (ADR 0003, onda
// 13.6): a camada numa cópia pequena corrigida ao vivo, com a grade para alinhar; na grande-angular, as restrições
// (cliques ao longo do que deveria ser reto; clique duplo ou Enter fecha) acham a distância focal.
import { LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { imagemMenor } from "@/lib/selecao/cores";
import type { ImagemRgba } from "@/lib/selecao/varinha";
import { corrigirGrandeAngular, corrigirLente, focalPelasRestricoes, LENTE_PADRAO, naFoto, type OpcoesDaGrandeAngular, type OpcoesDaLente, pontoNoResultado, type TipoDaGrandeAngular } from "@/lib/transformar/lente";
import type { Ponto } from "@/lib/transformar/malha";

const LADO_DE_TRABALHO = 900;

/** O ponto da foto debaixo de um ponto do resultado (o mesmo mapa do desenho). */
function naFotoPeloResultado(tipo: TipoDaGrandeAngular, p: Ponto, largura: number, altura: number, f: number, escala: number): Ponto {
  const cx = largura / 2;
  const cy = altura / 2;
  const d = Math.hypot(cx, cy);
  const q = naFoto(tipo, (p.x - cx) / d / escala, (p.y - cy) / d / escala, f);
  return { x: cx + q.x * d, y: cy + q.y * d };
}

export function JanelaLente({ tipo, imagem, aoFechar, aoConfirmar }: { tipo: "lente" | "grandeAngular"; imagem: ImagemRgba; aoFechar: () => void; aoConfirmar: (pixels: Uint8ClampedArray<ArrayBuffer>) => void }) {
  const pequena = useMemo(() => imagemMenor(imagem, LADO_DE_TRABALHO), [imagem]);
  const [lente, setLente] = useState<OpcoesDaLente>(LENTE_PADRAO);
  const [angular, setAngular] = useState<OpcoesDaGrandeAngular>({ tipo: "olhoDePeixe", focal: 1, escala: 100 });
  const [grade, setGrade] = useState(tipo === "lente");
  // As restrições, em pixels da foto pequena (pontos da foto, não do resultado)
  const [restricoes, setRestricoes] = useState<Ponto[][]>([]);
  const [desenhando, setDesenhando] = useState<Ponto[] | null>(null);
  const [calculando, setCalculando] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const titulo = tipo === "lente" ? "Correção de lente" : "Grande-angular adaptável";

  const pixels = useMemo(() => (tipo === "lente" ? corrigirLente(pequena, lente) : corrigirGrandeAngular(pequena, angular)), [tipo, pequena, lente, angular]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = pequena.largura;
    canvas.height = pequena.altura;
    canvas.getContext("2d")!.putImageData(new ImageData(pixels, pequena.largura, pequena.altura), 0, 0);
  }, [pixels, pequena]);

  const fecharRestricao = () => {
    if (!desenhando) return;
    const novas = desenhando.length >= 3 ? [...restricoes, desenhando] : restricoes;
    setDesenhando(null);
    setRestricoes(novas);
    const focal = focalPelasRestricoes(novas, pequena.largura, pequena.altura, angular.tipo);
    if (focal) setAngular((atual) => ({ ...atual, focal }));
  };
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") return desenhando ? setDesenhando(null) : aoFechar();
      if (evento.key === "Enter") fecharRestricao();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const confirmar = () => {
    setCalculando(true);
    window.setTimeout(() => aoConfirmar(tipo === "lente" ? corrigirLente(imagem, lente, "bicubica") : corrigirGrandeAngular(imagem, angular, "bicubica")), 30);
  };
  const deslizante = (rotulo: string, valor: number, minimo: number, maximo: number, aoMudar: (valor: number) => void, sufixo = "", passo = 1) => (
    <label className="flex flex-col gap-0.5">
      <span className="flex justify-between">
        <span>{rotulo}</span>
        <span className="tabular-nums text-suave">
          {Number.isInteger(passo) ? Math.round(valor) : valor.toFixed(2).replace(".", ",")}
          {sufixo}
        </span>
      </span>
      <input type="range" min={minimo} max={maximo} step={passo} value={valor} onChange={(evento) => aoMudar(Number(evento.currentTarget.value))} aria-label={rotulo} />
    </label>
  );
  const mudarLente = (mudanca: Partial<OpcoesDaLente>) => setLente((atual) => ({ ...atual, ...mudanca }));
  // As restrições na tela: os pontos da foto levados ao resultado de agora
  const naTela = (p: Ponto) => {
    const r = pontoNoResultado(angular.tipo, p, pequena.largura, pequena.altura, angular.focal);
    const cx = pequena.largura / 2;
    const cy = pequena.altura / 2;
    const e = angular.escala / 100;
    return { x: cx + (r.x - cx) * e, y: cy + (r.y - cy) * e };
  };
  return (
    <div className="fixed inset-0 z-50 flex bg-fundo text-xs" role="dialog" aria-modal aria-label={titulo}>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-3 border-b border-borda bg-painel px-3">
          <span className="font-semibold">{titulo}</span>
          <span className="text-suave">
            {tipo === "lente" ? "Ajuste até as linhas da grade baterem com as retas da foto." : "Clique ao longo do que deveria ser reto (uma parede, o horizonte); clique duplo ou Enter fecha a restrição."}
          </span>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#1b1d22] p-4">
          <div className="relative max-h-full max-w-full" style={{ aspectRatio: `${pequena.largura} / ${pequena.altura}`, height: "100%" }}>
            <canvas ref={canvasRef} className="block size-full" aria-label={`Prévia: ${titulo}`} style={{ background: "repeating-conic-gradient(#cfcfcf 0 25%, #fff 0 50%) 0 0 / 16px 16px" }} />
            <svg
              className="absolute inset-0 size-full"
              viewBox={`0 0 ${pequena.largura} ${pequena.altura}`}
              preserveAspectRatio="none"
              style={{ cursor: tipo === "grandeAngular" ? "crosshair" : "default" }}
              onPointerDown={(evento) => {
                if (tipo !== "grandeAngular" || evento.button !== 0) return;
                if (evento.detail >= 2) return fecharRestricao();
                const r = evento.currentTarget.getBoundingClientRect();
                const p = { x: ((evento.clientX - r.left) / r.width) * pequena.largura, y: ((evento.clientY - r.top) / r.height) * pequena.altura };
                const naFoto = naFotoPeloResultado(angular.tipo, p, pequena.largura, pequena.altura, angular.focal, angular.escala / 100);
                setDesenhando((atual) => [...(atual ?? []), naFoto]);
              }}
            >
              {grade
                ? Array.from({ length: 15 }, (_, i) => (
                    <g key={i}>
                      <line x1={((i + 1) * pequena.largura) / 16} y1={0} x2={((i + 1) * pequena.largura) / 16} y2={pequena.altura} stroke="#fff" strokeOpacity={0.35} vectorEffect="non-scaling-stroke" />
                      <line x1={0} y1={((i + 1) * pequena.altura) / 16} x2={pequena.largura} y2={((i + 1) * pequena.altura) / 16} stroke="#fff" strokeOpacity={0.35} vectorEffect="non-scaling-stroke" />
                    </g>
                  ))
                : null}
              {[...restricoes, ...(desenhando ? [desenhando] : [])].map((restricao, i) => (
                <g key={i}>
                  <polyline points={restricao.map(naTela).map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={i < restricoes.length ? "#22d3ee" : "#facc15"} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  {restricao.map(naTela).map((p, k) => (
                    <circle key={k} cx={p.x} cy={p.y} r={3} fill="#fff" stroke="#000" vectorEffect="non-scaling-stroke" />
                  ))}
                </g>
              ))}
            </svg>
          </div>
          {calculando ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
              <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden /> Corrigindo na resolução cheia…
            </div>
          ) : null}
        </div>
      </div>
      <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-borda bg-painel p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Personalizar</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {tipo === "lente" ? (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">Distorção geométrica</h3>
              {deslizante("Remover distorção", lente.distorcao, -100, 100, (distorcao) => mudarLente({ distorcao }))}
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">Aberração cromática</h3>
              {deslizante("Corrigir franja vermelha/ciano", lente.franjaVermelha, -100, 100, (franjaVermelha) => mudarLente({ franjaVermelha }))}
              {deslizante("Corrigir franja azul/amarela", lente.franjaAzul, -100, 100, (franjaAzul) => mudarLente({ franjaAzul }))}
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">Vinheta</h3>
              {deslizante("Quantidade", lente.vinheta, -100, 100, (vinheta) => mudarLente({ vinheta }))}
              {deslizante("Ponto médio", lente.pontoMedio, 0, 100, (pontoMedio) => mudarLente({ pontoMedio }))}
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">Transformar</h3>
              {deslizante("Perspectiva vertical", lente.perspectivaV, -100, 100, (perspectivaV) => mudarLente({ perspectivaV }))}
              {deslizante("Perspectiva horizontal", lente.perspectivaH, -100, 100, (perspectivaH) => mudarLente({ perspectivaH }))}
              {deslizante("Ângulo", lente.angulo, -45, 45, (angulo) => mudarLente({ angulo }), "°", 0.1)}
              {deslizante("Escala", lente.escala, 50, 150, (escala) => mudarLente({ escala }), "%")}
            </section>
          </>
        ) : (
          <>
            <label className="flex items-center gap-2">
              Correção:
              <select
                className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5"
                value={angular.tipo}
                onChange={(evento) => setAngular((atual) => ({ ...atual, tipo: evento.currentTarget.value as TipoDaGrandeAngular }))}
                aria-label="Correção"
              >
                <option value="olhoDePeixe">Olho de peixe</option>
                <option value="perspectiva">Perspectiva</option>
                <option value="esferica">Esférica total (panorama)</option>
              </select>
            </label>
            {deslizante("Escala", angular.escala, 50, 200, (escala) => setAngular((atual) => ({ ...atual, escala })), "%")}
            {deslizante("Distância focal", angular.focal, 0.2, 5, (focal) => setAngular((atual) => ({ ...atual, focal })), "", 0.01)}
            <p className="text-suave">Em meias diagonais da foto (1 é a lente que cobre a meia diagonal a 45°). As restrições acertam a focal sozinhas.</p>
            <button type="button" className="botao-secundario px-2 py-1 text-xs" disabled={!restricoes.length} onClick={() => setRestricoes([])}>
              Tirar as restrições ({restricoes.length})
            </button>
          </>
        )}
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={grade} onChange={(evento) => setGrade(evento.currentTarget.checked)} />
          Mostrar a grade
        </label>
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
