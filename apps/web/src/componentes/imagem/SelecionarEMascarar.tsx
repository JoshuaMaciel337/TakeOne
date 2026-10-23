"use client";

// Selecionar e mascarar (Ctrl+Alt+R; ADR 0003, onda 13.3): uma área de trabalho por cima do editor, com a camada (ou
// a imagem) e a seleção refeita ao vivo numa cópia pequena. À esquerda, o pincel de refinar borda (pinta a faixa que a
// imagem refaz, para os fios soltos) e o pincel (soma; Alt tira); à direita, as vistas, a detecção de borda, os ajustes
// globais e a saída. O OK refaz tudo na resolução cheia, com os mesmos traços.
import { Brush, LoaderCircle, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { imagemMenor } from "@/lib/selecao/cores";
import { type Selecao, vazia } from "@/lib/selecao/mascara";
import { bordaComoImagem } from "@/lib/selecao/naTela";
import { descontaminar, type OpcoesDoRefinamento, REFINAMENTO_PADRAO, refinarSelecao } from "@/lib/selecao/refinar";
import type { ImagemRgba } from "@/lib/selecao/varinha";

export type SaidaDoRefinamento = "selecao" | "mascara" | "camada" | "camadaComMascara";
type Vista = "cebola" | "formigas" | "sobreposicao" | "preto" | "branco" | "pretoEBranco" | "camadas";
type Traco = { tipo: "refinar" | "desrefinar" | "somar" | "subtrair"; raio: number; pontos: { x: number; y: number }[] };

const VISTAS: { id: Vista; nome: string }[] = [
  { id: "cebola", nome: "Casca de cebola" },
  { id: "formigas", nome: "Formigas" },
  { id: "sobreposicao", nome: "Sobreposição" },
  { id: "preto", nome: "No preto" },
  { id: "branco", nome: "No branco" },
  { id: "pretoEBranco", nome: "Preto e branco" },
  { id: "camadas", nome: "Nas camadas" },
];
const SAIDAS: { id: SaidaDoRefinamento; nome: string; comCamada: boolean }[] = [
  { id: "selecao", nome: "Seleção", comCamada: false },
  { id: "mascara", nome: "Máscara de camada", comCamada: true },
  { id: "camada", nome: "Nova camada", comCamada: true },
  { id: "camadaComMascara", nome: "Nova camada com máscara de camada", comCamada: true },
];

/** A seleção numa grade menor (a da prévia), pelo vizinho mais perto. */
function selecaoMenor(selecao: Selecao | null, largura: number, altura: number): Selecao {
  const saida = vazia(largura, altura);
  if (!selecao) return saida;
  for (let y = 0; y < altura; y++) {
    const ys = Math.min(selecao.altura - 1, Math.floor(((y + 0.5) / altura) * selecao.altura));
    for (let x = 0; x < largura; x++) saida.dados[y * largura + x] = selecao.dados[ys * selecao.largura + Math.min(selecao.largura - 1, Math.floor(((x + 0.5) / largura) * selecao.largura))];
  }
  return saida;
}

/**
 * Os traços na grade (largura × altura) de um documento de `documento` de largura: a seleção com o pincel (somar e
 * subtrair) e a faixa do pincel de refinar.
 */
function aplicarTracos(base: Selecao, tracos: Traco[], documentoLargura: number): { selecao: Selecao; faixa: Uint8Array | null } {
  const { largura, altura } = base;
  const escala = largura / documentoLargura;
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const dados = ctx.createImageData(largura, altura);
  for (let i = 0; i < base.dados.length; i++) {
    dados.data.fill(base.dados[i], i * 4, i * 4 + 3);
    dados.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(dados, 0, 0);
  const faixaCanvas = document.createElement("canvas");
  faixaCanvas.width = largura;
  faixaCanvas.height = altura;
  const faixaCtx = faixaCanvas.getContext("2d", { willReadFrequently: true })!;
  let temFaixa = false;
  for (const traco of tracos) {
    const naFaixa = traco.tipo === "refinar" || traco.tipo === "desrefinar";
    const alvo = naFaixa ? faixaCtx : ctx;
    // Alt no pincel de refinar apaga a faixa (a borda volta a ser a da seleção)
    alvo.globalCompositeOperation = traco.tipo === "desrefinar" ? "destination-out" : "source-over";
    alvo.lineCap = "round";
    alvo.lineJoin = "round";
    alvo.lineWidth = Math.max(1, traco.raio * 2 * escala);
    alvo.strokeStyle = traco.tipo === "subtrair" ? "#000" : "#fff";
    alvo.fillStyle = alvo.strokeStyle;
    alvo.beginPath();
    const [primeiro, ...resto] = traco.pontos;
    alvo.moveTo(primeiro.x * escala, primeiro.y * escala);
    if (!resto.length) alvo.arc(primeiro.x * escala, primeiro.y * escala, Math.max(0.5, traco.raio * escala), 0, Math.PI * 2);
    for (const p of resto) alvo.lineTo(p.x * escala, p.y * escala);
    if (resto.length) alvo.stroke();
    else alvo.fill();
    alvo.globalCompositeOperation = "source-over";
    if (naFaixa) temFaixa = true;
  }
  const lida = ctx.getImageData(0, 0, largura, altura).data;
  const selecao = vazia(largura, altura);
  for (let i = 0; i < selecao.dados.length; i++) selecao.dados[i] = lida[i * 4];
  if (!temFaixa) return { selecao, faixa: null };
  const faixaLida = faixaCtx.getImageData(0, 0, largura, altura).data;
  const faixa = new Uint8Array(largura * altura);
  for (let i = 0; i < faixa.length; i++) faixa[i] = faixaLida[i * 4 + 3] > 0 ? 1 : 0;
  return { selecao, faixa };
}

/** As opções do refinamento na escala de outra resolução (os raios em pixels andam com ela). */
function naEscala(opcoes: OpcoesDoRefinamento, escala: number): OpcoesDoRefinamento {
  return { ...opcoes, raio: opcoes.raio * escala, difusao: opcoes.difusao * escala };
}

export type ResultadoDoRefinamento = { selecao: Selecao; saida: SaidaDoRefinamento; descontaminada: ImagemRgba | null };

/** O refinamento na resolução cheia, com os mesmos traços e a descontaminação pedida. */
export function refinarNaResolucaoCheia(imagem: ImagemRgba, selecao: Selecao | null, tracos: Traco[], opcoes: OpcoesDoRefinamento, descontaminacao: number | null): { selecao: Selecao; descontaminada: ImagemRgba | null } {
  const base = selecao ?? vazia(imagem.largura, imagem.altura);
  const { selecao: comPincel, faixa } = aplicarTracos(base, tracos, imagem.largura);
  const refinada = refinarSelecao(imagem, comPincel, opcoes, faixa);
  const descontaminada = descontaminacao ? descontaminar(imagem, refinada, descontaminacao, Math.max(3, Math.round(opcoes.raio + 4))) : null;
  return { selecao: refinada, descontaminada };
}

export function SelecionarEMascarar({
  imagem,
  fundo,
  selecao,
  temCamada,
  aoFechar,
  aoConfirmar,
}: {
  /** A camada sozinha (ou a imagem inteira), no tamanho do documento. */
  imagem: ImagemRgba;
  /** O resto das camadas, para a vista "Nas camadas". */
  fundo: ImagemRgba | null;
  selecao: Selecao | null;
  temCamada: boolean;
  aoFechar: () => void;
  aoConfirmar: (resultado: ResultadoDoRefinamento) => void;
}) {
  const pequena = useMemo(() => imagemMenor(imagem, 900), [imagem]);
  const fundoPequeno = useMemo(() => (fundo ? imagemMenor(fundo, 900) : null), [fundo]);
  const escala = pequena.largura / imagem.largura;
  const basePequena = useMemo(() => selecaoMenor(selecao, pequena.largura, pequena.altura), [selecao, pequena.largura, pequena.altura]);
  const [opcoes, setOpcoes] = useState<OpcoesDoRefinamento>(REFINAMENTO_PADRAO);
  const [vista, setVista] = useState<Vista>("sobreposicao");
  const [transparencia, setTransparencia] = useState(0.5);
  const [ferramenta, setFerramenta] = useState<"refinar" | "pincel">("refinar");
  const [tamanho, setTamanho] = useState(Math.max(10, Math.round(Math.min(imagem.largura, imagem.altura) / 30)));
  const [tracos, setTracos] = useState<Traco[]>([]);
  const [descontaminar, setDescontaminar] = useState(false);
  const [quantidade, setQuantidade] = useState(0.8);
  const [saida, setSaida] = useState<SaidaDoRefinamento>(temCamada ? "mascara" : "selecao");
  const [calculando, setCalculando] = useState(false);
  const desenhando = useRef<Traco | null>(null);
  const [tracoVivo, setTracoVivo] = useState<Traco | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // A seleção refeita na cópia pequena, com os traços (o que está sendo pintado entra também)
  const refinada = useMemo(() => {
    const todos = tracoVivo ? [...tracos, tracoVivo] : tracos;
    const { selecao: comPincel, faixa } = aplicarTracos(basePequena, todos, imagem.largura);
    return refinarSelecao(pequena, comPincel, naEscala(opcoes, escala), faixa);
  }, [basePequena, tracos, tracoVivo, opcoes, pequena, escala, imagem.largura]);
  const formigas = useMemo(() => (vista === "formigas" ? bordaComoImagem(refinada, pequena.largura, pequena.altura) : null), [vista, refinada, pequena.largura, pequena.altura]);

  // A vista: a imagem e a cobertura juntas, como cada modo mostra
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = pequena.largura;
    canvas.height = pequena.altura;
    const ctx = canvas.getContext("2d")!;
    const saidaDaVista = ctx.createImageData(pequena.largura, pequena.altura);
    const d = pequena.dados;
    for (let y = 0; y < pequena.altura; y++) {
      for (let x = 0; x < pequena.largura; x++) {
        const i = y * pequena.largura + x;
        const a = refinada.dados[i] / 255;
        const alfaDaImagem = d[i * 4 + 3] / 255;
        const xadrez = ((x >> 3) + (y >> 3)) % 2 ? 204 : 255;
        for (let c = 0; c < 3; c++) {
          const cor = d[i * 4 + c] * alfaDaImagem + xadrez * (1 - alfaDaImagem);
          let valor: number;
          if (vista === "pretoEBranco") valor = a * 255;
          else if (vista === "preto") valor = cor * a;
          else if (vista === "branco") valor = cor * a + 255 * (1 - a);
          else if (vista === "sobreposicao") valor = cor * (1 - 0.5 * (1 - a)) + (c === 0 ? 255 : 0) * 0.5 * (1 - a);
          else if (vista === "camadas") valor = cor * a + (fundoPequeno ? fundoPequeno.dados[i * 4 + c] : xadrez) * (1 - a);
          else if (vista === "cebola") valor = cor * (a + (1 - a) * (1 - transparencia)) + xadrez * (1 - a) * transparencia;
          else valor = cor;
          saidaDaVista.data[i * 4 + c] = valor;
        }
        saidaDaVista.data[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(saidaDaVista, 0, 0);
  }, [pequena, refinada, vista, transparencia, fundoPequeno]);

  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar]);

  const noDocumento = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    const r = evento.currentTarget.getBoundingClientRect();
    return { x: ((evento.clientX - r.left) / r.width) * imagem.largura, y: ((evento.clientY - r.top) / r.height) * imagem.altura };
  };
  const mudar = (mudanca: Partial<OpcoesDoRefinamento>) => setOpcoes((atual) => ({ ...atual, ...mudanca }));
  const confirmar = () => {
    setCalculando(true);
    // Um quadro para o "calculando" aparecer antes da conta pesada
    window.setTimeout(() => {
      const { selecao: final, descontaminada } = refinarNaResolucaoCheia(imagem, selecao, tracos, opcoes, descontaminar && (saida === "camada" || saida === "camadaComMascara") ? quantidade : null);
      aoConfirmar({ selecao: final, saida, descontaminada });
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

  return (
    <div className="fixed inset-0 z-50 flex bg-fundo text-xs" role="dialog" aria-modal aria-label="Selecionar e mascarar">
      <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-borda bg-painel py-2">
        <button type="button" className={`botao-icone size-8 ${ferramenta === "refinar" ? "bg-painel-3 text-texto" : ""}`} title="Pincel de refinar borda: pinte nos fios e nas bordas macias (Alt tira)" aria-label="Pincel de refinar borda" aria-pressed={ferramenta === "refinar"} onClick={() => setFerramenta("refinar")}>
          <Sparkles className="size-4" aria-hidden />
        </button>
        <button type="button" className={`botao-icone size-8 ${ferramenta === "pincel" ? "bg-painel-3 text-texto" : ""}`} title="Pincel: soma à seleção (Alt tira)" aria-label="Pincel" aria-pressed={ferramenta === "pincel"} onClick={() => setFerramenta("pincel")}>
          <Brush className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-3 border-b border-borda bg-painel px-3">
          <span className="font-semibold">Selecionar e mascarar</span>
          <label className="flex items-center gap-1.5 text-suave">
            Tamanho:
            <input type="range" min={1} max={500} value={tamanho} onChange={(evento) => setTamanho(Number(evento.currentTarget.value))} aria-label="Tamanho do pincel" />
            <span className="w-8 tabular-nums">{tamanho}</span>
          </label>
          <span className="text-suave">{ferramenta === "refinar" ? "Pinte por cima da borda (cabelo, pelos): a imagem refaz o que estiver embaixo." : "Pinte para somar; com Alt, para tirar."}</span>
          <button type="button" className="botao-icone ml-auto size-7" onClick={() => setTracos((atual) => atual.slice(0, -1))} disabled={!tracos.length} title="Desfazer o último traço" aria-label="Desfazer o último traço">
            ↶
          </button>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#1b1d22] p-4">
          <div className="relative max-h-full max-w-full" style={{ aspectRatio: `${pequena.largura} / ${pequena.altura}`, height: "100%" }}>
            <canvas
              ref={canvasRef}
              className="block size-full touch-none"
              style={{ cursor: "crosshair", imageRendering: "auto" }}
              aria-label="Prévia do refinamento"
              onPointerDown={(evento) => {
                if (evento.button !== 0) return;
                evento.currentTarget.setPointerCapture(evento.pointerId);
                const tipo = ferramenta === "refinar" ? (evento.altKey ? "desrefinar" : "refinar") : evento.altKey ? "subtrair" : "somar";
                const traco: Traco = { tipo, raio: tamanho / 2, pontos: [noDocumento(evento)] };
                desenhando.current = traco;
                setTracoVivo(traco);
              }}
              onPointerMove={(evento) => {
                const traco = desenhando.current;
                if (!traco) return;
                const novo = { ...traco, pontos: [...traco.pontos, noDocumento(evento)] };
                desenhando.current = novo;
                setTracoVivo(novo);
              }}
              onPointerUp={() => {
                const traco = desenhando.current;
                desenhando.current = null;
                setTracoVivo(null);
                if (traco) setTracos((atual) => [...atual, traco]);
              }}
            />
            {formigas ? (
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: "repeating-linear-gradient(45deg, #000 0 3px, #fff 3px 6px)",
                  animation: "to-formigas 0.8s linear infinite",
                  maskImage: `url(${formigas})`,
                  maskSize: "100% 100%",
                  WebkitMaskImage: `url(${formigas})`,
                  WebkitMaskSize: "100% 100%",
                }}
                aria-hidden
              />
            ) : null}
          </div>
          {calculando ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
              <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden /> Refazendo na resolução cheia…
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
          <h3 className="font-semibold">Modo de exibição</h3>
          <label className="flex items-center gap-2">
            Visualizar:
            <select className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5" value={vista} onChange={(evento) => setVista(evento.currentTarget.value as Vista)}>
              {VISTAS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </label>
          {vista === "cebola" ? deslizante("Transparência", transparencia * 100, 0, 100, (valor) => setTransparencia(valor / 100), "%") : null}
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Detecção de borda</h3>
          {deslizante("Raio", opcoes.raio, 0, 250, (raio) => mudar({ raio }), " px")}
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={opcoes.raioInteligente} onChange={(evento) => mudar({ raioInteligente: evento.currentTarget.checked })} />
            Raio inteligente
          </label>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Refinamento global</h3>
          {deslizante("Suavizar", opcoes.suavizar, 0, 100, (suavizar) => mudar({ suavizar }))}
          {deslizante("Difusão", opcoes.difusao, 0, 250, (difusao) => mudar({ difusao }), " px")}
          {deslizante("Contraste", opcoes.contraste, 0, 100, (contraste) => mudar({ contraste }), "%")}
          {deslizante("Deslocar borda", opcoes.deslocar, -100, 100, (deslocar) => mudar({ deslocar }), "%")}
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Configurações de saída</h3>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={descontaminar} disabled={saida === "selecao" || saida === "mascara"} onChange={(evento) => setDescontaminar(evento.currentTarget.checked)} />
            Descontaminar cores
          </label>
          {descontaminar && (saida === "camada" || saida === "camadaComMascara") ? deslizante("Quantidade", quantidade * 100, 0, 100, (valor) => setQuantidade(valor / 100), "%") : null}
          <label className="flex flex-col gap-1">
            Saída para:
            <select className="rounded border border-borda bg-painel-2 px-1.5 py-0.5" value={saida} onChange={(evento) => setSaida(evento.currentTarget.value as SaidaDoRefinamento)}>
              {SAIDAS.filter((item) => temCamada || !item.comCamada).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </label>
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
