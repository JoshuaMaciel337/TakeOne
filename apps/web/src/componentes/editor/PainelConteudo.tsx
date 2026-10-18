"use client";

import { Clock, X } from "lucide-react";

import { AvisoErro } from "@/componentes/AvisoErro";
import { CartaoMidia } from "@/componentes/midia/CartaoMidia";
import { GerarVideo } from "@/componentes/midia/GerarVideo";
import { ListaEnvios } from "@/componentes/midia/ListaEnvios";
import { MontarClipes } from "@/componentes/midia/MontarClipes";
import { ZonaDeEnvio } from "@/componentes/midia/ZonaDeEnvio";
import type { Comando } from "@/lib/projeto/comandos";
import type { Clipe, Faixa } from "@/lib/projeto/modelo";
import type { Texto } from "@/lib/projeto/texto";
import type { Tick } from "@/lib/tempo";
import type { Midia } from "@/lib/tipos";

import { type Ferramenta } from "./ferramentas";
import { PainelAudio } from "./PainelAudio";
import { PainelAnimacoes } from "./PainelAnimacoes";
import { PainelEfeitos } from "./PainelEfeitos";
import { PainelFiltros } from "./PainelFiltros";
import { PainelFormas } from "./PainelFormas";
import { PainelTransicoes } from "./PainelTransicoes";
import { PainelLegendas, type PropsLegendas } from "./PainelLegendas";
import { PainelMarca } from "./PainelMarca";
import { PainelTranscricao } from "./PainelTranscricao";
import { PainelTexto } from "./PainelTexto";

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
  aoAdicionarTexto: (texto: Texto) => void;
  /** Uma animação foi pedida: entra no cursor (ou no instante dado) quando ficar pronta. */
  aoPedirAnimacao: (midia: Midia, inicio?: Tick) => void;
  legendas: PropsLegendas;
  /** O clipe escolhido, para a ferramenta Filtros. */
  selecionado: { clipe: Clipe; faixa: Faixa } | null;
  aoPrever: (comando: Comando | null) => void;
  /** No celular o painel é uma folha por cima da tela, com botão de fechar. */
  aoFechar: () => void;
  className?: string;
  style?: React.CSSProperties;
};

function PainelMidia({
  biblioteca: { midias, erro, excluir, recarregar },
  midiaSelecionadaId,
  aoSelecionarMidia,
  aoAdicionarMidia,
  proporcao,
  aoExecutar,
  aoAvisar,
}: Pick<Props, "biblioteca" | "midiaSelecionadaId" | "aoSelecionarMidia" | "aoAdicionarMidia"> & {
  proporcao: string;
  aoExecutar: (comando: Comando) => void;
  aoAvisar: (mensagem: string) => void;
}) {
  // As formas desenhadas (Elementos) não entram na biblioteca: elas são editadas no próprio clipe
  const biblioteca = (midias ?? []).filter((midia) => !midia.elemento);
  return (
    <div className="flex flex-col gap-3">
      <ZonaDeEnvio compacta />
      <ListaEnvios />
      <GerarVideo
        proporcao={proporcao}
        imagens={biblioteca.filter((midia) => midia.imagem && midia.status === "pronta")}
        aoPedir={() => void recarregar()}
      />
      <MontarClipes midias={biblioteca} aoExecutar={aoExecutar} aoAvisar={aoAvisar} />
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {biblioteca.length > 0 ? (
        <>
          <p className="text-xs font-medium text-suave">Biblioteca do espaço · arraste para a linha do tempo</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
            {biblioteca.map((midia) => (
              <CartaoMidia
                key={midia.id}
                midia={midia}
                selecionada={midia.id === midiaSelecionadaId}
                aoSelecionar={(alvo) => aoSelecionarMidia(alvo.id === midiaSelecionadaId ? null : alvo.id)}
                aoAdicionar={(alvo) => aoAdicionarMidia(alvo.id)}
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

export function PainelConteudo({
  ferramenta,
  biblioteca,
  midiaSelecionadaId,
  aoSelecionarMidia,
  aoAdicionarMidia,
  aoAdicionarTexto,
  aoPedirAnimacao,
  legendas,
  selecionado,
  aoPrever,
  aoFechar,
  className = "",
  style,
}: Props) {
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
        {ferramenta.id === "midia" ? (
          <PainelMidia
            biblioteca={biblioteca}
            midiaSelecionadaId={midiaSelecionadaId}
            aoSelecionarMidia={aoSelecionarMidia}
            aoAdicionarMidia={aoAdicionarMidia}
            proporcao={legendas.projeto.proporcao}
            aoExecutar={legendas.aoExecutar}
            aoAvisar={legendas.aoAvisar}
          />
        ) : ferramenta.id === "audio" ? (
          <PainelAudio aoPedir={aoPedirAnimacao} />
        ) : ferramenta.id === "elementos" ? (
          <div className="flex flex-col gap-3">
            <PainelFormas aoPedir={aoPedirAnimacao} aoAvisar={legendas.aoAvisar} />
            <PainelAnimacoes proporcao={legendas.projeto.proporcao} aoPedir={aoPedirAnimacao} />
          </div>
        ) : ferramenta.id === "texto" ? (
          <PainelTexto aoAdicionar={aoAdicionarTexto} />
        ) : ferramenta.id === "legendas" ? (
          <PainelLegendas {...legendas} />
        ) : ferramenta.id === "transcricao" ? (
          <PainelTranscricao
            projeto={legendas.projeto}
            tempo={legendas.tempo}
            aoExecutar={legendas.aoExecutar}
            aoBuscar={legendas.aoBuscar}
            aoAvisar={legendas.aoAvisar}
            aoPedirAnimacao={aoPedirAnimacao}
          />
        ) : ferramenta.id === "transicoes" ? (
          <PainelTransicoes selecionado={selecionado} aoPrever={aoPrever} aoExecutar={legendas.aoExecutar} />
        ) : ferramenta.id === "efeitos" ? (
          <PainelEfeitos selecionado={selecionado} aoPrever={aoPrever} aoExecutar={legendas.aoExecutar} />
        ) : ferramenta.id === "filtros" ? (
          <PainelFiltros selecionado={selecionado} aoExecutar={legendas.aoExecutar} />
        ) : ferramenta.id === "marca" ? (
          <PainelMarca midias={biblioteca.midias ?? []} proporcao={legendas.projeto.proporcao} aoExecutar={legendas.aoExecutar} aoAvisar={legendas.aoAvisar} />
        ) : (
          <EmBreve ferramenta={ferramenta} />
        )}
      </div>
    </aside>
  );
}
