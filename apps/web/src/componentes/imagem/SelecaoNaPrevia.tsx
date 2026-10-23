"use client";

// A seleção do documento na prévia (ADR 0003, onda 13.3): as formigas andando na borda e as ferramentas que desenham
// a seleção (letreiros, linha e coluna únicas, os laços e a varinha), como nos editores de imagem. Shift, Alt e os
// dois juntos no começo do arrasto escolhem somar, subtrair e intersectar; durante o arrasto, Shift prende a
// proporção (ou o ângulo de 45°), Alt desenha do centro e o Espaço reposiciona.
import { useEffect, useMemo, useRef, useState } from "react";

import { bordaPerto, caminhoMagnetico, distanciaDasAncoras, type MapaDeBordas } from "@/lib/selecao/magnetico";
import { combinar, difusao, elipse, type ModoDaSelecao, poligono, retangulo, type Selecao, temAlgo } from "@/lib/selecao/mascara";
import type { TamanhoDaAmostra } from "@/lib/selecao/varinha";
import { bordaComoImagem } from "@/lib/selecao/naTela";
import type { Tamanho } from "@/lib/projeto/geometria";

export type FerramentaDeSelecao = "letreiro" | "letreiroEliptico" | "linhaUnica" | "colunaUnica" | "laco" | "lacoPoligonal" | "lacoMagnetico" | "varinha";

export type OpcoesDaSelecao = {
  modo: ModoDaSelecao;
  /** A difusão da seleção nova, em pixels do documento. */
  difusao: number;
  /** A borda suave (suavização de serrilhado). */
  suavizar: boolean;
  /** O estilo dos letreiros: livre, a proporção fixa (largura:altura) ou o tamanho fixo (pixels). */
  estilo: "normal" | "proporcao" | "tamanho";
  largura: number;
  altura: number;
  /** A varinha (e o Aumentar e o Semelhante): tolerância de 0 a 255, contígua, todas as camadas e a amostra. */
  tolerancia: number;
  contigua: boolean;
  todasAsCamadas: boolean;
  amostra: TamanhoDaAmostra;
  /** O laço magnético: a largura em que procura a borda (pixels), o contraste mínimo (0 a 1) e a frequência (0 a 100). */
  larguraDoLaco: number;
  contraste: number;
  frequencia: number;
};

export const OPCOES_DA_SELECAO: OpcoesDaSelecao = {
  modo: "nova",
  difusao: 0,
  suavizar: true,
  estilo: "normal",
  largura: 1,
  altura: 1,
  tolerancia: 32,
  contigua: true,
  todasAsCamadas: false,
  amostra: 1,
  larguraDoLaco: 10,
  contraste: 0.1,
  frequencia: 57,
};

type Ponto = { x: number; y: number };

/** As formigas: a borda da seleção numa imagem do tamanho da prévia, usada como máscara de listras que andam. */
export function FormigasDaSelecao({ selecao, quadro }: { selecao: Selecao | null; quadro: Tamanho }) {
  const imagem = useMemo(() => (selecao && temAlgo(selecao) ? bordaComoImagem(selecao, quadro.largura, quadro.altura) : null), [selecao, quadro.largura, quadro.altura]);
  if (!imagem) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        background: "repeating-linear-gradient(45deg, #000 0 3px, #fff 3px 6px)",
        backgroundSize: "8.49px 8.49px",
        animation: "to-formigas 0.8s linear infinite",
        maskImage: `url(${imagem})`,
        maskSize: "100% 100%",
        WebkitMaskImage: `url(${imagem})`,
        WebkitMaskSize: "100% 100%",
      }}
      aria-hidden
    />
  );
}

/** O ponto preso a ângulos de 45° em volta de `de` (o laço poligonal com Shift). */
function em45(de: Ponto, ponto: Ponto): Ponto {
  const dx = ponto.x - de.x;
  const dy = ponto.y - de.y;
  const angulo = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const distancia = Math.hypot(dx, dy);
  return { x: de.x + Math.cos(angulo) * distancia, y: de.y + Math.sin(angulo) * distancia };
}

export function SelecaoNaPrevia({
  ferramenta,
  selecao,
  quadro,
  documento,
  opcoes,
  aoSelecionar,
  mao = false,
  bordas = null,
  aoVarinha,
}: {
  ferramenta: FerramentaDeSelecao;
  selecao: Selecao | null;
  quadro: Tamanho;
  documento: Tamanho;
  opcoes: OpcoesDaSelecao;
  aoSelecionar: (selecao: Selecao | null) => void;
  /** A Mão (o Espaço) por cima: o desenho em andamento continua, mas um clique novo não começa outro. */
  mao?: boolean;
  /** As bordas da imagem para o laço magnético (null enquanto o editor lê a imagem). */
  bordas?: MapaDeBordas | null;
  /** O clique da varinha, em pixels do documento, com o modo: o editor lê a imagem e seleciona. */
  aoVarinha?: (ponto: Ponto, modo: ModoDaSelecao) => void;
}) {
  const escala = documento.largura / Math.max(1, quadro.largura);
  // O arrasto dos letreiros (em pixels do documento) e o laço em andamento
  const [arrasto, setArrasto] = useState<{ inicio: Ponto; fim: Ponto; modo: ModoDaSelecao; porShift: boolean; porAlt: boolean; restringir: boolean; doCentro: boolean } | null>(null);
  const [laco, setLaco] = useState<{ pontos: Ponto[]; modo: ModoDaSelecao; cursor: Ponto | null } | null>(null);
  const espaco = useRef<{ preso: boolean; ultimo: Ponto | null }>({ preso: false, ultimo: null });
  // O laço magnético: o caminho já preso (pixels inteiros do documento), onde estão as âncoras nele e o trecho vivo
  const [ima, setIma] = useState<{ modo: ModoDaSelecao; pontos: Ponto[]; ancoras: number[]; vivo: Ponto[] } | null>(null);

  const paraDocumento = (evento: { clientX: number; clientY: number }, elemento: Element): Ponto => {
    const r = elemento.getBoundingClientRect();
    return { x: (evento.clientX - r.left) * escala, y: (evento.clientY - r.top) * escala };
  };
  const modoDoEvento = (evento: { shiftKey: boolean; altKey: boolean }): ModoDaSelecao => (evento.shiftKey && evento.altKey ? "intersectar" : evento.shiftKey ? "somar" : evento.altKey ? "subtrair" : opcoes.modo);

  /** A seleção nova (já com a difusão) junto da de antes, no modo. */
  const aplicar = (nova: Selecao, modo: ModoDaSelecao) => {
    const resultado = combinar(selecao, opcoes.difusao > 0 ? difusao(nova, opcoes.difusao / 2) : nova, modo);
    aoSelecionar(resultado && temAlgo(resultado) ? resultado : null);
  };

  /** O retângulo do arrasto, com a proporção fixa, o tamanho fixo, Shift (quadrado) e Alt (do centro). */
  const retanguloDoArrasto = (a: NonNullable<typeof arrasto>) => {
    let largura = a.fim.x - a.inicio.x;
    let altura = a.fim.y - a.inicio.y;
    if (opcoes.estilo === "tamanho") return { x: a.fim.x - opcoes.largura / 2, y: a.fim.y - opcoes.altura / 2, largura: opcoes.largura, altura: opcoes.altura };
    const proporcao = opcoes.estilo === "proporcao" ? opcoes.largura / Math.max(1e-6, opcoes.altura) : a.restringir ? 1 : null;
    if (proporcao) {
      const lado = Math.max(Math.abs(largura), Math.abs(altura) * proporcao);
      largura = Math.sign(largura || 1) * lado;
      altura = (Math.sign(altura || 1) * lado) / proporcao;
    }
    if (a.doCentro) return { x: a.inicio.x - Math.abs(largura), y: a.inicio.y - Math.abs(altura), largura: Math.abs(largura) * 2, altura: Math.abs(altura) * 2 };
    return { x: Math.min(a.inicio.x, a.inicio.x + largura), y: Math.min(a.inicio.y, a.inicio.y + altura), largura: Math.abs(largura), altura: Math.abs(altura) };
  };

  /** O laço magnético fecha: o trecho vivo entra e um último trecho magnético volta ao primeiro ponto. */
  const fecharIma = (atual: NonNullable<typeof ima>) => {
    setIma(null);
    if (!bordas) return;
    const pontos = [...atual.pontos, ...atual.vivo.slice(1)];
    const volta = caminhoMagnetico(bordas, pontos[pontos.length - 1], pontos[0], Math.max(15, opcoes.larguraDoLaco), opcoes.contraste);
    const todos = [...pontos, ...volta.slice(1)].map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));
    if (todos.length >= 3) aplicar(poligono(documento.largura, documento.altura, todos, opcoes.suavizar), atual.modo);
  };
  /** O trecho vivo até a borda perto do ponteiro; passando da distância da frequência, uma âncora entra sozinha. */
  const andarIma = (atual: NonNullable<typeof ima>, ponteiro: Ponto): NonNullable<typeof ima> => {
    if (!bordas) return atual;
    const margem = Math.max(15, opcoes.larguraDoLaco);
    const alvo = bordaPerto(bordas, ponteiro, Math.round(opcoes.larguraDoLaco), opcoes.contraste);
    let { pontos, ancoras } = atual;
    let vivo = caminhoMagnetico(bordas, pontos[pontos.length - 1], alvo, margem, opcoes.contraste);
    const limite = distanciaDasAncoras(opcoes.frequencia);
    let andado = 0;
    for (let i = 1; i < vivo.length; i++) {
      andado += Math.hypot(vivo[i].x - vivo[i - 1].x, vivo[i].y - vivo[i - 1].y);
      if (andado < limite) continue;
      pontos = [...pontos, ...vivo.slice(1, i + 1)];
      ancoras = [...ancoras, pontos.length - 1];
      vivo = caminhoMagnetico(bordas, pontos[pontos.length - 1], alvo, margem, opcoes.contraste);
      break;
    }
    return { ...atual, pontos, ancoras, vivo };
  };

  // As teclas dos laços e do arrasto: Enter fecha, Backspace tira o último ponto, Esc cancela, Espaço move
  useEffect(() => {
    const descer = (evento: KeyboardEvent) => {
      if (evento.key === " ") espaco.current.preso = true;
      if (ima && ferramenta === "lacoMagnetico") {
        if (evento.key === "Enter") {
          evento.preventDefault();
          fecharIma(ima);
        } else if (evento.key === "Backspace") {
          evento.preventDefault();
          // A última âncora sai e o caminho volta à de antes; sem âncora, o laço acaba
          if (ima.ancoras.length <= 1) setIma(null);
          else {
            const ancoras = ima.ancoras.slice(0, -1);
            setIma({ ...ima, ancoras, pontos: ima.pontos.slice(0, ancoras[ancoras.length - 1] + 1), vivo: [] });
          }
        }
      }
      if (laco && ferramenta === "lacoPoligonal") {
        if (evento.key === "Enter") {
          evento.preventDefault();
          if (laco.pontos.length >= 3) aplicar(poligono(documento.largura, documento.altura, laco.pontos, opcoes.suavizar), laco.modo);
          setLaco(null);
        } else if (evento.key === "Backspace") {
          evento.preventDefault();
          setLaco({ ...laco, pontos: laco.pontos.slice(0, -1) });
        }
      }
      if (evento.key === "Escape" && (laco || arrasto || ima)) {
        evento.preventDefault();
        evento.stopPropagation();
        setLaco(null);
        setArrasto(null);
        setIma(null);
      }
    };
    const subir = (evento: KeyboardEvent) => {
      if (evento.key === " ") {
        espaco.current.preso = false;
        espaco.current.ultimo = null;
      }
    };
    window.addEventListener("keydown", descer, true);
    window.addEventListener("keyup", subir);
    return () => {
      window.removeEventListener("keydown", descer, true);
      window.removeEventListener("keyup", subir);
    };
  });

  function aoApertar(evento: React.PointerEvent<HTMLDivElement>) {
    if (evento.button !== 0) return;
    evento.stopPropagation();
    const ponto = paraDocumento(evento, evento.currentTarget);
    const modo = modoDoEvento(evento);
    if (ferramenta === "varinha") {
      aoVarinha?.(ponto, modo);
      return;
    }
    if (ferramenta === "lacoMagnetico") {
      if (!bordas) return;
      if (!ima) {
        const inicio = bordaPerto(bordas, ponto, Math.round(opcoes.larguraDoLaco), opcoes.contraste);
        setIma({ modo, pontos: [inicio], ancoras: [0], vivo: [] });
        return;
      }
      const primeiro = ima.pontos[0];
      // Perto do primeiro ponto (6 px da tela) ou com dois cliques: fecha
      if ((Math.hypot(ponto.x - primeiro.x, ponto.y - primeiro.y) <= 6 * escala && ima.pontos.length > 3) || evento.detail >= 2) {
        fecharIma(ima);
        return;
      }
      const andado = andarIma(ima, ponto);
      const pontos = [...andado.pontos, ...andado.vivo.slice(1)];
      setIma({ ...andado, pontos, ancoras: [...andado.ancoras, pontos.length - 1], vivo: [] });
      return;
    }
    if (ferramenta === "linhaUnica" || ferramenta === "colunaUnica") {
      const r = ferramenta === "linhaUnica" ? { x: 0, y: Math.floor(ponto.y), largura: documento.largura, altura: 1 } : { x: Math.floor(ponto.x), y: 0, largura: 1, altura: documento.altura };
      aplicar(retangulo(documento.largura, documento.altura, r, false), modo);
      return;
    }
    if (ferramenta === "lacoPoligonal") {
      if (!laco) {
        setLaco({ pontos: [ponto], modo, cursor: ponto });
        return;
      }
      const primeiro = laco.pontos[0];
      // Perto do primeiro ponto (6 px da tela) ou com dois cliques: fecha
      const fechar = Math.hypot(ponto.x - primeiro.x, ponto.y - primeiro.y) <= 6 * escala || evento.detail >= 2;
      if (fechar && laco.pontos.length >= 3) {
        aplicar(poligono(documento.largura, documento.altura, laco.pontos, opcoes.suavizar), laco.modo);
        setLaco(null);
        return;
      }
      const ultimo = laco.pontos[laco.pontos.length - 1];
      setLaco({ ...laco, pontos: [...laco.pontos, evento.shiftKey ? em45(ultimo, ponto) : ponto] });
      return;
    }
    evento.currentTarget.setPointerCapture(evento.pointerId);
    if (ferramenta === "laco") {
      setLaco({ pontos: [ponto], modo, cursor: null });
      return;
    }
    setArrasto({ inicio: ponto, fim: ponto, modo, porShift: evento.shiftKey, porAlt: evento.altKey, restringir: false, doCentro: false });
  }

  function aoMover(evento: React.PointerEvent<HTMLDivElement>) {
    const ponto = paraDocumento(evento, evento.currentTarget);
    if (arrasto) {
      // Espaço: o retângulo inteiro anda com o mouse
      if (espaco.current.preso) {
        const ultimo = espaco.current.ultimo ?? ponto;
        const dx = ponto.x - ultimo.x;
        const dy = ponto.y - ultimo.y;
        espaco.current.ultimo = ponto;
        setArrasto({ ...arrasto, inicio: { x: arrasto.inicio.x + dx, y: arrasto.inicio.y + dy }, fim: ponto });
        return;
      }
      setArrasto({ ...arrasto, fim: ponto, restringir: evento.shiftKey && !arrasto.porShift, doCentro: evento.altKey && !arrasto.porAlt });
      return;
    }
    if (laco && ferramenta === "laco") {
      const ultimo = laco.pontos[laco.pontos.length - 1];
      if (Math.hypot(ponto.x - ultimo.x, ponto.y - ultimo.y) >= escala) setLaco({ ...laco, pontos: [...laco.pontos, ponto] });
      return;
    }
    if (laco && ferramenta === "lacoPoligonal") setLaco({ ...laco, cursor: evento.shiftKey ? em45(laco.pontos[laco.pontos.length - 1], ponto) : ponto });
    if (ima && ferramenta === "lacoMagnetico") setIma(andarIma(ima, ponto));
  }

  function aoSoltar(evento: React.PointerEvent<HTMLDivElement>) {
    if (arrasto) {
      const r = retanguloDoArrasto(arrasto);
      setArrasto(null);
      // Um clique sem arrastar (no modo nova) desmarca, como lá
      if (opcoes.estilo !== "tamanho" && (r.largura < 2 * escala || r.altura < 2 * escala)) {
        if (arrasto.modo === "nova") aoSelecionar(null);
        return;
      }
      const forma = ferramenta === "letreiroEliptico" ? elipse : retangulo;
      aplicar(forma(documento.largura, documento.altura, r, opcoes.suavizar), arrasto.modo);
      return;
    }
    if (laco && ferramenta === "laco") {
      const pontos = [...laco.pontos, paraDocumento(evento, evento.currentTarget)];
      setLaco(null);
      if (pontos.length < 3) {
        if (laco.modo === "nova") aoSelecionar(null);
        return;
      }
      aplicar(poligono(documento.largura, documento.altura, pontos, opcoes.suavizar), laco.modo);
    }
  }

  // O desenho em andamento, em pixels da prévia
  const naTela = (p: Ponto) => `${p.x / escala},${p.y / escala}`;
  let desenho: React.ReactNode = null;
  if (arrasto) {
    const r = retanguloDoArrasto(arrasto);
    const props = { fill: "none", stroke: "#fff", strokeWidth: 1, strokeDasharray: "4 3", vectorEffect: "non-scaling-stroke" as const };
    desenho =
      ferramenta === "letreiroEliptico" ? (
        <ellipse cx={(r.x + r.largura / 2) / escala} cy={(r.y + r.altura / 2) / escala} rx={r.largura / 2 / escala} ry={r.altura / 2 / escala} {...props} />
      ) : (
        <rect x={r.x / escala} y={r.y / escala} width={r.largura / escala} height={r.altura / escala} {...props} />
      );
  } else if (laco) {
    const pontos = laco.cursor ? [...laco.pontos, laco.cursor] : laco.pontos;
    desenho = <polyline points={pontos.map(naTela).join(" ")} fill="none" stroke="#fff" strokeWidth={1} strokeDasharray="4 3" />;
  } else if (ima) {
    const meio = (p: Ponto) => naTela({ x: p.x + 0.5, y: p.y + 0.5 });
    desenho = (
      <>
        <polyline points={[...ima.pontos, ...ima.vivo.slice(1)].map(meio).join(" ")} fill="none" stroke="#fff" strokeWidth={1} />
        {ima.ancoras.map((indice) => {
          const p = ima.pontos[indice];
          return <rect key={indice} x={(p.x + 0.5) / escala - 2.5} y={(p.y + 0.5) / escala - 2.5} width={5} height={5} fill="#fff" stroke="#000" strokeWidth={1} />;
        })}
      </>
    );
  }
  const ocupado = Boolean(arrasto || laco || ima);
  return (
    <div className={`absolute inset-0 touch-none ${mao && !ocupado ? "pointer-events-none" : ""}`} style={{ cursor: "crosshair" }} onPointerDown={aoApertar} onPointerMove={aoMover} onPointerUp={aoSoltar} aria-label="Área da seleção">
      {ferramenta === "lacoMagnetico" && !bordas ? <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[11px] text-white">Lendo as bordas da imagem…</span> : null}
      {desenho ? (
        <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
          <g style={{ filter: "drop-shadow(0 0 1px #000)" }}>{desenho}</g>
        </svg>
      ) : null}
    </div>
  );
}
