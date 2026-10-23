"use client";

import { ChevronLeft, ChevronRight, Diamond, MousePointerClick, RotateCcw, Timer, X } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";

import type { Comando } from "@/lib/projeto/comandos";
import { LIMITES_TRANSFORMACAO, VOLUME_MAXIMO } from "@/lib/projeto/edicao";
import { EFEITOS } from "@/lib/projeto/efeitos";
import { type ChaveDeKeyframe, transformacaoParaEditar, volumeNoTempo } from "@/lib/projeto/keyframes";
import { type Clipe, type Faixa, MESCLAGENS, type Mesclagem, type Projeto, type Transformacao } from "@/lib/projeto/modelo";
import { duracaoDoQuadro, formatarTimecodeLongo, type Tick } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

import type { IdAba } from "./PainelPropriedades";
import { razao } from "./proporcoes";

type Props = {
  projeto: Projeto;
  selecionado: { clipe: Clipe; faixa: Faixa } | null;
  midia: Midia | null;
  tempo: Tick;
  aoBuscar: (tempo: Tick) => void;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
  /** Abre uma aba do painel Propriedades (a velocidade, o efeito). */
  aoAbrirAba: (aba: IdAba) => void;
};

const PERTO = 1e-6;
const LADO_MENOR = 1080;

function numero(valor: number, casas: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas, useGrouping: false });
}

/**
 * Um número que se arrasta para os lados (como nos controles de efeito dos editores profissionais): arrastar muda o
 * valor (Shift, dez vezes mais rápido), um clique abre o campo para digitar e as setas mudam um passo.
 */
function NumeroArrastavel({
  rotulo,
  valor,
  casas = 1,
  sufixo = "",
  passo = 1,
  minimo = -Infinity,
  maximo = Infinity,
  desativado = false,
  aoPrever,
  aoConfirmar,
}: {
  rotulo: string;
  valor: number;
  casas?: number;
  sufixo?: string;
  passo?: number;
  minimo?: number;
  maximo?: number;
  desativado?: boolean;
  aoPrever: (valor: number) => void;
  aoConfirmar: (valor: number) => void;
}) {
  const [editando, setEditando] = useState(false);
  const arrasto = useRef<{ x: number; inicial: number; atual: number; moveu: boolean } | null>(null);
  const limitar = (v: number) => Math.min(maximo, Math.max(minimo, v));
  if (editando) {
    return (
      <input
        autoFocus
        aria-label={rotulo}
        defaultValue={numero(valor, casas)}
        onFocus={(evento) => evento.currentTarget.select()}
        onBlur={(evento) => {
          setEditando(false);
          const digitado = Number(evento.currentTarget.value.replace(",", "."));
          if (Number.isFinite(digitado)) aoConfirmar(limitar(digitado));
        }}
        onKeyDown={(evento) => {
          if (evento.key === "Enter") evento.currentTarget.blur();
          if (evento.key === "Escape") setEditando(false);
        }}
        className="w-16 rounded border border-destaque bg-painel-2 px-1 text-right text-xs tabular-nums text-texto outline-none"
      />
    );
  }
  return (
    <span
      role="slider"
      tabIndex={desativado ? -1 : 0}
      aria-label={rotulo}
      aria-valuenow={valor}
      aria-disabled={desativado}
      title={desativado ? undefined : "Arraste para os lados, ou clique para digitar"}
      onPointerDown={(evento) => {
        if (desativado) return;
        evento.currentTarget.setPointerCapture(evento.pointerId);
        arrasto.current = { x: evento.clientX, inicial: valor, atual: valor, moveu: false };
      }}
      onPointerMove={(evento) => {
        const atual = arrasto.current;
        if (!atual) return;
        const dx = evento.clientX - atual.x;
        if (!atual.moveu && Math.abs(dx) < 3) return;
        atual.moveu = true;
        atual.atual = limitar(atual.inicial + Math.round(dx) * passo * (evento.shiftKey ? 10 : 1));
        aoPrever(atual.atual);
      }}
      onPointerUp={() => {
        const atual = arrasto.current;
        arrasto.current = null;
        if (!atual) return;
        if (atual.moveu) aoConfirmar(atual.atual);
        else setEditando(true);
      }}
      onKeyDown={(evento) => {
        if (desativado) return;
        if (evento.key === "Enter") setEditando(true);
        else if (evento.key === "ArrowRight" || evento.key === "ArrowUp" || evento.key === "ArrowLeft" || evento.key === "ArrowDown") {
          evento.preventDefault();
          evento.stopPropagation();
          const sentido = evento.key === "ArrowRight" || evento.key === "ArrowUp" ? 1 : -1;
          aoConfirmar(limitar(valor + sentido * passo * (evento.shiftKey ? 10 : 1)));
        }
      }}
      className={`cursor-ew-resize select-none whitespace-nowrap rounded px-0.5 tabular-nums text-codigo underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-1 focus-visible:ring-codigo ${desativado ? "pointer-events-none opacity-50" : ""}`}
    >
      {numero(valor, casas)}
      {sufixo}
    </span>
  );
}

/** Um losango da faixa: o instante (desde o começo do clipe) e as chaves com ponto nele (a posição tem x e y). */
type Losango = { t: Tick; chaves: ChaveDeKeyframe[] };

/**
 * Uma linha dos controles: o cronômetro (liga e desliga a animação), o nome, os valores, as setas e o losango do
 * keyframe à esquerda; a faixa com os losangos no tempo do clipe à direita (clicar leva o cursor; arrastar um losango
 * muda o instante dele).
 */
function Linha({
  nome,
  chaves,
  clipe,
  projeto,
  tempo,
  travada,
  aoBuscar,
  aoExecutar,
  children,
}: {
  nome: string;
  chaves: ChaveDeKeyframe[] | null;
  clipe: Clipe;
  projeto: Projeto;
  tempo: Tick;
  travada: boolean;
  aoBuscar: (tempo: Tick) => void;
  aoExecutar: (comando: Comando) => void;
  children: ReactNode;
}) {
  const faixaRef = useRef<HTMLDivElement>(null);
  const [arrastado, setArrastado] = useState<{ de: Tick; para: Tick } | null>(null);
  const meioQuadro = duracaoDoQuadro(projeto.taxa) / 2;
  const noClipe = tempo - clipe.inicio;
  const dentro = noClipe >= 0 && noClipe <= clipe.duracao;
  const porInstante = new Map<number, ChaveDeKeyframe[]>();
  for (const chave of chaves ?? []) {
    for (const ponto of clipe.keyframes?.[chave] ?? []) {
      const ja = [...porInstante.keys()].find((t) => Math.abs(t - ponto.t) <= meioQuadro);
      if (ja === undefined) porInstante.set(ponto.t, [chave]);
      else porInstante.get(ja)!.push(chave);
    }
  }
  const pontos: Losango[] = [...porInstante.entries()].map(([t, cs]) => ({ t, chaves: cs })).sort((a, b) => a.t - b.t);
  const animada = Boolean(chaves?.some((chave) => clipe.keyframes?.[chave]?.length));
  const noInstante = pontos.some((ponto) => Math.abs(ponto.t - noClipe) <= meioQuadro);
  const anterior = [...pontos].reverse().find((ponto) => ponto.t < noClipe - meioQuadro);
  const seguinte = pontos.find((ponto) => ponto.t > noClipe + meioQuadro);
  const fracao = (t: Tick) => `${(Math.min(Math.max(t / Math.max(1, clipe.duracao), 0), 1) * 100).toFixed(3)}%`;
  const tempoNaFaixa = (clientX: number) => {
    const caixa = faixaRef.current!.getBoundingClientRect();
    return Math.min(Math.max((clientX - caixa.left) / caixa.width, 0), 1) * clipe.duracao;
  };
  const alternar = () => {
    for (const chave of chaves ?? []) aoExecutar({ comando: "clipe.keyframe", parametros: { clipeId: clipe.id, propriedade: chave, tempo, acao: "alternar" } });
  };

  return (
    <div className="flex min-h-7 items-stretch border-b border-borda/40 text-xs">
      <div className="flex min-w-0 flex-1 items-center gap-1 py-0.5 pl-5 pr-1">
        {chaves ? (
          <button
            type="button"
            disabled={travada}
            aria-pressed={animada}
            onClick={() => {
              if (!animada) {
                if (dentro) alternar();
                return;
              }
              if (!window.confirm(`Desligar a animação de ${nome.toLowerCase()}? Os keyframes dela saem e fica o valor do cursor.`)) return;
              for (const chave of chaves) aoExecutar({ comando: "clipe.limparKeyframes", parametros: { clipeId: clipe.id, propriedade: chave, tempo } });
            }}
            title={animada ? "Desligar a animação (tira os keyframes)" : "Ligar a animação: põe um keyframe no cursor"}
            aria-label={animada ? `Desligar a animação de ${nome}` : `Animar ${nome}`}
            className={`grid size-5 shrink-0 place-items-center rounded ${animada ? "text-codigo" : "text-suave hover:text-texto"} disabled:opacity-40`}
          >
            <Timer className="size-3.5" aria-hidden />
          </button>
        ) : (
          <span className="size-5 shrink-0" />
        )}
        <span className="w-[4.5rem] shrink-0 truncate text-suave" title={nome}>
          {nome}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
        {chaves && animada ? (
          <span className="flex shrink-0 items-center">
            <button type="button" className="grid size-4 place-items-center text-suave hover:text-texto disabled:opacity-30" disabled={!anterior} onClick={() => anterior && aoBuscar(clipe.inicio + anterior.t)} aria-label="Ir para o keyframe anterior" title="Ir para o keyframe anterior">
              <ChevronLeft className="size-3" aria-hidden />
            </button>
            <button type="button" className="grid size-4 place-items-center text-codigo disabled:opacity-30" disabled={travada || !dentro} onClick={alternar} aria-pressed={noInstante} aria-label={noInstante ? "Tirar o keyframe do cursor" : "Pôr um keyframe no cursor"} title={noInstante ? "Tirar o keyframe do cursor" : "Pôr um keyframe no cursor"}>
              <Diamond className="size-3" fill={noInstante ? "currentColor" : "none"} aria-hidden />
            </button>
            <button type="button" className="grid size-4 place-items-center text-suave hover:text-texto disabled:opacity-30" disabled={!seguinte} onClick={() => seguinte && aoBuscar(clipe.inicio + seguinte.t)} aria-label="Ir para o keyframe seguinte" title="Ir para o keyframe seguinte">
              <ChevronRight className="size-3" aria-hidden />
            </button>
          </span>
        ) : null}
      </div>
      <div
        ref={faixaRef}
        className="relative w-[38%] shrink-0 cursor-pointer border-l border-borda bg-painel-2/40"
        onPointerDown={(evento) => {
          if (evento.target === evento.currentTarget) aoBuscar(clipe.inicio + Math.round(tempoNaFaixa(evento.clientX)));
        }}
      >
        {dentro ? <span className="pointer-events-none absolute inset-y-0 w-px bg-codigo" style={{ left: fracao(noClipe) }} aria-hidden /> : null}
        {pontos.map((ponto) => {
          const t = arrastado && Math.abs(arrastado.de - ponto.t) <= meioQuadro ? arrastado.para : ponto.t;
          return (
            <button
              key={ponto.t}
              type="button"
              aria-label={`Keyframe em ${formatarTimecodeLongo(clipe.inicio + ponto.t, projeto.taxa)}`}
              title="Clique para ir até ele; arraste para mudar o instante"
              className="absolute top-1/2 grid size-3.5 -translate-x-1/2 -translate-y-1/2 place-items-center text-texto"
              style={{ left: fracao(t) }}
              onPointerDown={(evento) => {
                evento.stopPropagation();
                if (travada) return;
                evento.currentTarget.setPointerCapture(evento.pointerId);
                setArrastado({ de: ponto.t, para: ponto.t });
              }}
              onPointerMove={(evento) => {
                if (arrastado && Math.abs(arrastado.de - ponto.t) <= meioQuadro) setArrastado({ de: ponto.t, para: tempoNaFaixa(evento.clientX) });
              }}
              onPointerUp={() => {
                const atual = arrastado;
                setArrastado(null);
                if (!atual || Math.abs(atual.para - atual.de) <= meioQuadro) {
                  aoBuscar(clipe.inicio + ponto.t);
                  return;
                }
                for (const chave of ponto.chaves) aoExecutar({ comando: "clipe.moverKeyframe", parametros: { clipeId: clipe.id, propriedade: chave, de: ponto.t, para: Math.round(atual.para) } });
              }}
            >
              <Diamond className="size-3" fill="currentColor" aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** O cabeçalho de um efeito: "fx", o nome e o redefinir (ou tirar). */
function Componente({ nome, aoRedefinir, aoTirar, children }: { nome: string; aoRedefinir?: () => void; aoTirar?: () => void; children: ReactNode }) {
  const [aberto, setAberto] = useState(true);
  return (
    <section>
      <div className="flex h-7 items-stretch border-b border-borda/60 bg-painel-2/60 text-xs">
        <button type="button" aria-expanded={aberto} onClick={() => setAberto((atual) => !atual)} className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 text-left font-semibold hover:bg-painel-2">
          <ChevronRight className={`size-3.5 text-suave transition ${aberto ? "rotate-90" : ""}`} aria-hidden />
          <span className="font-serif text-[11px] italic text-suave">fx</span>
          <span className="truncate">{nome}</span>
          <span className="ml-auto flex items-center gap-0.5">
            {aoRedefinir ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(evento) => {
                  evento.stopPropagation();
                  aoRedefinir();
                }}
                onKeyDown={(evento) => evento.key === "Enter" && aoRedefinir()}
                className="grid size-5 place-items-center rounded text-suave hover:text-texto"
                title="Redefinir"
                aria-label={`Redefinir ${nome}`}
              >
                <RotateCcw className="size-3" aria-hidden />
              </span>
            ) : null}
            {aoTirar ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(evento) => {
                  evento.stopPropagation();
                  aoTirar();
                }}
                onKeyDown={(evento) => evento.key === "Enter" && aoTirar()}
                className="grid size-5 place-items-center rounded text-suave hover:text-texto"
                title="Tirar o efeito"
                aria-label={`Tirar ${nome}`}
              >
                <X className="size-3" aria-hidden />
              </span>
            ) : null}
          </span>
        </button>
        <span className="w-[38%] shrink-0 border-l border-borda" />
      </div>
      {aberto ? children : null}
    </section>
  );
}

/**
 * Controles de efeito: os componentes do clipe escolhido na ordem dos editores profissionais (Movimento, Opacidade,
 * Remapeamento de tempo, o efeito e o Volume), com os valores que se arrastam e, à direita, a faixa do tempo do clipe
 * com os keyframes. Os outros ajustes (recorte, cantos, IA, texto) ficam no painel Propriedades.
 */
export function ControlesDeEfeito({ projeto, selecionado, midia, tempo, aoBuscar, aoPrever, aoExecutar, aoAbrirAba }: Props) {
  if (!selecionado) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <MousePointerClick className="size-6 text-suave" aria-hidden />
        <p className="text-xs text-suave">Selecione um clipe na linha do tempo para ver os controles de efeito dele.</p>
      </div>
    );
  }
  const { clipe, faixa } = selecionado;
  const travada = faixa.travada;
  const visual = faixa.tipo !== "audio";
  const comSom = faixa.tipo === "audio" || (Boolean(midia?.audio) && !midia?.imagem && !clipe.som_separado && !clipe.texto);
  const t = transformacaoParaEditar(clipe, tempo);
  const r = razao(projeto.proporcao as Parameters<typeof razao>[0]);
  const quadro = r >= 1 ? { largura: Math.round(LADO_MENOR * r), altura: LADO_MENOR } : { largura: LADO_MENOR, altura: Math.round(LADO_MENOR / r) };
  const linha = { clipe, projeto, tempo, travada, aoBuscar, aoExecutar };

  const transformar = (mudanca: Partial<Transformacao>): Comando => ({ comando: "clipe.transformar", parametros: { clipeIds: [clipe.id], transformacao: mudanca, tempo } });
  const controle = (atual: number, mudanca: (valor: number) => Comando) => ({
    valor: atual,
    desativado: travada,
    aoPrever: (valor: number) => aoPrever(mudanca(valor)),
    aoConfirmar: (valor: number) => {
      if (Math.abs(valor - atual) < PERTO) aoPrever(null);
      else aoExecutar(mudanca(valor));
    },
  });
  const volume = volumeNoTempo(clipe, tempo);
  const nivelDb = volume > 0 ? 20 * Math.log10(volume) : -60;
  const efeito = clipe.efeito ? EFEITOS.find((item) => item.id === clipe.efeito!.tipo) : undefined;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-7 shrink-0 items-stretch border-b border-borda text-[11px]">
        <span className="flex min-w-0 flex-1 items-center truncate px-2">
          <span className="text-suave">Clipe:&nbsp;</span>
          <span className="truncate font-medium">{clipe.texto ? clipe.texto.conteudo.split("\n")[0] : (midia?.nome ?? "Clipe")}</span>
        </span>
        <span className="flex w-[38%] shrink-0 items-center justify-between border-l border-borda px-1 font-mono text-[10px] text-suave">
          <span>{formatarTimecodeLongo(clipe.inicio, projeto.taxa)}</span>
          <span>{formatarTimecodeLongo(clipe.inicio + clipe.duracao, projeto.taxa)}</span>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {travada ? <p className="m-2 rounded bg-painel-2 px-2 py-1.5 text-xs text-suave">A faixa está travada. Destrave o cadeado para editar.</p> : null}
        {visual ? (
          <>
            <h3 className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-suave">Efeitos de vídeo</h3>
            <Componente nome="Movimento" aoRedefinir={travada ? undefined : () => aoExecutar(transformar({ x: 0, y: 0, escala: 1, rotacao: 0 }))}>
              <Linha nome="Posição" chaves={["x", "y"]} {...linha}>
                <NumeroArrastavel
                  rotulo="Posição horizontal, em pixels"
                  {...controle((0.5 + t.x) * quadro.largura, (px) => transformar({ x: px / quadro.largura - 0.5 }))}
                  minimo={(0.5 + LIMITES_TRANSFORMACAO.x.minimo) * quadro.largura}
                  maximo={(0.5 + LIMITES_TRANSFORMACAO.x.maximo) * quadro.largura}
                />
                <NumeroArrastavel
                  rotulo="Posição vertical, em pixels"
                  {...controle((0.5 + t.y) * quadro.altura, (px) => transformar({ y: px / quadro.altura - 0.5 }))}
                  minimo={(0.5 + LIMITES_TRANSFORMACAO.y.minimo) * quadro.altura}
                  maximo={(0.5 + LIMITES_TRANSFORMACAO.y.maximo) * quadro.altura}
                />
              </Linha>
              <Linha nome="Escala" chaves={["escala"]} {...linha}>
                <NumeroArrastavel
                  rotulo="Escala"
                  sufixo=" %"
                  {...controle(t.escala * 100, (valor) => transformar({ escala: valor / 100 }))}
                  minimo={LIMITES_TRANSFORMACAO.escala.minimo * 100}
                  maximo={LIMITES_TRANSFORMACAO.escala.maximo * 100}
                />
              </Linha>
              <Linha nome="Rotação" chaves={["rotacao"]} {...linha}>
                <NumeroArrastavel rotulo="Rotação" sufixo="°" {...controle(t.rotacao, (valor) => transformar({ rotacao: valor }))} />
              </Linha>
            </Componente>
            <Componente nome="Opacidade" aoRedefinir={travada ? undefined : () => aoExecutar(transformar({ opacidade: 1 }))}>
              <Linha nome="Opacidade" chaves={["opacidade"]} {...linha}>
                <NumeroArrastavel rotulo="Opacidade" sufixo=" %" minimo={0} maximo={100} {...controle(t.opacidade * 100, (valor) => transformar({ opacidade: valor / 100 }))} />
              </Linha>
              <Linha nome="Mesclagem" chaves={null} {...linha}>
                <select
                  aria-label="Modo de mesclagem"
                  disabled={travada}
                  value={clipe.mesclagem ?? "normal"}
                  onChange={(evento) => aoExecutar({ comando: "clipe.mesclar", parametros: { clipeIds: [clipe.id], mesclagem: evento.currentTarget.value as Mesclagem } })}
                  className="min-w-0 rounded border border-borda bg-painel-2 px-1 py-0.5 text-xs"
                >
                  {MESCLAGENS.map((modo) => (
                    <option key={modo.id} value={modo.id}>
                      {modo.nome}
                    </option>
                  ))}
                </select>
              </Linha>
            </Componente>
            {!clipe.texto && midia && !midia.imagem ? (
              <Componente nome="Remapeamento de tempo">
                <Linha nome="Velocidade" chaves={null} {...linha}>
                  <span className="whitespace-nowrap tabular-nums">{numero(clipe.velocidade * 100, 0)} %</span>
                  {clipe.curva_velocidade?.length ? <span className="text-suave">com curva</span> : null}
                  <button type="button" className="text-codigo hover:underline" onClick={() => aoAbrirAba("velocidade")}>
                    Mudar…
                  </button>
                </Linha>
              </Componente>
            ) : null}
            {clipe.efeito && efeito ? (
              <Componente nome={efeito.nome} aoTirar={travada ? undefined : () => aoExecutar({ comando: "clipe.efeito", parametros: { clipeIds: [clipe.id], efeito: null } })}>
                <Linha nome="Intensidade" chaves={null} {...linha}>
                  <NumeroArrastavel
                    rotulo="Intensidade"
                    sufixo=" %"
                    casas={0}
                    minimo={0}
                    maximo={100}
                    {...controle(clipe.efeito.intensidade * 100, (valor) => ({ comando: "clipe.efeito", parametros: { clipeIds: [clipe.id], efeito: { ...clipe.efeito!, intensidade: valor / 100 } } }))}
                  />
                </Linha>
              </Componente>
            ) : null}
          </>
        ) : null}
        {comSom ? (
          <>
            <h3 className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-suave">Efeitos de áudio</h3>
            <Componente nome="Volume" aoRedefinir={travada ? undefined : () => aoExecutar({ comando: "clipe.audio", parametros: { clipeIds: [clipe.id], volume: 1, tempo } })}>
              <Linha nome="Nível" chaves={["volume"]} {...linha}>
                <NumeroArrastavel
                  rotulo="Nível do som, em decibéis"
                  sufixo=" dB"
                  passo={0.1}
                  minimo={-60}
                  maximo={20 * Math.log10(VOLUME_MAXIMO)}
                  {...controle(nivelDb, (db) => ({ comando: "clipe.audio", parametros: { clipeIds: [clipe.id], volume: db <= -60 ? 0 : 10 ** (db / 20), tempo } }))}
                />
              </Linha>
              <div className="px-5 py-1.5 text-[11px] text-suave">
                Equalizador, eco, voz limpa, tom e nivelar ficam na{" "}
                <button type="button" className="text-codigo hover:underline" onClick={() => aoAbrirAba("audio")}>
                  aba Áudio
                </button>
                .
              </div>
            </Componente>
          </>
        ) : null}
      </div>
    </div>
  );
}
