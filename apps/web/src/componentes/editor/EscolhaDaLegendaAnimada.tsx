"use client";

import { useState } from "react";

import { CATEGORIAS_ANIMADAS, ESTILOS_ANIMADOS } from "@/lib/projeto/legendaAnimada";

import { PreviaDaAnimacao } from "./PainelAnimacoes";

type Props = {
  /** O estilo escolhido; null: sem animação (só quando `semAnimacao`). */
  escolhido: string | null;
  aoEscolher: (estilo: string | null) => void;
  /** A página da prévia de um estilo (a frase de exemplo nas cores e no lugar de quem pede). */
  previaDe: (estilo: string) => string | null;
  proporcao: string;
  /** Mostra "Sem animação" antes das categorias (a página de opções do Clipar). */
  semAnimacao?: boolean;
  alturaDaPrevia?: number;
};

/**
 * A biblioteca de legendas animadas (14.11): as categorias, a miniatura de cada estilo (apps/web/public/legendas,
 * gerada por apps/worker/miniaturas_legendas.py) e a prévia tocando o estilo sob o mouse, ou o escolhido.
 */
export function EscolhaDaLegendaAnimada({ escolhido, aoEscolher, previaDe, proporcao, semAnimacao, alturaDaPrevia = 240 }: Props) {
  const categoriaDoEscolhido = ESTILOS_ANIMADOS.find((estilo) => estilo.id === escolhido)?.categoria;
  const [categoria, setCategoria] = useState(categoriaDoEscolhido ?? CATEGORIAS_ANIMADAS[0].id);
  const [sobre, setSobre] = useState<string | null>(null);
  const tocando = sobre ?? escolhido;
  const previa = tocando ? previaDe(tocando) : null;
  const descricao = ESTILOS_ANIMADOS.find((estilo) => estilo.id === tocando)?.descricao;
  const [largura, altura] = proporcao.split(":").map(Number);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Categorias de legenda animada">
        {semAnimacao ? (
          <button type="button" role="tab" aria-selected={escolhido === null} className={`rounded-full border px-2.5 py-1 text-[11px] ${escolhido === null ? "border-destaque bg-destaque/15 text-texto" : "border-borda text-suave hover:text-texto"}`} onClick={() => aoEscolher(null)}>
            Sem animação
          </button>
        ) : null}
        {CATEGORIAS_ANIMADAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={categoria === item.id}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${categoria === item.id ? "border-destaque text-texto" : "border-borda text-suave hover:text-texto"}`}
            onClick={() => setCategoria(item.id)}
          >
            {item.nome}
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5" onMouseLeave={() => setSobre(null)}>
        {ESTILOS_ANIMADOS.filter((estilo) => estilo.categoria === categoria).map((estilo) => (
          <li key={estilo.id}>
            <button
              type="button"
              className={`group flex w-full flex-col overflow-hidden rounded-md border text-left ${escolhido === estilo.id ? "border-destaque ring-1 ring-destaque" : "border-borda hover:border-suave"}`}
              aria-pressed={escolhido === estilo.id}
              title={estilo.descricao}
              onMouseEnter={() => setSobre(estilo.id)}
              onFocus={() => setSobre(estilo.id)}
              onBlur={() => setSobre(null)}
              onClick={() => aoEscolher(estilo.id)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a miniatura estática da pasta pública */}
              <img src={`/legendas/${estilo.id}.webp`} alt="" loading="lazy" className="aspect-square w-full bg-painel-3 object-cover" />
              <span className="truncate px-1.5 py-1 text-[10px] text-suave group-hover:text-texto">{estilo.nome}</span>
            </button>
          </li>
        ))}
      </ul>
      {previa ? (
        // A largura que cabe na altura da prévia: em pé, a caixa estreita mostra o quadro inteiro
        <div className="mx-auto w-full" style={{ maxWidth: (alturaDaPrevia * largura) / altura }}>
          <PreviaDaAnimacao endereco={previa} proporcao={proporcao} alturaMaxima={alturaDaPrevia} />
        </div>
      ) : null}
      {descricao ? <p className="text-[11px] text-suave">{descricao}</p> : null}
    </div>
  );
}
