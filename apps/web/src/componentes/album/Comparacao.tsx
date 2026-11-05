"use client";

import { Check, X, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CLASSE_DA_CATEGORIA, CLASSE_DA_COR, Estrelas, IconeDaCategoria } from "@/componentes/album/comum";
import { CATEGORIAS, type FotoDoAlbum, gradeDaComparacao, type Mudanca, mudancaDaTecla } from "@/lib/album/fotos";
import { arquivoDaMidia } from "@/lib/api";

const ZOOM_MAXIMO = 8;
const VAO = 4;

/** A vista de todas: o zoom (1 = cabe na célula) e o ponto da foto no meio da célula, em frações dela. */
type Vista = { zoom: number; u: number; v: number };
const CABER: Vista = { zoom: 1, u: 0.5, v: 0.5 };

function presa(vista: Vista): Vista {
  const zoom = Math.min(ZOOM_MAXIMO, Math.max(1, vista.zoom));
  const meia = 0.5 / zoom;
  return { zoom, u: Math.min(1 - meia, Math.max(meia, vista.u)), v: Math.min(1 - meia, Math.max(meia, vista.v)) };
}

/**
 * Duas a doze fotos lado a lado, com o zoom e o arrasto valendo para todas ao mesmo tempo (o mesmo ponto de cada
 * foto no meio): para achar a de olho aberto ou a mais nítida numa rajada. A foto ativa recebe as teclas (0 a 5,
 * 6 a 9, P, X, U) e as setas trocam a ativa; Esc fecha.
 */
export function Comparacao({
  fotos,
  aoAplicar,
  aoTirar,
  aoFechar,
}: {
  fotos: FotoDoAlbum[];
  aoAplicar: (mudanca: Mudanca, ids: string[]) => void;
  aoTirar: (midiaId: string) => void;
  aoFechar: () => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [medida, setMedida] = useState({ largura: 0, altura: 0 });
  const [vista, setVista] = useState<Vista>(CABER);
  const [ativa, setAtiva] = useState(fotos[0]?.midia_id ?? "");
  const arrasto = useRef<{ x: number; y: number; vista: Vista; escala: [number, number]; moveu: boolean } | null>(null);
  const ativaAtual = fotos.some((f) => f.midia_id === ativa) ? ativa : (fotos[0]?.midia_id ?? "");

  useEffect(() => {
    const elemento = area.current;
    if (!elemento) return;
    const medir = () => setMedida({ largura: elemento.clientWidth, altura: elemento.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  const { colunas, linhas } = gradeDaComparacao(fotos.length, medida.largura, medida.altura);
  const celula = { largura: (medida.largura - (colunas - 1) * VAO) / colunas, altura: (medida.altura - (linhas - 1) * VAO) / linhas - 32 };

  /** O tamanho da foto na célula com o zoom de agora. */
  const tamanhoNaCelula = (foto: FotoDoAlbum, zoom: number): [number, number] => {
    const w = foto.largura ?? 1;
    const h = foto.altura ?? 1;
    const caber = Math.min(celula.largura / w, Math.max(1, celula.altura) / h);
    return [w * caber * zoom, h * caber * zoom];
  };

  // O teclado: a ativa recebe as notas; setas trocam a ativa; Z aproxima no meio; Esc fecha
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
      const alvo = evento.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT")) return;
      const i = fotos.findIndex((f) => f.midia_id === ativaAtual);
      if (evento.key === "Escape") {
        evento.preventDefault();
        aoFechar();
      } else if (evento.key === "ArrowRight" || evento.key === "ArrowLeft") {
        evento.preventDefault();
        const proxima = fotos[(i + (evento.key === "ArrowRight" ? 1 : fotos.length - 1)) % fotos.length];
        if (proxima) setAtiva(proxima.midia_id);
      } else if (evento.key.toLowerCase() === "z") {
        evento.preventDefault();
        setVista((atual) => (atual.zoom > 1 ? CABER : presa({ zoom: 3, u: atual.u, v: atual.v })));
      } else {
        const foto = fotos[i];
        const mudanca = foto ? mudancaDaTecla(evento.key, foto) : null;
        if (mudanca && foto) {
          evento.preventDefault();
          aoAplicar(mudanca, [foto.midia_id]);
        }
      }
      // As teclas da comparação não chegam à grade
      evento.stopImmediatePropagation();
    };
    window.addEventListener("keydown", tecla, { capture: true });
    return () => window.removeEventListener("keydown", tecla, { capture: true });
  }, [fotos, ativaAtual, aoAplicar, aoFechar]);

  // A roda aproxima no ponto do ponteiro, o mesmo ponto em todas
  useEffect(() => {
    const elemento = area.current;
    if (!elemento) return;
    const roda = (evento: WheelEvent) => {
      const celulaDoPonteiro = (evento.target as HTMLElement).closest<HTMLElement>("[data-foto]");
      const foto = fotos.find((f) => f.midia_id === celulaDoPonteiro?.dataset.foto);
      if (!foto || !celulaDoPonteiro) return;
      evento.preventDefault();
      const caixa = celulaDoPonteiro.querySelector("[data-imagem]")!.getBoundingClientRect();
      setVista((atual) => {
        const [w, h] = tamanhoNaCelula(foto, atual.zoom);
        // O ponto da foto sob o ponteiro fica parado
        const fu = (evento.clientX - caixa.left) / w;
        const fv = (evento.clientY - caixa.top) / h;
        const zoom = Math.min(ZOOM_MAXIMO, Math.max(1, atual.zoom * Math.exp(-evento.deltaY * 0.0015)));
        const r = atual.zoom / zoom;
        return presa({ zoom, u: fu - (fu - atual.u) * r, v: fv - (fv - atual.v) * r });
      });
    };
    elemento.addEventListener("wheel", roda, { passive: false });
    return () => elemento.removeEventListener("wheel", roda);
  });

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Comparar fotos">
      <div className="flex h-11 shrink-0 items-center gap-3 px-3 text-sm">
        <span className="flex-1">
          Comparando {fotos.length} fotos
          <span className="ml-2 text-xs text-white/60">a roda e o arrasto valem para todas · setas trocam a ativa · Z aproxima</span>
        </span>
        <button
          type="button"
          className="flex h-8 items-center gap-1 rounded-md px-2 text-xs tabular-nums hover:bg-white/10"
          onClick={() => setVista((atual) => (atual.zoom > 1 ? CABER : presa({ zoom: 3, u: atual.u, v: atual.v })))}
          title="Aproximar ou caber (Z)"
        >
          <ZoomIn className="size-4" aria-hidden />
          {vista.zoom > 1 ? `${vista.zoom.toFixed(1)}×` : "Caber"}
        </button>
        <button type="button" className="flex size-8 items-center justify-center rounded-md hover:bg-white/10" onClick={aoFechar} aria-label="Fechar a comparação (Esc)">
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div
        ref={area}
        className="grid min-h-0 flex-1 touch-none p-1 select-none"
        style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${linhas}, minmax(0, 1fr))`, gap: VAO }}
      >
        {fotos.map((foto) => {
          const [w, h] = tamanhoNaCelula(foto, vista.zoom);
          const ladoMaior = Math.max(foto.largura ?? 0, foto.altura ?? 0);
          const arquivo = vista.zoom > 1 && Math.max(w, h) * (window.devicePixelRatio || 1) > Math.min(ladoMaior, 1920) * 1.05 ? "imagem.png" : "proxy.webp";
          const eAtiva = foto.midia_id === ativaAtual;
          const categoria = foto.categoria ? CATEGORIAS.find((c) => c.id === foto.categoria) : null;
          return (
            <div key={foto.midia_id} data-foto={foto.midia_id} className={`flex min-h-0 flex-col overflow-hidden rounded ${eAtiva ? "ring-2 ring-destaque" : "ring-1 ring-white/10"}`}>
              <div
                className={`relative min-h-0 flex-1 overflow-hidden ${vista.zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
                onPointerDown={(evento) => {
                  if (evento.button !== 0) return;
                  setAtiva(foto.midia_id);
                  arrasto.current = { x: evento.clientX, y: evento.clientY, vista, escala: [w, h], moveu: false };
                  evento.currentTarget.setPointerCapture(evento.pointerId);
                }}
                onPointerMove={(evento) => {
                  const a = arrasto.current;
                  if (!a) return;
                  const dx = evento.clientX - a.x;
                  const dy = evento.clientY - a.y;
                  if (Math.abs(dx) + Math.abs(dy) > 3) a.moveu = true;
                  if (a.moveu && a.vista.zoom > 1) setVista(presa({ zoom: a.vista.zoom, u: a.vista.u - dx / a.escala[0], v: a.vista.v - dy / a.escala[1] }));
                }}
                onPointerUp={(evento) => {
                  const a = arrasto.current;
                  arrasto.current = null;
                  if (!a || a.moveu) return;
                  // O clique sem arrastar: aproxima 3 vezes no ponto, ou volta a caber
                  if (vista.zoom > 1) setVista(CABER);
                  else {
                    const caixa = evento.currentTarget.querySelector("[data-imagem]")!.getBoundingClientRect();
                    setVista(presa({ zoom: 3, u: (evento.clientX - caixa.left) / caixa.width, v: (evento.clientY - caixa.top) / caixa.height }));
                  }
                }}
              >
                <div
                  data-imagem=""
                  className="absolute left-1/2 top-1/2"
                  style={{
                    width: w,
                    height: h,
                    transform: `translate(${-vista.u * w}px, ${-vista.v * h}px)`,
                    backgroundImage: `url(${arquivoDaMidia(foto.midia_id, "proxy.webp")})`,
                    backgroundSize: "100% 100%",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagem da API com a sessão do cookie */}
                  <img key={arquivo} src={arquivoDaMidia(foto.midia_id, arquivo)} alt={foto.nome} draggable={false} className={`size-full ${foto.marcacao === "rejeitada" ? "opacity-40" : ""}`} />
                </div>
                {categoria ? (
                  <span className={`absolute right-1 top-1 flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-semibold text-white ${CLASSE_DA_CATEGORIA[categoria.id]}`} title={foto.motivo ?? categoria.nome}>
                    <IconeDaCategoria categoria={categoria.id} />
                    {foto.nota_ia ?? ""}
                  </span>
                ) : null}
                {foto.marcacao ? (
                  <span className={`absolute left-1 top-1 flex size-5 items-center justify-center rounded-full ${foto.marcacao === "rejeitada" ? "bg-erro" : "bg-sucesso"}`}>
                    {foto.marcacao === "rejeitada" ? <X className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                  </span>
                ) : null}
              </div>
              <div className="flex h-8 shrink-0 items-center gap-2 bg-white/5 px-2 text-xs" onPointerDown={() => setAtiva(foto.midia_id)}>
                <span className="min-w-0 flex-1 truncate text-white/80" title={foto.nome}>
                  {foto.nome}
                </span>
                {foto.cor ? <span className={`size-2.5 rounded-full ${CLASSE_DA_COR[foto.cor]}`} aria-hidden /> : null}
                <Estrelas nota={foto.nota} aoMudar={(nota) => aoAplicar({ nota }, [foto.midia_id])} tamanho="size-3.5" />
                <button
                  type="button"
                  className={`flex size-6 items-center justify-center rounded ${foto.marcacao === "escolhida" ? "bg-sucesso" : "hover:bg-white/15"}`}
                  onClick={() => aoAplicar(foto.marcacao === "escolhida" ? { tirar_marcacao: true } : { marcacao: "escolhida" }, [foto.midia_id])}
                  aria-label="Escolher (P)"
                  title="Escolher (P)"
                >
                  <Check className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className={`flex size-6 items-center justify-center rounded ${foto.marcacao === "rejeitada" ? "bg-erro" : "hover:bg-white/15"}`}
                  onClick={() => aoAplicar(foto.marcacao === "rejeitada" ? { tirar_marcacao: true } : { marcacao: "rejeitada" }, [foto.midia_id])}
                  aria-label="Rejeitar (X)"
                  title="Rejeitar (X)"
                >
                  <X className="size-4" aria-hidden />
                </button>
                {fotos.length > 2 ? (
                  <button type="button" className="rounded px-1 text-[11px] text-white/60 hover:bg-white/15 hover:text-white" onClick={() => aoTirar(foto.midia_id)} title="Tirar da comparação">
                    Tirar
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
