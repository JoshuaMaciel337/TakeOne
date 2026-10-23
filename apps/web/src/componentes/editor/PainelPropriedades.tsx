"use client";

import {
  CONTORNO_PADRAO,
  type Contorno,
  DESFOQUE_MAXIMO_DA_SOMBRA,
  DISTANCIA_MAXIMA_DA_SOMBRA,
  LARGURA_MAXIMA_DO_CONTORNO,
  type Sombra,
  SOMBRA_PADRAO,
} from "@/lib/projeto/silhueta";
import { ChevronLeft, ChevronRight, Diamond, Image as ImageIcon, LoaderCircle, MousePointerClick, RotateCcw, Trash2, TrianglesCenterlineDashedHorizontal, TrianglesCenterlineDashedVertical, X } from "lucide-react";
import { useContext, useState } from "react";

import { chamarApi } from "@/lib/api";
import { formatarBytes, formatarTempo } from "@/lib/formatar";
import type { Comando } from "@/lib/projeto/comandos";
import { CURVAS_PRONTAS, type PontoDeVelocidade } from "@/lib/projeto/velocidade";
import { LIMITES_TRANSFORMACAO, LIMITES_VELOCIDADE, type MudancaDeAudio, RECORTE_MINIMO, VOLUME_MAXIMO } from "@/lib/projeto/edicao";
import { BORDA_MAXIMA, type Cantos, CANTOS_PADRAO, CHAVE_LUMA_PADRAO, type ChaveLuma, type Chroma, CHROMA_PADRAO, chaveDoFluido, type Clipe, type Faixa, LIMITES_DA_MASCARA, MASCARA_PADRAO, type MascaraDeForma, MESCLAGENS, type Mesclagem, type Recorte, RECORTE_PADRAO, type Transformacao, TRANSFORMACAO_PADRAO, zeroDoFluido } from "@/lib/projeto/modelo";
import { type Curva, CURVAS_DE_KEYFRAME, type Keyframe, keyframeEm, type PropriedadeAnimavel, PROPRIEDADES_ANIMAVEIS, transformacaoParaEditar, volumeNoTempo } from "@/lib/projeto/keyframes";
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
import { NivelarVoz } from "./NivelarVoz";
import { AbaCor } from "./AbaCor";
import { AbaTexto } from "./AbaTexto";
import { CampoCor } from "./CampoCor";
import { ControleNumerico } from "./ControleNumerico";
import { IniciarDesenhoDaMascara } from "./DesenhoDaMascara";
import { NoRitmo } from "./NoRitmo";
import { Estabilizar } from "./Estabilizar";
import { FotoEm3D } from "./FotoEm3D";
import { Multicamera } from "./Multicamera";
import { BotaoSeguirObjeto } from "./SeguirObjeto";
import { SecaoExpressoes } from "./SecaoExpressoes";
import { SecaoForma } from "./SecaoForma";
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

// Imagem parada: não tem som nem velocidade
const ABAS_IMAGEM = [
  { id: "info", nome: "Informações", fase: "" },
  { id: "basico", nome: "Básico", fase: "" },
  { id: "animacao", nome: "Animação", fase: "" },
  { id: "cor", nome: "Cor", fase: "" },
] as const;

// No editor de imagem não há tempo: sem animação, som nem velocidade
const ABAS_DESENHO_TEXTO = [
  { id: "texto", nome: "Texto", fase: "" },
  { id: "basico", nome: "Básico", fase: "" },
  { id: "cor", nome: "Cor", fase: "" },
] as const;
// A camada de ajuste: a cor (o que ela muda) e o básico (opacidade e máscara)
const ABAS_AJUSTE = [
  { id: "cor", nome: "Cor", fase: "" },
  { id: "basico", nome: "Básico", fase: "" },
] as const;
const ABAS_DESENHO = [
  { id: "basico", nome: "Básico", fase: "" },
  { id: "cor", nome: "Cor", fase: "" },
] as const;

export type IdAba = (typeof ABAS)[number]["id"] | (typeof ABAS_TEXTO)[number]["id"];

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

type EstadoSeguirObjeto = {
  marcando: string | null;
  andamento: { seguidorId: string; texto: string } | null;
  aoIniciar: (clipeId: string) => void;
  /** Esconder um objeto do próprio clipe (uma placa): marcar na prévia, seguir e pixelizar. */
  aoEsconder?: (clipeId: string) => void;
};

type Props = {
  midia: Midia | null;
  /** As mídias do projeto (o "Igualar a cor" lê a do clipe de referência). */
  midias?: ReadonlyMap<string, Midia>;
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
  /** A forma nova entra no lugar da imagem dos clipes quando ficar pronta (o Editor espera a biblioteca). */
  aoTrocarMidia: (clipeIds: string[], midia: Midia) => void;
  /** A foto em 3D entra no lugar da foto do clipe quando ficar pronta (o Editor espera a biblioteca). */
  aoTrocarPorVideo?: (clipeId: string, midia: Midia) => void;
  /** O "Seguir um objeto" (o fluxo fica no Editor, porque passa pela prévia). */
  seguirObjeto: EstadoSeguirObjeto;
  /** Cor de fundo do projeto, mostrada quando nada está selecionado. */
  fundo: string;
  /** Mudança provisória enquanto um controle é arrastado; `null` para desistir dela. */
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
  /** "imagem" no editor de imagem: sem as abas e as seções que dependem do tempo (keyframes, animação, som). */
  modo?: "video" | "imagem";
  /** No editor de imagem: abre a escolha de outra imagem para a camada, no mesmo lugar. */
  aoTrocarImagem?: (clipeId: string) => void;
  /** Abaixo da tela larga o painel é uma folha por cima, com botão de fechar. */
  aoFechar?: () => void;
  /** Abre uma aba de fora (os menus e os painéis do editor de imagem); `vez` muda a cada pedido. */
  pedidoDeAba?: { aba: IdAba; vez: number };
  /** Só estas abas (os painéis do layout profissional dividem as propriedades: Controles de efeito, Cor, Metadados). */
  somenteAbas?: readonly IdAba[];
  /** Sem nada escolhido, no lugar do aviso (as propriedades do documento, no editor de imagem). */
  semSelecao?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export function PainelPropriedades({ midia, midias, selecionado, taxa, tempo, aoBuscar, proporcao, faixas, aoAvisar, aoTrocarMidia, aoTrocarPorVideo, seguirObjeto, fundo, aoPrever, aoExecutar, modo = "video", aoTrocarImagem, aoFechar, pedidoDeAba, somenteAbas, semSelecao, className = "", style }: Props) {
  // Uma aba guardada para texto e outra para mídia: um texto novo abre direto na aba Texto
  const [abaDaMidia, setAbaDaMidia] = useState<IdAba>("basico");
  const [abaDoTexto, setAbaDoTexto] = useState<IdAba>("texto");
  const ehTexto = Boolean(selecionado?.clipe.texto);
  const abaEscolhida = ehTexto ? abaDoTexto : abaDaMidia;
  const setAba = ehTexto ? setAbaDoTexto : setAbaDaMidia;
  // O pedido de fora vale uma vez (o estado muda durante a renderização, sem efeito)
  const [vezVista, setVezVista] = useState(0);
  if (pedidoDeAba && pedidoDeAba.vez !== vezVista) {
    setVezVista(pedidoDeAba.vez);
    setAba(pedidoDeAba.aba);
  }
  const ehAudio = selecionado?.faixa.tipo === "audio";
  const todasAsAbas: readonly { id: IdAba; nome: string; fase: string }[] = selecionado?.clipe.ajuste
    ? ABAS_AJUSTE
    : modo === "imagem"
      ? ehTexto
        ? ABAS_DESENHO_TEXTO
        : ABAS_DESENHO
      : ehTexto ? ABAS_TEXTO : ehAudio ? ABAS_AUDIO : selecionado && midia?.imagem ? ABAS_IMAGEM : ABAS;
  // Mídia da biblioteca, sem clipe, só tem informações; num texto, a aba que não existe vira a do texto
  // Num clipe de áudio, a aba que não existe vira a do som
  const abas = somenteAbas ? todasAsAbas.filter((item) => somenteAbas.includes(item.id)) : todasAsAbas;
  const aba: IdAba = !selecionado ? "info" : abas.some((item) => item.id === abaEscolhida) ? abaEscolhida : ehAudio && abas.some((item) => item.id === "audio") ? "audio" : (abas[0]?.id ?? "info");
  const atual = abas.find((item) => item.id === aba) ?? { id: aba, nome: "", fase: "" };
  // O painel não tem o que mostrar para esta escolha (a Cor de um som, os Controles de efeito sem clipe)
  if ((selecionado && !abas.length) || (!selecionado && midia && somenteAbas && !somenteAbas.includes("info"))) {
    return (
      <aside aria-label="Propriedades" style={style} className={`flex min-h-0 shrink-0 flex-col items-center justify-center gap-2 bg-painel p-6 text-center ${className}`}>
        <MousePointerClick className="size-6 text-suave" aria-hidden />
        <p className="text-xs text-suave">{selecionado ? "Este clipe não tem nada para ajustar aqui." : "Selecione um clipe na linha do tempo."}</p>
      </aside>
    );
  }

  if (!midia && !selecionado) {
    if (semSelecao) {
      return (
        <aside aria-label="Propriedades" style={style} className={`flex min-h-0 shrink-0 flex-col overflow-y-auto bg-painel ${className}`}>
          {semSelecao}
        </aside>
      );
    }
    return (
      <aside aria-label="Propriedades" style={style} className={`flex min-h-0 shrink-0 flex-col bg-painel ${className}`}>
        {modo === "imagem" || somenteAbas ? null : (
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
        )}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <MousePointerClick className="size-6 text-suave" aria-hidden />
          <p className="text-xs text-suave">
            {modo === "imagem"
              ? "Selecione uma camada na prévia ou na lista para ajustar posição, cor, efeitos e recorte."
              : "Selecione um clipe na prévia ou na linha do tempo para ajustar posição, tamanho e recorte."}
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside aria-label="Propriedades" style={style} className={`flex min-h-0 shrink-0 flex-col bg-painel ${className}`}>
      {aoFechar ? (
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-borda px-3 lg:hidden">
          <h2 className="text-sm font-semibold">Ajustes do clipe</h2>
          <button type="button" onClick={aoFechar} className="botao-icone" aria-label="Fechar os ajustes">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}
      {/* As abas quebram em linhas: com rolagem para o lado, Animação e Cor ficavam escondidas num painel estreito */}
      <div role="tablist" aria-label="Propriedades" hidden={Boolean(somenteAbas) && abas.length < 2} className="flex shrink-0 flex-wrap gap-1 border-b border-borda px-2 py-1.5">
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
          <AbaTexto clipe={selecionado.clipe} faixa={selecionado.faixa} aoPrever={aoPrever} aoExecutar={aoExecutar} semTempo={modo === "imagem"} />
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
                  <Linha rotulo="Volume" valor={selecionado.clipe.keyframes?.volume?.length ? "Com keyframes" : `${Math.round(selecionado.clipe.volume * 100)}%`} />
                </dl>
              </>
            ) : null}
            <h3 className="truncate text-sm font-semibold" title={midia.nome}>
              {selecionado ? `Mídia · ${midia.nome}` : midia.nome}
            </h3>
            <dl className="mt-2">
              <Linha rotulo="Arquivo" valor={midia.nome_original} />
              <Linha rotulo="Tamanho" valor={formatarBytes(midia.tamanho_total)} />
              {midia.imagem ? <Linha rotulo="Tipo" valor="Imagem" /> : <Linha rotulo="Duração" valor={formatarTempo(midia.duracao)} />}
              {midia.imagem && midia.video ? (
                <Linha rotulo="Resolução" valor={`${midia.video.largura} × ${midia.video.altura}${midia.video.transparente ? " · com transparência" : ""}`} />
              ) : midia.video ? (
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
            seguirObjeto={seguirObjeto}
            aoTrocarMidia={aoTrocarMidia}
            aoTrocarPorVideo={aoTrocarPorVideo}
            faixas={faixas}
            midias={midias}
            aoPrever={aoPrever}
            aoExecutar={aoExecutar}
            modo={modo}
            aoTrocarImagem={aoTrocarImagem}
          />
        ) : aba === "velocidade" && selecionado && !selecionado.clipe.texto ? (
          <AbaVelocidade clipe={selecionado.clipe} faixa={selecionado.faixa} midia={midia} aoPrever={aoPrever} aoExecutar={aoExecutar} />
        ) : aba === "cor" && selecionado && selecionado.faixa.tipo !== "audio" ? (
          <AbaCor clipe={selecionado.clipe} faixa={selecionado.faixa} midia={midia} faixas={faixas} midias={midias} aoPrever={aoPrever} aoExecutar={aoExecutar} />
        ) : aba === "animacao" && selecionado && selecionado.faixa.tipo !== "audio" ? (
          <AbaAnimacao clipe={selecionado.clipe} faixa={selecionado.faixa} aoPrever={aoPrever} aoExecutar={aoExecutar} />
        ) : aba === "audio" && selecionado ? (
          <AbaAudio
            clipe={selecionado.clipe}
            faixa={selecionado.faixa}
            midia={midia}
            faixas={faixas}
            tempo={tempo}
            taxa={taxa}
            aoBuscar={aoBuscar}
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
  seguirObjeto: EstadoSeguirObjeto;
  aoTrocarMidia: (clipeIds: string[], midia: Midia) => void;
  aoTrocarPorVideo?: (clipeId: string, midia: Midia) => void;
  /** Para a multicâmera: as faixas (as câmeras) e as mídias da biblioteca (as gravações). */
  faixas: Faixa[];
  midias?: ReadonlyMap<string, Midia>;
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

function AbaBasico({ clipe, faixa, tempo, taxa, aoBuscar, midia, proporcao, aoAvisar, seguirObjeto, aoTrocarMidia, aoTrocarPorVideo, faixas, midias, aoPrever, aoExecutar, modo = "video", aoTrocarImagem }: PropsBasico & { modo?: "video" | "imagem"; aoTrocarImagem?: (clipeId: string) => void }) {
  const comTempo = modo === "video";
  if (faixa.tipo === "audio") {
    return <p className="py-8 text-center text-xs text-suave">Clipes de áudio não aparecem na imagem.</p>;
  }
  if (clipe.ajuste) {
    const opacidade = clipe.transformacao.opacidade;
    const comando = (valor: number): Comando => ({ comando: "clipe.transformar", parametros: { clipeIds: [clipe.id], transformacao: { opacidade: valor } } });
    return (
      <div>
        {faixa.travada ? <p className="mb-2 rounded-md bg-painel-2 px-2 py-1.5 text-xs text-suave">A faixa está travada. Destrave o cadeado para editar.</p> : null}
        <Secao titulo="Camada de ajuste">
          <p className="text-[11px] text-suave">A cor, o filtro e as curvas desta camada (aba Cor) valem para tudo o que está embaixo dela. A máscara limita a uma parte do quadro.</p>
          <ControleNumerico
            rotulo="Opacidade"
            valor={opacidade * 100}
            minimo={0}
            maximo={100}
            sufixo="%"
            desativado={faixa.travada}
            aoPrever={(valor) => aoPrever(comando(valor / 100))}
            aoConfirmar={(valor) => {
              if (Math.abs(valor / 100 - opacidade) < PERTO) aoPrever(null);
              else aoExecutar(comando(valor / 100));
            }}
          />
          <MascaraDoClipe clipe={clipe} travada={faixa.travada} aoPrever={aoPrever} aoExecutar={aoExecutar} />
        </Secao>
      </div>
    );
  }
  // Os valores do instante do cursor: com keyframes, mexer grava um ponto ali
  const t = transformacaoParaEditar(clipe, tempo);
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
    acao: comTempo ? (
      <BotaoKeyframe
        pontos={clipe.keyframes?.[chave] ?? undefined}
        noInstante={noInstante.includes(chave)}
        desativado={travada || !dentro}
        aoClicar={() => aoExecutar({ comando: "clipe.keyframe", parametros: { clipeId: clipe.id, propriedade: chave, tempo, acao: "alternar" } })}
      />
    ) : undefined,
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
      {aoTrocarImagem && clipe.midia_id ? (
        <button type="button" className="botao-secundario mb-2 w-full px-3 py-1.5 text-xs" disabled={travada} onClick={() => aoTrocarImagem(clipe.id)} title="Outra imagem no mesmo lugar e tamanho">
          <ImageIcon className="size-3.5" aria-hidden />
          Trocar a imagem
        </button>
      ) : null}
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
        <div className="flex items-center gap-2 text-xs">
          <span className="flex-1 text-suave">Virar</span>
          {(["horizontal", "vertical"] as const).map((sentido) => (
            <button
              key={sentido}
              type="button"
              className={`botao-icone ${clipe.virar?.[sentido] ? "bg-destaque/15 text-destaque" : ""}`}
              disabled={travada}
              aria-pressed={Boolean(clipe.virar?.[sentido])}
              aria-label={`Virar na ${sentido}`}
              title={`Virar na ${sentido}`}
              onClick={() => aoExecutar({ comando: "clipe.virar", parametros: { clipeIds: [clipe.id], sentido } })}
            >
              {/* O eixo tracejado é o espelho: vertical para virar na horizontal */}
              {sentido === "horizontal" ? <TrianglesCenterlineDashedVertical className="size-4" aria-hidden /> : <TrianglesCenterlineDashedHorizontal className="size-4" aria-hidden />}
            </button>
          ))}
        </div>
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
        <CantosDoClipe clipe={clipe} travada={travada} aoPrever={aoPrever} aoExecutar={aoExecutar} />
        {!clipe.ajuste ? <SilhuetaDoClipe clipe={clipe} travada={travada} aoPrever={aoPrever} aoExecutar={aoExecutar} /> : null}
        <MascaraDoClipe clipe={clipe} travada={travada} aoPrever={aoPrever} aoExecutar={aoExecutar} />
        {midia?.elemento && !clipe.texto ? (
          <SecaoForma clipe={clipe} midia={{ ...midia, elemento: midia.elemento }} travada={travada} aoTrocarMidia={aoTrocarMidia} aoAvisar={aoAvisar} />
        ) : null}
        {comTempo && aoTrocarPorVideo && midia?.imagem && !midia.elemento && !midia.animacao && !midia.video?.transparente && !clipe.texto ? (
          <FotoEm3D clipe={clipe} midia={midia} travada={travada} aoPedir={aoTrocarPorVideo} aoAvisar={aoAvisar} />
        ) : null}
        {clipe.texto ? null : <TelaVerde clipe={clipe} travada={travada} aoPrever={aoPrever} aoExecutar={aoExecutar} />}
        {clipe.texto ? null : <ChaveDeLuma clipe={clipe} travada={travada} aoPrever={aoPrever} aoExecutar={aoExecutar} />}
        {!clipe.texto && midia?.video && (!midia.imagem || !comTempo) && !midia.elemento ? (
          <RemoverFundo
            clipe={clipe}
            midia={midia}
            travada={travada}
            aoExecutar={aoExecutar}
            // Numa foto do editor de imagem: a pessoa nítida sobre uma cópia desfocada (duas camadas)
            desfocar={!comTempo && midia.imagem && !midia.video.transparente ? () => aoExecutar({ comando: "imagem.desfocarFundo", parametros: { faixaId: faixa.id } }) : undefined}
          />
        ) : null}
        {!clipe.texto && midia?.video && !midia.imagem && !midia.elemento && !midia.animacao && comTempo ? (
          <>
            <EsconderRostos clipe={clipe} midia={midia} travada={travada} aoExecutar={aoExecutar} />
            <EsconderObjetos clipe={clipe} midia={midia} travada={travada} estado={seguirObjeto} aoExecutar={aoExecutar} />
          </>
        ) : null}
        {!clipe.texto && midia?.video && !midia.imagem && !midia.animacao ? (
          <Estabilizar clipe={clipe} midia={midia} travada={travada} aoExecutar={aoExecutar} />
        ) : null}
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
                    const acao = evento.currentTarget.value as Curva;
                    for (const propriedade of noInstante) {
                      aoExecutar({ comando: "clipe.keyframe", parametros: { clipeId: clipe.id, propriedade, tempo, acao } });
                    }
                  }}
                  className="rounded-md border border-borda bg-painel-2 px-1 py-0.5 text-[11px] text-texto outline-none focus:border-destaque"
                >
                  {CURVAS_DE_KEYFRAME.map(({ id, nome }) => (
                    <option key={id} value={id}>
                      {nome}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="ml-auto">{pontosDoClipe.length} keyframes</span>
            )}
          </div>
        ) : null}
        {!clipe.texto && midia?.video && !midia.imagem ? (
          <SeguirRosto clipe={clipe} faixa={faixa} midia={midia} proporcao={proporcao} aoExecutar={aoExecutar} aoAvisar={aoAvisar} />
        ) : null}
        {/* Quem segue fica por cima do vídeo: textos e sobreposições (a legenda tem lugar fixo) */}
        {comTempo && (faixa.tipo === "texto" || faixa.tipo === "video") ? (
          <BotaoSeguirObjeto
            clipe={clipe}
            travada={travada}
            marcando={seguirObjeto.marcando === clipe.id}
            andamento={seguirObjeto.andamento?.seguidorId === clipe.id ? seguirObjeto.andamento.texto : null}
            aoIniciar={() => seguirObjeto.aoIniciar(clipe.id)}
          />
        ) : null}
      </Secao>
      {comTempo ? (
        <Secao titulo="Expressões">
          <SecaoExpressoes clipe={clipe} travada={travada} aoPrever={aoPrever} aoExecutar={aoExecutar} />
        </Secao>
      ) : null}
      {comTempo && midias && midia?.video && !midia.imagem && (faixa.tipo === "principal" || faixa.multicamera) ? (
        <Secao titulo="Multicâmera">
          <Multicamera clipe={clipe} faixas={faixas} midias={midias} tempo={tempo} travada={travada} aoExecutar={aoExecutar} aoAvisar={aoAvisar} soTrocar={faixa.tipo !== "principal"} />
        </Secao>
      ) : null}
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
/**
 * Câmera lenta suave: o worker inventa os quadros do meio (4 vezes os da fonte) só no trecho do clipe, com 1 s de
 * folga para cada lado, alinhado aos quadros. Aparar além da folga pede para ligar de novo.
 */
function CameraLentaSuave({ clipe, midia, travada, aoExecutar }: { clipe: Clipe; midia: Midia; travada: boolean; aoExecutar: (comando: Comando) => void }) {
  const [erro, setErro] = useState("");
  const chave = clipe.fluido ? chaveDoFluido(clipe.fluido.de, clipe.fluido.ate) : null;
  const estado = chave ? midia.fluidos?.[chave] : undefined;
  const coberto = zeroDoFluido(clipe, midia) !== null;
  function ligar() {
    const fps = midia.video?.fps ?? 30;
    const de = Math.max(0, Math.floor((clipe.entrada / TICKS_POR_SEGUNDO - 1) * fps) / fps);
    const ate = Math.min(midia.duracao ?? Infinity, Math.ceil(((clipe.entrada + clipe.duracao * clipe.velocidade) / TICKS_POR_SEGUNDO + 1) * fps) / fps);
    const trecho = { de: Math.round(de * 1000) / 1000, ate: Math.round(ate * 1000) / 1000 };
    aoExecutar({ comando: "clipe.fluido", parametros: { clipeId: clipe.id, fluido: trecho } });
    setErro("");
    chamarApi(`/midias/${midia.id}/fluido`, { metodo: "POST", corpo: trecho }).catch((e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível pedir a câmera lenta suave agora."));
  }
  return (
    <div className="mt-2">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={Boolean(clipe.fluido)}
          disabled={travada}
          onChange={(evento) => (evento.currentTarget.checked ? ligar() : aoExecutar({ comando: "clipe.fluido", parametros: { clipeId: clipe.id, fluido: null } }))}
        />
        <span className="flex-1">Câmera lenta suave (inventa os quadros do meio)</span>
      </label>
      {clipe.fluido && estado?.status === "processando" ? <p className="text-[11px] text-suave">Criando os quadros do meio… pode levar alguns minutos; a prévia mostra o vídeo de sempre até lá.</p> : null}
      {clipe.fluido && estado?.status === "erro" ? <p className="text-[11px] text-red-400">{estado.erro ?? "A câmera lenta suave não ficou pronta."}</p> : null}
      {clipe.fluido && estado?.status === "pronta" && !coberto ? (
        <button type="button" className="botao-secundario mt-1 px-2 py-1 text-[11px]" disabled={travada} onClick={ligar}>
          O clipe passou do trecho: refazer
        </button>
      ) : null}
      {erro ? <p className="text-[11px] text-red-400">{erro}</p> : null}
    </div>
  );
}

/** "Ao contrário": liga no clipe e pede ao worker o vídeo invertido, se ele ainda não existe. */
function AoContrario({ clipe, midia, travada, aoExecutar }: { clipe: Clipe; midia: Midia; travada: boolean; aoExecutar: (comando: Comando) => void }) {
  const [erro, setErro] = useState("");
  const estado = midia.invertido;
  function alternar(ligar: boolean) {
    aoExecutar({ comando: "clipe.inverter", parametros: { clipeIds: [clipe.id], ligar } });
    if (!ligar || estado?.status === "pronta" || estado?.status === "processando") return;
    setErro("");
    chamarApi(`/midias/${midia.id}/inversao`, { metodo: "POST" }).catch((e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível pedir o vídeo ao contrário agora."));
  }
  return (
    <div className="mt-2">
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={Boolean(clipe.inverter)} disabled={travada} onChange={(evento) => alternar(evento.currentTarget.checked)} />
        <span className="flex-1">Ao contrário</span>
      </label>
      {clipe.inverter && estado?.status === "processando" ? <p className="text-[11px] text-suave">Preparando o vídeo ao contrário… a prévia mostra o original até ficar pronto.</p> : null}
      {clipe.inverter && estado?.status === "erro" ? <p className="text-[11px] text-red-400">{estado.erro ?? "O vídeo ao contrário não ficou pronto."}</p> : null}
      {erro ? <p className="text-[11px] text-red-400">{erro}</p> : null}
      {clipe.inverter ? <p className="text-[11px] text-suave">Ao contrário, o clipe fica sem curva de velocidade, recorte do fundo, estabilizar, tirar o ruído, voz limpa e tom.</p> : null}
    </div>
  );
}

function AbaVelocidade({ clipe, faixa, midia, aoPrever, aoExecutar }: PropsAba & { midia: Midia | null }) {
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
        {midia?.video && !midia.imagem ? <AoContrario clipe={clipe} midia={midia} travada={travada} aoExecutar={aoExecutar} /> : null}
        {midia?.video?.fps && !midia.imagem && (clipe.velocidade < 1 || clipe.fluido) ? <CameraLentaSuave clipe={clipe} midia={midia} travada={travada} aoExecutar={aoExecutar} /> : null}
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
      <line x1={0} y1={10} x2={60} y2={10} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="2 2" />
      <polyline points={pontos.map(([u, s]) => `${(u * 60).toFixed(1)},${y(s).toFixed(1)}`).join(" ")} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

/**
 * Remover o fundo sem tela verde: o worker acha a pessoa em cada quadro (MODNet) e a prévia e o
 * render usam a mesma máscara. Numa foto (só no editor de imagem), a máscara é uma imagem.
 */
function RemoverFundo({ clipe, midia, travada, aoExecutar, desfocar }: { clipe: Clipe; midia: Midia; travada: boolean; aoExecutar: (comando: Comando) => void; desfocar?: () => void }) {
  const [erroDoPedido, setErroDoPedido] = useState("");
  const recorte = midia.recorte_fundo;
  // A animação já nasce com a transparência: a mesma opção, com outro nome
  const animacao = Boolean(midia.animacao);
  const foto = Boolean(midia.imagem);
  function pedirMascara() {
    if (recorte?.status === "pronta" || recorte?.status === "processando") return;
    setErroDoPedido("");
    chamarApi(`/midias/${midia.id}/recorte-fundo`, { metodo: "POST" }).catch((erro: unknown) =>
      setErroDoPedido(erro instanceof Error ? erro.message : "Não foi possível pedir o recorte agora."),
    );
  }
  function mudar(ligar: boolean) {
    aoExecutar({ comando: "clipe.removerFundo", parametros: { clipeIds: [clipe.id], ligar } });
    if (ligar) pedirMascara();
  }
  return (
    <div className="mt-2 border-t border-borda/60 pt-2">
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={Boolean(clipe.remover_fundo)} disabled={travada} onChange={(evento) => mudar(evento.currentTarget.checked)} />
        <span className="flex-1">{animacao ? "Fundo transparente (só a animação aparece)" : "Remover o fundo (fica a pessoa)"}</span>
      </label>
      {!desfocar && !foto && !animacao ? (
        <>
          <label className="mt-1 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={Boolean(clipe.fundo_desfocado)}
              disabled={travada}
              onChange={(evento) => {
                const ligar = evento.currentTarget.checked;
                aoExecutar({ comando: "clipe.fundoDesfocado", parametros: { clipeIds: [clipe.id], intensidade: ligar ? 0.5 : null } });
                if (ligar) pedirMascara();
              }}
            />
            <span className="flex-1">Desfocar o fundo (a pessoa fica nítida)</span>
          </label>
          {clipe.fundo_desfocado ? (
            <>
              <ControleNumerico
                rotulo="Desfoque do fundo"
                valor={clipe.fundo_desfocado * 100}
                minimo={5}
                maximo={100}
                sufixo="%"
                desativado={travada}
                aoPrever={() => undefined}
                aoConfirmar={(valor) => aoExecutar({ comando: "clipe.fundoDesfocado", parametros: { clipeIds: [clipe.id], intensidade: valor / 100 } })}
              />
              <p className="mt-1 text-[11px] text-suave" role="status">
                {recorte?.status === "pronta"
                  ? "Pronto. A pessoa fica nítida sobre o próprio vídeo desfocado."
                  : recorte?.status === "erro" || erroDoPedido
                    ? `O recorte falhou: ${erroDoPedido || recorte?.erro}`
                    : `Achando a pessoa em cada quadro${recorte?.progresso ? ` · ${recorte.progresso}%` : ""}.`}
              </p>
            </>
          ) : null}
        </>
      ) : null}
      {desfocar && !clipe.remover_fundo ? (
        <button
          type="button"
          className="botao-secundario mt-1.5 w-full px-3 py-1.5 text-xs"
          disabled={travada}
          title="A pessoa fica nítida e uma cópia desfocada da foto entra embaixo"
          onClick={() => {
            desfocar();
            pedirMascara();
          }}
        >
          Desfocar o fundo
        </button>
      ) : null}
      {clipe.remover_fundo ? (
        <p className="mt-1 text-[11px] text-suave" role="status">
          {recorte?.status === "pronta"
            ? animacao
              ? "A animação aparece por cima do vídeo, sem fundo."
              : foto
                ? "Pronto. A prévia e a imagem exportada mostram só a pessoa."
                : "Pronto. A prévia e o vídeo exportado mostram só a pessoa."
            : recorte?.status === "erro" || erroDoPedido
              ? `O recorte falhou: ${erroDoPedido || recorte?.erro}`
              : `Achando a pessoa ${foto ? "na imagem" : "em cada quadro"}${recorte?.progresso ? ` · ${recorte.progresso}%` : ""}. Até terminar, a prévia mostra ${foto ? "a imagem" : "o clipe"} inteir${foto ? "a" : "o"}.`}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Esconder os rostos: o worker acha todos os rostos de cada quadro (YuNet) e grava uma máscara; uma cópia pixelizada
 * ou desfocada do clipe, recortada por ela, fica por cima (lib/projeto/fundoDesfocado.ts).
 */
function EsconderRostos({ clipe, midia, travada, aoExecutar }: { clipe: Clipe; midia: Midia; travada: boolean; aoExecutar: (comando: Comando) => void }) {
  const [erroDoPedido, setErroDoPedido] = useState("");
  const estado = midia.esconder_rostos;
  const valor = clipe.esconder_rostos ?? null;
  const executar = (novo: { modo: "pixelizar" | "desfocar"; forca: number } | null) => aoExecutar({ comando: "clipe.esconderRostos", parametros: { clipeIds: [clipe.id], valor: novo } });
  function pedir() {
    if (estado?.status === "pronta" || estado?.status === "processando") return;
    setErroDoPedido("");
    chamarApi(`/midias/${midia.id}/esconder-rostos`, { metodo: "POST" }).catch((erro: unknown) => setErroDoPedido(erro instanceof Error ? erro.message : "Não foi possível pedir agora."));
  }
  return (
    <div className="mt-2 border-t border-borda/60 pt-2">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={valor !== null}
          disabled={travada}
          onChange={(evento) => {
            const ligar = evento.currentTarget.checked;
            executar(ligar ? { modo: "pixelizar", forca: 0.6 } : null);
            if (ligar) pedir();
          }}
        />
        <span className="flex-1">Esconder os rostos</span>
      </label>
      {valor ? (
        <>
          <div className="mt-1 grid grid-cols-2 gap-1" role="radiogroup" aria-label="Jeito de esconder">
            {(["pixelizar", "desfocar"] as const).map((modo) => (
              <button
                key={modo}
                type="button"
                role="radio"
                aria-checked={valor.modo === modo}
                disabled={travada}
                onClick={() => executar({ ...valor, modo })}
                className={`rounded-md border px-2 py-1 text-xs ${valor.modo === modo ? "border-destaque bg-destaque/10" : "border-borda text-suave hover:text-texto"}`}
              >
                {modo === "pixelizar" ? "Pixelizar" : "Desfocar"}
              </button>
            ))}
          </div>
          <ControleNumerico
            rotulo="Força"
            valor={valor.forca * 100}
            minimo={5}
            maximo={100}
            sufixo="%"
            desativado={travada}
            aoPrever={() => undefined}
            aoConfirmar={(forca) => executar({ ...valor, forca: forca / 100 })}
          />
          <p className="mt-1 text-[11px] text-suave" role="status">
            {estado?.status === "pronta"
              ? estado.quadros_com_rosto === 0
                ? "Nenhum rosto foi achado neste vídeo."
                : "Pronto. Os rostos ficam escondidos na prévia e no vídeo exportado."
              : estado?.status === "erro" || erroDoPedido
                ? `Não deu certo: ${erroDoPedido || estado?.erro}`
                : `Procurando os rostos em cada quadro${estado?.progresso ? ` · ${estado.progresso}%` : ""}.`}
          </p>
        </>
      ) : null}
    </div>
  );
}

/** Esconder objetos que se movem (uma placa, um logo): a pessoa marca, o VitTrack segue e uma cópia pixelizada cobre. */
function EsconderObjetos({
  clipe,
  midia,
  travada,
  estado,
  aoExecutar,
}: {
  clipe: Clipe;
  midia: Midia;
  travada: boolean;
  estado: EstadoSeguirObjeto;
  aoExecutar: (comando: Comando) => void;
}) {
  const objetos = clipe.esconder_objetos ?? [];
  const mudar = (lista: typeof objetos) => aoExecutar({ comando: "clipe.esconderObjetos", parametros: { clipeId: clipe.id, objetos: lista } });
  const marcando = estado.marcando === clipe.id;
  const andamento = estado.andamento?.seguidorId === clipe.id ? estado.andamento.texto : null;
  return (
    <div className="mt-2 border-t border-borda/60 pt-2">
      <button
        type="button"
        className="botao-secundario w-full px-3 py-1.5 text-xs"
        disabled={travada || marcando || andamento !== null || objetos.length >= 4 || !estado.aoEsconder}
        onClick={() => estado.aoEsconder?.(clipe.id)}
      >
        {andamento ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
        {andamento ?? (marcando ? "Marque o objeto na prévia" : "Esconder um objeto (placa, logo)")}
      </button>
      {objetos.map((objeto, indice) => {
        const situacao = midia.objetos_escondidos?.[objeto.rastreio];
        return (
          <div key={objeto.rastreio} className="mt-1.5 rounded-md border border-borda/60 p-1.5">
            <div className="flex items-center gap-1">
              <span className="flex-1 text-xs">Objeto {indice + 1}</span>
              <select
                value={objeto.modo}
                disabled={travada}
                aria-label={`Jeito de esconder o objeto ${indice + 1}`}
                onChange={(evento) => mudar(objetos.map((o, i) => (i === indice ? { ...o, modo: evento.currentTarget.value as "pixelizar" | "desfocar" } : o)))}
                className="rounded-md border border-borda bg-painel-2 px-1.5 py-0.5 text-xs"
              >
                <option value="pixelizar">Pixelizar</option>
                <option value="desfocar">Desfocar</option>
              </select>
              <button type="button" className="botao-icone size-6" disabled={travada} onClick={() => mudar(objetos.filter((_, i) => i !== indice))} aria-label={`Mostrar o objeto ${indice + 1} de novo`} title="Mostrar de novo">
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
            <ControleNumerico
              rotulo="Força"
              valor={objeto.forca * 100}
              minimo={5}
              maximo={100}
              sufixo="%"
              desativado={travada}
              aoPrever={() => undefined}
              aoConfirmar={(forca) => mudar(objetos.map((o, i) => (i === indice ? { ...o, forca: forca / 100 } : o)))}
            />
            <p className="text-[11px] text-suave" role="status">
              {situacao?.status === "pronta" ? "Escondido na prévia e no vídeo exportado." : situacao?.status === "erro" ? `Não deu certo: ${situacao.erro}` : "Gravando a máscara do objeto…"}
            </p>
          </div>
        );
      })}
      {!objetos.length && !marcando && !andamento ? <p className="mt-1 text-[11px] text-suave">Marque uma placa ou um logo: ele é seguido pelo vídeo e fica pixelizado.</p> : null}
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

/** Cantos arredondados e borda: o raio, a espessura e a cor da borda. */
function CantosDoClipe({ clipe, travada, aoPrever, aoExecutar }: { clipe: Clipe; travada: boolean } & Pick<PropsAba, "aoPrever" | "aoExecutar">) {
  const cantos = clipe.cantos ?? null;
  const comando = (valor: Cantos | null): Comando => ({ comando: "clipe.cantos", parametros: { clipeIds: [clipe.id], cantos: valor } });
  const controle = (campo: "raio" | "borda") => ({
    valor: (cantos?.[campo] ?? 0) * 100,
    desativado: travada,
    aoPrever: (valor: number) => aoPrever(comando({ ...cantos!, [campo]: valor / 100 })),
    aoConfirmar: (valor: number) => {
      if (Math.abs(valor / 100 - cantos![campo]) < PERTO) aoPrever(null);
      else aoExecutar(comando({ ...cantos!, [campo]: valor / 100 }));
    },
  });
  return (
    <div className="mt-2 border-t border-borda/60 pt-2">
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={cantos !== null} disabled={travada} onChange={(evento) => aoExecutar(comando(evento.currentTarget.checked ? CANTOS_PADRAO : null))} />
        <span className="flex-1">Cantos arredondados e borda</span>
      </label>
      {cantos ? (
        <>
          <ControleNumerico rotulo="Arredondar" minimo={0} maximo={50} sufixo="%" {...controle("raio")} />
          <ControleNumerico rotulo="Borda" minimo={0} maximo={BORDA_MAXIMA * 100} passo={0.5} sufixo="%" {...controle("borda")} />
          {cantos.borda > 0 ? (
            <CampoCor
              rotulo="Cor da borda"
              cor={cantos.cor}
              desativado={travada}
              aoPrever={(cor) => aoPrever(comando({ ...cantos, cor }))}
              aoConfirmar={(cor) => aoExecutar(comando({ ...cantos, cor }))}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Contorno e sombra em volta do que aparece do clipe (recortes, logos, formas, adesivos). */
function SilhuetaDoClipe({ clipe, travada, aoPrever, aoExecutar }: { clipe: Clipe; travada: boolean } & Pick<PropsAba, "aoPrever" | "aoExecutar">) {
  const contorno = clipe.contorno ?? null;
  const sombra = clipe.sombra ?? null;
  const comando = (mudanca: { contorno?: Contorno | null; sombra?: Sombra | null }): Comando => ({ comando: "clipe.silhueta", parametros: { clipeIds: [clipe.id], ...mudanca } });
  const doContorno = (campo: "largura") => ({
    valor: (contorno?.[campo] ?? 0) * 100,
    desativado: travada,
    aoPrever: (valor: number) => aoPrever(comando({ contorno: { ...contorno!, [campo]: valor / 100 } })),
    aoConfirmar: (valor: number) => {
      if (Math.abs(valor / 100 - contorno![campo]) < PERTO) aoPrever(null);
      else aoExecutar(comando({ contorno: { ...contorno!, [campo]: valor / 100 } }));
    },
  });
  const daSombra = (campo: "opacidade" | "desfoque" | "distancia" | "angulo", fator: number) => ({
    valor: (sombra?.[campo] ?? 0) * fator,
    desativado: travada,
    aoPrever: (valor: number) => aoPrever(comando({ sombra: { ...sombra!, [campo]: valor / fator } })),
    aoConfirmar: (valor: number) => {
      if (Math.abs(valor / fator - sombra![campo]) < PERTO) aoPrever(null);
      else aoExecutar(comando({ sombra: { ...sombra!, [campo]: valor / fator } }));
    },
  });
  return (
    <div className="mt-2 border-t border-borda/60 pt-2">
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={contorno !== null} disabled={travada} onChange={(evento) => aoExecutar(comando({ contorno: evento.currentTarget.checked ? CONTORNO_PADRAO : null }))} />
        <span className="flex-1">Contorno em volta</span>
      </label>
      {contorno ? (
        <>
          <ControleNumerico rotulo="Largura" minimo={0.5} maximo={LARGURA_MAXIMA_DO_CONTORNO * 100} passo={0.5} sufixo="%" {...doContorno("largura")} />
          <CampoCor
            rotulo="Cor do contorno"
            cor={contorno.cor}
            desativado={travada}
            aoPrever={(cor) => aoPrever(comando({ contorno: { ...contorno, cor } }))}
            aoConfirmar={(cor) => aoExecutar(comando({ contorno: { ...contorno, cor } }))}
          />
        </>
      ) : null}
      <label className="mt-1 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={sombra !== null} disabled={travada} onChange={(evento) => aoExecutar(comando({ sombra: evento.currentTarget.checked ? SOMBRA_PADRAO : null }))} />
        <span className="flex-1">Sombra</span>
      </label>
      {sombra ? (
        <>
          <ControleNumerico rotulo="Opacidade" minimo={5} maximo={100} sufixo="%" {...daSombra("opacidade", 100)} />
          <ControleNumerico rotulo="Desfoque" minimo={0} maximo={DESFOQUE_MAXIMO_DA_SOMBRA * 100} passo={0.5} sufixo="%" {...daSombra("desfoque", 100)} />
          <ControleNumerico rotulo="Distância" minimo={0} maximo={DISTANCIA_MAXIMA_DA_SOMBRA * 100} passo={0.5} sufixo="%" {...daSombra("distancia", 100)} />
          <ControleNumerico rotulo="Direção" minimo={-180} maximo={180} sufixo="°" {...daSombra("angulo", 1)} />
          <CampoCor
            rotulo="Cor da sombra"
            cor={sombra.cor}
            desativado={travada}
            aoPrever={(cor) => aoPrever(comando({ sombra: { ...sombra, cor } }))}
            aoConfirmar={(cor) => aoExecutar(comando({ sombra: { ...sombra, cor } }))}
          />
        </>
      ) : null}
    </div>
  );
}

/** Máscara de forma: só a parte de dentro (ou de fora) de um retângulo ou de uma elipse aparece. */
function MascaraDoClipe({ clipe, travada, aoPrever, aoExecutar }: { clipe: Clipe; travada: boolean } & Pick<PropsAba, "aoPrever" | "aoExecutar">) {
  const mascara = clipe.mascara ?? null;
  const desenhar = useContext(IniciarDesenhoDaMascara);
  const comando = (valor: MascaraDeForma | null): Comando => ({ comando: "clipe.mascara", parametros: { clipeIds: [clipe.id], mascara: valor } });
  const controle = (campo: "x" | "y" | "largura" | "altura" | "suavidade", minimo: number, maximo: number) => ({
    valor: (mascara?.[campo] ?? 0) * 100,
    minimo: minimo * 100,
    maximo: maximo * 100,
    sufixo: "%",
    desativado: travada,
    aoPrever: (valor: number) => aoPrever(comando({ ...mascara!, [campo]: valor / 100 })),
    aoConfirmar: (valor: number) => {
      if (Math.abs(valor / 100 - mascara![campo]) < PERTO) aoPrever(null);
      else aoExecutar(comando({ ...mascara!, [campo]: valor / 100 }));
    },
  });
  const { centro, tamanho, suavidade } = LIMITES_DA_MASCARA;
  return (
    <div className="mt-2 border-t border-borda/60 pt-2">
      <label className="flex items-center justify-between gap-2 text-xs">
        <span>Máscara</span>
        <select
          aria-label="Forma da máscara"
          value={mascara?.forma ?? ""}
          disabled={travada}
          onChange={(evento) => {
            const forma = evento.currentTarget.value as MascaraDeForma["forma"] | "";
            // O desenho começa na prévia: a máscara só muda quando ele fica pronto
            if (forma === "desenho") return desenhar?.(clipe.id);
            aoExecutar(comando(forma ? { ...(mascara ?? MASCARA_PADRAO), forma, pontos: null } : null));
          }}
          className="rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs outline-none focus:border-destaque"
        >
          <option value="">Nenhuma</option>
          <option value="elipse">Elipse</option>
          <option value="retangulo">Retângulo</option>
          {desenhar ? <option value="desenho">Desenho</option> : null}
        </select>
      </label>
      {mascara ? (
        <>
          {mascara.forma === "desenho" ? (
            <button type="button" className="botao-secundario mt-1.5 w-full px-3 py-1.5 text-xs" disabled={travada || !desenhar} onClick={() => desenhar?.(clipe.id)}>
              Desenhar de novo na prévia
            </button>
          ) : (
            <>
              <ControleNumerico rotulo="Centro na horizontal" {...controle("x", centro.minimo, centro.maximo)} />
              <ControleNumerico rotulo="Centro na vertical" {...controle("y", centro.minimo, centro.maximo)} />
              <ControleNumerico rotulo="Largura" {...controle("largura", tamanho.minimo, tamanho.maximo)} />
              <ControleNumerico rotulo="Altura" {...controle("altura", tamanho.minimo, tamanho.maximo)} />
            </>
          )}
          <ControleNumerico rotulo="Suavidade" {...controle("suavidade", suavidade.minimo, suavidade.maximo)} />
          <label className="mt-1 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={mascara.inverter} disabled={travada} onChange={(evento) => aoExecutar(comando({ ...mascara, inverter: evento.currentTarget.checked }))} />
            Inverter (some o que está dentro)
          </label>
        </>
      ) : null}
    </div>
  );
}

/** Chave de luminância de um clipe de mídia: tira o escuro ou o claro, com o limite e a suavidade. */
function ChaveDeLuma({ clipe, travada, aoPrever, aoExecutar }: { clipe: Clipe; travada: boolean } & Pick<PropsAba, "aoPrever" | "aoExecutar">) {
  const chave = clipe.chave_luma ?? null;
  const comando = (valor: ChaveLuma | null): Comando => ({ comando: "clipe.chaveLuma", parametros: { clipeIds: [clipe.id], chave: valor } });
  const controle = (campo: "limiar" | "suavidade") => ({
    valor: (chave?.[campo] ?? 0) * 100,
    desativado: travada,
    aoPrever: (valor: number) => aoPrever(comando({ ...chave!, [campo]: valor / 100 })),
    aoConfirmar: (valor: number) => {
      if (Math.abs(valor / 100 - chave![campo]) < PERTO) aoPrever(null);
      else aoExecutar(comando({ ...chave!, [campo]: valor / 100 }));
    },
  });
  return (
    <div className="mt-2 border-t border-borda/60 pt-2">
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={chave !== null} disabled={travada} onChange={(evento) => aoExecutar(comando(evento.currentTarget.checked ? CHAVE_LUMA_PADRAO : null))} />
        <span className="flex-1">Tirar o fundo preto ou branco</span>
      </label>
      {chave ? (
        <>
          <label className="mt-1 flex items-center gap-2 text-xs">
            <span className="flex-1 text-suave">Some o</span>
            <select
              value={chave.tirar}
              disabled={travada}
              onChange={(evento) => aoExecutar(comando({ ...chave, tirar: evento.currentTarget.value as ChaveLuma["tirar"] }))}
              className="rounded-md border border-borda bg-painel-2 px-2 py-1 text-xs outline-none focus:border-destaque"
            >
              <option value="escuro">Escuro</option>
              <option value="claro">Claro</option>
            </select>
          </label>
          <ControleNumerico rotulo="Até" minimo={0} maximo={100} sufixo="%" {...controle("limiar")} />
          <ControleNumerico rotulo="Suavidade" minimo={0} maximo={100} sufixo="%" {...controle("suavidade")} />
        </>
      ) : null}
    </div>
  );
}

function AbaAudio({
  clipe,
  faixa,
  midia,
  faixas,
  tempo,
  taxa,
  aoBuscar,
  aoAvisar,
  aoPrever,
  aoExecutar,
}: PropsAba & { midia: Midia | null; faixas: Faixa[]; tempo: Tick; taxa: Taxa; aoBuscar: (tempo: Tick) => void; aoAvisar: (mensagem: string) => void }) {
  const [erroDoPedido, setErroDoPedido] = useState("");
  if (!midia?.audio) return <p className="py-8 text-center text-xs text-suave">Este clipe não tem som.</p>;
  if (clipe.som_separado) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center text-xs text-suave">
        <p>O som deste vídeo foi separado: ele está num clipe da faixa de áudio, onde fica o volume, os fades e os efeitos.</p>
        <button
          type="button"
          className="botao-secundario px-3 py-1.5 text-xs"
          disabled={faixa.travada}
          onClick={() => aoExecutar({ comando: "clipe.devolverSom", parametros: { clipeIds: [clipe.id] } })}
        >
          Devolver o som ao vídeo
        </button>
        <p className="text-[11px]">O clipe de áudio separado continua na linha do tempo: apague-o para o som não tocar duas vezes.</p>
      </div>
    );
  }
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
  const efeitos = { ...SEM_EFEITOS_VOZ, ...clipe.efeitos_voz };

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
  // Keyframes de volume: com pontos, o volume mostrado é o do cursor e mexer grava um ponto ali
  const pontosDeVolume = clipe.keyframes?.volume ?? [];
  const dentro = tempo >= clipe.inicio && tempo <= clipe.inicio + clipe.duracao;
  const meioQuadro = duracaoDoQuadro(taxa) / 2;
  const noClipe = tempo - clipe.inicio;
  const volumeNoInstante = keyframeEm(pontosDeVolume, noClipe, meioQuadro);
  const volumeAgora = volumeNoTempo(clipe, tempo);
  const volumeAnterior = Math.max(...pontosDeVolume.map((p) => p.t).filter((x) => x >= 0 && x < noClipe - meioQuadro));
  const volumeSeguinte = Math.min(...pontosDeVolume.map((p) => p.t).filter((x) => x <= clipe.duracao && x > noClipe + meioQuadro));
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
          {...controle(volumeAgora * 100, (valor) => ({ volume: valor / 100, tempo }))}
          acao={
            <BotaoKeyframe
              pontos={pontosDeVolume}
              noInstante={Boolean(volumeNoInstante)}
              desativado={travada || !dentro}
              aoClicar={() => aoExecutar({ comando: "clipe.keyframe", parametros: { clipeId: clipe.id, propriedade: "volume", tempo, acao: "alternar" } })}
            />
          }
        />
        {pontosDeVolume.length ? (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-suave" aria-label="Keyframes de volume">
            <button
              type="button"
              className="botao-icone size-6"
              disabled={!Number.isFinite(volumeAnterior)}
              onClick={() => aoBuscar(clipe.inicio + volumeAnterior)}
              aria-label="Keyframe de volume anterior"
              title="Keyframe de volume anterior"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              className="botao-icone size-6"
              disabled={!Number.isFinite(volumeSeguinte)}
              onClick={() => aoBuscar(clipe.inicio + volumeSeguinte)}
              aria-label="Keyframe de volume seguinte"
              title="Keyframe de volume seguinte"
            >
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
            {volumeNoInstante ? (
              <label className="ml-auto flex items-center gap-1">
                Até o próximo
                <select
                  value={volumeNoInstante.curva}
                  disabled={travada}
                  onChange={(evento) =>
                    aoExecutar({ comando: "clipe.keyframe", parametros: { clipeId: clipe.id, propriedade: "volume", tempo, acao: evento.currentTarget.value as Curva } })
                  }
                  className="rounded-md border border-borda bg-painel-2 px-1 py-0.5 text-[11px] text-texto outline-none focus:border-destaque"
                >
                  {CURVAS_DE_KEYFRAME.map(({ id, nome }) => (
                    <option key={id} value={id}>
                      {nome}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="ml-auto">{pontosDeVolume.length} keyframes de volume</span>
            )}
          </div>
        ) : null}
        {faixa.tipo !== "audio" && midia.video && !midia.imagem ? (
          <button
            type="button"
            className="botao-secundario mt-2 w-full px-3 py-1.5 text-xs"
            disabled={travada}
            onClick={() => aoExecutar({ comando: "clipe.separarSom", parametros: { clipeIds: ids } })}
            title="O som vai para um clipe na faixa de áudio: aparar um sem o outro faz os cortes em J e em L"
          >
            Separar o som
          </button>
        ) : null}
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
          value={EFEITOS_PRONTOS.find((pronto) => JSON.stringify({ ...pronto.efeitos, ronco: efeitos.ronco }) === JSON.stringify(efeitos))?.id ?? ""}
          onChange={(evento) => {
            // O ronco não faz parte dos prontos: fica como estava
            const pronto = EFEITOS_PRONTOS.find((item) => item.id === evento.currentTarget.value);
            if (pronto) aoExecutar(comando({ efeitos_voz: { ...pronto.efeitos, ronco: efeitos.ronco } }));
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
        <label className="mt-2 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={(efeitos.ronco ?? 0) > 0.5}
            disabled={travada}
            onChange={(evento) => aoExecutar(comando({ efeitos_voz: { ...efeitos, ronco: evento.currentTarget.checked ? 1 : 0 } }))}
          />
          Tirar o ronco (corta abaixo de 80 Hz: vento, ar-condicionado, batidas no microfone)
        </label>
        <ControleNumerico rotulo="Graves" minimo={-EQ_LIMITE_DB} maximo={EQ_LIMITE_DB} sufixo="dB" {...controle(efeitos.grave, (valor) => ({ efeitos_voz: { ...efeitos, grave: valor } }))} />
        <ControleNumerico rotulo="Médios" minimo={-EQ_LIMITE_DB} maximo={EQ_LIMITE_DB} sufixo="dB" {...controle(efeitos.medio, (valor) => ({ efeitos_voz: { ...efeitos, medio: valor } }))} />
        <ControleNumerico rotulo="Agudos" minimo={-EQ_LIMITE_DB} maximo={EQ_LIMITE_DB} sufixo="dB" {...controle(efeitos.agudo, (valor) => ({ efeitos_voz: { ...efeitos, agudo: valor } }))} />
        <ControleNumerico rotulo="Eco" minimo={0} maximo={ECO_MAXIMO * 100} sufixo="%" {...controle(efeitos.eco * 100, (valor) => ({ efeitos_voz: { ...efeitos, eco: valor / 100 } }))} />
        <ControleNumerico rotulo="Reverb" minimo={0} maximo={100} sufixo="%" {...controle(efeitos.reverb * 100, (valor) => ({ efeitos_voz: { ...efeitos, reverb: valor / 100 } }))} />
      </Secao>
      <Secao titulo="Nivelar a voz">
        <NivelarVoz clipe={clipe} faixa={faixa} aoPrever={aoPrever} aoExecutar={aoExecutar} aoAvisar={aoAvisar} />
      </Secao>
      <Secao titulo="Abaixar na fala">
        <AbaixarNaFala clipe={clipe} faixa={faixa} faixas={faixas} aoPrever={aoPrever} aoExecutar={aoExecutar} aoAvisar={aoAvisar} />
      </Secao>
      <Secao titulo="Ritmo">
        <NoRitmo clipe={clipe} faixa={faixas.find((item) => item.tipo === "principal") ?? faixa} faixaDoClipe={faixa} aoExecutar={aoExecutar} aoAvisar={aoAvisar} />
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
