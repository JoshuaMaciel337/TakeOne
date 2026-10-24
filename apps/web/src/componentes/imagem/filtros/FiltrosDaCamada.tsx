"use client";

// Os filtros inteligentes de uma camada no painel Camadas (ADR 0003, onda 13.11), logo abaixo dela, como lá: a linha
// "Filtros inteligentes" (o olho de todos e a máscara dos filtros) e um filtro por linha, o último aplicado em cima,
// com o olho, o clique duplo nas opções, as opções de mesclagem, subir, descer e excluir.
import { ArrowDown, ArrowUp, Eye, SlidersHorizontal, SquareDashed, Trash2 } from "lucide-react";

import { arquivoDaMidia } from "@/lib/api";
import { FILTRO_POR_ID } from "@/lib/imagem/filtros/catalogo";
import type { FiltrosInteligentes } from "@/lib/imagem/filtros/pilha";
import { arquivoDaVersao } from "@/lib/pixels";
import type { Comando } from "@/lib/projeto/comandos";

export function FiltrosDaCamada({
  clipeId,
  pilha,
  nivel,
  mascaraEmFoco,
  aoExecutar,
  aoEditar,
  aoMesclagem,
  aoMascara,
}: {
  clipeId: string;
  pilha: FiltrosInteligentes;
  nivel: number;
  mascaraEmFoco: boolean;
  aoExecutar: (comando: Comando) => void;
  aoEditar: (filtroId: string) => void;
  aoMesclagem: (filtroId: string) => void;
  /** O clique na máscara dos filtros: cria (branca) ou põe em foco para o pincel. */
  aoMascara: () => void;
}) {
  const mudar = (filtros: FiltrosInteligentes, nome: string) => aoExecutar({ comando: "imagem.filtros", parametros: { clipeId, filtros, nome } });
  const ligada = pilha.ligado !== false;
  const recuo = { paddingLeft: 28 + nivel * 14 };
  return (
    <>
      <li className="flex h-7 items-center gap-1.5 border-b border-borda/40 pr-2 text-[11px]" style={recuo}>
        <button type="button" className="grid size-5 place-items-center text-suave hover:text-texto" aria-label={ligada ? "Esconder os filtros inteligentes" : "Mostrar os filtros inteligentes"} onClick={() => mudar({ ...pilha, ligado: !ligada }, "esconder os filtros")}>
          {ligada ? <Eye className="size-3.5" aria-hidden /> : <span className="size-3.5" />}
        </button>
        <button
          type="button"
          className={`relative size-5 shrink-0 overflow-hidden rounded-sm border bg-white ${mascaraEmFoco ? "border-2 border-texto" : "border-borda"}`}
          title={pilha.mascara ? "Máscara dos filtros: clique para pintar nela" : "Adicionar uma máscara aos filtros"}
          aria-label="Máscara dos filtros inteligentes"
          aria-pressed={mascaraEmFoco}
          onClick={aoMascara}
        >
          {pilha.mascara ? (
            // eslint-disable-next-line @next/next/no-img-element -- a versão da API com a sessão do cookie
            <img src={arquivoDaMidia(pilha.mascara.midia_id, arquivoDaVersao(pilha.mascara.versao))} alt="" className="size-full object-cover" />
          ) : (
            <SquareDashed className="size-full p-0.5 text-suave" aria-hidden />
          )}
        </button>
        <span className={`flex-1 truncate ${ligada ? "" : "text-apagado"}`}>Filtros inteligentes</span>
      </li>
      {[...pilha.filtros].reverse().map((filtro) => {
        const indice = pilha.filtros.indexOf(filtro);
        const nome = FILTRO_POR_ID.get(filtro.tipo)?.nome ?? filtro.tipo;
        const trocar = (de: number, para: number) => {
          const lista = [...pilha.filtros];
          [lista[de], lista[para]] = [lista[para], lista[de]];
          mudar({ ...pilha, filtros: lista }, "mudar a ordem dos filtros");
        };
        return (
          <li key={filtro.id} className="group flex h-7 items-center gap-1.5 border-b border-borda/40 pr-2 text-[11px]" style={{ paddingLeft: 40 + nivel * 14 }}>
            <button
              type="button"
              className="grid size-5 place-items-center text-suave hover:text-texto"
              aria-label={filtro.ligado ? `Desligar ${nome}` : `Ligar ${nome}`}
              onClick={() => mudar({ ...pilha, filtros: pilha.filtros.map((item) => (item.id === filtro.id ? { ...item, ligado: !item.ligado } : item)) }, filtro.ligado ? "desligar o filtro" : "ligar o filtro")}
            >
              {filtro.ligado ? <Eye className="size-3.5" aria-hidden /> : <span className="size-3.5" />}
            </button>
            <button type="button" className={`min-w-0 flex-1 truncate text-left ${filtro.ligado && ligada ? "" : "text-apagado"}`} title="Clique duplo: as opções do filtro" onDoubleClick={() => aoEditar(filtro.id)}>
              {nome}
              {filtro.modo !== "normal" || filtro.opacidade < 1 ? <span className="ml-1 text-suave">({Math.round(filtro.opacidade * 100)}%)</span> : null}
            </button>
            <span className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100">
              <button type="button" className="botao-icone size-5" title={`Opções de mesclagem de ${nome}`} aria-label={`Opções de mesclagem de ${nome}`} onClick={() => aoMesclagem(filtro.id)}>
                <SlidersHorizontal className="size-3" aria-hidden />
              </button>
              <button type="button" className="botao-icone size-5" title="Subir (vale depois)" aria-label={`Subir ${nome}`} disabled={indice === pilha.filtros.length - 1} onClick={() => trocar(indice, indice + 1)}>
                <ArrowUp className="size-3" aria-hidden />
              </button>
              <button type="button" className="botao-icone size-5" title="Descer (vale antes)" aria-label={`Descer ${nome}`} disabled={indice === 0} onClick={() => trocar(indice, indice - 1)}>
                <ArrowDown className="size-3" aria-hidden />
              </button>
              <button
                type="button"
                className="botao-icone size-5"
                title={`Excluir ${nome}`}
                aria-label={`Excluir ${nome}`}
                onClick={() => mudar({ ...pilha, filtros: pilha.filtros.filter((item) => item.id !== filtro.id) }, "excluir o filtro")}
              >
                <Trash2 className="size-3" aria-hidden />
              </button>
            </span>
          </li>
        );
      })}
    </>
  );
}
