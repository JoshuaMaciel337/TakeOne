"use client";

// O painel de escopos de cor do editor de vídeo (forma de onda, desfile RGB, vetorscópio e histograma), lidos do quadro
// que o monitor Programa acabou de desenhar. As contas ficam em lib/previa/escopos.ts; aqui só a leitura e a pintura.
import { useEffect, useRef, useState } from "react";

import { ALVOS_DO_VETORSCOPIO, ANGULO_DA_PELE, brilhoDaContagem, formaDeOnda, histogramas, type Pixels, posicaoNoVetorscopio, vetorscopio } from "@/lib/previa/escopos";
import { assinarQuadro } from "@/lib/previa/quadroAoVivo";

type Escopo = "onda" | "desfile" | "vetorscopio" | "histograma";
const ESCOPOS: { id: Escopo; nome: string }[] = [
  { id: "onda", nome: "Forma de onda" },
  { id: "desfile", nome: "Desfile RGB" },
  { id: "vetorscopio", nome: "Vetorscópio" },
  { id: "histograma", nome: "Histograma" },
];
type Escolha = { ligados: Escopo[]; ondaRgb: boolean };
const CHAVE = "takeone-escopos";
const PADRAO: Escolha = { ligados: ["onda", "vetorscopio"], ondaRgb: false };
/** O quadro é lido em no máximo este tamanho: os escopos mostram a distribuição, não o detalhe. */
const AMOSTRA = { largura: 480, altura: 270 };
/** No máximo um cálculo a cada tanto, enquanto toca. */
const INTERVALO_MS = 90;
const FUNDO = "#0b0d10";
const GRADE = "rgba(255,255,255,0.18)";
const ROTULO = "rgba(255,255,255,0.55)";

function lerEscolha(): Escolha {
  try {
    const guardada = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as Partial<Escolha> | null;
    const ligados = (guardada?.ligados ?? []).filter((id) => ESCOPOS.some((escopo) => escopo.id === id));
    return ligados.length ? { ligados, ondaRgb: Boolean(guardada?.ondaRgb) } : PADRAO;
  } catch {
    return PADRAO;
  }
}

export function PainelEscopos() {
  const [escolha, setEscolha] = useState<Escolha>(lerEscolha);
  const corpoRef = useRef<HTMLDivElement>(null);
  const telas = useRef(new Map<Escopo, HTMLCanvasElement>());
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 });
  const [temQuadro, setTemQuadro] = useState(false);

  const mudar = (nova: Escolha) => {
    setEscolha(nova);
    try {
      localStorage.setItem(CHAVE, JSON.stringify(nova));
    } catch {
      // Sem armazenamento, a escolha vale até recarregar
    }
  };

  useEffect(() => {
    const corpo = corpoRef.current;
    if (!corpo) return;
    const observador = new ResizeObserver(([entrada]) => setTamanho({ largura: Math.floor(entrada.contentRect.width), altura: Math.floor(entrada.contentRect.height) }));
    observador.observe(corpo);
    return () => observador.disconnect();
  }, []);

  // A cada quadro novo da prévia (no máximo um cálculo a cada INTERVALO_MS), lê os pixels e pinta os escopos ligados
  useEffect(() => {
    const amostra = document.createElement("canvas");
    const ctx = amostra.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    let pendente: HTMLCanvasElement | null = null;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const calcular = () => {
      espera = null;
      const canvas = pendente;
      pendente = null;
      if (!canvas || !canvas.width || !canvas.height) return;
      const escala = Math.min(1, AMOSTRA.largura / canvas.width, AMOSTRA.altura / canvas.height);
      const largura = Math.max(1, Math.round(canvas.width * escala));
      const altura = Math.max(1, Math.round(canvas.height * escala));
      if (amostra.width !== largura || amostra.height !== altura) {
        amostra.width = largura;
        amostra.height = altura;
      }
      ctx.drawImage(canvas, 0, 0, largura, altura);
      const pixels: Pixels = { largura, altura, dados: ctx.getImageData(0, 0, largura, altura).data };
      setTemQuadro(true);
      for (const [escopo, tela] of telas.current) pintar(escopo, tela, pixels, escolha.ondaRgb);
    };
    const parar = assinarQuadro((canvas) => {
      pendente = canvas;
      espera ??= setTimeout(calcular, INTERVALO_MS);
    });
    return () => {
      parar();
      if (espera) clearTimeout(espera);
    };
  }, [escolha, tamanho]);

  const ligados = ESCOPOS.filter((escopo) => escolha.ligados.includes(escopo.id));
  // Um escopo ocupa tudo; dois ficam lado a lado (ou um sobre o outro, num painel alto); três ou quatro, em 2 × 2
  const colunas = ligados.length === 1 ? 1 : ligados.length === 2 ? (tamanho.largura >= tamanho.altura ? 2 : 1) : 2;
  const linhas = Math.ceil(ligados.length / colunas);
  const celula = { largura: Math.floor((tamanho.largura - (colunas - 1) * 4) / colunas), altura: Math.floor((tamanho.altura - (linhas - 1) * 4) / linhas) };

  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-borda px-2 py-1">
        {ESCOPOS.map((escopo) => {
          const ligado = escolha.ligados.includes(escopo.id);
          return (
            <button
              key={escopo.id}
              type="button"
              aria-pressed={ligado}
              className={`rounded px-1.5 py-0.5 ${ligado ? "bg-destaque/20 text-texto" : "text-suave hover:text-texto"}`}
              onClick={() => {
                const ligadosNovos = ligado ? escolha.ligados.filter((id) => id !== escopo.id) : [...escolha.ligados, escopo.id];
                if (ligadosNovos.length) mudar({ ...escolha, ligados: ESCOPOS.map((e) => e.id).filter((id) => ligadosNovos.includes(id)) });
              }}
            >
              {escopo.nome}
            </button>
          );
        })}
        {escolha.ligados.includes("onda") ? (
          <label className="ml-auto flex items-center gap-1 text-suave">
            Onda
            <select aria-label="Canal da forma de onda" className="rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs text-texto" value={escolha.ondaRgb ? "rgb" : "luma"} onChange={(e) => mudar({ ...escolha, ondaRgb: e.currentTarget.value === "rgb" })}>
              <option value="luma">Luma</option>
              <option value="rgb">RGB</option>
            </select>
          </label>
        ) : null}
      </div>
      <div ref={corpoRef} className="relative min-h-0 flex-1 p-1" style={{ background: FUNDO }}>
        <div className="grid size-full gap-1" style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${linhas}, minmax(0, 1fr))` }}>
          {ligados.map((escopo) => (
            <canvas
              key={escopo.id}
              aria-label={escopo.nome}
              width={Math.max(1, celula.largura)}
              height={Math.max(1, celula.altura)}
              className="size-full"
              ref={(tela) => {
                if (tela) telas.current.set(escopo.id, tela);
                else telas.current.delete(escopo.id);
              }}
            />
          ))}
        </div>
        {!temQuadro ? <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-suave">Os escopos leem o monitor Programa: ponha um clipe na linha do tempo.</p> : null}
      </div>
    </div>
  );
}

function pintar(escopo: Escopo, tela: HTMLCanvasElement, pixels: Pixels, ondaRgb: boolean) {
  const ctx = tela.getContext("2d");
  if (!ctx || tela.width < 20 || tela.height < 20) return;
  ctx.fillStyle = FUNDO;
  ctx.fillRect(0, 0, tela.width, tela.height);
  if (escopo === "onda" || escopo === "desfile") pintarOnda(ctx, tela, pixels, escopo === "desfile" ? "desfile" : ondaRgb ? "rgb" : "luma");
  else if (escopo === "vetorscopio") pintarVetorscopio(ctx, tela, pixels);
  else pintarHistograma(ctx, tela, pixels);
}

const MARGEM_ESQUERDA = 26;
const MARGEM = 6;
const CORES = { r: [255, 70, 60], g: [60, 230, 90], b: [70, 130, 255], luma: [170, 240, 170] } as const;

/** A forma de onda (da luz ou dos três canais juntos) ou o desfile (os três canais lado a lado), com a escala de 0 a 100. */
function pintarOnda(ctx: CanvasRenderingContext2D, tela: HTMLCanvasElement, pixels: Pixels, modo: "luma" | "rgb" | "desfile") {
  const area = { x: MARGEM_ESQUERDA, y: MARGEM, largura: tela.width - MARGEM_ESQUERDA - MARGEM, altura: tela.height - 2 * MARGEM };
  if (area.largura < 8 || area.altura < 8) return;
  const imagem = ctx.createImageData(area.largura, area.altura);
  const canais = modo === "luma" ? (["luma"] as const) : (["r", "g", "b"] as const);
  const faixas = modo === "desfile" ? 3 : 1;
  const largura = Math.floor(area.largura / faixas);
  canais.forEach((canal, indice) => {
    const colunas = Math.max(1, largura - (faixas > 1 ? 3 : 0));
    const contagens = formaDeOnda(pixels, canal, colunas);
    // A contagem que já sai no brilho máximo: uma fração dos pixels de cada coluna
    const referencia = Math.max(2, (pixels.altura * pixels.largura) / colunas / 12);
    const x0 = modo === "desfile" ? indice * largura : 0;
    pintarContagens(imagem, contagens, colunas, x0, area.altura, CORES[canal], referencia);
  });
  ctx.putImageData(imagem, area.x, area.y);
  // A escala: 0, 25, 50, 75 e 100% da luz (0 a 255)
  ctx.strokeStyle = GRADE;
  ctx.fillStyle = ROTULO;
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const marca of [0, 25, 50, 75, 100]) {
    const y = area.y + area.altura - 1 - (marca / 100) * (area.altura - 1) + 0.5;
    ctx.beginPath();
    ctx.moveTo(area.x, y);
    ctx.lineTo(area.x + area.largura, y);
    ctx.stroke();
    ctx.fillText(String(marca), area.x - 4, y);
  }
  if (modo === "desfile")
    for (let i = 1; i < 3; i++) {
      const x = area.x + i * largura - 1.5;
      ctx.beginPath();
      ctx.moveTo(x, area.y);
      ctx.lineTo(x, area.y + area.altura);
      ctx.stroke();
    }
}

/** Soma as contagens de uma forma de onda (colunas × 256 níveis) na imagem, na cor do canal (as cores se somam). */
function pintarContagens(imagem: ImageData, contagens: Uint32Array, colunas: number, x0: number, altura: number, cor: readonly [number, number, number], referencia: number) {
  const { data, width } = imagem;
  for (let coluna = 0; coluna < colunas; coluna++) {
    const x = x0 + coluna;
    if (x >= width) break;
    for (let nivel = 0; nivel < 256; nivel++) {
      const contagem = contagens[coluna * 256 + nivel];
      if (!contagem) continue;
      const y = altura - 1 - Math.round((nivel / 255) * (altura - 1));
      const i = (y * width + x) * 4;
      const brilho = brilhoDaContagem(contagem, referencia);
      data[i] = Math.min(255, data[i] + cor[0] * brilho);
      data[i + 1] = Math.min(255, data[i + 1] + cor[1] * brilho);
      data[i + 2] = Math.min(255, data[i + 2] + cor[2] * brilho);
      data[i + 3] = 255;
    }
  }
}

/** O vetorscópio: cada casa na cor do matiz dela, as caixas das barras a 75% e a 100% e a linha dos tons de pele. */
function pintarVetorscopio(ctx: CanvasRenderingContext2D, tela: HTMLCanvasElement, pixels: Pixels) {
  const lado = Math.floor(Math.min(tela.width, tela.height) - 2 * MARGEM);
  if (lado < 16) return;
  const x0 = Math.floor((tela.width - lado) / 2);
  const y0 = Math.floor((tela.height - lado) / 2);
  const contagens = vetorscopio(pixels, lado);
  const referencia = Math.max(2, (pixels.largura * pixels.altura) / (lado * 6));
  const imagem = ctx.createImageData(lado, lado);
  for (let y = 0; y < lado; y++)
    for (let x = 0; x < lado; x++) {
      const contagem = contagens[y * lado + x];
      if (!contagem) continue;
      const brilho = brilhoDaContagem(contagem, referencia);
      // A cor da casa: o Cb e o Cr dela com a luz no meio, puxada para o branco onde há muito pixel
      const cb = (x + 0.5) / lado - 0.5;
      const cr = 0.5 - (y + 0.5) / lado;
      const cor = corDoPonto(cb, cr);
      const i = (y * lado + x) * 4;
      for (let c = 0; c < 3; c++) imagem.data[i + c] = Math.min(255, (cor[c] * 0.7 + 255 * 0.3 * brilho) * brilho);
      imagem.data[i + 3] = 255;
    }
  ctx.putImageData(imagem, x0, y0);
  const meio = { x: x0 + lado / 2, y: y0 + lado / 2 };
  const raio = lado / 2;
  ctx.strokeStyle = GRADE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(meio.x, meio.y, raio - 0.5, 0, Math.PI * 2);
  ctx.moveTo(meio.x - raio, meio.y);
  ctx.lineTo(meio.x + raio, meio.y);
  ctx.moveTo(meio.x, meio.y - raio);
  ctx.lineTo(meio.x, meio.y + raio);
  ctx.stroke();
  // A linha dos tons de pele
  const pele = (ANGULO_DA_PELE * Math.PI) / 180;
  ctx.strokeStyle = "rgba(255,200,150,0.45)";
  ctx.beginPath();
  ctx.moveTo(meio.x, meio.y);
  ctx.lineTo(meio.x + Math.cos(pele) * raio, meio.y - Math.sin(pele) * raio);
  ctx.stroke();
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const alvo of ALVOS_DO_VETORSCOPIO) {
    for (const nivel of [0.75, 1]) {
      const [cb, cr] = posicaoNoVetorscopio(alvo.cor[0] * nivel, alvo.cor[1] * nivel, alvo.cor[2] * nivel);
      const x = meio.x + cb * lado;
      const y = meio.y - cr * lado;
      const meiaCaixa = nivel === 1 ? 3 : 5;
      ctx.strokeStyle = nivel === 1 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.55)";
      ctx.strokeRect(x - meiaCaixa, y - meiaCaixa, meiaCaixa * 2, meiaCaixa * 2);
      if (nivel === 0.75) {
        ctx.fillStyle = ROTULO;
        ctx.fillText(alvo.nome, x + (cb >= 0 ? 14 : -14), y + (cr >= 0 ? -10 : 10));
      }
    }
  }
}

/** A cor de uma casa do vetorscópio, com a luz em 60%. */
function corDoPonto(cb: number, cr: number): [number, number, number] {
  const luz = 0.6;
  const r = luz + 1.5748 * cr;
  const b = luz + 1.8556 * cb;
  const g = (luz - 0.2126 * r - 0.0722 * b) / 0.7152;
  return [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)) as [number, number, number];
}

/** O histograma dos três canais (somados onde se cruzam) e a luz por cima, numa linha. */
function pintarHistograma(ctx: CanvasRenderingContext2D, tela: HTMLCanvasElement, pixels: Pixels) {
  const area = { x: MARGEM, y: MARGEM, largura: tela.width - 2 * MARGEM, altura: tela.height - 2 * MARGEM - 12 };
  if (area.largura < 16 || area.altura < 16) return;
  const h = histogramas(pixels);
  // A escala sai do maior valor fora das pontas: um fundo preto ou estourado não achata o resto
  let maior = 1;
  for (const canal of [h.r, h.g, h.b, h.luma]) for (let nivel = 1; nivel < 255; nivel++) maior = Math.max(maior, canal[nivel]);
  const imagem = ctx.createImageData(area.largura, area.altura);
  for (const canal of ["r", "g", "b"] as const) {
    const cor = CORES[canal];
    for (let x = 0; x < area.largura; x++) {
      const nivel = Math.min(255, Math.floor((x / area.largura) * 256));
      const altura = Math.min(area.altura, Math.round((h[canal][nivel] / maior) * area.altura));
      for (let y = area.altura - altura; y < area.altura; y++) {
        const i = (y * area.largura + x) * 4;
        imagem.data[i] = Math.min(255, imagem.data[i] + cor[0] * 0.6);
        imagem.data[i + 1] = Math.min(255, imagem.data[i + 1] + cor[1] * 0.6);
        imagem.data[i + 2] = Math.min(255, imagem.data[i + 2] + cor[2] * 0.6);
        imagem.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(imagem, area.x, area.y);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  for (let x = 0; x < area.largura; x++) {
    const nivel = Math.min(255, Math.floor((x / area.largura) * 256));
    const y = area.y + area.altura - Math.min(area.altura, (h.luma[nivel] / maior) * area.altura);
    if (x === 0) ctx.moveTo(area.x + x, y);
    else ctx.lineTo(area.x + x, y);
  }
  ctx.stroke();
  // A luz média, embaixo
  let soma = 0;
  let total = 0;
  for (let nivel = 0; nivel < 256; nivel++) {
    soma += nivel * h.luma[nivel];
    total += h.luma[nivel];
  }
  ctx.fillStyle = ROTULO;
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`luz média ${total ? Math.round((soma / total / 255) * 100) : 0}%`, area.x, area.y + area.altura + 2);
}
