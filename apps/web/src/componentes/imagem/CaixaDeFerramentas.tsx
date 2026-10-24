"use client";

import { ArrowLeftRight, Circle, CircleDashed, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { type FerramentaDaImagem, GRUPOS_DE_FERRAMENTAS, type IdFerramentaDaImagem } from "./ferramentasDaImagem";

type Props = {
  ativa: IdFerramentaDaImagem;
  aoEscolher: (id: IdFerramentaDaImagem) => void;
  /** A última usada de cada grupo: é a que o botão do grupo mostra. */
  ultimas: Partial<Record<number, IdFerramentaDaImagem>>;
  primeiroPlano: string;
  fundo: string;
  /** Clique numa cor: abre a escolha dela no painel Cor. */
  aoEditarCor: (qual: "primeiroPlano" | "fundo") => void;
  aoTrocarCores: () => void;
  aoCoresPadrao: () => void;
  /** Duplo clique na Mão ajusta à tela; no Zoom, 100%. */
  aoDuploClique: (id: IdFerramentaDaImagem) => void;
  /** O modo Máscara rápida (Q) ligado, e o botão que liga e desliga. */
  mascaraRapida?: boolean;
  aoMascaraRapida?: () => void;
  /** Editar › Barra de ferramentas: as tiradas da caixa (ficam no "…"), as colunas e a tecla de cada uma. */
  ocultas?: ReadonlySet<string>;
  colunas?: 1 | 2;
  teclaDe?: (item: FerramentaDaImagem) => string;
};

const SEM_OCULTAS: ReadonlySet<string> = new Set();
// O grupo das extras (as tiradas da caixa) no menu da lista
const EXTRAS = -1;

const SEGURAR_MS = 350;

/**
 * A caixa de ferramentas (coluna à esquerda): um botão por grupo, com o triângulo no canto quando o grupo tem
 * outras; o botão direito (ou segurar) abre a lista do grupo, com o nome e a tecla de cada uma. Embaixo, as cores de
 * primeiro plano e de fundo, as cores padrão (D) e a troca (X).
 */
export function CaixaDeFerramentas({ ativa, aoEscolher, ultimas, primeiroPlano, fundo, aoEditarCor, aoTrocarCores, aoCoresPadrao, aoDuploClique, mascaraRapida = false, aoMascaraRapida, ocultas = SEM_OCULTAS, colunas = 1, teclaDe = (item) => item.tecla }: Props) {
  // Os grupos sem as ferramentas tiradas (o índice continua o do grupo, para a última usada de cada um)
  const grupos = GRUPOS_DE_FERRAMENTAS.map((grupo, i) => ({ i, itens: grupo.filter((item) => !ocultas.has(item.id)) })).filter((grupo) => grupo.itens.length);
  const extras = GRUPOS_DE_FERRAMENTAS.flat().filter((item, i, todas) => ocultas.has(item.id) && todas.findIndex((x) => x.id === item.id) === i);
  const [lista, setLista] = useState<{ grupo: number; topo: number } | null>(null);
  const segurando = useRef<number | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!lista) return;
    const fora = (evento: PointerEvent) => {
      if (!caixaRef.current?.contains(evento.target as Node)) setLista(null);
    };
    const esc = (evento: KeyboardEvent) => evento.key === "Escape" && setLista(null);
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [lista]);

  function abrirLista(grupo: number, elemento: HTMLElement) {
    const caixa = caixaRef.current?.getBoundingClientRect();
    setLista({ grupo, topo: elemento.getBoundingClientRect().top - (caixa?.top ?? 0) });
  }

  return (
    <div ref={caixaRef} className={`relative z-20 flex shrink-0 flex-col items-center gap-0.5 border-r border-borda bg-painel py-1.5 ${colunas === 2 ? "w-[70px]" : "w-10"}`}>
      <nav aria-label="Ferramentas" className={colunas === 2 ? "grid grid-cols-2 gap-0.5" : "flex flex-col items-center gap-0.5"}>
        {grupos.map(({ i, itens: grupo }) => {
          const naVez: FerramentaDaImagem = grupo.find((item) => item.id === ativa) ?? grupo.find((item) => item.id === ultimas[i]) ?? grupo[0];
          const ligada = grupo.some((item) => item.id === ativa);
          const Icone = naVez.icone;
          return (
            <button
              key={i}
              type="button"
              aria-pressed={ligada}
              aria-label={naVez.nome}
              title={teclaDe(naVez) ? `${naVez.nome} (${teclaDe(naVez)})` : naVez.nome}
              onClick={() => aoEscolher(naVez.id)}
              onDoubleClick={() => aoDuploClique(naVez.id)}
              onContextMenu={(evento) => {
                evento.preventDefault();
                if (grupo.length > 1) abrirLista(i, evento.currentTarget);
              }}
              onPointerDown={(evento) => {
                if (grupo.length < 2 || evento.button !== 0) return;
                const elemento = evento.currentTarget;
                segurando.current = window.setTimeout(() => abrirLista(i, elemento), SEGURAR_MS);
              }}
              onPointerUp={() => segurando.current !== null && window.clearTimeout(segurando.current)}
              onPointerLeave={() => segurando.current !== null && window.clearTimeout(segurando.current)}
              className={`relative grid size-[30px] place-items-center rounded transition ${ligada ? "bg-destaque text-white" : "text-suave hover:bg-painel-3 hover:text-texto"}`}
            >
              <Icone className="size-[18px]" aria-hidden />
              {grupo.length > 1 ? (
                <svg className={`absolute bottom-[3px] right-[3px] size-1.5 ${ligada ? "text-white/80" : "text-suave"}`} viewBox="0 0 6 6" aria-hidden>
                  <path d="M6 0V6H0Z" fill="currentColor" />
                </svg>
              ) : null}
            </button>
          );
        })}
        {extras.length ? (
          <button
            type="button"
            aria-label="Ferramentas extras"
            title="Ferramentas extras (as tiradas da caixa)"
            onClick={(evento) => abrirLista(EXTRAS, evento.currentTarget)}
            className={`grid size-[30px] place-items-center rounded transition ${extras.some((item) => item.id === ativa) ? "bg-destaque text-white" : "text-suave hover:bg-painel-3 hover:text-texto"}`}
          >
            <MoreHorizontal className="size-[18px]" aria-hidden />
          </button>
        ) : null}
      </nav>
      {lista ? (
        <div role="menu" className="absolute left-full z-50 ml-1 min-w-64 rounded-md border border-borda bg-painel-2 py-1 text-xs shadow-xl shadow-black/50" style={{ top: lista.topo }}>
          {(lista.grupo === EXTRAS ? extras : (grupos.find((g) => g.i === lista.grupo)?.itens ?? [])).map((item) => {
            const Icone = item.icone;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={item.id === ativa}
                onClick={() => {
                  aoEscolher(item.id);
                  setLista(null);
                }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-destaque/20"
              >
                <span className={`size-1.5 rounded-full ${item.id === ativa ? "bg-texto" : ""}`} aria-hidden />
                <Icone className="size-4 text-suave" aria-hidden />
                <span className="flex-1">{item.nome}</span>
                <span className="text-[11px] text-suave">{teclaDe(item)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-auto flex flex-col items-center gap-1 pb-1">
        <div className="flex w-[30px] items-center justify-between">
          <button type="button" onClick={aoCoresPadrao} title="Cores padrão de primeiro plano e de fundo (D)" aria-label="Cores padrão" className="relative size-3">
            <span className="absolute left-0 top-0 size-2 border border-white/70 bg-black" />
            <span className="absolute bottom-0 right-0 size-2 border border-black/50 bg-white" />
          </button>
          <button type="button" onClick={aoTrocarCores} title="Trocar as cores de primeiro plano e de fundo (X)" aria-label="Trocar as cores" className="text-suave hover:text-texto">
            <ArrowLeftRight className="size-3" aria-hidden />
          </button>
        </div>
        <div className="relative size-[30px]">
          <button
            type="button"
            onClick={() => aoEditarCor("fundo")}
            title="Escolher a cor de fundo"
            aria-label={`Cor de fundo ${fundo}`}
            className="absolute bottom-0 right-0 size-[18px] rounded-[2px] border border-white/60 shadow"
            style={{ background: fundo }}
          />
          <button
            type="button"
            onClick={() => aoEditarCor("primeiroPlano")}
            title="Escolher a cor de primeiro plano"
            aria-label={`Cor de primeiro plano ${primeiroPlano}`}
            className="absolute left-0 top-0 size-[18px] rounded-[2px] border border-white/60 shadow"
            style={{ background: primeiroPlano }}
          />
        </div>
        {aoMascaraRapida ? (
          <button
            type="button"
            onClick={aoMascaraRapida}
            title={mascaraRapida ? "Editar no modo Padrão (Q)" : "Editar no modo Máscara rápida (Q)"}
            aria-label="Máscara rápida"
            aria-pressed={mascaraRapida}
            className={`botao-icone mt-1 size-7 ${mascaraRapida ? "bg-painel-3 text-erro" : ""}`}
          >
            {mascaraRapida ? <Circle className="size-4 fill-current opacity-60" aria-hidden /> : <CircleDashed className="size-4" aria-hidden />}
          </button>
        ) : null}
      </div>
    </div>
  );
}
