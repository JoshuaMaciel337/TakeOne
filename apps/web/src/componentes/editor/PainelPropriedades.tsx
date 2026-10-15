"use client";

import { ChevronLeft, ChevronRight, Diamond, MousePointerClick, RotateCcw } from "lucide-react";
import { useState } from "react";

import { chamarApi } from "@/lib/api";
import { formatarBytes, formatarTempo } from "@/lib/formatar";
import type { Comando } from "@/lib/projeto/comandos";
import { CURVAS_PRONTAS, type PontoDeVelocidade } from "@/lib/projeto/velocidade";
import { LIMITES_TRANSFORMACAO, LIMITES_VELOCIDADE, type MudancaDeAudio, RECORTE_MINIMO, VOLUME_MAXIMO } from "@/lib/projeto/edicao";
import { type Chroma, CHROMA_PADRAO, type Clipe, type Faixa, MESCLAGENS, type Mesclagem, type Recorte, RECORTE_PADRAO, type Transformacao, TRANSFORMACAO_PADRAO } from "@/lib/projeto/modelo";
import { type Keyframe, keyframeEm, type PropriedadeAnimavel, PROPRIEDADES_ANIMAVEIS, transformacaoNoTempo } from "@/lib/projeto/keyframes";
import {
  chaveDoTom,
  CURVAS_DO_FADE,
  type CurvaDoFade,
  ECO_MAXIMO,
  EFEITOS_PRONTOS,
  EQ_LIMITE_DB,
  ganhoParaIgualar,
  LUFS_IGUALAR,
  SEM_EFEITOS_VOZ,
  TOM_LIMITE,
} from "@/lib/projeto/som";
import { duracaoDoQuadro, formatarTimecode, type Taxa, type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

import { AbaAnimacao } from "./AbaAnimacao";
import { AbaixarNaFala } from "./AbaixarNaFala";
import { AbaCor } from "./AbaCor";
import { AbaTexto } from "./AbaTexto";
import { CampoCor } from "./CampoCor";
import { ControleNumerico } from "./ControleNumerico";
import { SeguirRosto } from "./SeguirRosto";

// As abas da seção 5 do plano. As que ainda não têm conteúdo dizem em que fase chegam.
const ABAS = [
  { id: "info", nome: "Informações", fase: "" },
  { id: "basico", nome: "Básico", fase: "" },
  { id: "audio", nome: "Áudio", fase: "" },
  { id: "velocidade", nome: "Velocidade", fase: "" },
  { id: "animacao", nome: "Animação", fase: "" },
  { id: "cor", nome: "Cor", fase: "" },
] as const;

// Clipe de texto: o texto em si, posição e tamanho, e a animação (que vem depois)
const ABAS_TEXTO = [
  { id: "texto", nome: "Texto", fase: "" },
  { id: "basico", nome: "Básico", fase: "" },
  { id: "animacao", nome: "Animação", fase: "" },
  { id: "cor", nome: "Cor", fase: "" },
] as const;

// Clipe numa faixa de áudio: não aparece na imagem, então só o som e a velocidade
const ABAS_AUDIO = [
  { id: "info", nome: "Informações", fase: "" },
  { id: "audio", nome: "Áudio", fase: "" },
  { id: "velocidade", nome: "Velocidade", fase: "" },
] as const;

type IdAba = (typeof ABAS)[number]["id"] | (typeof ABAS_TEXTO)[number]["id"];

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

const NOMES_FAIXA: Record<Faixa["tipo"], string> = { principal: "Principal", video: "Sobreposição", audio: "Áudio", texto: "Texto", legenda: "Legendas" };

type Props = {
  midia: Midia | null;
  /** O clipe escolhido na linha do tempo; `midia` é a dele. */
  selecionado: { clipe: Clipe; faixa: Faixa } | null;
  taxa: Taxa;
  /** O instante do cursor: os keyframes do clipe são lidos e gravados nele. */
  tempo: Tick;
  aoBuscar: (tempo: Tick) => void;
  /** "9:16", "16:9"... do projeto: o "Seguir o rosto" cobre esse quadro. */
  proporcao: string;
  /** As faixas do projeto: o "Abaixar na fala" procura a fala nelas. */
  faixas: Faixa[];
  aoAvisar: (mensagem: string) => void;
  /** Cor de fundo do projeto, mostrada quando nada está selecionado. */
  fundo: string;
  /** Mudança provisória enquanto um controle é arrastado; `null` para desistir dela. */
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
  className?: string;
  style?: React.CSSProperties;
};

export function PainelPropriedades({ midia, selecionado, taxa, tempo, aoBuscar, proporcao, faixas, aoAvisar, fundo, aoPrever, aoExecutar, className = "", style }: Props) {
  // Uma aba guardada para texto e outra para mídia: um texto novo abre direto na aba Texto
  const [abaDaMidia, setAbaDaMidia] = useState<IdAba>("basico");
  const [abaDoTexto, setAbaDoTexto] = useState<IdAba>("texto");
  const ehTexto = Boolean(selecionado?.clipe.texto);
  const abaEscolhida = ehTexto ? abaDoTexto : abaDaMidia;
  const setAba = ehTexto ? setAbaDoTexto : setAbaDaMidia;
  const ehAudio = selecionado?.faixa.tipo === "audio";
  const abas: readonly { id: IdAba; nome: string; fase: string }[] = ehTexto ? ABAS_TEXTO : ehAudio ? ABAS_AUDIO : ABAS;
  // Mídia da biblioteca, sem clipe, só tem informações; num texto, a aba que não existe vira a do texto
  // Num clipe de áudio, a aba que não existe vira a do som
  const aba: IdAba = !selecionado ? "info" : abas.some((item) => item.id === abaEscolhida) ? abaEscolhida : ehAudio ? "audio" : abas[0].id;
  const atual = abas.find((item) => item.id === aba)!;

  if (!midia && !selecionado) {
    return (
      <aside aria-label="Propriedades" style={style} className={`flex min-h-0 shrink-0 flex-col bg-painel ${className}`}>
        <div className="border-b border-borda p-3">
          <h3 className="text-sm font-semibold">Projeto</h3>
          <div className="mt-1">
            <CampoCor
              rotulo="Cor de fundo"
              cor={fundo}
              aoPrever={(cor) => aoPrever({ comando: "projeto.fundo", parametros: { cor } })}
              aoConfirmar={(cor) => aoExecutar({ comando: "projeto.fundo", parametros: { cor } })}
            />
          </div>
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
        {abas.map((item) => (
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
        {aba === "texto" && selecionado?.clipe.texto ? (
          <AbaTexto clipe={selecionado.clipe} faixa={selecionado.faixa} aoPrever={aoPrever} aoExecutar={aoExecutar} />
        ) : aba === "info" && midia ? (
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
          <AbaBasico
            clipe={selecionado.clipe}
            faixa={selecionado.faixa}
            tempo={tempo}
            taxa={taxa}
            aoBuscar={aoBuscar}
            midia={midia}
            proporcao={proporcao}
            aoAvisar={aoAvisar}
            aoPrever={aoPrever}
            aoExecutar={aoExecutar}
          />
        ) : aba === "velocidade" && selecionado && !selecionado.clipe.texto ? (
          <AbaVelocidade clipe={selecionado.clipe} faixa={selecionado.faixa} aoPrever={aoPrever} aoExecutar={aoExecutar} />
        ) : aba === "cor" && selecionado && selecionado.faixa.tipo !== "audio" ? (
          <AbaCor clipe={selecionado.clipe} faixa={selecionado.faixa} aoPrever={aoPrever} aoExecutar={aoExecutar} />
        ) : aba === "animacao" && selecionado && selecionado.faixa.tipo !== "audio" ? (
          <AbaAnimacao clipe={selecionado.clipe} faixa={selecionado.faixa} aoPrever={aoPrever} aoExecutar={aoExecutar} />
        ) : aba === "audio" && selecionado ? (
          <AbaAudio
            clipe={selecionado.clipe}
            faixa={selecionado.faixa}
            midia={midia}
            faixas={faixas}
            aoAvisar={aoAvisar}
            aoPrever={aoPrever}
            aoExecutar={aoExecutar}
          />
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
type PropsBasico = PropsAba & {
  tempo: Tick;
  taxa: Taxa;
  aoBuscar: (tempo: Tick) => void;
  midia: Midia | null;
  proporcao: string;
  aoAvisar: (mensagem: string) => void;
};

/** O losango do keyframe: cheio com ponto no instante, vazado com pontos em outros instantes. */
function BotaoKeyframe({ pontos, noInstante, desativado, aoClicar }: { pontos: Keyframe[] | undefined; noInstante: boolean; desativado: boolean; aoClicar: () => void }) {
  const tem = Boolean(pontos?.length);
  const titulo = noInstante ? "Tirar o keyframe deste instante" : "Pôr um keyframe neste instante";
  return (
    <button
      type="button"
      disabled={desativado}
      aria-pressed={noInstante}
      aria-label={titulo}
      title={titulo}
      onClick={(evento) => {
        evento.preventDefault();
        aoClicar();
      }}
      className={`grid size-4 place-items-center rounded disabled:opacity-40 ${tem ? "text-destaque" : "text-suave hover:text-texto"}`}
    >
      <Diamond className="size-3" fill={noInstante ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}

function AbaBasico({ clipe, faixa, tempo, taxa, aoBuscar, midia, proporcao, aoAvisar, aoPrever, aoExecutar }: PropsBasico) {
  if (faixa.tipo === "audio") {
    return <p className="py-8 text-center text-xs text-suave">Clipes de áudio não aparecem na imagem.</p>;
  }
  // Os valores do instante do cursor: com keyframes, mexer grava um ponto ali
  const t = transformacaoNoTempo(clipe, tempo);
  const travada = faixa.travada;
  const ids = [clipe.id];
  const dentro = tempo >= clipe.inicio && tempo <= clipe.inicio + clipe.duracao;
  const meioQuadro = duracaoDoQuadro(taxa) / 2;
  const noClipe = tempo - clipe.inicio;
  const pontosDoClipe = PROPRIEDADES_ANIMAVEIS.flatMap((p) => clipe.keyframes?.[p] ?? []).filter((p) => p.t >= 0 && p.t <= clipe.duracao);
  const anterior = Math.max(...pontosDoClipe.map((p) => p.t).filter((x) => x < noClipe - meioQuadro));
  const seguinte = Math.min(...pontosDoClipe.map((p) => p.t).filter((x) => x > noClipe + meioQuadro));
  const noInstante = PROPRIEDADES_ANIMAVEIS.filter((p) => keyframeEm(clipe.keyframes?.[p], noClipe, meioQuadro));

  const transformar = (mudanca: Partial<Transformacao>): Comando => ({ comando: "clipe.transformar", parametros: { clipeIds: ids, transformacao: mudanca, tempo } });
  /** `fator` converte o valor guardado no que aparece (0,5 → 50%). */
  const controleDeTransformacao = (chave: PropriedadeAnimavel, fator: number) => ({
    valor: t[chave] * fator,
    desativado: travada,
    aoPrever: (valor: number) => aoPrever(transformar({ [chave]: valor / fator })),
    aoConfirmar: (valor: number) => {
      if (Math.abs(valor / fator - t[chave]) < PERTO) aoPrever(null);
      else aoExecutar(transformar({ [chave]: valor / fator }));
    },
    acao: (
      <BotaoKeyframe
        pontos={clipe.keyframes?.[chave] ?? undefined}
        noInstante={noInstante.includes(chave)}
        desativado={travada || !dentro}
        aoClicar={() => aoExecutar({ comando: "clipe.keyframe", parametros: { clipeId: clipe.id, propriedade: chave, tempo, acao: "alternar" } })}
      />
    ),
  });
  const curvaAtual = noInstante.map((p) => keyframeEm(clipe.keyframes?.[p], noClipe, meioQuadro)?.curva)[0];

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
        <label className="mt-1 flex items-center gap-2 text-xs">
          <span className="flex-1 text-suave">Mesclagem</span>
          <select
            value={clipe.mesclagem ?? "normal"}
            disabled={travada}
            onChange={(evento) => aoExecutar({ comando: "clipe.mesclar", parametros: { clipeIds: [clipe.id], mesclagem: evento.currentTarget.value as Mesclagem } })}
            className="rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs outline-none focus:border-destaque"
          >
            {MESCLAGENS.map(({ id, nome }) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
        </label>
        {clipe.texto ? null : <TelaVerde clipe={clipe} travada={travada} aoPrever={aoPrever} aoExecutar={aoExecutar} />}
        {!clipe.texto && midia?.video ? <RemoverFundo clipe={clipe} midia={midia} travada={travada} aoExecutar={aoExecutar} /> : null}
        {pontosDoClipe.length ? (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-suave" aria-label="Keyframes do clipe">
            <button
              type="button"
              className="botao-icone size-6"
              disabled={!Number.isFinite(anterior)}
              onClick={() => aoBuscar(clipe.inicio + anterior)}
              aria-label="Keyframe anterior"
              title="Keyframe anterior"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              className="botao-icone size-6"
              disabled={!Number.isFinite(seguinte)}
              onClick={() => aoBuscar(clipe.inicio + seguinte)}
              aria-label="Keyframe seguinte"
              title="Keyframe seguinte"
            >
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
            {curvaAtual ? (
              <label className="ml-auto flex items-center gap-1">
                Até o próximo
                <select
                  value={curvaAtual}
                  disabled={travada}
                  onChange={(evento) => {
                    const acao = evento.currentTarget.value as "linear" | "suave";
                    for (const propriedade of noInstante) {
                      aoExecutar({ comando: "clipe.keyframe", parametros: { clipeId: clipe.id, propriedade, tempo, acao } });
                    }
                  }}
                  className="rounded-md border border-borda bg-painel-2 px-1 py-0.5 text-[11px] text-texto outline-none focus:border-destaque"
                >
                  <option value="linear">Linear</option>
                  <option value="suave">Suave</option>
                </select>
              </label>
            ) : (
              <span className="ml-auto">{pontosDoClipe.length} keyframes</span>
            )}
          </div>
        ) : null}
        {!clipe.texto && midia?.video ? (
          <SeguirRosto clipe={clipe} faixa={faixa} midia={midia} proporcao={proporcao} aoExecutar={aoExecutar} aoAvisar={aoAvisar} />
        ) : null}
      </Secao>
      {clipe.texto ? null : (
        <Secao titulo="Recorte">
          <ControleNumerico rotulo="Esquerda" {...controleDeBorda("esquerda")} />
          <ControleNumerico rotulo="Direita" {...controleDeBorda("direita")} />
          <ControleNumerico rotulo="Cima" {...controleDeBorda("topo")} />
          <ControleNumerico rotulo="Baixo" {...controleDeBorda("base")} />
        </Secao>
      )}
    </div>
  );
}

/** Fade mais longo que o controle deslizante oferece; no campo de número vai até a duração do clipe. */
const FADE_MAXIMO_S = 10;

/** Volume e fades de entrada e saída do som do clipe. */
const VELOCIDADES_RAPIDAS = [0.5, 1, 1.5, 2, 3];

/** Velocidade do clipe de mídia: o trecho da mídia fica o mesmo e a duração muda; o som mantém o tom. */
function AbaVelocidade({ clipe, faixa, aoPrever, aoExecutar }: PropsAba) {
  const travada = faixa.travada;
  const comando = (velocidade: number): Comando => ({ comando: "clipe.velocidade", parametros: { clipeId: clipe.id, velocidade } });
  const duracaoS = clipe.duracao / TICKS_POR_SEGUNDO;
  return (
    <div>
      {travada ? <p className="mb-2 rounded-md bg-painel-2 px-2 py-1.5 text-xs text-suave">A faixa está travada. Destrave o cadeado para editar.</p> : null}
      <Secao titulo="Velocidade">
        <ControleNumerico
          rotulo="Velocidade"
          valor={clipe.velocidade * 100}
          minimo={LIMITES_VELOCIDADE.minimo * 100}
          maximo={400}
          maximoDigitado={LIMITES_VELOCIDADE.maximo * 100}
          passo={5}
          sufixo="%"
          desativado={travada}
          aoPrever={(valor) => aoPrever(comando(valor / 100))}
          aoConfirmar={(valor) => {
            if (Math.abs(valor / 100 - clipe.velocidade) < PERTO) aoPrever(null);
            else aoExecutar(comando(valor / 100));
          }}
        />
        <div className="mt-2 grid grid-cols-5 gap-1">
          {VELOCIDADES_RAPIDAS.map((velocidade) => (
            <button
              key={velocidade}
              type="button"
              disabled={travada}
              aria-pressed={Math.abs(clipe.velocidade - velocidade) < PERTO}
              onClick={() => aoExecutar(comando(velocidade))}
              className={`rounded-md border px-1 py-1 text-[11px] transition disabled:opacity-50 ${
                Math.abs(clipe.velocidade - velocidade) < PERTO ? "border-destaque bg-destaque/10 text-texto" : "border-borda text-suave hover:text-texto"
              }`}
            >
              {velocidade.toLocaleString("pt-BR")}×
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-suave">
          Duração: {duracaoS.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} s. O som acompanha a velocidade sem mudar o tom da voz.
        </p>
      </Secao>
      <Secao titulo="Curva">
        <p className="mb-1 text-[11px] text-suave">Muda a velocidade ao longo do clipe, sem mudar a duração dele.</p>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={travada}
            aria-pressed={!clipe.curva_velocidade}
            onClick={() => aoExecutar({ comando: "clipe.curvaVelocidade", parametros: { clipeId: clipe.id, pontos: null } })}
            className={`rounded-md border px-2 py-1.5 text-left text-[11px] transition disabled:opacity-50 ${!clipe.curva_velocidade ? "border-destaque bg-destaque/10" : "border-borda hover:border-suave"}`}
          >
            Nenhuma
          </button>
          {CURVAS_PRONTAS.map((curva) => {
            const escolhida = JSON.stringify(clipe.curva_velocidade) === JSON.stringify(curva.pontos);
            return (
              <button
                key={curva.id}
                type="button"
                disabled={travada}
                aria-pressed={escolhida}
                onClick={() => aoExecutar({ comando: "clipe.curvaVelocidade", parametros: { clipeId: clipe.id, pontos: curva.pontos } })}
                className={`flex flex-col gap-1 rounded-md border px-2 py-1.5 text-left text-[11px] transition disabled:opacity-50 ${escolhida ? "border-destaque bg-destaque/10" : "border-borda hover:border-suave"}`}
              >
                <DesenhoDaCurva pontos={curva.pontos} />
                {curva.nome}
              </button>
            );
          })}
        </div>
      </Secao>
    </div>
  );
}

/** A curva de velocidade num desenho pequeno: em cima, mais rápido; embaixo, mais devagar. */
function DesenhoDaCurva({ pontos }: { pontos: PontoDeVelocidade[] }) {
  // Escala logarítmica: 0,2× embaixo, 5× em cima, 1× no meio
  const y = (s: number) => 10 - (Math.log(s) / Math.log(5)) * 9;
  return (
    <svg viewBox="0 0 60 20" className="h-5 w-full" aria-hidden>
      <line x1={0} y1={10} x2={60} y2={10} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
      <polyline points={pontos.map(([u, s]) => `${(u * 60).toFixed(1)},${y(s).toFixed(1)}`).join(" ")} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

/**
 * Remover o fundo sem tela verde: o worker acha a pessoa em cada quadro (MODNet) e a prévia e o
 * render usam a mesma máscara.
 */
function RemoverFundo({ clipe, midia, travada, aoExecutar }: { clipe: Clipe; midia: Midia; travada: boolean; aoExecutar: (comando: Comando) => void }) {
  const [erroDoPedido, setErroDoPedido] = useState("");
  const recorte = midia.recorte_fundo;
  function mudar(ligar: boolean) {
    aoExecutar({ comando: "clipe.removerFundo", parametros: { clipeIds: [clipe.id], ligar } });
    if (!ligar || recorte?.status === "pronta" || recorte?.status === "processando") return;
    setErroDoPedido("");
    chamarApi(`/midias/${midia.id}/recorte-fundo`, { metodo: "POST" }).catch((erro: unknown) =>
      setErroDoPedido(erro instanceof Error ? erro.message : "Não foi possível pedir o recorte agora."),
    );
  }
  return (
    <div className="mt-2 border-t border-borda/60 pt-2">
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={Boolean(clipe.remover_fundo)} disabled={travada} onChange={(evento) => mudar(evento.currentTarget.checked)} />
        <span className="flex-1">Remover o fundo (fica a pessoa)</span>
      </label>
      {clipe.remover_fundo ? (
        <p className="mt-1 text-[11px] text-suave" role="status">
          {recorte?.status === "pronta"
            ? "Pronto. A prévia e o vídeo exportado mostram só a pessoa."
            : recorte?.status === "erro" || erroDoPedido
              ? `O recorte falhou: ${erroDoPedido || recorte?.erro}`
              : `Achando a pessoa em cada quadro${recorte?.progresso ? ` · ${recorte.progresso}%` : ""}. Até terminar, a prévia mostra o clipe inteiro.`}
        </p>
      ) : null}
    </div>
  );
}

/** Tela verde (chroma key) de um clipe de mídia: a cor que some, a semelhança e a suavidade. */
function TelaVerde({ clipe, travada, aoPrever, aoExecutar }: { clipe: Clipe; travada: boolean } & Pick<PropsAba, "aoPrever" | "aoExecutar">) {
  const chroma = clipe.chroma ?? null;
  const comando = (valor: Chroma | null): Comando => ({ comando: "clipe.chroma", parametros: { clipeIds: [clipe.id], chroma: valor } });
  const controle = (chave: "semelhanca" | "suavidade") => ({
    valor: (chroma?.[chave] ?? 0) * 100,
    desativado: travada,
    aoPrever: (valor: number) => aoPrever(comando({ ...chroma!, [chave]: valor / 100 })),
    aoConfirmar: (valor: number) => {
      if (Math.abs(valor / 100 - chroma![chave]) < PERTO) aoPrever(null);
      else aoExecutar(comando({ ...chroma!, [chave]: valor / 100 }));
    },
  });
  return (
    <div className="mt-2 border-t border-borda/60 pt-2">
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={chroma !== null} disabled={travada} onChange={(evento) => aoExecutar(comando(evento.currentTarget.checked ? CHROMA_PADRAO : null))} />
        <span className="flex-1">Tela verde (some com a cor do fundo)</span>
      </label>
      {chroma ? (
        <>
          <CampoCor
            rotulo="Cor que some"
            cor={chroma.cor}
            desativado={travada}
            aoPrever={(cor) => aoPrever(comando({ ...chroma, cor }))}
            aoConfirmar={(cor) => aoExecutar(comando({ ...chroma, cor }))}
          />
          <ControleNumerico rotulo="Semelhança" minimo={1} maximo={100} sufixo="%" {...controle("semelhanca")} />
          <ControleNumerico rotulo="Suavidade" minimo={0} maximo={100} sufixo="%" {...controle("suavidade")} />
        </>
      ) : null}
    </div>
  );
}

function AbaAudio({ clipe, faixa, midia, faixas, aoAvisar, aoPrever, aoExecutar }: PropsAba & { midia: Midia | null; faixas: Faixa[]; aoAvisar: (mensagem: string) => void }) {
  const [erroDoPedido, setErroDoPedido] = useState("");
  if (!midia?.audio) return <p className="py-8 text-center text-xs text-suave">Este clipe não tem som.</p>;
  const travada = faixa.travada;
  const ids = [clipe.id];
  const duracaoS = clipe.duracao / TICKS_POR_SEGUNDO;
  const comando = (mudanca: MudancaDeAudio): Comando => ({
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
  const voz = midia.voz_limpa;
  const efeitos = clipe.efeitos_voz ?? SEM_EFEITOS_VOZ;

  /** Pede ao worker a voz limpa da mídia (a API não repete o que já está pronto ou andando). */
  function pedirLimpeza() {
    setErroDoPedido("");
    chamarApi(`/midias/${midia!.id}/voz-limpa`, { metodo: "POST" }).catch((erro: unknown) =>
      setErroDoPedido(erro instanceof Error ? erro.message : "Não foi possível pedir a limpeza agora."),
    );
  }

  /** Liga ou desliga a voz limpa no clipe. Ligar pede a limpeza da mídia, se ela ainda não foi feita. */
  function mudarVozLimpa(ligar: boolean) {
    aoExecutar(comando({ voz_limpa: ligar }));
    if (ligar && voz?.status !== "pronta" && voz?.status !== "processando") pedirLimpeza();
    else pedirTom(clipe.tom ?? 0, ligar);
  }

  /** Pede ao worker a voz no tom (sobre a voz limpa, se ela está ligada e pronta), se ainda não existe. */
  function pedirTom(semitons: number, vozLimpa: boolean) {
    const limpa = vozLimpa && voz?.status === "pronta";
    const estado = midia!.tons?.[chaveDoTom(semitons, limpa)]?.status;
    if (!semitons || estado === "pronta" || estado === "processando") return;
    setErroDoPedido("");
    chamarApi(`/midias/${midia!.id}/tom`, { metodo: "POST", corpo: { semitons, limpa } }).catch((erro: unknown) =>
      setErroDoPedido(erro instanceof Error ? erro.message : "Não foi possível pedir o tom agora."),
    );
  }
  const tom = clipe.tom ?? 0;
  const estadoDoTom = tom ? midia.tons?.[chaveDoTom(tom, Boolean(clipe.voz_limpa) && voz?.status === "pronta")] : undefined;

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
        <label className="mt-1 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={Boolean(clipe.igualar_volume)}
            disabled={travada || typeof midia.audio.lufs !== "number"}
            onChange={(evento) => aoExecutar(comando({ igualar_volume: evento.currentTarget.checked }))}
          />
          <span className="flex-1">Igualar o volume ({LUFS_IGUALAR} LUFS)</span>
        </label>
        <p className="text-[11px] text-suave">
          {typeof midia.audio.lufs === "number"
            ? `Volume medido: ${midia.audio.lufs.toFixed(1).replace(".", ",")} LUFS${
                clipe.igualar_volume ? ` · ${ganhoParaIgualar(midia.audio.lufs) >= 0 ? "sobe" : "desce"} ${Math.abs(ganhoParaIgualar(midia.audio.lufs)).toFixed(1).replace(".", ",")} dB` : ""
              }`
            : "Esta mídia foi enviada antes da medição de volume. Envie de novo para medir."}
        </p>
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
        {clipe.fade_entrada > 0 || clipe.fade_saida > 0 ? (
          <label className="mt-1 flex items-center gap-2 text-xs">
            <span className="flex-1 text-suave">Formato dos fades</span>
            <select
              value={clipe.curva_fade ?? "linear"}
              disabled={travada}
              onChange={(evento) => aoExecutar(comando({ curva_fade: evento.currentTarget.value as CurvaDoFade }))}
              className="rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs outline-none focus:border-destaque"
            >
              {CURVAS_DO_FADE.map(({ id, nome }) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </Secao>
      <Secao titulo="Efeitos de voz">
        <select
          aria-label="Efeito pronto"
          disabled={travada}
          value={EFEITOS_PRONTOS.find((pronto) => JSON.stringify(pronto.efeitos) === JSON.stringify(efeitos))?.id ?? ""}
          onChange={(evento) => {
            const pronto = EFEITOS_PRONTOS.find((item) => item.id === evento.currentTarget.value);
            if (pronto) aoExecutar(comando({ efeitos_voz: pronto.efeitos }));
          }}
          className="mt-1 w-full rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-xs outline-none focus:border-destaque"
        >
          <option value="" disabled>
            Ajuste próprio
          </option>
          {EFEITOS_PRONTOS.map(({ id, nome }) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
        <ControleNumerico rotulo="Graves" minimo={-EQ_LIMITE_DB} maximo={EQ_LIMITE_DB} sufixo="dB" {...controle(efeitos.grave, (valor) => ({ efeitos_voz: { ...efeitos, grave: valor } }))} />
        <ControleNumerico rotulo="Médios" minimo={-EQ_LIMITE_DB} maximo={EQ_LIMITE_DB} sufixo="dB" {...controle(efeitos.medio, (valor) => ({ efeitos_voz: { ...efeitos, medio: valor } }))} />
        <ControleNumerico rotulo="Agudos" minimo={-EQ_LIMITE_DB} maximo={EQ_LIMITE_DB} sufixo="dB" {...controle(efeitos.agudo, (valor) => ({ efeitos_voz: { ...efeitos, agudo: valor } }))} />
        <ControleNumerico rotulo="Eco" minimo={0} maximo={ECO_MAXIMO * 100} sufixo="%" {...controle(efeitos.eco * 100, (valor) => ({ efeitos_voz: { ...efeitos, eco: valor / 100 } }))} />
        <ControleNumerico rotulo="Reverb" minimo={0} maximo={100} sufixo="%" {...controle(efeitos.reverb * 100, (valor) => ({ efeitos_voz: { ...efeitos, reverb: valor / 100 } }))} />
      </Secao>
      <Secao titulo="Abaixar na fala">
        <AbaixarNaFala clipe={clipe} faixa={faixa} faixas={faixas} aoPrever={aoPrever} aoExecutar={aoExecutar} aoAvisar={aoAvisar} />
      </Secao>
      <Secao titulo="Voz">
        <ControleNumerico
          rotulo="Tom da voz"
          valor={tom}
          minimo={-TOM_LIMITE}
          maximo={TOM_LIMITE}
          passo={1}
          sufixo="st"
          desativado={travada}
          aoPrever={() => aoPrever(null)}
          aoConfirmar={(valor) => {
            const semitons = Math.round(valor);
            if (semitons === tom) return;
            aoExecutar(comando({ tom: semitons }));
            pedirTom(semitons, Boolean(clipe.voz_limpa));
          }}
        />
        {tom ? (
          <p className="text-[11px] text-suave" role="status">
            {estadoDoTom?.status === "pronta"
              ? `${tom > 0 ? "Mais aguda" : "Mais grave"} em ${Math.abs(tom)} semitons, sem mudar a velocidade.`
              : estadoDoTom?.status === "erro" || erroDoPedido
                ? `O tom falhou: ${erroDoPedido || estadoDoTom?.erro}`
                : "Preparando a voz no tom. Até terminar, a prévia toca o tom original."}
          </p>
        ) : null}
        <label className="mt-1 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={Boolean(clipe.voz_limpa)} disabled={travada} onChange={(evento) => mudarVozLimpa(evento.currentTarget.checked)} />
          <span className="flex-1">Limpar a voz (tira ruído de fundo e eco)</span>
        </label>
        {clipe.voz_limpa ? (
          <p className="mt-1 text-[11px] text-suave" role="status">
            {voz?.status === "pronta"
              ? "Pronta. A prévia e o vídeo exportado usam a voz limpa."
              : voz?.status === "erro" || erroDoPedido
                ? `A limpeza falhou: ${erroDoPedido || voz?.erro}`
                : `Preparando a voz limpa${voz?.progresso ? ` · ${voz.progresso}%` : ""}. Até terminar, a prévia toca o som original.`}
          </p>
        ) : null}
        {clipe.voz_limpa && (voz?.status === "erro" || erroDoPedido) ? (
          <button type="button" className="mt-1 text-[11px] text-destaque underline-offset-2 hover:underline" onClick={pedirLimpeza}>
            Tentar de novo
          </button>
        ) : null}
      </Secao>
    </div>
  );
}
