"use client";

// A caixa da transformação livre na prévia (ADR 0003, ondas 13.3 e 13.6), em pixels do documento: arrastar dentro move,
// os cantos e os meios dos lados mudam o tamanho (Shift na proporção, Alt a partir do centro), fora dos cantos gira
// (Shift de 15 em 15°), e Ctrl num canto distorce. Os modos Inclinar, Distorcer, Perspectiva e Deformar mudam o que
// as alças fazem, como nos editores de imagem. Por baixo, a prévia do conteúdo pelo mesmo mapa da transformação final.
import { useEffect, useMemo, useRef, useState } from "react";

import type { Tamanho } from "@/lib/projeto/geometria";
import { cantosDaMalha, colunasDa, dividirMalha, inversaDoMapa, linhasDa, type Malha, malhaDoQuad, mapaDaMalha, moverPontoDaMalha } from "@/lib/transformar/deformar";
import { reamostrar, reamostrarPeloMapa } from "@/lib/transformar/livre";
import { homografia, type Ponto, type Quadrilatero } from "@/lib/transformar/malha";

export type ModoDaTransformacao = "livre" | "escala" | "girar" | "inclinar" | "distorcer" | "perspectiva" | "deformar";
export type EstadoDaTransformacao = { quad: Quadrilatero; malha: Malha | null };
/** O Deformar dividindo a malha: o próximo clique na caixa põe a divisão ali. */
export type DivisaoDaMalha = "cruz" | "vertical" | "horizontal";

/** O mapa do estado: a malha, quando deformada, senão a homografia dos cantos. */
export function mapaDoEstado(estado: EstadoDaTransformacao) {
  return estado.malha ? mapaDaMalha(estado.malha) : homografia(estado.quad);
}

const soma = (a: Ponto, b: Ponto): Ponto => ({ x: a.x + b.x, y: a.y + b.y });
const menos = (a: Ponto, b: Ponto): Ponto => ({ x: a.x - b.x, y: a.y - b.y });
const vezes = (a: Ponto, k: number): Ponto => ({ x: a.x * k, y: a.y * k });
const meio = (a: Ponto, b: Ponto): Ponto => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const centroDe = (q: Quadrilatero): Ponto => ({ x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 });
function girar(p: Ponto, centro: Ponto, angulo: number): Ponto {
  const cos = Math.cos(angulo);
  const sen = Math.sin(angulo);
  const d = menos(p, centro);
  return { x: centro.x + d.x * cos - d.y * sen, y: centro.y + d.x * sen + d.y * cos };
}
/** As coordenadas de `p` na base (U, V). */
function naBase(p: Ponto, u: Ponto, v: Ponto): [number, number] {
  const det = u.x * v.y - u.y * v.x || 1e-9;
  return [(p.x * v.y - p.y * v.x) / det, (u.x * p.y - u.y * p.x) / det];
}

type Alca = { tipo: "canto"; i: number } | { tipo: "lado"; i: number } | { tipo: "girar" } | { tipo: "mover" } | { tipo: "malha"; i: number };

/**
 * O canto `i` (ou o lado `i`, entre o canto i e o i+1) arrastado no modo livre: o quadrilátero, tratado como um
 * paralelogramo pelas bordas dele, muda de tamanho a partir do canto (ou do lado) oposto, ou do centro com Alt.
 */
function escalar(inicial: Quadrilatero, alca: { tipo: "canto" | "lado"; i: number }, desloc: Ponto, proporcional: boolean, doCentro: boolean): Quadrilatero {
  const [q0, , , q3] = inicial;
  const u = menos(inicial[1], q0);
  const v = menos(q3, q0);
  const [du, dv] = naBase(desloc, u, v);
  // Quanto cada borda cresce (em frações dela), pelo lado que a alça puxa
  const lados = alca.tipo === "canto" ? [[-1, -1], [1, -1], [1, 1], [-1, 1]][alca.i] : [[0, -1], [1, 0], [0, 1], [-1, 0]][alca.i];
  let su = 1 + lados[0] * du * (doCentro ? 2 : 1);
  let sv = 1 + lados[1] * dv * (doCentro ? 2 : 1);
  if (lados[0] === 0) su = proporcional ? sv : 1;
  if (lados[1] === 0) sv = proporcional ? su : 1;
  if (proporcional && lados[0] !== 0 && lados[1] !== 0) {
    const media = (Math.abs(su) + Math.abs(sv)) / 2;
    su = Math.sign(su || 1) * media;
    sv = Math.sign(sv || 1) * media;
  }
  // O ponto fixo: o centro, ou o canto ou lado oposto
  const fixoUV: [number, number] = doCentro ? [0.5, 0.5] : [lados[0] === 1 ? 0 : lados[0] === -1 ? 1 : 0.5, lados[1] === 1 ? 0 : lados[1] === -1 ? 1 : 0.5];
  const emUV = (a: number, b: number) => soma(q0, soma(vezes(u, a), vezes(v, b)));
  const fixo = emUV(...fixoUV);
  return ([[0, 0], [1, 0], [1, 1], [0, 1]] as const).map(([a, b]) => soma(fixo, soma(vezes(u, (a - fixoUV[0]) * su), vezes(v, (b - fixoUV[1]) * sv)))) as Quadrilatero;
}

export function TransformacaoNaPrevia({
  estado,
  modo,
  quadro,
  documento,
  origem,
  referencia = null,
  opaco = false,
  dividindo = null,
  aoDividir,
  aoMudar,
  aoConfirmar,
}: {
  estado: EstadoDaTransformacao;
  modo: ModoDaTransformacao;
  quadro: Tamanho;
  documento: Tamanho;
  /** O conteúdo que vai junto (a seleção em branco, a camada), já pequeno para a tela. */
  origem: { imagem: CanvasImageSource; largura: number; altura: number } | null;
  /** O ponto de referência (pixels do documento): o giro é em volta dele. */
  referencia?: Ponto | null;
  /** A camada aparece inteira (a seleção, meio transparente). */
  opaco?: boolean;
  /** Deformar: a divisão que o próximo clique põe na malha. */
  dividindo?: DivisaoDaMalha | null;
  aoDividir?: (malha: Malha) => void;
  aoMudar: (estado: EstadoDaTransformacao) => void;
  aoConfirmar: () => void;
}) {
  const escala = quadro.largura / Math.max(1, documento.largura);
  const naTela = (p: Ponto): Ponto => ({ x: p.x * escala, y: p.y * escala });
  const arrasto = useRef<{ alca: Alca; inicio: Ponto; estado: EstadoDaTransformacao; anguloInicial: number } | null>(null);
  const [cursor, setCursor] = useState("move");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Os pixels da origem, lidos uma vez
  const pixelsDaOrigem = useMemo(() => {
    if (!origem) return null;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(origem.largura));
    canvas.height = Math.max(1, Math.round(origem.altura));
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(origem.imagem, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { dados: pixels.data, largura: pixels.width, altura: pixels.height };
  }, [origem]);

  // A prévia do conteúdo transformado, na resolução da tela, pela mesma reamostragem do resultado (sem emendas)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(1, Math.round(quadro.largura));
    canvas.height = Math.max(1, Math.round(quadro.altura));
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!pixelsDaOrigem) return;
    const mapa = mapaDoEstado(estado);
    const tela = { largura: canvas.width, altura: canvas.height };
    const pixels = estado.malha ? reamostrarPeloMapa(pixelsDaOrigem, (u, v) => naTela(mapa(u, v)), tela, "bilinear", 24) : reamostrar(pixelsDaOrigem, estado.quad.map(naTela) as Quadrilatero, tela, "bilinear");
    ctx.putImageData(new ImageData(pixels, tela.largura, tela.altura), 0, 0);
  });

  const paraDocumento = (evento: { clientX: number; clientY: number }, elemento: Element): Ponto => {
    const r = elemento.getBoundingClientRect();
    return { x: (evento.clientX - r.left) / escala, y: (evento.clientY - r.top) / escala };
  };
  /** A alça sob o ponto (em pixels da tela: 6 px de folga), ou mover dentro e girar fora. */
  const alcaEm = (p: Ponto): Alca => {
    const perto = (a: Ponto) => Math.hypot((a.x - p.x) * escala, (a.y - p.y) * escala) <= 7;
    if (modo === "deformar") {
      const malha = estado.malha ?? malhaDoQuad(estado.quad);
      const i = malha.pontos.findIndex(perto);
      if (i >= 0) return { tipo: "malha", i };
    }
    const canto = estado.quad.findIndex(perto);
    // No modo Girar, as alças giram
    if (canto >= 0) return modo === "girar" ? { tipo: "girar" } : { tipo: "canto", i: canto };
    if (modo !== "deformar") {
      const lado = [0, 1, 2, 3].findIndex((i) => perto(meio(estado.quad[i], estado.quad[(i + 1) % 4])));
      if (lado >= 0) return { tipo: "lado", i: lado };
    }
    // Dentro do quadrilátero (pela regra par-ímpar) move; fora gira
    let dentro = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const a = estado.quad[i];
      const b = estado.quad[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
    }
    if (modo === "girar") return dentro ? { tipo: "mover" } : { tipo: "girar" };
    return dentro ? { tipo: "mover" } : modo === "livre" ? { tipo: "girar" } : { tipo: "mover" };
  };

  function aoApertar(evento: React.PointerEvent<HTMLDivElement>) {
    if (evento.button !== 0) return;
    evento.stopPropagation();
    if (evento.detail >= 2) {
      aoConfirmar();
      return;
    }
    evento.currentTarget.setPointerCapture(evento.pointerId);
    const p = paraDocumento(evento, evento.currentTarget);
    // Dividindo a malha: a divisão vai para o ponto da imagem debaixo do clique
    if (modo === "deformar" && dividindo && aoDividir) {
      const malha = estado.malha ?? malhaDoQuad(estado.quad);
      const { u, v } = inversaDoMapa(mapaDaMalha(malha), p);
      aoDividir(dividirMalha(malha, dividindo === "horizontal" ? null : u, dividindo === "vertical" ? null : v));
      return;
    }
    const centro = referencia ?? centroDe(estado.quad);
    arrasto.current = { alca: alcaEm(p), inicio: p, estado, anguloInicial: Math.atan2(p.y - centro.y, p.x - centro.x) };
  }

  function aoMover(evento: React.PointerEvent<HTMLDivElement>) {
    const p = paraDocumento(evento, evento.currentTarget);
    const a = arrasto.current;
    if (!a) {
      const alca = alcaEm(p);
      setCursor(alca.tipo === "mover" ? "move" : alca.tipo === "girar" ? "alias" : "crosshair");
      return;
    }
    const d = menos(p, a.inicio);
    const q = a.estado.quad;
    const novo = (quad: Quadrilatero, malha: Malha | null = null) => aoMudar({ quad, malha });
    const naMalha = (f: (ponto: Ponto) => Ponto) => (a.estado.malha ? { ...a.estado.malha, pontos: a.estado.malha.pontos.map(f) } : null);
    // Mover o quadrilátero (e a malha, se houver) inteiro
    if (a.alca.tipo === "mover") {
      novo(q.map((ponto) => soma(ponto, d)) as Quadrilatero, naMalha((ponto) => soma(ponto, d)));
      return;
    }
    if (a.alca.tipo === "malha") {
      const malha = moverPontoDaMalha(a.estado.malha ?? malhaDoQuad(q), a.alca.i, d);
      // Os cantos da malha são os do quadrilátero
      const quad = cantosDaMalha(malha).map((i) => malha.pontos[i]) as Quadrilatero;
      novo(quad, malha);
      return;
    }
    if (a.alca.tipo === "girar") {
      const centro = referencia ?? centroDe(q);
      let angulo = Math.atan2(p.y - centro.y, p.x - centro.x) - a.anguloInicial;
      if (evento.shiftKey) angulo = Math.round(angulo / (Math.PI / 12)) * (Math.PI / 12);
      novo(q.map((ponto) => girar(ponto, centro, angulo)) as Quadrilatero, naMalha((ponto) => girar(ponto, centro, angulo)));
      return;
    }
    const comCtrl = evento.ctrlKey || evento.metaKey;
    const quad = [...q] as Quadrilatero;
    if (a.alca.tipo === "canto" && (modo === "distorcer" || (modo === "livre" && comCtrl))) {
      quad[a.alca.i] = soma(q[a.alca.i], d);
      novo(quad);
    } else if (a.alca.tipo === "canto" && modo === "perspectiva") {
      // O canto anda pela direção do arrasto, e o outro canto do lado nessa direção anda ao contrário (o lado de cima
      // encolhe dos dois lados, como lá)
      const i = a.alca.i;
      const horizontal = Math.abs(d.x) >= Math.abs(d.y);
      const vizinho = horizontal ? [1, 0, 3, 2][i] : [3, 2, 1, 0][i];
      const passo = horizontal ? { x: d.x, y: 0 } : { x: 0, y: d.y };
      quad[i] = soma(q[i], passo);
      quad[vizinho] = menos(q[vizinho], passo);
      novo(quad);
    } else if (a.alca.tipo === "lado" && (modo === "inclinar" || (modo === "livre" && comCtrl))) {
      // O lado anda na direção dele: os dois cantos juntos
      const i = a.alca.i;
      const j = (i + 1) % 4;
      const direcao = menos(q[j], q[i]);
      const comprimento = Math.hypot(direcao.x, direcao.y) || 1;
      const ao = ((d.x * direcao.x + d.y * direcao.y) / comprimento) / comprimento;
      quad[i] = soma(q[i], vezes(direcao, ao));
      quad[j] = soma(q[j], vezes(direcao, ao));
      novo(quad);
    } else if (a.alca.tipo === "canto" || a.alca.tipo === "lado") {
      novo(escalar(q, a.alca, d, evento.shiftKey, evento.altKey));
    }
  }

  function aoSoltar() {
    arrasto.current = null;
  }

  // O contorno: as bordas da malha (curvas) ou do quadrilátero
  const mapa = mapaDoEstado(estado);
  const borda: Ponto[] = [];
  const passos = estado.malha ? 24 : 1;
  for (let k = 0; k < passos; k++) borda.push(naTela(mapa(k / passos, 0)));
  for (let k = 0; k < passos; k++) borda.push(naTela(mapa(1, k / passos)));
  for (let k = 0; k < passos; k++) borda.push(naTela(mapa(1 - k / passos, 1)));
  for (let k = 0; k < passos; k++) borda.push(naTela(mapa(0, 1 - k / passos)));
  // No Deformar: as divisões (cheias) e os terços de cada retalho (as linhas da grade)
  const linhasDaMalha: { pontos: Ponto[]; divisao: boolean }[] = [];
  const malhaNaTela = modo === "deformar" ? (estado.malha ?? malhaDoQuad(estado.quad)) : null;
  if (malhaNaTela) {
    const linhas = (cortes: number[]) => cortes.slice(0, -1).flatMap((c, k) => [c, c + (cortes[k + 1] - c) / 3, c + ((cortes[k + 1] - c) * 2) / 3].map((t, i) => ({ t, divisao: i === 0 && k > 0 }))).filter(({ t }) => t > 0);
    for (const { t, divisao } of linhas(malhaNaTela.cortesV)) linhasDaMalha.push({ pontos: Array.from({ length: 25 }, (_, k) => naTela(mapa(k / 24, t))), divisao });
    for (const { t, divisao } of linhas(malhaNaTela.cortesU)) linhasDaMalha.push({ pontos: Array.from({ length: 25 }, (_, k) => naTela(mapa(t, k / 24))), divisao });
  }
  const alcas: Ponto[] = malhaNaTela ? malhaNaTela.pontos.map(naTela) : [...estado.quad.map(naTela), ...[0, 1, 2, 3].map((i) => naTela(meio(estado.quad[i], estado.quad[(i + 1) % 4])))];
  // As de ancoragem (cantos dos retalhos) são quadradas; as alças, redondas
  const ancoragem = (i: number) => !malhaNaTela || ((i % colunasDa(malhaNaTela)) % 3 === 0 && Math.floor(i / colunasDa(malhaNaTela)) % 3 === 0 && linhasDa(malhaNaTela) > 0);
  const pontosSvg = (lista: Ponto[]) => lista.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <div className="absolute inset-0 z-30 touch-none" style={{ cursor: dividindo && modo === "deformar" ? "crosshair" : cursor }} onPointerDown={aoApertar} onPointerMove={aoMover} onPointerUp={aoSoltar} aria-label="Transformação">
      <canvas ref={canvasRef} className={`pointer-events-none absolute inset-0 size-full ${opaco ? "" : "opacity-40"}`} aria-hidden />
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        <polygon points={pontosSvg(borda)} fill="none" stroke="#000" strokeWidth={2} strokeOpacity={0.5} />
        <polygon points={pontosSvg(borda)} fill="none" stroke="#fff" strokeWidth={1} />
        {linhasDaMalha.map((linha, i) => (
          <polyline key={i} points={pontosSvg(linha.pontos)} fill="none" stroke="#fff" strokeWidth={linha.divisao ? 1.5 : 1} strokeOpacity={linha.divisao ? 1 : 0.6} />
        ))}
        {alcas.map((p, i) =>
          ancoragem(i) ? <rect key={i} x={p.x - 3.5} y={p.y - 3.5} width={7} height={7} fill="#fff" stroke="#000" strokeWidth={1} /> : <circle key={i} cx={p.x} cy={p.y} r={3} fill="#fff" stroke="#000" strokeWidth={1} />,
        )}
        {referencia ? (
          <g transform={`translate(${naTela(referencia).x} ${naTela(referencia).y})`}>
            <circle r={5} fill="none" stroke="#000" strokeWidth={2} strokeOpacity={0.5} />
            <circle r={5} fill="none" stroke="#fff" strokeWidth={1} />
            <path d="M -8 0 H 8 M 0 -8 V 8" stroke="#fff" strokeWidth={1} />
          </g>
        ) : null}
      </svg>
    </div>
  );
}
