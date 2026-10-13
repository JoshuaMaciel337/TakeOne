"use client";

import { MousePointerClick, RotateCcw } from "lucide-react";
import { useState } from "react";

import { formatarBytes, formatarTempo } from "@/lib/formatar";
import type { Comando } from "@/lib/projeto/comandos";
import { LIMITES_TRANSFORMACAO, RECORTE_MINIMO, VOLUME_MAXIMO } from "@/lib/projeto/edicao";
import { type Clipe, type Faixa, type Recorte, RECORTE_PADRAO, type Transformacao, TRANSFORMACAO_PADRAO } from "@/lib/projeto/modelo";
import { formatarTimecode, type Taxa, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

import { ControleNumerico } from "./ControleNumerico";

// As abas da seção 5 do plano. As que ainda não têm conteúdo dizem em que fase chegam.
const ABAS = [
  { id: "info", nome: "Informações", fase: "" },
  { id: "basico", nome: "Básico", fase: "" },
  { id: "audio", nome: "Áudio", fase: "" },
  { id: "velocidade", nome: "Velocidade", fase: "Fase 4" },
  { id: "animacao", nome: "Animação", fase: "Fase 3" },
  { id: "cor", nome: "Cor", fase: "Fase 4" },
] as const;

type IdAba = (typeof ABAS)[number]["id"];

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-borda/60 py-2 text-xs last:border-0">
      <dt className="text-suave">{rotulo}</dt>
      <dd className="min-w-0 truncate text-right font-medium tabular-nums" title={valor}>
        {valor}
      </dd>
    </div>
  );
}

const NOMES_FAIXA: Record<Faixa["tipo"], string> = { principal: "Principal", video: "Sobreposição", audio: "Áudio" };

type Props = {
  midia: Midia | null;
  /** O clipe escolhido na linha do tempo; `midia` é a dele. */
  selecionado: { clipe: Clipe; faixa: Faixa } | null;
  taxa: Taxa;
  /** Cor de fundo do projeto, mostrada quando nada está selecionado. */
  fundo: string;
  /** Mudança provisória enquanto um controle é arrastado; `null` para desistir dela. */
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
  className?: string;
  style?: React.CSSProperties;
};

export function PainelPropriedades({ midia, selecionado, taxa, fundo, aoPrever, aoExecutar, className = "", style }: Props) {
  const [abaEscolhida, setAba] = useState<IdAba>("basico");
  // Mídia da biblioteca, sem clipe, só tem informações
  const aba = selecionado ? abaEscolhida : "info";
  const atual = ABAS.find((item) => item.id === aba)!;

  if (!midia) {
    return (
      <aside aria-label="Propriedades" style={style} className={`flex min-h-0 shrink-0 flex-col bg-painel ${className}`}>
        <div className="border-b border-borda p-3">
          <h3 className="text-sm font-semibold">Projeto</h3>
          <CorDeFundo cor={fundo} aoPrever={aoPrever} aoExecutar={aoExecutar} />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <MousePointerClick className="size-6 text-suave" aria-hidden />
          <p className="text-xs text-suave">Selecione um clipe na prévia ou na linha do tempo para ajustar posição, tamanho e recorte.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside aria-label="Propriedades" style={style} className={`flex min-h-0 shrink-0 flex-col bg-painel ${className}`}>
      <div role="tablist" aria-label="Propriedades" className="flex shrink-0 gap-1 overflow-x-auto border-b border-borda px-2 py-1.5">
        {ABAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === aba}
            disabled={!selecionado && item.id !== "info"}
            onClick={() => setAba(item.id)}
            className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium transition ${
              item.id === aba ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"
            } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-suave`}
          >
            {item.nome}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto p-3">
        {aba === "info" ? (
          <>
            {selecionado ? (
              <>
                <h3 className="text-sm font-semibold">Clipe</h3>
                <dl className="mb-4 mt-2">
                  <Linha rotulo="Faixa" valor={NOMES_FAIXA[selecionado.faixa.tipo]} />
                  <Linha rotulo="Começa em" valor={formatarTimecode(selecionado.clipe.inicio, taxa)} />
                  <Linha rotulo="Duração" valor={formatarTimecode(selecionado.clipe.duracao, taxa)} />
                  <Linha rotulo="Trecho da mídia a partir de" valor={formatarTimecode(selecionado.clipe.entrada, taxa)} />
                  <Linha rotulo="Velocidade" valor={`${selecionado.clipe.velocidade.toLocaleString("pt-BR")}×`} />
                  <Linha rotulo="Volume" valor={`${Math.round(selecionado.clipe.volume * 100)}%`} />
                </dl>
              </>
            ) : null}
            <h3 className="truncate text-sm font-semibold" title={midia.nome}>
              {selecionado ? `Mídia · ${midia.nome}` : midia.nome}
            </h3>
            <dl className="mt-2">
              <Linha rotulo="Arquivo" valor={midia.nome_original} />
              <Linha rotulo="Tamanho" valor={formatarBytes(midia.tamanho_total)} />
              <Linha rotulo="Duração" valor={formatarTempo(midia.duracao)} />
              {midia.video ? (
                <>
                  <Linha rotulo="Resolução" valor={`${midia.video.largura} × ${midia.video.altura}`} />
                  <Linha rotulo="Quadros por segundo" valor={midia.video.fps ? String(midia.video.fps) : "-"} />
                  <Linha rotulo="Codec do vídeo" valor={midia.video.codec?.toUpperCase() ?? "-"} />
                </>
              ) : null}
              {midia.audio ? (
                <Linha
                  rotulo="Áudio"
                  valor={`${midia.audio.codec?.toUpperCase() ?? "-"} · ${midia.audio.canais === 1 ? "mono" : `${midia.audio.canais} canais`} · ${(midia.audio.taxa / 1000).toLocaleString("pt-BR")} kHz`}
                />
              ) : (
                <Linha rotulo="Áudio" valor="Sem áudio" />
              )}
            </dl>
          </>
        ) : aba === "basico" && selecionado ? (
          <AbaBasico clipe={selecionado.clipe} faixa={selecionado.faixa} aoPrever={aoPrever} aoExecutar={aoExecutar} />
        ) : aba === "audio" && selecionado ? (
          <AbaAudio clipe={selecionado.clipe} faixa={selecionado.faixa} temSom={Boolean(midia.audio)} aoPrever={aoPrever} aoExecutar={aoExecutar} />
        ) : (
          <p className="py-8 text-center text-xs text-suave">
            Os ajustes de {atual.nome.toLowerCase()} do clipe chegam na {atual.fase.toLowerCase()}.
          </p>
        )}
      </div>
    </aside>
  );
}

type PropsAba = {
  clipe: Clipe;
  faixa: Faixa;
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
};

function Secao({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="border-b border-borda/60 pb-2 pt-3 first:pt-0 last:border-0">
      <div className="flex min-h-6 items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

type Bordas = { esquerda: number; topo: number; direita: number; base: number };

/** Bordas cortadas, em frações da mídia, a partir do recorte (que guarda o que sobra). */
function bordasDoRecorte(r: Recorte): Bordas {
  return { esquerda: r.x, topo: r.y, direita: 1 - r.x - r.largura, base: 1 - r.y - r.altura };
}

function recorteDasBordas(b: Bordas): Recorte {
  return { x: b.esquerda, y: b.topo, largura: 1 - b.esquerda - b.direita, altura: 1 - b.topo - b.base };
}

/** Diferença abaixo da qual dois valores contam como iguais (evita passo de desfazer sem mudança). */
const PERTO = 1e-6;

/** Posição, tamanho, giro, opacidade e recorte do clipe. */
function AbaBasico({ clipe, faixa, aoPrever, aoExecutar }: PropsAba) {
  if (faixa.tipo === "audio") {
    return <p className="py-8 text-center text-xs text-suave">Clipes de áudio não aparecem na imagem.</p>;
  }
  const t = clipe.transformacao;
  const travada = faixa.travada;
  const ids = [clipe.id];

  const transformar = (mudanca: Partial<Transformacao>): Comando => ({ comando: "clipe.transformar", parametros: { clipeIds: ids, transformacao: mudanca } });
  /** `fator` converte o valor guardado no que aparece (0,5 → 50%). */
  const controleDeTransformacao = (chave: keyof Transformacao, fator: number) => ({
    valor: t[chave] * fator,
    desativado: travada,
    aoPrever: (valor: number) => aoPrever(transformar({ [chave]: valor / fator })),
    aoConfirmar: (valor: number) => {
      if (Math.abs(valor / fator - t[chave]) < PERTO) aoPrever(null);
      else aoExecutar(transformar({ [chave]: valor / fator }));
    },
  });

  const bordas = bordasDoRecorte(clipe.recorte);
  const recortar = (borda: keyof Bordas, valor: number): Comando => ({
    comando: "clipe.recortar",
    parametros: { clipeIds: ids, recorte: recorteDasBordas({ ...bordas, [borda]: valor }) },
  });
  const controleDeBorda = (borda: keyof Bordas) => ({
    valor: bordas[borda] * 100,
    minimo: 0,
    maximo: (1 - RECORTE_MINIMO) * 100,
    passo: 0.5,
    sufixo: "%",
    desativado: travada,
    aoPrever: (valor: number) => aoPrever(recortar(borda, valor / 100)),
    aoConfirmar: (valor: number) => {
      if (Math.abs(valor / 100 - bordas[borda]) < PERTO) aoPrever(null);
      else aoExecutar(recortar(borda, valor / 100));
    },
  });

  const mudado =
    (Object.keys(TRANSFORMACAO_PADRAO) as (keyof Transformacao)[]).some((chave) => Math.abs(t[chave] - TRANSFORMACAO_PADRAO[chave]) > PERTO) ||
    (Object.keys(RECORTE_PADRAO) as (keyof Recorte)[]).some((chave) => Math.abs(clipe.recorte[chave] - RECORTE_PADRAO[chave]) > PERTO);
  const { x, y, escala, opacidade } = LIMITES_TRANSFORMACAO;

  return (
    <div>
      {travada ? <p className="mb-2 rounded-md bg-painel-2 px-2 py-1.5 text-xs text-suave">A faixa está travada. Destrave o cadeado para editar.</p> : null}
      <Secao
        titulo="Posição e tamanho"
        acao={
          <button
            type="button"
            className="botao-icone size-6"
            disabled={travada || !mudado}
            onClick={() => aoExecutar({ comando: "clipe.restaurar", parametros: { clipeIds: ids } })}
            aria-label="Restaurar posição, tamanho e recorte"
            title="Restaurar posição, tamanho e recorte"
          >
            <RotateCcw className="size-3.5" aria-hidden />
          </button>
        }
      >
        <ControleNumerico
          rotulo="Posição horizontal"
          minimo={-100}
          maximo={100}
          minimoDigitado={x.minimo * 100}
          maximoDigitado={x.maximo * 100}
          passo={0.1}
          sufixo="%"
          {...controleDeTransformacao("x", 100)}
        />
        <ControleNumerico
          rotulo="Posição vertical"
          minimo={-100}
          maximo={100}
          minimoDigitado={y.minimo * 100}
          maximoDigitado={y.maximo * 100}
          passo={0.1}
          sufixo="%"
          {...controleDeTransformacao("y", 100)}
        />
        <ControleNumerico
          rotulo="Escala"
          minimo={1}
          maximo={400}
          minimoDigitado={escala.minimo * 100}
          maximoDigitado={escala.maximo * 100}
          sufixo="%"
          {...controleDeTransformacao("escala", 100)}
        />
        <ControleNumerico rotulo="Giro" minimo={-180} maximo={180} passo={0.5} sufixo="°" {...controleDeTransformacao("rotacao", 1)} />
        <ControleNumerico rotulo="Opacidade" minimo={opacidade.minimo * 100} maximo={opacidade.maximo * 100} sufixo="%" {...controleDeTransformacao("opacidade", 100)} />
      </Secao>
      <Secao titulo="Recorte">
        <ControleNumerico rotulo="Esquerda" {...controleDeBorda("esquerda")} />
        <ControleNumerico rotulo="Direita" {...controleDeBorda("direita")} />
        <ControleNumerico rotulo="Cima" {...controleDeBorda("topo")} />
        <ControleNumerico rotulo="Baixo" {...controleDeBorda("base")} />
      </Secao>
    </div>
  );
}

/** Fade mais longo que o controle deslizante oferece; no campo de número vai até a duração do clipe. */
const FADE_MAXIMO_S = 10;

/** Volume e fades de entrada e saída do som do clipe. */
function AbaAudio({ clipe, faixa, temSom, aoPrever, aoExecutar }: PropsAba & { temSom: boolean }) {
  if (!temSom) return <p className="py-8 text-center text-xs text-suave">Este clipe não tem som.</p>;
  const travada = faixa.travada;
  const ids = [clipe.id];
  const duracaoS = clipe.duracao / TICKS_POR_SEGUNDO;
  const comando = (mudanca: { volume?: number; fade_entrada?: number; fade_saida?: number }): Comando => ({
    comando: "clipe.audio",
    parametros: { clipeIds: ids, ...mudanca },
  });
  const controle = (atual: number, paraMudanca: (valor: number) => Parameters<typeof comando>[0]) => ({
    valor: atual,
    desativado: travada,
    aoPrever: (valor: number) => aoPrever(comando(paraMudanca(valor))),
    aoConfirmar: (valor: number) => {
      if (Math.abs(valor - atual) < PERTO) aoPrever(null);
      else aoExecutar(comando(paraMudanca(valor)));
    },
  });
  const emTicks = (segundos: number) => Math.round(segundos * TICKS_POR_SEGUNDO);

  return (
    <div>
      {travada ? <p className="mb-2 rounded-md bg-painel-2 px-2 py-1.5 text-xs text-suave">A faixa está travada. Destrave o cadeado para editar.</p> : null}
      {faixa.muda ? <p className="mb-2 rounded-md bg-painel-2 px-2 py-1.5 text-xs text-suave">A faixa está silenciada: o som deste clipe não sai.</p> : null}
      <Secao titulo="Som">
        <ControleNumerico
          rotulo="Volume"
          minimo={0}
          maximo={VOLUME_MAXIMO * 100}
          sufixo="%"
          {...controle(clipe.volume * 100, (valor) => ({ volume: valor / 100 }))}
        />
        <ControleNumerico
          rotulo="Aparecer aos poucos"
          minimo={0}
          maximo={Math.min(FADE_MAXIMO_S, duracaoS)}
          maximoDigitado={duracaoS}
          passo={0.1}
          sufixo="s"
          {...controle(clipe.fade_entrada / TICKS_POR_SEGUNDO, (valor) => ({ fade_entrada: emTicks(valor) }))}
        />
        <ControleNumerico
          rotulo="Sumir aos poucos"
          minimo={0}
          maximo={Math.min(FADE_MAXIMO_S, duracaoS)}
          maximoDigitado={duracaoS}
          passo={0.1}
          sufixo="s"
          {...controle(clipe.fade_saida / TICKS_POR_SEGUNDO, (valor) => ({ fade_saida: emTicks(valor) }))}
        />
      </Secao>
    </div>
  );
}

type PropsCor = { cor: string; aoPrever: (comando: Comando | null) => void; aoExecutar: (comando: Comando) => void };

/** Cor atrás das camadas, onde nenhum clipe cobre o quadro. */
function CorDeFundo({ cor, aoPrever, aoExecutar }: PropsCor) {
  return (
    <label className="mt-2 flex items-center justify-between gap-3 text-xs">
      <span className="text-suave">Cor de fundo</span>
      <span className="flex items-center gap-2">
        <span className="font-mono uppercase tabular-nums text-suave">{cor}</span>
        <input
          type="color"
          value={cor}
          onChange={(evento) => aoPrever({ comando: "projeto.fundo", parametros: { cor: evento.currentTarget.value } })}
          // O "change" nativo só vem quando a pessoa fecha o seletor: aí vira um passo do desfazer
          ref={(elemento) => {
            if (!elemento) return;
            const confirmar = () => aoExecutar({ comando: "projeto.fundo", parametros: { cor: elemento.value } });
            elemento.addEventListener("change", confirmar);
            return () => elemento.removeEventListener("change", confirmar);
          }}
          className="h-7 w-10 cursor-pointer rounded border border-borda bg-painel-2"
        />
      </span>
    </label>
  );
}
