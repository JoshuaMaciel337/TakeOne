"use client";

import { ChevronDown, Copy, Eye, Lock, Shapes, SlidersHorizontal, SquareDashed, Trash2, Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import type { Comando } from "@/lib/projeto/comandos";
import { camadasDaImagem } from "@/lib/projeto/imagem";
import { MASCARA_PADRAO, MESCLAGENS, type Mesclagem, type Projeto } from "@/lib/projeto/modelo";
import { CONTORNO_PADRAO, SOMBRA_PADRAO } from "@/lib/projeto/silhueta";
import type { Midia } from "@/lib/tipos";

import { AJUSTES, type Ajuste } from "./ajustesDaImagem";

type Props = {
  projeto: Projeto;
  midias: ReadonlyMap<string, Midia>;
  selecao: string[];
  aoSelecionar: (ids: string[]) => void;
  aoExecutar: (comando: Comando) => void;
  /** Uma camada de ajuste nova, do tipo escolhido no botão de ajuste. */
  aoCriarAjuste: (ajuste: Ajuste) => void;
  /** Um estilo de camada novo: abre o painel Propriedades na parte dele. */
  aoAbrirPropriedades: () => void;
};

/** O nome de cada camada: o do texto, "Camada de ajuste" ou o da mídia. */
export function nomeDaCamada(clipe: Projeto["faixas"][number]["clipes"][number], midias: ReadonlyMap<string, Midia>): string {
  if (clipe.texto) return clipe.texto.conteudo.replace(/\s+/g, " ").trim() || "Texto";
  if (clipe.ajuste) return "Camada de ajuste";
  return (clipe.midia_id ? midias.get(clipe.midia_id)?.nome : undefined) ?? "Imagem";
}

/** Um botão de rodapé que abre uma lista para cima. */
function BotaoComLista({ titulo, rotulo, itens, desativado }: { titulo: string; rotulo: React.ReactNode; itens: { nome: string; aoEscolher: () => void }[]; desativado?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: PointerEvent) => !caixaRef.current?.contains(evento.target as Node) && setAberto(false);
    window.addEventListener("pointerdown", fora);
    return () => window.removeEventListener("pointerdown", fora);
  }, [aberto]);
  return (
    <div ref={caixaRef} className="relative">
      <button type="button" className="botao-icone h-6 w-auto gap-0.5 px-1" title={titulo} aria-label={titulo} aria-expanded={aberto} disabled={desativado} onClick={() => setAberto((valor) => !valor)}>
        {rotulo}
        <ChevronDown className="size-2.5" aria-hidden />
      </button>
      {aberto ? (
        <div role="menu" className="absolute bottom-full left-0 z-50 mb-1 min-w-48 rounded-md border border-borda bg-painel-2 py-1 text-xs shadow-xl shadow-black/50">
          {itens.map((item) => (
            <button
              key={item.nome}
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1 text-left hover:bg-destaque/20"
              onClick={() => {
                setAberto(false);
                item.aoEscolher();
              }}
            >
              {item.nome}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * O painel Camadas, como nos editores de imagem profissionais: em cima, o modo de mesclagem e a opacidade da camada
 * escolhida, e o bloqueio; as camadas de cima para baixo (o olho na coluna da esquerda, arrastar muda a ordem); no
 * rodapé, estilo de camada (fx), máscara, ajuste, duplicar e apagar.
 */
export function PainelCamadas({ projeto, midias, selecao, aoSelecionar, aoExecutar, aoCriarAjuste, aoAbrirPropriedades }: Props) {
  const camadas = camadasDaImagem(projeto);
  const escolhida = camadas.find(({ clipe }) => selecao.includes(clipe.id));
  const [arrastada, setArrastada] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);
  const [opacidade, setOpacidade] = useState<string | null>(null);
  const ids = escolhida ? [escolhida.clipe.id] : [];
  const travada = Boolean(escolhida?.faixa.travada);

  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-borda p-2">
        <div className="flex items-center gap-2">
          <select
            aria-label="Modo de mesclagem"
            disabled={!escolhida || travada}
            value={escolhida?.clipe.mesclagem ?? "normal"}
            onChange={(evento) => aoExecutar({ comando: "clipe.mesclar", parametros: { clipeIds: ids, mesclagem: evento.currentTarget.value as Mesclagem } })}
            className="min-w-0 flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5 disabled:opacity-50"
          >
            {MESCLAGENS.map((modo) => (
              <option key={modo.id} value={modo.id}>
                {modo.nome}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-suave">
            Opacidade:
            <input
              aria-label="Opacidade"
              disabled={!escolhida || travada}
              inputMode="numeric"
              value={opacidade ?? (escolhida ? String(Math.round(escolhida.clipe.transformacao.opacidade * 100)) : "")}
              onChange={(evento) => setOpacidade(evento.currentTarget.value)}
              onBlur={() => {
                const valor = Number(opacidade);
                setOpacidade(null);
                if (escolhida && opacidade !== null && Number.isFinite(valor)) {
                  aoExecutar({ comando: "clipe.transformar", parametros: { clipeIds: ids, transformacao: { opacidade: Math.min(100, Math.max(0, valor)) / 100 } } });
                }
              }}
              onKeyDown={(evento) => evento.key === "Enter" && evento.currentTarget.blur()}
              className="w-10 rounded border border-borda bg-painel-2 px-1 py-0.5 text-right text-texto tabular-nums disabled:opacity-50"
            />
            %
          </label>
        </div>
        <div className="flex items-center gap-1 text-suave">
          Bloquear:
          <button
            type="button"
            disabled={!escolhida}
            aria-pressed={travada}
            title="Bloquear tudo (a camada não se move nem muda)"
            onClick={() => escolhida && aoExecutar({ comando: "faixa.alternar", parametros: { faixaId: escolhida.faixa.id, propriedade: "travada" } })}
            className={`grid size-5 place-items-center rounded border ${travada ? "border-destaque bg-destaque/20 text-texto" : "border-borda hover:text-texto"} disabled:opacity-40`}
          >
            <Lock className="size-3" aria-hidden />
          </button>
        </div>
      </div>

      <ol aria-label="Camadas, de cima para baixo" className="min-h-0 flex-1 overflow-y-auto" onDragLeave={() => setAlvo(null)}>
        {camadas.length === 0 ? <li className="px-3 py-4 text-center text-suave">Nenhuma camada ainda.</li> : null}
        {camadas.map(({ faixa, clipe }, indice) => {
          const midia = clipe.midia_id ? midias.get(clipe.midia_id) : undefined;
          const nome = nomeDaCamada(clipe, midias);
          const marcada = selecao.includes(clipe.id);
          const comEstilo = Boolean(clipe.contorno || clipe.sombra);
          const mesclagem = clipe.mesclagem && clipe.mesclagem !== "normal" ? MESCLAGENS.find((m) => m.id === clipe.mesclagem)?.nome : null;
          return (
            <li
              key={faixa.id}
              draggable
              onDragStart={(evento) => {
                setArrastada(faixa.id);
                evento.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(evento) => {
                if (!arrastada) return;
                evento.preventDefault();
                const caixa = evento.currentTarget.getBoundingClientRect();
                setAlvo(evento.clientY < caixa.top + caixa.height / 2 ? indice : indice + 1);
              }}
              onDrop={(evento) => {
                evento.preventDefault();
                if (arrastada && alvo !== null) {
                  const de = camadas.findIndex((camada) => camada.faixa.id === arrastada);
                  const para = alvo > de ? alvo - 1 : alvo;
                  if (para !== de) aoExecutar({ comando: "imagem.mover", parametros: { faixaId: arrastada, para } });
                }
                setArrastada(null);
                setAlvo(null);
              }}
              onDragEnd={() => {
                setArrastada(null);
                setAlvo(null);
              }}
              className={`relative flex h-9 items-stretch border-b border-borda/60 ${marcada ? "bg-destaque/25" : "hover:bg-painel-2"} ${arrastada === faixa.id ? "opacity-50" : ""}`}
            >
              {alvo === indice ? <span className="absolute inset-x-0 top-0 h-0.5 bg-destaque" aria-hidden /> : null}
              {alvo === indice + 1 && indice === camadas.length - 1 ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-destaque" aria-hidden /> : null}
              <button
                type="button"
                onClick={() => aoExecutar({ comando: "faixa.alternar", parametros: { faixaId: faixa.id, propriedade: "oculta" } })}
                aria-label={faixa.oculta ? `Mostrar ${nome}` : `Esconder ${nome}`}
                title={faixa.oculta ? "Mostrar a camada" : "Esconder a camada"}
                className="grid w-7 shrink-0 place-items-center border-r border-borda/60 text-suave hover:text-texto"
              >
                {faixa.oculta ? <span className="size-3.5" /> : <Eye className="size-3.5" aria-hidden />}
              </button>
              <button type="button" onClick={() => aoSelecionar([clipe.id])} aria-pressed={marcada} className="flex min-w-0 flex-1 items-center gap-2 px-1.5 text-left">
                <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-borda bg-painel-3">
                  {clipe.texto ? (
                    <Type className="size-3.5 text-suave" aria-hidden />
                  ) : clipe.ajuste ? (
                    <SlidersHorizontal className="size-3.5 text-suave" aria-hidden />
                  ) : midia?.elemento ? (
                    <Shapes className="size-3.5 text-suave" aria-hidden />
                  ) : midia ? (
                    // eslint-disable-next-line @next/next/no-img-element -- capa da API com a sessão do cookie
                    <img src={arquivoDaMidia(midia.id, "capa.jpg")} alt="" className="size-full object-cover" />
                  ) : null}
                </span>
                {clipe.mascara ? <SquareDashed className="size-3.5 shrink-0 text-suave" aria-label="Com máscara" /> : null}
                <span className={`min-w-0 flex-1 truncate ${faixa.oculta ? "text-apagado" : ""}`}>{nome}</span>
                {mesclagem ? <span className="shrink-0 text-[10px] text-suave">{mesclagem}</span> : null}
                {comEstilo ? <span className="shrink-0 font-serif text-[11px] italic text-suave">fx</span> : null}
                {faixa.travada ? <Lock className="size-3 shrink-0 text-suave" aria-label="Bloqueada" /> : null}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex h-8 shrink-0 items-center justify-end gap-0.5 border-t border-borda px-1.5">
        <BotaoComLista
          titulo="Adicionar um estilo de camada"
          rotulo={<span className="font-serif text-[13px] italic">fx</span>}
          desativado={!escolhida || travada}
          itens={[
            {
              nome: "Contorno…",
              aoEscolher: () => {
                aoExecutar({ comando: "clipe.silhueta", parametros: { clipeIds: ids, contorno: escolhida?.clipe.contorno ?? CONTORNO_PADRAO } });
                aoAbrirPropriedades();
              },
            },
            {
              nome: "Sombra projetada…",
              aoEscolher: () => {
                aoExecutar({ comando: "clipe.silhueta", parametros: { clipeIds: ids, sombra: escolhida?.clipe.sombra ?? SOMBRA_PADRAO } });
                aoAbrirPropriedades();
              },
            },
          ]}
        />
        <button
          type="button"
          className="botao-icone size-6"
          title="Adicionar uma máscara (elipse; mude a forma em Propriedades)"
          aria-label="Adicionar uma máscara"
          disabled={!escolhida || travada || Boolean(escolhida.clipe.mascara)}
          onClick={() => {
            aoExecutar({ comando: "clipe.mascara", parametros: { clipeIds: ids, mascara: MASCARA_PADRAO } });
            aoAbrirPropriedades();
          }}
        >
          <SquareDashed className="size-3.5" aria-hidden />
        </button>
        <BotaoComLista
          titulo="Criar uma camada de ajuste"
          rotulo={<SlidersHorizontal className="size-3.5" aria-hidden />}
          itens={AJUSTES.map((ajuste) => ({ nome: `${ajuste.nome}…`, aoEscolher: () => aoCriarAjuste(ajuste) }))}
        />
        <button
          type="button"
          className="botao-icone size-6"
          title="Duplicar a camada (Ctrl+J)"
          aria-label="Duplicar a camada"
          disabled={!escolhida}
          onClick={() => escolhida && aoExecutar({ comando: "imagem.duplicar", parametros: { faixaId: escolhida.faixa.id } })}
        >
          <Copy className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="botao-icone size-6"
          title="Excluir a camada (Delete)"
          aria-label="Excluir a camada"
          disabled={!escolhida || travada}
          onClick={() => escolhida && aoExecutar({ comando: "imagem.apagar", parametros: { faixaId: escolhida.faixa.id } })}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
