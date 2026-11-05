"use client";

import { Clock, LayoutGrid, List, Search, X } from "lucide-react";
import { useState } from "react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { CartaoMidia } from "@/componentes/midia/CartaoMidia";
import { formatoMaisPerto, GerarImagem } from "@/componentes/midia/GerarImagem";
import { GerarVideo } from "@/componentes/midia/GerarVideo";
import { ListaEnvios } from "@/componentes/midia/ListaEnvios";
import { MontarClipes } from "@/componentes/midia/MontarClipes";
import { ZonaDeEnvio } from "@/componentes/midia/ZonaDeEnvio";
import type { Comando, ResultadoDoComando } from "@/lib/projeto/comandos";
import { paraBusca } from "@/lib/materiais";
import type { Clipe, Faixa, Projeto } from "@/lib/projeto/modelo";
import type { Texto } from "@/lib/projeto/texto";
import type { Tick } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

import { BancoPixabay } from "./BancoPixabay";
import { type Ferramenta } from "./ferramentas";
import type { PropsGravacao } from "./GravarNarracao";
import { PainelAudio } from "./PainelAudio";
import { PainelAnimacoes } from "./PainelAnimacoes";
import { PainelEfeitos } from "./PainelEfeitos";
import { PainelFiltros } from "./PainelFiltros";
import { PainelFormas } from "./PainelFormas";
import { PainelTransicoes } from "./PainelTransicoes";
import { PainelLegendas, type PropsLegendas } from "./PainelLegendas";
import { PainelMarca } from "./PainelMarca";
import { PainelModelos } from "./PainelModelos";
import { PainelTranscricao } from "./PainelTranscricao";
import { PainelTexto } from "./PainelTexto";
import { PainelDoCorte } from "./PainelDoCorte";
import type { CorteDoProjeto } from "@/lib/clipar/corteDoProjeto";

type Biblioteca = {
  midias: Midia[] | null;
  erro: string;
  excluir: (midiaId: string) => Promise<void>;
  recarregar: () => Promise<void>;
};

type Props = {
  ferramenta: Ferramenta;
  biblioteca: Biblioteca;
  midiaSelecionadaId: string | null;
  aoSelecionarMidia: (midiaId: string | null) => void;
  aoAdicionarMidia: (midiaId: string) => void;
  /** Duplo clique numa mídia: abre na Fonte (só no layout profissional). */
  aoAbrirMidia?: (midiaId: string) => void;
  aoAdicionarTexto: (texto: Texto) => void;
  /** Uma animação foi pedida: entra no cursor (ou no instante dado) quando ficar pronta. */
  aoPedirAnimacao: (midia: Midia, inicio?: Tick) => void;
  /** Gravar narração, na ferramenta Áudio. */
  gravacao: PropsGravacao;
  /** O comando roda quando as mídias dadas (as formas de um modelo) aparecem prontas na biblioteca. */
  aoExecutarQuandoProntas: (midiaIds: string[], comando: Comando) => void;
  legendas: PropsLegendas;
  /** O clipe escolhido, para a ferramenta Filtros. */
  selecionado: { clipe: Clipe; faixa: Faixa } | null;
  aoPrever: (comando: Comando | null) => void;
  /** Mostra um comando só na tela (o material sob o mouse); null tira, sem confirmar nada. */
  aoMostrar?: (comando: Comando | null) => void;
  /** Tira a prévia e executa o comando (o fim de um arrasto que mostrou a prévia). */
  aoConfirmar?: (comando: Comando) => ResultadoDoComando;
  /** No celular o painel é uma folha por cima da tela, com botão de fechar. */
  aoFechar: () => void;
  /** O modelo de projeto que já vem escolhido (o "Usar" da página Modelos do hub). */
  modeloInicial?: string;
  /** A animação que já vem aberta na ferramenta Texto ou Elementos (o "Usar" de uma animação no hub). */
  animacaoInicial?: string;
  /** O corte do Clipar de onde o projeto veio (a ferramenta Corte). */
  corte?: CorteDoProjeto | null;
  /** Se o projeto já está salvo no servidor (a capa do corte é exportada dele). */
  salvo?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

function PainelMidia({
  biblioteca: { midias, erro, excluir, recarregar },
  midiaSelecionadaId,
  aoSelecionarMidia,
  aoAdicionarMidia,
  aoAbrirMidia,
  proporcao,
  aoExecutar,
  aoAvisar,
  aoPedir,
  projeto,
}: Pick<Props, "biblioteca" | "midiaSelecionadaId" | "aoSelecionarMidia" | "aoAdicionarMidia" | "aoAbrirMidia"> & {
  proporcao: string;
  projeto: Projeto;
  aoPedir: (midia: Midia) => void;
  aoExecutar: (comando: Comando) => void;
  aoAvisar: (mensagem: string) => void;
}) {
  // As formas desenhadas (Elementos) não entram na biblioteca: elas são editadas no próprio clipe
  const biblioteca = (midias ?? []).filter((midia) => !midia.elemento && !midia.camada_pixels);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"tudo" | "video" | "imagem" | "audio">("tudo");
  const [ordem, setOrdem] = useState<"recentes" | "nome" | "duracao">("recentes");
  const [emLista, setEmLista] = useState(false);
  const usadas = new Set(projeto.faixas.flatMap((faixa) => faixa.clipes.map((clipe) => clipe.midia_id).filter(Boolean)));
  const termo = paraBusca(busca.trim());
  const visiveis = biblioteca
    .filter((midia) => (tipo === "tudo" ? true : tipo === "imagem" ? midia.imagem : tipo === "audio" ? !midia.video : midia.video && !midia.imagem))
    .filter((midia) => !termo || paraBusca(midia.nome).includes(termo))
    .sort((a, b) =>
      ordem === "nome" ? a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }) : ordem === "duracao" ? (b.duracao ?? 0) - (a.duracao ?? 0) : 0,
    );
  return (
    <div className="flex flex-col gap-3">
      <ZonaDeEnvio compacta />
      <ListaEnvios />
      <GerarVideo
        proporcao={proporcao}
        imagens={biblioteca.filter((midia) => midia.imagem && midia.status === "pronta")}
        aoPedir={() => void recarregar()}
      />
      <GerarImagem formato={formatoMaisPerto(...(proporcao.split(":").map(Number) as [number, number]))} aoPedir={() => void recarregar()} />
      <BancoPixabay aoPedir={aoPedir} />
      <MontarClipes midias={biblioteca} aoExecutar={aoExecutar} aoAvisar={aoAvisar} />
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {biblioteca.length > 0 ? (
        <>
          <p className="text-xs font-medium text-suave">Biblioteca do espaço · arraste para a linha do tempo</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-borda bg-painel-2 px-2 py-1">
              <Search className="size-3.5 text-suave" aria-hidden />
              <input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar na biblioteca" aria-label="Buscar na biblioteca" className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
            </label>
            <select value={tipo} onChange={(evento) => setTipo(evento.target.value as typeof tipo)} aria-label="Tipo de mídia" className="rounded-md border border-borda bg-painel-2 px-1.5 py-1 text-xs">
              <option value="tudo">Tudo</option>
              <option value="video">Vídeos</option>
              <option value="imagem">Fotos</option>
              <option value="audio">Áudios</option>
            </select>
            <select value={ordem} onChange={(evento) => setOrdem(evento.target.value as typeof ordem)} aria-label="Ordem" className="rounded-md border border-borda bg-painel-2 px-1.5 py-1 text-xs">
              <option value="recentes">Recentes</option>
              <option value="nome">Nome</option>
              <option value="duracao">Duração</option>
            </select>
            <button type="button" className="botao-icone" onClick={() => setEmLista(!emLista)} aria-pressed={emLista} aria-label={emLista ? "Ver em grade" : "Ver em lista"} title={emLista ? "Ver em grade" : "Ver em lista"}>
              {emLista ? <LayoutGrid className="size-4" aria-hidden /> : <List className="size-4" aria-hidden />}
            </button>
          </div>
          {!visiveis.length ? <p className="py-2 text-center text-xs text-suave">Nenhuma mídia com esse filtro.</p> : null}
          <div className={emLista ? "flex flex-col gap-1.5" : "grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2"}>
            {visiveis.map((midia) => (
              <CartaoMidia
                key={midia.id}
                midia={midia}
                noProjeto={usadas.has(midia.id)}
                emLista={emLista}
                selecionada={midia.id === midiaSelecionadaId}
                aoSelecionar={(alvo) => aoSelecionarMidia(alvo.id === midiaSelecionadaId ? null : alvo.id)}
                aoAdicionar={(alvo) => aoAdicionarMidia(alvo.id)}
                aoAbrir={aoAbrirMidia ? (alvo) => aoAbrirMidia(alvo.id) : undefined}
                aoExcluir={(alvo) => {
                  if (!window.confirm(`Excluir "${alvo.nome}"? O arquivo sai da biblioteca.`)) return;
                  if (alvo.id === midiaSelecionadaId) aoSelecionarMidia(null);
                  void excluir(alvo.id);
                }}
              />
            ))}
          </div>
        </>
      ) : midias ? (
        <p className="text-center text-xs text-suave">Nenhuma mídia ainda.</p>
      ) : null}
    </div>
  );
}

/**
 * Ferramenta Elementos: as formas e as animações que não são texto (os textos animados ficam na ferramenta
 * Texto). Com uma animação aberta, as formas somem; o painel das animações não sai do lugar na árvore, para
 * o React não o remontar e perder o modelo aberto.
 */
function PainelElementos({ proporcao, aoPedir, aoAvisar, animacaoInicial }: { proporcao: string; aoPedir: (midia: Midia) => void; aoAvisar: (mensagem: string) => void; animacaoInicial?: string }) {
  const [animacaoAberta, setAnimacaoAberta] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div hidden={animacaoAberta}>
        <PainelFormas aoPedir={aoPedir} aoAvisar={aoAvisar} />
      </div>
      <PainelAnimacoes grupo="elementos" proporcao={proporcao} aoPedir={aoPedir} aoAbrir={setAnimacaoAberta} inicial={animacaoInicial} />
    </div>
  );
}

function EmBreve({ ferramenta }: { ferramenta: Ferramenta }) {
  const Icone = ferramenta.icone;
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-painel-3">
        <Icone className="size-6 text-destaque" aria-hidden />
      </span>
      <p className="text-sm text-suave">{ferramenta.emBreve?.descricao}</p>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-borda px-3 py-1 text-xs text-suave">
        <Clock className="size-3.5" aria-hidden />
        {ferramenta.emBreve?.fase}
      </span>
    </div>
  );
}

/** O conteúdo de uma ferramenta, sem o invólucro: os painéis do layout profissional (Projeto, Efeitos, Texto…) usam os mesmos. */
export function ConteudoDaFerramenta({
  ferramenta,
  biblioteca,
  midiaSelecionadaId,
  aoSelecionarMidia,
  aoAdicionarMidia,
  aoAbrirMidia,
  aoAdicionarTexto,
  aoPedirAnimacao,
  gravacao,
  aoExecutarQuandoProntas,
  legendas,
  selecionado,
  aoPrever,
  aoMostrar,
  aoConfirmar,
  modeloInicial,
  animacaoInicial,
  corte,
  salvo = true,
}: Omit<Props, "aoFechar" | "className" | "style">) {
  return (
    <>
    {ferramenta.id === "corte" ? (
      corte ? (
        <PainelDoCorte {...legendas} corte={corte} midias={biblioteca.midias ?? []} aoPrever={aoPrever} aoConfirmar={aoConfirmar ?? legendas.aoExecutar} salvo={salvo} />
      ) : (
        <p className="text-xs text-suave">Este projeto não veio de um corte do Clipar.</p>
      )
    ) : ferramenta.id === "midia" ? (
      <PainelMidia
        biblioteca={biblioteca}
        midiaSelecionadaId={midiaSelecionadaId}
        aoSelecionarMidia={aoSelecionarMidia}
        aoAdicionarMidia={aoAdicionarMidia}
        aoAbrirMidia={aoAbrirMidia}
        proporcao={legendas.projeto.proporcao}
        projeto={legendas.projeto}
        aoExecutar={legendas.aoExecutar}
        aoAvisar={legendas.aoAvisar}
        aoPedir={aoPedirAnimacao}
      />
    ) : ferramenta.id === "audio" ? (
      <PainelAudio
        aoPedir={aoPedirAnimacao}
        gravacao={gravacao}
        doEspaco={{
          midias: (biblioteca.midias ?? []).filter((midia) => midia.status === "pronta" && midia.audio && !midia.elemento && !midia.camada_pixels && !midia.imagem),
          aoPor: (midiaId, somenteSom) => legendas.aoExecutar({ comando: "clipe.adicionar", parametros: { midiaId, inicio: gravacao?.tempo ?? 0, somenteSom } }),
        }}
      />
    ) : ferramenta.id === "elementos" ? (
      <PainelElementos proporcao={legendas.projeto.proporcao} aoPedir={aoPedirAnimacao} aoAvisar={legendas.aoAvisar} animacaoInicial={animacaoInicial} />
    ) : ferramenta.id === "texto" ? (
      <PainelTexto aoAdicionar={aoAdicionarTexto} proporcao={legendas.projeto.proporcao} aoPedir={aoPedirAnimacao} animacaoInicial={animacaoInicial} />
    ) : ferramenta.id === "legendas" ? (
      <PainelLegendas {...legendas} aoExecutarQuandoProntas={aoExecutarQuandoProntas} midias={biblioteca.midias ?? []} />
    ) : ferramenta.id === "transcricao" ? (
      <PainelTranscricao
        projeto={legendas.projeto}
        tempo={legendas.tempo}
        aoExecutar={legendas.aoExecutar}
        aoBuscar={legendas.aoBuscar}
        aoAvisar={legendas.aoAvisar}
        aoPedirAnimacao={aoPedirAnimacao}
        midias={biblioteca.midias ?? []}
      />
    ) : ferramenta.id === "transicoes" ? (
      <PainelTransicoes selecionado={selecionado} aoPrever={aoPrever} aoExecutar={legendas.aoExecutar} aoMostrar={aoMostrar} />
    ) : ferramenta.id === "efeitos" ? (
      <PainelEfeitos selecionado={selecionado} aoPrever={aoPrever} aoExecutar={legendas.aoExecutar} aoMostrar={aoMostrar} />
    ) : ferramenta.id === "filtros" ? (
      <PainelFiltros selecionado={selecionado} aoExecutar={legendas.aoExecutar} aoMostrar={aoMostrar} tempo={legendas.tempo} />
    ) : ferramenta.id === "modelos" ? (
      <PainelModelos
        projeto={legendas.projeto}
        modeloInicial={modeloInicial}
        midias={biblioteca.midias ?? []}
        proporcao={legendas.projeto.proporcao}
        aoExecutar={legendas.aoExecutar}
        aoExecutarQuandoProntas={aoExecutarQuandoProntas}
        aoAvisar={legendas.aoAvisar}
      />
    ) : ferramenta.id === "marca" ? (
      <PainelMarca midias={biblioteca.midias ?? []} projeto={{ proporcao: legendas.projeto.proporcao, aoExecutar: legendas.aoExecutar }} aoAvisar={legendas.aoAvisar} />
    ) : (
      <EmBreve ferramenta={ferramenta} />
    )}
    </>
  );
}

export function PainelConteudo({ aoFechar, className = "", style, ...props }: Props) {
  const { ferramenta } = props;
  return (
    <aside
      aria-label={ferramenta.nome}
      style={style}
      className={`flex min-h-0 shrink-0 flex-col bg-painel max-md:rounded-t-2xl max-md:border-t max-md:border-borda max-md:shadow-2xl ${className}`}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-borda px-3">
        <h2 className="text-sm font-semibold">{ferramenta.nome}</h2>
        <button type="button" onClick={aoFechar} className="botao-icone md:hidden" aria-label="Fechar painel">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <ConteudoDaFerramenta {...props} />
      </div>
    </aside>
  );
}
