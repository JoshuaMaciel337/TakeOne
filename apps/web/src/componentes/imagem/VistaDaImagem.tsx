"use client";

// Exibir do editor de imagem (ADR 0003, onda 13.14), na prévia: as réguas (de onde se arrastam as guias), as guias do
// documento (o Mover as leva; de volta à régua, somem), a grade, a malha de pixels e as bordas das camadas. As contas
// ficam em lib/imagem/vista.ts.
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { type Caixa, type Guias } from "@/lib/projeto/geometria";
import { marcasDaRegua, type PreferenciasDaVista, UNIDADES_DA_REGUA, type UnidadeDaRegua } from "@/lib/imagem/vista";
import { pontoNoElemento } from "./pontoNaVista";

/** A espessura das réguas, em pixels da tela. */
export const LADO_DA_REGUA = 20;

export type GuiaArrastada = { tipo: "v" | "h"; pos: number; indice: number | null };

/** O ponto do ponteiro em pixels do documento, pela caixa da imagem na tela. */
export function noDocumento(evento: { clientX: number; clientY: number }, imagem: HTMLElement, escala: number) {
  const p = pontoNoElemento(evento, imagem);
  return { x: p.x / escala, y: p.y / escala };
}

/** As guias, a grade, a malha de pixels e as bordas das camadas, por cima da imagem (as guias passam para a mesa). */
export function GuiasEGrade({
  guias,
  arrastada,
  vista,
  escala,
  tamanho,
  mesa,
  caixas,
  podeArrastar,
  aoComecar,
}: {
  guias: Guias | null;
  arrastada: GuiaArrastada | null;
  vista: PreferenciasDaVista;
  escala: number;
  tamanho: { largura: number; altura: number };
  mesa: number;
  caixas: Caixa[];
  /** O Mover está escolhido e as guias não estão travadas. */
  podeArrastar: boolean;
  aoComecar: (guia: GuiaArrastada, evento: React.PointerEvent) => void;
}) {
  const extras = vista.extras;
  // A cor e o estilo das guias e da grade (Editar › Preferências › Guias e grade)
  const corDaGuia = vista.corDasGuias;
  const tracoDaGuia = (lado: "v" | "h") => (vista.estiloDasGuias === "tracejado" ? `repeating-linear-gradient(${lado === "v" ? "180deg" : "90deg"}, ${corDaGuia} 0 4px, transparent 4px 8px)` : corDaGuia);
  const tracosDaGrade = vista.estiloDaGrade === "tracejado" ? "4 3" : vista.estiloDaGrade === "pontos" ? "1 3" : undefined;
  const passoGrande = vista.espacoDaGrade * escala;
  const passoPequeno = passoGrande / Math.max(1, vista.subdivisoes);
  const comMalha = extras && vista.malhaDePixels && escala >= 8;
  const lista = (tipo: "v" | "h") =>
    (tipo === "v" ? (guias?.verticais ?? []) : (guias?.horizontais ?? [])).map((pos, indice) => (arrastada?.indice === indice && arrastada.tipo === tipo ? arrastada.pos : pos));
  const guiaNova = arrastada && arrastada.indice === null ? arrastada : null;
  return (
    <>
      {extras && vista.grade && passoPequeno >= 3 ? (
        <svg className="pointer-events-none absolute inset-0 size-full overflow-hidden" aria-hidden>
          <defs>
            <pattern id="to-grade-pequena" width={passoPequeno} height={passoPequeno} patternUnits="userSpaceOnUse">
              <path d={`M ${passoPequeno} 0 L 0 0 0 ${passoPequeno}`} fill="none" stroke={vista.corDaGrade} strokeOpacity={0.4} strokeWidth={1} strokeDasharray="2 2" />
            </pattern>
            <pattern id="to-grade" width={passoGrande} height={passoGrande} patternUnits="userSpaceOnUse">
              <rect width={passoGrande} height={passoGrande} fill="url(#to-grade-pequena)" />
              <path d={`M ${passoGrande} 0 L 0 0 0 ${passoGrande}`} fill="none" stroke={vista.corDaGrade} strokeOpacity={0.8} strokeWidth={1} strokeDasharray={tracosDaGrade} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#to-grade)" />
        </svg>
      ) : null}
      {comMalha ? (
        <svg className="pointer-events-none absolute inset-0 size-full overflow-hidden" aria-hidden>
          <defs>
            <pattern id="to-malha" width={escala} height={escala} patternUnits="userSpaceOnUse">
              <path d={`M ${escala} 0 L 0 0 0 ${escala}`} fill="none" stroke="rgba(160,160,160,0.45)" strokeWidth={1} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#to-malha)" />
        </svg>
      ) : null}
      {extras && vista.bordasDaCamada
        ? caixas.map((caixa, i) => (
            <div
              key={i}
              className="pointer-events-none absolute border border-sky-400/80"
              aria-hidden
              style={{ left: caixa.cx - caixa.largura / 2, top: caixa.cy - caixa.altura / 2, width: caixa.largura, height: caixa.altura, transform: `rotate(${caixa.rotacao}deg)` }}
            />
          ))
        : null}
      {extras && vista.guias
        ? (["v", "h"] as const).flatMap((tipo) =>
            lista(tipo).map((pos, indice) => (
              <div
                key={`${tipo}${indice}`}
                role="separator"
                aria-orientation={tipo === "v" ? "vertical" : "horizontal"}
                aria-label={`Guia ${tipo === "v" ? "vertical" : "horizontal"} em ${Math.round(pos)} px`}
                className={`absolute ${podeArrastar ? (tipo === "v" ? "cursor-ew-resize" : "cursor-ns-resize") : "pointer-events-none"}`}
                style={tipo === "v" ? { left: pos * escala - 3, top: -mesa, width: 7, height: tamanho.altura + 2 * mesa } : { top: pos * escala - 3, left: -mesa, height: 7, width: tamanho.largura + 2 * mesa }}
                onPointerDown={(evento) => {
                  if (!podeArrastar || evento.button !== 0) return;
                  evento.stopPropagation();
                  aoComecar({ tipo, pos, indice }, evento);
                }}
              >
                <span className="absolute" style={tipo === "v" ? { left: 3, top: 0, bottom: 0, width: 1, background: tracoDaGuia("v") } : { top: 3, left: 0, right: 0, height: 1, background: tracoDaGuia("h") }} />
              </div>
            )),
          )
        : null}
      {guiaNova ? (
        <span
          className="pointer-events-none absolute"
          aria-hidden
          style={guiaNova.tipo === "v" ? { left: guiaNova.pos * escala, top: -mesa, width: 1, height: tamanho.altura + 2 * mesa, background: tracoDaGuia("v") } : { top: guiaNova.pos * escala, left: -mesa, height: 1, width: tamanho.largura + 2 * mesa, background: tracoDaGuia("h") }}
        />
      ) : null}
    </>
  );
}

/**
 * As réguas, em cima e à esquerda da prévia, presas ao canto do documento (acompanham a rolagem e o zoom). Arrastar de
 * uma régua faz uma guia nova; o clique com o botão direito troca a unidade.
 */
export function Reguas({
  imagemRef,
  areaRef,
  escala,
  documento,
  ppi,
  unidade,
  aoComecar,
  aoMudarUnidade,
}: {
  imagemRef: React.RefObject<HTMLElement | null>;
  areaRef: React.RefObject<HTMLElement | null>;
  escala: number;
  documento: { largura: number; altura: number };
  ppi: number;
  unidade: UnidadeDaRegua;
  aoComecar: (tipo: "v" | "h", evento: React.PointerEvent) => void;
  aoMudarUnidade: (unidade: UnidadeDaRegua) => void;
}) {
  const cima = useRef<HTMLCanvasElement>(null);
  const lado = useRef<HTMLCanvasElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [versao, setVersao] = useState(0);

  // A rolagem e o tamanho da área mexem no lugar do documento: as réguas se desenham de novo
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const mudar = () => setVersao((v) => v + 1);
    area.addEventListener("scroll", mudar, { passive: true });
    const observador = new ResizeObserver(mudar);
    observador.observe(area);
    return () => {
      area.removeEventListener("scroll", mudar);
      observador.disconnect();
    };
  }, [areaRef]);

  useLayoutEffect(() => {
    const imagem = imagemRef.current;
    const area = areaRef.current;
    if (!imagem || !area) return;
    const r = imagem.getBoundingClientRect();
    const a = area.getBoundingClientRect();
    const densidade = window.devicePixelRatio || 1;
    for (const [canvas, horizontal] of [
      [cima.current, true],
      [lado.current, false],
    ] as const) {
      if (!canvas) continue;
      const comprimento = horizontal ? a.width : a.height;
      canvas.width = Math.round((horizontal ? comprimento : LADO_DA_REGUA) * densidade);
      canvas.height = Math.round((horizontal ? LADO_DA_REGUA : comprimento) * densidade);
      const ctx = canvas.getContext("2d")!;
      // A vertical é a horizontal transposta: "ao longo" vira o y e "através" vira o x
      if (horizontal) ctx.setTransform(densidade, 0, 0, densidade, 0, 0);
      else ctx.setTransform(0, densidade, densidade, 0, 0, 0);
      const estilo = getComputedStyle(canvas);
      ctx.fillStyle = estilo.backgroundColor || "#1b1b1f";
      ctx.fillRect(0, 0, comprimento, LADO_DA_REGUA);
      ctx.strokeStyle = estilo.color || "#999";
      ctx.fillStyle = estilo.color || "#999";
      ctx.font = "9px Inter, system-ui, sans-serif";
      // O zero da régua: o canto do documento na tela, relativo à área
      const zero = horizontal ? r.left - a.left : r.top - a.top;
      const inicio = (0 - zero) / escala;
      const fim = (comprimento - zero) / escala;
      const marcas = marcasDaRegua(inicio, fim, escala, unidade, ppi, horizontal ? documento.largura : documento.altura);
      ctx.beginPath();
      for (const m of marcas) {
        const p = Math.round(zero + m.pos * escala) + 0.5;
        const altura = m.nivel === 0 ? LADO_DA_REGUA : m.nivel === 1 ? LADO_DA_REGUA * 0.5 : LADO_DA_REGUA * 0.3;
        ctx.moveTo(p, LADO_DA_REGUA);
        ctx.lineTo(p, LADO_DA_REGUA - altura);
        if (m.rotulo) {
          ctx.save();
          if (horizontal) ctx.translate(p + 2, 9);
          else {
            // Na vertical, o número lido de baixo para cima, como nas réguas dos editores
            ctx.setTransform(densidade, 0, 0, densidade, 0, 0);
            ctx.translate(9, p - 2);
            ctx.rotate(-Math.PI / 2);
          }
          ctx.fillText(m.rotulo, 0, 0);
          ctx.restore();
        }
      }
      ctx.stroke();
    }
  }, [imagemRef, areaRef, escala, documento.largura, documento.altura, ppi, unidade, versao]);

  const comum = "absolute z-10 select-none bg-painel-2 text-[10px] text-suave";
  return (
    <>
      <canvas
        ref={cima}
        className={`${comum} cursor-s-resize`}
        style={{ left: LADO_DA_REGUA, top: 0, height: LADO_DA_REGUA, width: `calc(100% - ${LADO_DA_REGUA}px)` }}
        aria-label="Régua horizontal: arraste para baixo para criar uma guia"
        onPointerDown={(evento) => evento.button === 0 && aoComecar("h", evento)}
        onContextMenu={(evento) => {
          evento.preventDefault();
          setMenu({ x: evento.clientX, y: evento.clientY });
        }}
      />
      <canvas
        ref={lado}
        className={`${comum} cursor-e-resize`}
        style={{ left: 0, top: LADO_DA_REGUA, width: LADO_DA_REGUA, height: `calc(100% - ${LADO_DA_REGUA}px)` }}
        aria-label="Régua vertical: arraste para a direita para criar uma guia"
        onPointerDown={(evento) => evento.button === 0 && aoComecar("v", evento)}
        onContextMenu={(evento) => {
          evento.preventDefault();
          setMenu({ x: evento.clientX, y: evento.clientY });
        }}
      />
      <div className={`${comum} left-0 top-0 border-b border-r border-borda`} style={{ width: LADO_DA_REGUA, height: LADO_DA_REGUA }} aria-hidden />
      {menu ? (
        <div className="fixed inset-0 z-50" onPointerDown={() => setMenu(null)}>
          <div role="menu" className="fixed min-w-36 rounded-md border border-borda bg-painel-2 py-1 text-xs shadow-xl shadow-black/50" style={{ left: menu.x, top: menu.y }} onPointerDown={(evento) => evento.stopPropagation()}>
            {UNIDADES_DA_REGUA.map((u) => (
              <button
                key={u.id}
                type="button"
                role="menuitemradio"
                aria-checked={u.id === unidade}
                className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-destaque/20"
                onClick={() => {
                  aoMudarUnidade(u.id);
                  setMenu(null);
                }}
              >
                <span className="w-3">{u.id === unidade ? "✓" : ""}</span>
                {u.nome}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
