"use client";

// Filtro › Dissolver (Ctrl+Shift+X; ADR 0003, onda 13.6): a área de trabalho com a camada numa cópia pequena e os
// pincéis do Dissolver à esquerda; o campo de deslocamento é mexido ao vivo e, no OK, levado à resolução cheia.
import { Circle, CircleDot, Eraser, LoaderCircle, Lock, LockOpen, MoveRight, RotateCw, Shrink, Expand, Undo2, Waves, X, ArrowLeftToLine } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { imagemMenor } from "@/lib/selecao/cores";
import type { ImagemRgba } from "@/lib/selecao/varinha";
import { type Campo, campoEm, campoNovo, deformar, type FerramentaDoDissolver, marcarNoCampo, restaurarTudo } from "@/lib/transformar/dissolver";

const FERRAMENTAS: { id: FerramentaDoDissolver; nome: string; tecla: string; icone: typeof Circle; dica: string }[] = [
  { id: "empurrar", nome: "Deformação para a frente", tecla: "W", icone: MoveRight, dica: "Arraste: o que está debaixo do pincel vai junto." },
  { id: "reconstruir", nome: "Reconstruir", tecla: "R", icone: Undo2, dica: "Pinte para desfazer aos poucos o que foi deformado." },
  { id: "suavizar", nome: "Suavizar", tecla: "E", icone: Waves, dica: "Pinte para alisar as deformações." },
  { id: "torcer", nome: "Torcer no sentido horário", tecla: "C", icone: RotateCw, dica: "Segure parado ou arraste: gira o que está debaixo (Alt para o outro lado)." },
  { id: "contrair", nome: "Contrair", tecla: "S", icone: Shrink, dica: "Segure parado: o que está debaixo vai para o centro." },
  { id: "inflar", nome: "Inflar", tecla: "B", icone: Expand, dica: "Segure parado: o que está debaixo cresce do centro." },
  { id: "empurrarEsquerda", nome: "Empurrar para a esquerda", tecla: "O", icone: ArrowLeftToLine, dica: "Arraste para cima: vai para a esquerda; para baixo, para a direita (Alt inverte)." },
  { id: "congelar", nome: "Congelar máscara", tecla: "F", icone: Lock, dica: "Pinte o que não deve mudar." },
  { id: "descongelar", nome: "Descongelar máscara", tecla: "D", icone: LockOpen, dica: "Pinte para soltar o que foi congelado." },
];
const CONTINUAS: ReadonlySet<FerramentaDoDissolver> = new Set(["torcer", "contrair", "inflar", "reconstruir"]);
const LADO_DE_TRABALHO = 1024;

export function JanelaDissolver({ imagem, aoFechar, aoConfirmar }: { imagem: ImagemRgba; aoFechar: () => void; aoConfirmar: (pixels: Uint8ClampedArray<ArrayBuffer>) => void }) {
  const pequena = useMemo(() => imagemMenor(imagem, LADO_DE_TRABALHO), [imagem]);
  const escala = pequena.largura / imagem.largura;
  const campo = useRef<Campo>(campoNovo(pequena.largura, pequena.altura));
  const historico = useRef<{ dx: Float32Array; dy: Float32Array; congelado: Float32Array }[]>([]);
  const [vez, setVez] = useState(0);
  const [ferramenta, setFerramenta] = useState<FerramentaDoDissolver>("empurrar");
  const [tamanho, setTamanho] = useState(Math.round(Math.min(imagem.largura, imagem.altura) / 8));
  const [densidade, setDensidade] = useState(50);
  const [pressao, setPressao] = useState(100);
  const [taxa, setTaxa] = useState(80);
  const [mostrarMascara, setMostrarMascara] = useState(true);
  const [calculando, setCalculando] = useState(false);
  // O círculo do pincel: onde está e quantos pixels da tela há num da cópia pequena
  const [cursor, setCursor] = useState<{ x: number; y: number; k: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const traco = useRef<{ x: number; y: number; alt: boolean; relogio: number | null } | null>(null);

  // A vista: a cópia pequena deformada, e o congelado em vermelho por cima
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const quadro = requestAnimationFrame(() => {
      canvas.width = pequena.largura;
      canvas.height = pequena.altura;
      const ctx = canvas.getContext("2d")!;
      const pixels = deformar(pequena, campo.current);
      if (mostrarMascara) {
        const { congelado } = campo.current;
        for (let i = 0; i < congelado.length; i++) {
          const m = congelado[i] * 0.5;
          if (m <= 0) continue;
          pixels[i * 4] = pixels[i * 4] * (1 - m) + 255 * m;
          pixels[i * 4 + 1] *= 1 - m;
          pixels[i * 4 + 2] *= 1 - m;
          pixels[i * 4 + 3] = Math.max(pixels[i * 4 + 3], 255 * m);
        }
      }
      ctx.putImageData(new ImageData(pixels, pequena.largura, pequena.altura), 0, 0);
    });
    return () => cancelAnimationFrame(quadro);
  }, [pequena, vez, mostrarMascara]);

  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") return aoFechar();
      if (evento.ctrlKey && evento.key.toLowerCase() === "z") {
        evento.preventDefault();
        desfazer();
        return;
      }
      if (evento.ctrlKey || evento.altKey || evento.metaKey) return;
      const escolhida = FERRAMENTAS.find((item) => item.tecla === evento.key.toUpperCase());
      if (escolhida) setFerramenta(escolhida.id);
      if (evento.key === "[") setTamanho((atual) => Math.max(1, Math.round(atual * 0.85)));
      if (evento.key === "]") setTamanho((atual) => Math.round(atual * 1.15) + 1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const guardar = () => {
    const c = campo.current;
    historico.current = [...historico.current.slice(-19), { dx: Float32Array.from(c.dx), dy: Float32Array.from(c.dy), congelado: Float32Array.from(c.congelado) }];
  };
  function desfazer() {
    const ultimo = historico.current.at(-1);
    if (!ultimo) return;
    historico.current = historico.current.slice(0, -1);
    campo.current = { ...campo.current, ...ultimo };
    setVez((atual) => atual + 1);
  }
  const pincel = () => ({ raio: Math.max(1, (tamanho / 2) * escala), densidade: densidade / 100, pressao: pressao / 100, taxa: taxa / 100 });
  const noCampo = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    const r = evento.currentTarget.getBoundingClientRect();
    return { x: ((evento.clientX - r.left) / r.width) * pequena.largura - 0.5, y: ((evento.clientY - r.top) / r.height) * pequena.altura - 0.5 };
  };
  /** As marcas entre o ponto de antes e o de agora, a um quarto do raio uma da outra. */
  const marcarAte = (p: { x: number; y: number }, alt: boolean) => {
    const atual = traco.current;
    if (!atual) return;
    const p0 = { x: atual.x, y: atual.y };
    const distancia = Math.hypot(p.x - p0.x, p.y - p0.y);
    const raio = pincel().raio;
    const passos = Math.max(1, Math.ceil(distancia / Math.max(1, raio / 4)));
    for (let k = 1; k <= passos; k++) {
      const x = p0.x + ((p.x - p0.x) * k) / passos;
      const y = p0.y + ((p.y - p0.y) * k) / passos;
      marcarNoCampo(campo.current, ferramenta, x, y, (p.x - p0.x) / passos, (p.y - p0.y) / passos, pincel(), alt);
    }
    traco.current = { ...atual, x: p.x, y: p.y, alt };
    setVez((v) => v + 1);
  };
  const soltarTraco = () => {
    const atual = traco.current;
    if (atual?.relogio) window.clearInterval(atual.relogio);
    traco.current = null;
  };

  const confirmar = () => {
    setCalculando(true);
    window.setTimeout(() => {
      const cheio = campoEm(campo.current, imagem.largura, imagem.altura);
      aoConfirmar(deformar(imagem, cheio, "bicubica"));
    }, 30);
  };
  const deslizante = (rotulo: string, valor: number, minimo: number, maximo: number, aoMudar: (valor: number) => void, sufixo = "") => (
    <label className="flex flex-col gap-0.5">
      <span className="flex justify-between">
        <span>{rotulo}</span>
        <span className="tabular-nums text-suave">
          {Math.round(valor)}
          {sufixo}
        </span>
      </span>
      <input type="range" min={minimo} max={maximo} value={valor} onChange={(evento) => aoMudar(Number(evento.currentTarget.value))} aria-label={rotulo} />
    </label>
  );
  const dados = FERRAMENTAS.find((item) => item.id === ferramenta)!;
  return (
    <div className="fixed inset-0 z-50 flex bg-fundo text-xs" role="dialog" aria-modal aria-label="Dissolver">
      <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-borda bg-painel py-2">
        {FERRAMENTAS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`botao-icone size-8 ${ferramenta === item.id ? "bg-painel-3 text-texto" : ""}`}
            title={`${item.nome} (${item.tecla})`}
            aria-label={item.nome}
            aria-pressed={ferramenta === item.id}
            onClick={() => setFerramenta(item.id)}
          >
            <item.icone className="size-4" aria-hidden />
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-3 border-b border-borda bg-painel px-3">
          <span className="font-semibold">Dissolver</span>
          <span className="text-suave">{dados.dica}</span>
          <button type="button" className="botao-icone ml-auto size-7" onClick={desfazer} title="Desfazer o último traço (Ctrl+Z)" aria-label="Desfazer o último traço">
            ↶
          </button>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#1b1d22] p-4">
          <div className="relative max-h-full max-w-full" style={{ aspectRatio: `${pequena.largura} / ${pequena.altura}`, height: "100%" }}>
            <canvas
              ref={canvasRef}
              className="block size-full touch-none"
              style={{ cursor: "none" }}
              aria-label="Prévia do Dissolver"
              onPointerDown={(evento) => {
                if (evento.button !== 0) return;
                evento.currentTarget.setPointerCapture(evento.pointerId);
                guardar();
                const p = noCampo(evento);
                const alt = evento.altKey;
                traco.current = { x: p.x, y: p.y, alt, relogio: null };
                marcarNoCampo(campo.current, ferramenta, p.x, p.y, 0, 0, pincel(), alt);
                // As que agem paradas continuam enquanto o botão está apertado
                if (CONTINUAS.has(ferramenta)) {
                  traco.current.relogio = window.setInterval(() => {
                    const atual = traco.current;
                    if (!atual) return;
                    marcarNoCampo(campo.current, ferramenta, atual.x, atual.y, 0, 0, pincel(), atual.alt);
                    setVez((v) => v + 1);
                  }, 40);
                }
                setVez((v) => v + 1);
              }}
              onPointerMove={(evento) => {
                const r = evento.currentTarget.getBoundingClientRect();
                setCursor({ x: evento.clientX - r.left, y: evento.clientY - r.top, k: r.width / pequena.largura });
                if (traco.current) marcarAte(noCampo(evento), evento.altKey);
              }}
              onPointerUp={soltarTraco}
              onPointerCancel={soltarTraco}
              onPointerLeave={() => setCursor(null)}
            />
            {cursor ? (
              <span
                className="pointer-events-none absolute rounded-full border border-white mix-blend-difference"
                style={{
                  left: cursor.x,
                  top: cursor.y,
                  width: tamanho * escala * cursor.k,
                  height: tamanho * escala * cursor.k,
                  transform: "translate(-50%, -50%)",
                }}
                aria-hidden
              />
            ) : null}
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
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Opções do pincel</h3>
          {deslizante("Tamanho", tamanho, 1, Math.max(imagem.largura, imagem.altura), setTamanho, " px")}
          {deslizante("Densidade", densidade, 0, 100, setDensidade)}
          {deslizante("Pressão", pressao, 1, 100, setPressao)}
          {deslizante("Taxa", taxa, 0, 100, setTaxa)}
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Opções de máscara</h3>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={mostrarMascara} onChange={(evento) => setMostrarMascara(evento.currentTarget.checked)} />
            Mostrar a máscara
          </label>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="botao-secundario flex-1 px-2 py-1 text-xs"
              onClick={() => {
                guardar();
                campo.current.congelado.fill(0);
                setVez((v) => v + 1);
              }}
            >
              <Eraser className="mr-1 inline size-3.5" aria-hidden />
              Nenhuma
            </button>
            <button
              type="button"
              className="botao-secundario flex-1 px-2 py-1 text-xs"
              onClick={() => {
                guardar();
                campo.current.congelado.fill(1);
                setVez((v) => v + 1);
              }}
            >
              <Circle className="mr-1 inline size-3.5" aria-hidden />
              Tudo
            </button>
            <button
              type="button"
              className="botao-secundario flex-1 px-2 py-1 text-xs"
              onClick={() => {
                guardar();
                const c = campo.current.congelado;
                for (let i = 0; i < c.length; i++) c[i] = 1 - c[i];
                setVez((v) => v + 1);
              }}
            >
              <CircleDot className="mr-1 inline size-3.5" aria-hidden />
              Inverter
            </button>
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Opções do pincel de reconstrução</h3>
          <button
            type="button"
            className="botao-secundario px-2 py-1 text-xs"
            onClick={() => {
              guardar();
              restaurarTudo(campo.current);
              setVez((v) => v + 1);
            }}
          >
            Restaurar tudo
          </button>
        </section>
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
