"use client";

// As peças do editor de imagem no Takecut: a coluna das ferramentas com nome à esquerda (cada uma abre o painel dela ao
// lado) e a faixa com as ferramentas de mexer na imagem em cima da prévia. Os painéis são os mesmos do Takepro.
import {
  Brush,
  ChevronDown,
  Crop,
  Eraser,
  Hand,
  History,
  Image as IconeImagem,
  LayoutTemplate,
  type LucideIcon,
  Move,
  Paintbrush,
  Palette,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  SquareDashed,
  SquareDashedMousePointer,
  Bandage,
  Type,
  WandSparkles,
  Square,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { GRUPOS_DE_FERRAMENTAS, type IdFerramentaDaImagem } from "./ferramentasDaImagem";
import type { IdPainelDaImagem } from "./menusDaImagem";

/** As entradas da coluna do Takecut: o painel que cada uma abre ao lado. */
export const ENTRADAS_DO_TAKECUT: { painel: IdPainelDaImagem; nome: string; icone: LucideIcon }[] = [
  { painel: "modelos", nome: "Modelos", icone: LayoutTemplate },
  { painel: "biblioteca", nome: "Imagens", icone: IconeImagem },
  { painel: "estilos", nome: "Texto", icone: Type },
  { painel: "formas", nome: "Formas", icone: Shapes },
  { painel: "ajustes", nome: "Ajustes", icone: SlidersHorizontal },
  { painel: "filtros", nome: "Filtros", icone: WandSparkles },
  { painel: "estilosDeCamada", nome: "Efeitos", icone: Paintbrush },
  { painel: "fotoIA", nome: "Foto com IA", icone: Sparkles },
  { painel: "cor", nome: "Cores", icone: Palette },
  { painel: "historico", nome: "Histórico", icone: History },
];

export function ColunaDoTakecut({ aberto, aoAbrir, className = "" }: { aberto: IdPainelDaImagem | null; aoAbrir: (painel: IdPainelDaImagem) => void; className?: string }) {
  return (
    <nav aria-label="Ferramentas" className={`flex shrink-0 gap-0.5 overflow-auto border-borda bg-painel p-1 max-md:w-full max-md:border-b md:w-[4.5rem] md:flex-col md:border-r ${className}`}>
      {ENTRADAS_DO_TAKECUT.map(({ painel, nome, icone: Icone }) => {
        const marcado = painel === aberto;
        return (
          <button
            key={painel}
            type="button"
            onClick={() => aoAbrir(painel)}
            aria-pressed={marcado}
            className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium leading-tight transition max-md:w-16 ${
              marcado ? "bg-painel-3 text-texto" : "text-suave hover:bg-painel-2 hover:text-texto"
            }`}
          >
            <Icone className={`size-5 ${marcado ? "text-destaque" : ""}`} aria-hidden />
            <span className="w-full text-center">{nome}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** As ferramentas da faixa de cima, com o nome curto (as outras ficam em "Mais"). */
const FERRAMENTAS_DA_FAIXA: { id: IdFerramentaDaImagem; nome: string; icone: LucideIcon }[] = [
  { id: "mover", nome: "Mover", icone: Move },
  { id: "letreiro", nome: "Selecionar", icone: SquareDashed },
  { id: "objeto", nome: "Objeto", icone: SquareDashedMousePointer },
  { id: "corte", nome: "Cortar", icone: Crop },
  { id: "remover", nome: "Remover", icone: Bandage },
  { id: "pincel", nome: "Pincel", icone: Brush },
  { id: "borracha", nome: "Borracha", icone: Eraser },
  { id: "texto", nome: "Texto", icone: Type },
  { id: "retangulo", nome: "Forma", icone: Square },
  { id: "mao", nome: "Mão", icone: Hand },
];

export function FaixaDeFerramentas({
  ativa,
  aoEscolher,
  primeiroPlano,
  fundo,
  aoEditarCor,
}: {
  ativa: IdFerramentaDaImagem;
  aoEscolher: (id: IdFerramentaDaImagem) => void;
  primeiroPlano: string;
  fundo: string;
  aoEditarCor: () => void;
}) {
  const [mais, setMais] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mais) return;
    const fora = (evento: PointerEvent) => {
      if (!caixa.current?.contains(evento.target as Node)) setMais(false);
    };
    const esc = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setMais(false);
    };
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [mais]);
  const naFaixa = FERRAMENTAS_DA_FAIXA.some((item) => item.id === ativa);
  const outra = naFaixa ? null : GRUPOS_DE_FERRAMENTAS.flat().find((item) => item.id === ativa);
  return (
    <div className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-borda bg-painel px-2" role="toolbar" aria-label="Ferramentas da imagem">
      {FERRAMENTAS_DA_FAIXA.map(({ id, nome, icone: Icone }) => (
        <button
          key={id}
          type="button"
          onClick={() => aoEscolher(id)}
          aria-pressed={ativa === id}
          title={nome}
          className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition ${ativa === id ? "bg-painel-3 text-texto" : "text-suave hover:bg-painel-2 hover:text-texto"}`}
        >
          <Icone className={`size-4 ${ativa === id ? "text-destaque" : ""}`} aria-hidden />
          <span className={ativa === id ? "" : "hidden min-[1700px]:inline"}>{nome}</span>
        </button>
      ))}
      <div ref={caixa} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMais((valor) => !valor)}
          aria-expanded={mais}
          aria-haspopup="menu"
          className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition ${outra ? "bg-painel-3 text-texto" : "text-suave hover:bg-painel-2 hover:text-texto"}`}
        >
          {outra ? outra.nome.replace(/^Ferramenta /, "") : "Mais"}
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
        {mais ? (
          <div role="menu" className="fixed z-50 mt-1 max-h-[60vh] w-64 overflow-y-auto rounded-lg border border-borda bg-painel p-1 shadow-xl shadow-black/40">
            {GRUPOS_DE_FERRAMENTAS.map((grupo, indice) => (
              <div key={indice} className={indice ? "mt-1 border-t border-borda pt-1" : ""}>
                {grupo.map((item) => {
                  const Icone = item.icone;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        aoEscolher(item.id);
                        setMais(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-painel-2 ${item.id === ativa ? "text-destaque" : ""}`}
                    >
                      <Icone className="size-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{item.nome.replace(/^Ferramenta /, "")}</span>
                      {item.tecla ? <span className="text-[10px] text-apagado">{item.tecla}</span> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <button type="button" onClick={aoEditarCor} className="relative ml-2 size-7 shrink-0" title="Cores de primeiro plano e de fundo" aria-label="Cores">
        <span className="absolute bottom-0 right-0 size-4 rounded-sm border border-white/50" style={{ background: fundo }} />
        <span className="absolute left-0 top-0 size-4 rounded-sm border border-white/50" style={{ background: primeiroPlano }} />
      </button>
    </div>
  );
}
