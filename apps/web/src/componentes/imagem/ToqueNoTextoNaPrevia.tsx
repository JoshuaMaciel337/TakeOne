"use client";

// A ferramenta Toque no texto (ADR 0003, onda 13.16): o clique numa letra de uma camada de texto escolhe a letra, e a
// caixa dela move (o deslocamento para o lado, sem empurrar as seguintes, e a linha de base), muda o tamanho pelos cantos
// (a escala, em volta do meio da letra) e gira pela alça de cima (Shift de 15°). A letra continua texto: o estilo dela
// guarda o giro, o deslocamento, a linha de base e as escalas, e a edição na tela continua valendo.
import { useRef, useState } from "react";

import type { Caixa } from "@/lib/projeto/geometria";
import type { Virar } from "@/lib/projeto/modelo";
import { cantosDoGlifo, type Disposicao, disporTexto, type GlifoPosto } from "@/lib/texto/layout";
import { fonteDoEstilo, useVersaoDasFontes } from "@/lib/texto/fontes";
import { aplicarEstilo, type EstiloDoCaractere, estiloNoIndice, type TextoRico } from "@/lib/texto/modelo";
import { contasDaCaixa, textoMedido } from "./EdicaoDeTextoNaPrevia";
import { pontoNoElemento } from "./pontoNaVista";

export type TextoTocavel = { clipeId: string; texto: TextoRico; caixa: Caixa; virar?: Virar | null };
type Ponto = { x: number; y: number };

type Props = {
  /** As camadas de texto à vista, da de cima para a de baixo. */
  textos: TextoTocavel[];
  /** O texto com a letra mudada (final: ao soltar, um passo do desfazer). */
  aoMudar: (clipeId: string, texto: TextoRico, final: boolean) => void;
  /** A camada da letra escolhida passa a ser a escolhida. */
  aoSelecionarCamada: (clipeId: string) => void;
  aoAviso?: (texto: string) => void;
};

type Letra = { clipeId: string; indice: number };
type Arrasto = {
  modo: "mover" | "escala" | "giro";
  letra: Letra;
  texto: TextoRico;
  contas: ReturnType<typeof contasDaCaixa>;
  /** O ponto do começo e o meio da letra, nas unidades do texto. */
  inicio: Ponto;
  meio: Ponto;
  glifo: GlifoPosto;
  estilo: EstiloDoCaractere;
};

const GRAUS = 180 / Math.PI;

/** O glifo que desenha o caractere (a ligadura cobre mais de um). */
function glifoDaLetra(disposicao: Disposicao, indice: number): GlifoPosto | null {
  return disposicao.glifos.find((g) => indice >= g.indice && indice < g.indice + Math.max(1, g.glifo.letras) && g.glifo.caixa.x1 > g.glifo.caixa.x0) ?? null;
}

/** O ponto dentro do quadrilátero (convexo, em qualquer sentido). */
function dentro(cantos: Ponto[], p: Ponto): boolean {
  let sinal = 0;
  for (let i = 0; i < cantos.length; i++) {
    const a = cantos[i];
    const b = cantos[(i + 1) % cantos.length];
    const lado = Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    if (!lado) continue;
    if (sinal && lado !== sinal) return false;
    sinal = lado;
  }
  return true;
}

const meioDe = (cantos: Ponto[]) => ({ x: cantos.reduce((s, p) => s + p.x, 0) / cantos.length, y: cantos.reduce((s, p) => s + p.y, 0) / cantos.length });
const arredondar = (valor: number, casas = 10) => Math.round(valor * casas) / casas;
const limitar = (valor: number, min: number, max: number) => Math.min(max, Math.max(min, valor));

export function ToqueNoTextoNaPrevia({ textos, aoMudar, aoSelecionarCamada, aoAviso }: Props) {
  useVersaoDasFontes();
  const [letra, setLetra] = useState<Letra | null>(null);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const ultimo = useRef<TextoRico | null>(null);

  // A letra escolhida na tela: os cantos da caixa dela, a alça de giro e a conta da camada
  const escolhida = (() => {
    if (!letra) return null;
    const alvo = textos.find((t) => t.clipeId === letra.clipeId);
    if (!alvo) return null;
    const disposicao = disporTexto(alvo.texto, fonteDoEstilo);
    const glifo = glifoDaLetra(disposicao, letra.indice);
    if (!glifo) return null;
    const contas = contasDaCaixa(alvo.texto, alvo.caixa, alvo.virar);
    const cantos = cantosDoGlifo(glifo).map((p) => contas.naTela(p.x, p.y));
    const meio = meioDe(cantos);
    // A alça de giro fica 20 pixels acima do meio do lado de cima, na direção que sai do meio da letra
    const topo = { x: (cantos[0].x + cantos[1].x) / 2, y: (cantos[0].y + cantos[1].y) / 2 };
    const distancia = Math.hypot(topo.x - meio.x, topo.y - meio.y) || 1;
    const alca = { x: topo.x + ((topo.x - meio.x) / distancia) * 20, y: topo.y + ((topo.y - meio.y) / distancia) * 20 };
    return { alvo, disposicao, glifo, contas, cantos, meio, topo, alca };
  })();

  function comecar(modo: Arrasto["modo"], escolha: Letra, alvo: TextoTocavel, glifo: GlifoPosto, telaNoInicio: Ponto) {
    const contas = contasDaCaixa(alvo.texto, alvo.caixa, alvo.virar);
    const estilo = { ...alvo.texto.estilo, ...estiloNoIndice(alvo.texto, escolha.indice + 1) } as EstiloDoCaractere;
    setArrasto({ modo, letra: escolha, texto: alvo.texto, contas, inicio: contas.doTexto(telaNoInicio.x, telaNoInicio.y), meio: meioDe(cantosDoGlifo(glifo)), glifo, estilo });
    ultimo.current = null;
  }

  function aoApertar(evento: React.PointerEvent<HTMLDivElement>) {
    if (evento.button !== 0) return;
    evento.stopPropagation();
    const p = pontoNoElemento(evento, evento.currentTarget);
    evento.currentTarget.setPointerCapture(evento.pointerId);
    // Primeiro as alças da letra escolhida
    if (escolhida && letra) {
      if (Math.hypot(p.x - escolhida.alca.x, p.y - escolhida.alca.y) <= 9) return comecar("giro", letra, escolhida.alvo, escolhida.glifo, p);
      if (escolhida.cantos.some((c) => Math.hypot(p.x - c.x, p.y - c.y) <= 7)) return comecar("escala", letra, escolhida.alvo, escolhida.glifo, p);
      if (dentro(escolhida.cantos, p)) return comecar("mover", letra, escolhida.alvo, escolhida.glifo, p);
    }
    // Uma letra de outra camada (a de cima primeiro)
    for (const alvo of textos) {
      const contas = contasDaCaixa(alvo.texto, alvo.caixa, alvo.virar);
      const t = contas.doTexto(p.x, p.y);
      const naCaixa = t.x >= -alvo.texto.origem.x && t.x <= alvo.texto.caixa.largura - alvo.texto.origem.x && t.y >= -alvo.texto.origem.y && t.y <= alvo.texto.caixa.altura - alvo.texto.origem.y;
      if (alvo.texto.deformar || alvo.texto.caminho) {
        if (naCaixa) {
          aoAviso?.("O toque no texto não vale num texto deformado ou num caminho.");
          return;
        }
        continue;
      }
      const folga = 3 / Math.max(1e-6, contas.escala);
      const glifo = [...disporTexto(alvo.texto, fonteDoEstilo).glifos].reverse().find((g) => g.glifo.caixa.x1 > g.glifo.caixa.x0 && dentro(cantosDoGlifo(g, folga), t));
      if (!glifo) continue;
      const escolha = { clipeId: alvo.clipeId, indice: glifo.indice };
      setLetra(escolha);
      aoSelecionarCamada(alvo.clipeId);
      // Clicar e arrastar já move a letra
      comecar("mover", escolha, alvo, glifo, p);
      return;
    }
    setLetra(null);
  }

  function aoMover(evento: React.PointerEvent<HTMLDivElement>) {
    if (!arrasto) return;
    const tela = pontoNoElemento(evento, evento.currentTarget);
    const p = arrasto.contas.doTexto(tela.x, tela.y);
    const { estilo, glifo, meio, inicio } = arrasto;
    let mudanca: Partial<EstiloDoCaractere>;
    if (arrasto.modo === "mover") {
      // Para o lado sem empurrar as seguintes; para cima e para baixo, a linha de base (positiva sobe)
      mudanca = { deslocamento: arredondar((estilo.deslocamento ?? 0) + p.x - inicio.x), linhaDeBase: arredondar(estilo.linhaDeBase - (p.y - inicio.y)) };
    } else if (arrasto.modo === "escala") {
      const s = Math.hypot(p.x - meio.x, p.y - meio.y) / Math.max(1e-6, Math.hypot(inicio.x - meio.x, inicio.y - meio.y));
      const escalaH = arredondar(limitar(estilo.escalaH * s, 0.01, 10), 1000);
      const escalaV = arredondar(limitar(estilo.escalaV * s, 0.01, 10), 1000);
      // A letra cresce a partir da origem dela: o deslocamento e a linha de base devolvem o meio ao lugar
      const caixa = glifo.glifo.caixa;
      const meioX = ((caixa.x0 + caixa.x1) / 2) * glifo.escalaX;
      const meioY = ((caixa.y0 + caixa.y1) / 2) * glifo.escalaY;
      const kx = escalaH / estilo.escalaH - 1;
      const ky = escalaV / estilo.escalaV - 1;
      mudanca = { escalaH, escalaV, deslocamento: arredondar((estilo.deslocamento ?? 0) - meioX * kx), linhaDeBase: arredondar(estilo.linhaDeBase - meioY * ky) };
    } else {
      const delta = (Math.atan2(p.y - meio.y, p.x - meio.x) - Math.atan2(inicio.y - meio.y, inicio.x - meio.x)) * GRAUS;
      let giro = (estilo.giro ?? 0) + delta;
      if (evento.shiftKey) giro = Math.round(giro / 15) * 15;
      giro = ((((giro + 180) % 360) + 360) % 360) - 180;
      mudanca = { giro: arredondar(giro) };
    }
    const fim = arrasto.letra.indice + Math.max(1, arrasto.glifo.glifo.letras);
    const novo = textoMedido(aplicarEstilo(arrasto.texto, arrasto.letra.indice, fim, mudanca));
    ultimo.current = novo;
    aoMudar(arrasto.letra.clipeId, novo, false);
  }

  function aoSoltar() {
    if (arrasto && ultimo.current) aoMudar(arrasto.letra.clipeId, ultimo.current, true);
    ultimo.current = null;
    setArrasto(null);
  }

  const leitura = arrasto && escolhida ? (() => {
    const estilo = { ...escolhida.alvo.texto.estilo, ...estiloNoIndice(escolhida.alvo.texto, letra!.indice + 1) } as EstiloDoCaractere;
    if (arrasto.modo === "giro") return `${arredondar(estilo.giro ?? 0)}°`;
    if (arrasto.modo === "escala") return `${Math.round(estilo.escalaH * 100)}%`;
    return `${arredondar(estilo.deslocamento ?? 0)} px, ${arredondar(estilo.linhaDeBase)} px`;
  })() : null;

  return (
    <div
      className="absolute inset-0 touch-none"
      style={{ cursor: arrasto?.modo === "giro" ? "grabbing" : arrasto ? "move" : "default" }}
      onPointerDown={aoApertar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      data-toque-no-texto
    >
      {escolhida ? (
        <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
          <polygon points={escolhida.cantos.map((c) => `${c.x},${c.y}`).join(" ")} fill="none" stroke="#2f80ff" strokeWidth={1} data-letra-tocada />
          <line x1={escolhida.topo.x} y1={escolhida.topo.y} x2={escolhida.alca.x} y2={escolhida.alca.y} stroke="#2f80ff" strokeWidth={1} />
          <circle cx={escolhida.alca.x} cy={escolhida.alca.y} r={4} fill="#fff" stroke="#2f80ff" strokeWidth={1} data-alca-giro />
          {escolhida.cantos.map((c, i) => (
            <rect key={i} x={c.x - 3.5} y={c.y - 3.5} width={7} height={7} fill="#fff" stroke="#2f80ff" strokeWidth={1} data-alca-escala />
          ))}
        </svg>
      ) : null}
      {leitura && escolhida ? (
        <div className="pointer-events-none absolute rounded bg-black/75 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-white" style={{ left: escolhida.alca.x + 10, top: escolhida.alca.y - 10 }}>
          {leitura}
        </div>
      ) : null}
    </div>
  );
}
