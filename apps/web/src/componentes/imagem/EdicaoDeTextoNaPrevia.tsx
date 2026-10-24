"use client";

// A edição do texto direto na tela (ADR 0003, onda 13.8): um campo de texto escondido recebe o que se digita (com os
// acentos e a composição do teclado), e o cursor e a seleção são desenhados por cima do texto, pela disposição dele e
// pela caixa da camada (com o giro e a escala). O clique põe o cursor; arrastar seleciona; 2, 3, 4 e 5 cliques escolhem
// a palavra, a linha, o parágrafo e tudo; as setas para cima e para baixo, Home e End andam pelas linhas desenhadas.
// Esc ou Ctrl+Enter terminam (e o clique fora da caixa).
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { Caixa } from "@/lib/projeto/geometria";
import type { Virar } from "@/lib/projeto/modelo";
import { type Disposicao, disporTexto } from "@/lib/texto/layout";
import { fonteDoEstilo, useVersaoDasFontes } from "@/lib/texto/fontes";
import { medirTexto } from "@/lib/texto/medida";
import { type EstiloDoCaractere, type EstiloDoParagrafo, estiloComum, substituir, textoCorrido, type TextoRico } from "@/lib/texto/modelo";

export type SelecaoDoTexto = { de: number; ate: number };

type Props = {
  texto: TextoRico;
  /** A caixa da camada na tela (pixels da prévia), e a virada dela. */
  caixa: Caixa;
  virar?: Virar | null;
  selecao: SelecaoDoTexto;
  aoSelecionar: (selecao: SelecaoDoTexto) => void;
  /** O estilo do que for digitado (um estilo mudado sem seleção vale para o próximo caractere). */
  estiloPendente: Partial<EstiloDoCaractere> | null;
  /** O texto mudou (já medido). */
  aoMudar: (texto: TextoRico) => void;
  aoTerminar: () => void;
  /** Os atalhos de formatação: uma mudança no que está escolhido (ou no que for digitado). */
  aoEstilo?: (mudanca: Partial<EstiloDoCaractere>) => void;
  aoParagrafo?: (mudanca: Partial<EstiloDoParagrafo>) => void;
  /** Alt + setas com o cursor entre dois caracteres: soma ao kerning do par. */
  aoKern?: (delta: number) => void;
};

/** O texto com a caixa e a origem medidas de novo (depois de cada mudança). */
export function textoMedido(texto: TextoRico): TextoRico {
  return { ...texto, ...medirTexto(texto, disporTexto(texto, fonteDoEstilo)) };
}

/** A conta da tela: do ponto do texto (coordenadas da disposição) ao pixel da prévia, e de volta. */
function contasDaCaixa(texto: TextoRico, caixa: Caixa, virar?: Virar | null) {
  const sx = caixa.largura / texto.caixa.largura;
  const sy = caixa.altura / texto.caixa.altura;
  const r = (caixa.rotacao * Math.PI) / 180;
  const cos = Math.cos(r);
  const sen = Math.sin(r);
  const fx = virar?.horizontal ? -1 : 1;
  const fy = virar?.vertical ? -1 : 1;
  const naTela = (x: number, y: number) => {
    const ux = ((x + texto.origem.x) - texto.caixa.largura / 2) * sx * fx;
    const uy = ((y + texto.origem.y) - texto.caixa.altura / 2) * sy * fy;
    return { x: caixa.cx + ux * cos - uy * sen, y: caixa.cy + ux * sen + uy * cos };
  };
  const doTexto = (px: number, py: number) => {
    const dx = px - caixa.cx;
    const dy = py - caixa.cy;
    const ux = (dx * cos + dy * sen) * fx;
    const uy = (-dx * sen + dy * cos) * fy;
    return { x: ux / sx + texto.caixa.largura / 2 - texto.origem.x, y: uy / sy + texto.caixa.altura / 2 - texto.origem.y };
  };
  // A matriz do SVG (as coordenadas do texto na tela)
  const a = sx * fx * cos;
  const b = sx * fx * sen;
  const c = -sy * fy * sen;
  const d = sy * fy * cos;
  const o = naTela(0, 0);
  return { naTela, doTexto, matriz: `matrix(${a} ${b} ${c} ${d} ${o.x} ${o.y})`, escala: Math.hypot(a, b) };
}

/** O caractere mais perto de um ponto da prévia (o clique que abre a edição). */
export function indiceNaTela(texto: TextoRico, caixa: Caixa, virar: Virar | null | undefined, ponto: { x: number; y: number }): number {
  const contas = contasDaCaixa(texto, caixa, virar);
  return indiceNoPonto(disporTexto(texto, fonteDoEstilo), contas.doTexto(ponto.x, ponto.y), texto.orientacao === "vertical");
}

/** O caractere mais perto do ponto (coordenadas do texto). */
export function indiceNoPonto(disposicao: Disposicao, p: { x: number; y: number }, vertical: boolean): number {
  if (!disposicao.linhas.length) return 0;
  // A linha: a de base mais perto (no vertical, a coluna)
  let melhor = 0;
  let menor = Infinity;
  disposicao.linhas.forEach((linha, i) => {
    const d = vertical ? Math.abs(p.x - linha.baseX) : p.y < linha.baseY - linha.ascendente ? linha.baseY - linha.ascendente - p.y : p.y > linha.baseY + linha.descendente ? p.y - linha.baseY - linha.descendente : 0;
    if (d < menor) [menor, melhor] = [d, i];
  });
  const linha = disposicao.linhas[melhor];
  let indice = linha.inicio;
  let distancia = Infinity;
  for (let i = linha.inicio; i <= linha.fim; i++) {
    const cursor = disposicao.cursores[i];
    if (!cursor || cursor.linha !== melhor) continue;
    const d = Math.abs((vertical ? cursor.y : cursor.x) - (vertical ? p.y : p.x));
    if (d < distancia) [distancia, indice] = [d, i];
  }
  return indice;
}

/** A palavra, a linha (desenhada) e o parágrafo em volta do índice. */
export function trechoEmVolta(texto: string, disposicao: Disposicao, indice: number, cliques: number): SelecaoDoTexto {
  if (cliques >= 5) return { de: 0, ate: texto.length };
  if (cliques === 4) {
    const de = texto.lastIndexOf("\n", indice - 1) + 1;
    const fim = texto.indexOf("\n", indice);
    return { de, ate: fim < 0 ? texto.length : fim };
  }
  if (cliques === 3) {
    const linha = disposicao.linhas[disposicao.cursores[indice]?.linha ?? 0];
    return linha ? { de: linha.inicio, ate: linha.fim } : { de: 0, ate: texto.length };
  }
  const letra = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}_]/u.test(c);
  let de = indice;
  let ate = indice;
  while (de > 0 && letra(texto[de - 1])) de--;
  while (ate < texto.length && letra(texto[ate])) ate++;
  return { de, ate };
}

export function EdicaoDeTextoNaPrevia({ texto, caixa, virar, selecao, aoSelecionar, estiloPendente, aoMudar, aoTerminar, aoEstilo, aoParagrafo, aoKern }: Props) {
  useVersaoDasFontes();
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const arrasto = useRef<{ ancora: number } | null>(null);
  // Os cliques seguidos no mesmo lugar (o pointerdown não traz a contagem): 2 a palavra, 3 a linha, 4 o parágrafo, 5 tudo
  const cliques = useRef({ tempo: -Infinity, x: 0, y: 0, contagem: 0 });
  const [piscar, setPiscar] = useState(true);
  const corrido = textoCorrido(texto);
  const disposicao = disporTexto(texto, fonteDoEstilo);
  const vertical = texto.orientacao === "vertical";
  const contas = contasDaCaixa(texto, caixa, virar);

  // O campo segue a seleção (quando ela vem de fora: o clique, as setas desenhadas)
  useLayoutEffect(() => {
    const campo = campoRef.current;
    if (!campo) return;
    if (campo.value !== corrido) campo.value = corrido;
    if (campo.selectionStart !== Math.min(selecao.de, selecao.ate) || campo.selectionEnd !== Math.max(selecao.de, selecao.ate)) {
      campo.setSelectionRange(Math.min(selecao.de, selecao.ate), Math.max(selecao.de, selecao.ate), selecao.ate < selecao.de ? "backward" : "forward");
    }
  });
  const terminarRef = useRef(aoTerminar);
  const selecionarRef = useRef(aoSelecionar);
  useEffect(() => {
    terminarRef.current = aoTerminar;
    selecionarRef.current = aoSelecionar;
  });
  useEffect(() => {
    campoRef.current?.focus({ preventScroll: true });
    const intervalo = window.setInterval(() => setPiscar((atual) => !atual), 530);
    // Depois de um botão ou da cor da barra, o que se digita volta para o texto (os campos de digitar ficam com o deles)
    const tecla = (evento: KeyboardEvent) => {
      const campo = campoRef.current;
      if (!campo || document.activeElement === campo) return;
      const alvo = evento.target instanceof HTMLElement ? evento.target : null;
      if (alvo?.closest("[role='dialog'], [role='listbox'], [role='menu']")) return;
      if (alvo?.matches("textarea, select, [contenteditable='true'], input:not([type='color']):not([type='checkbox']):not([type='radio']):not([type='range'])")) return;
      if (evento.key === "Escape" || (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey))) {
        evento.preventDefault();
        evento.stopPropagation();
        terminarRef.current();
        return;
      }
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
      // A tecla não chega aos atalhos do editor; o caractere dela entra no campo, que passa a ter o foco
      evento.stopPropagation();
      campo.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", tecla, true);
    // O cursor que o campo anda sozinho (setas para os lados, Ctrl+setas, Ctrl+A) volta para a seleção. O onSelect do
    // React não serve: ele dispara no mesmo keydown, antes de o campo receber a seleção das setas para cima e para baixo,
    // e devolvia a antiga
    const mudou = () => {
      const campo = campoRef.current;
      if (!campo || document.activeElement !== campo) return;
      const paraTras = campo.selectionDirection === "backward";
      selecionarRef.current({ de: paraTras ? campo.selectionEnd : campo.selectionStart, ate: paraTras ? campo.selectionStart : campo.selectionEnd });
    };
    document.addEventListener("selectionchange", mudou);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener("keydown", tecla, true);
      document.removeEventListener("selectionchange", mudou);
    };
  }, []);

  /** O texto mudou no campo: o trecho trocado (entre o começo e o fim iguais) entra no texto rico. */
  const aoDigitar = () => {
    const campo = campoRef.current;
    if (!campo) return;
    const novo = campo.value;
    let inicio = 0;
    while (inicio < novo.length && inicio < corrido.length && novo[inicio] === corrido[inicio]) inicio++;
    let fimNovo = novo.length;
    let fimVelho = corrido.length;
    while (fimNovo > inicio && fimVelho > inicio && novo[fimNovo - 1] === corrido[fimVelho - 1]) {
      fimNovo--;
      fimVelho--;
    }
    const trocado = substituir(texto, inicio, fimVelho, novo.slice(inicio, fimNovo), estiloPendente ?? undefined);
    aoMudar(textoMedido(trocado));
    aoSelecionar({ de: campo.selectionStart, ate: campo.selectionEnd });
  };

  /**
   * Os atalhos de formatação: Ctrl+Shift+K (maiúsculas), H (versalete), U (sublinhado), B e I (negrito e itálico
   * falsos), / (tachado), = (sobrescrito; com Alt, subscrito), > e < (tamanho), L, C, R, J e F (alinhamento); Alt + setas
   * para os lados mexem no tracking (com seleção) ou no kerning do par, e para cima e para baixo na entrelinha (com
   * Ctrl, de 5 em 5 vezes).
   */
  const formatar = (evento: React.KeyboardEvent): boolean => {
    const comando = evento.ctrlKey || evento.metaKey;
    const comum = { ...texto.estilo, ...estiloComum(texto, selecao.de, selecao.ate), ...estiloPendente };
    if (comando && evento.shiftKey) {
      const mudancas: Record<string, Partial<EstiloDoCaractere>> = {
        KeyK: { caixa: comum.caixa === "maiusculas" ? "normal" : "maiusculas" },
        KeyH: { caixa: comum.caixa === "versalete" ? "normal" : "versalete" },
        KeyU: { sublinhado: !comum.sublinhado },
        KeyB: { negritoFalso: !comum.negritoFalso },
        KeyI: { italicoFalso: !comum.italicoFalso },
        Slash: { tachado: !comum.tachado },
        IntlRo: { tachado: !comum.tachado },
        Equal: evento.altKey ? { posicao: comum.posicao === "subscrito" ? "normal" : "subscrito" } : { posicao: comum.posicao === "sobrescrito" ? "normal" : "sobrescrito" },
        Period: { tamanho: Math.min(5000, Math.round((comum.tamanho ?? 12) * 1.1 + 1)) },
        Comma: { tamanho: Math.max(1, Math.round((comum.tamanho ?? 12) / 1.1 - 1)) },
      };
      const alinhamentos: Record<string, EstiloDoParagrafo["alinhamento"]> = { KeyL: "esquerda", KeyC: "centro", KeyR: "direita", KeyJ: "justificado-esquerda", KeyF: "justificado" };
      if (mudancas[evento.code] && aoEstilo) {
        aoEstilo(mudancas[evento.code]);
        return true;
      }
      if (alinhamentos[evento.code] && aoParagrafo) {
        aoParagrafo({ alinhamento: alinhamentos[evento.code] });
        return true;
      }
      return false;
    }
    if (evento.altKey && !evento.shiftKey && evento.key.startsWith("Arrow")) {
      const passo = comando ? 100 : 20;
      if (evento.key === "ArrowLeft" || evento.key === "ArrowRight") {
        const delta = evento.key === "ArrowRight" ? passo : -passo;
        if (selecao.de === selecao.ate) aoKern?.(delta);
        else aoEstilo?.({ tracking: Math.max(-1000, Math.min(10000, (comum.tracking ?? 0) + delta)) });
        return true;
      }
      // A entrelinha automática começa dos 120% do tamanho; Alt + seta para cima aperta, para baixo abre
      const entrelinha = comum.entrelinha ?? (comum.tamanho ?? 12) * 1.2;
      const delta = (evento.key === "ArrowDown" ? 1 : -1) * (comando ? 10 : 2);
      aoEstilo?.({ entrelinha: Math.max(0, Math.round(entrelinha + delta)) });
      return true;
    }
    return false;
  };

  /** As setas para cima e para baixo, Home e End, pelas linhas desenhadas (o campo escondido tem outras). */
  const aoTeclar = (evento: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (evento.key === "Escape" || (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey))) {
      evento.preventDefault();
      evento.stopPropagation();
      aoTerminar();
      return;
    }
    // As teclas do editor (atalhos de ferramenta, Delete da camada) não valem enquanto se digita
    evento.stopPropagation();
    if (formatar(evento)) {
      evento.preventDefault();
      return;
    }
    const linhaAcima = evento.key === (vertical ? "ArrowRight" : "ArrowUp");
    const linhaAbaixo = evento.key === (vertical ? "ArrowLeft" : "ArrowDown");
    if (!linhaAcima && !linhaAbaixo && evento.key !== "Home" && evento.key !== "End") return;
    if ((evento.key === "Home" || evento.key === "End") && (evento.ctrlKey || evento.metaKey)) return;
    evento.preventDefault();
    const atual = selecao.ate;
    const cursor = disposicao.cursores[atual];
    if (!cursor) return;
    let destino = atual;
    if (evento.key === "Home") destino = disposicao.linhas[cursor.linha]?.inicio ?? atual;
    else if (evento.key === "End") destino = disposicao.linhas[cursor.linha]?.fim ?? atual;
    else {
      const linha = cursor.linha + (linhaAcima ? -1 : 1);
      if (linha < 0) destino = 0;
      else if (linha >= disposicao.linhas.length) destino = corrido.length;
      else {
        const alvo = disposicao.linhas[linha];
        destino = indiceNoPonto(disposicao, vertical ? { x: alvo.baseX, y: cursor.y } : { x: cursor.x, y: alvo.baseY }, vertical);
      }
    }
    aoSelecionar({ de: evento.shiftKey ? selecao.de : destino, ate: destino });
  };

  const noTexto = (evento: { clientX: number; clientY: number }, elemento: Element) => {
    const r = elemento.getBoundingClientRect();
    return contas.doTexto(evento.clientX - r.left, evento.clientY - r.top);
  };
  const dentroDaCaixa = (p: { x: number; y: number }) => {
    const x = p.x + texto.origem.x;
    const y = p.y + texto.origem.y;
    const folga = 12 / Math.max(1e-6, contas.escala);
    return x >= -folga && y >= -folga && x <= texto.caixa.largura + folga && y <= texto.caixa.altura + folga;
  };

  // A seleção: um retângulo por linha, do primeiro ao último caractere dela que está escolhido
  const a = Math.min(selecao.de, selecao.ate);
  const b = Math.max(selecao.de, selecao.ate);
  const retangulos: { x: number; y: number; largura: number; altura: number }[] = [];
  if (b > a) {
    disposicao.linhas.forEach((linha, i) => {
      const de = Math.max(a, linha.inicio);
      const ate = Math.min(b, linha.fim);
      if (ate <= de) return;
      const c0 = disposicao.cursores[de];
      const c1 = disposicao.cursores[ate]?.linha === i ? disposicao.cursores[ate] : { ...c0, x: linha.baseX + linha.largura, y: linha.baseY + linha.largura };
      if (vertical) retangulos.push({ x: linha.baseX - c0.ascendente, y: c0.y, largura: c0.ascendente + c0.descendente, altura: Math.max(1, c1.y - c0.y) });
      else retangulos.push({ x: c0.x, y: linha.baseY - linha.ascendente, largura: Math.max(1, c1.x - c0.x), altura: linha.ascendente + linha.descendente });
    });
  }
  const cursor = disposicao.cursores[selecao.ate];
  const espessura = 1.5 / Math.max(1e-6, contas.escala);
  return (
    <div
      className="absolute inset-0 touch-none"
      style={{ cursor: "text" }}
      aria-label="Editar o texto"
      onPointerDown={(evento) => {
        if (evento.button !== 0) return;
        evento.stopPropagation();
        evento.preventDefault();
        const p = noTexto(evento, evento.currentTarget);
        if (!dentroDaCaixa(p)) {
          aoTerminar();
          return;
        }
        evento.currentTarget.setPointerCapture(evento.pointerId);
        const indice = indiceNoPonto(disposicao, p, vertical);
        const anterior = cliques.current;
        const seguido = evento.timeStamp - anterior.tempo < 500 && Math.hypot(evento.clientX - anterior.x, evento.clientY - anterior.y) < 6;
        cliques.current = { tempo: evento.timeStamp, x: evento.clientX, y: evento.clientY, contagem: seguido ? anterior.contagem + 1 : 1 };
        if (cliques.current.contagem >= 2) {
          aoSelecionar(trechoEmVolta(corrido, disposicao, indice, cliques.current.contagem));
          arrasto.current = null;
        } else {
          const ancora = evento.shiftKey ? selecao.de : indice;
          aoSelecionar({ de: ancora, ate: indice });
          arrasto.current = { ancora };
        }
        campoRef.current?.focus({ preventScroll: true });
      }}
      onPointerMove={(evento) => {
        if (!arrasto.current) return;
        const indice = indiceNoPonto(disposicao, noTexto(evento, evento.currentTarget), vertical);
        aoSelecionar({ de: arrasto.current.ancora, ate: indice });
      }}
      onPointerUp={() => {
        arrasto.current = null;
      }}
    >
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        <g transform={contas.matriz}>
          {/* A borda da caixa (no de parágrafo, a da pessoa) */}
          <rect x={-texto.origem.x} y={-texto.origem.y} width={texto.caixa.largura} height={texto.caixa.altura} fill="none" stroke="#2f80ff" strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.7} />
          {retangulos.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.largura} height={r.altura} fill="#2f80ff" opacity={0.35} />
          ))}
          {cursor && b === a && piscar ? (
            vertical ? (
              <rect x={cursor.x - cursor.ascendente} y={cursor.y - espessura / 2} width={cursor.ascendente + cursor.descendente} height={espessura} fill="#000" stroke="#fff" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
            ) : (
              <rect x={cursor.x - espessura / 2} y={cursor.y - cursor.ascendente} width={espessura} height={cursor.ascendente + cursor.descendente} fill="#000" stroke="#fff" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
            )
          ) : null}
        </g>
      </svg>
      <textarea
        ref={campoRef}
        aria-label="Texto"
        defaultValue={corrido}
        spellCheck
        className="pointer-events-none absolute size-px resize-none overflow-hidden opacity-0"
        style={cursor ? { left: contas.naTela(cursor.x, cursor.y).x, top: contas.naTela(cursor.x, cursor.y).y } : undefined}
        onInput={aoDigitar}
        onKeyDown={aoTeclar}
      />
    </div>
  );
}
