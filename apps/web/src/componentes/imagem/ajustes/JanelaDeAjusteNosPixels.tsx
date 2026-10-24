"use client";

// A janela de Imagem › Ajustes (ADR 0003, onda 13.10), que grava o ajuste nos pixels da camada: flutua sem cobrir a
// imagem (os conta-gotas clicam nela), mostra o resultado na camada enquanto muda (Visualizar) e o OK vira um passo
// do desfazer. Os dezesseis ajustes usam os controles do painel Propriedades; os clássicos têm os deles.
import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";

import { ControleNumerico } from "@/componentes/editor/ControleNumerico";
import { type AjusteDaImagem, NOMES_DOS_AJUSTES, type Rgb } from "@/lib/imagem/ajustes";
import type { Corresponder, Hdr, MetodoHdr, SombrasRealces, Substituir } from "@/lib/imagem/ajustesNosPixels";
import type { Degrade } from "@/lib/pintura/degrade";
import type { ImagemRgba } from "@/lib/selecao/varinha";

import { PropriedadesDoAjuste } from "./PropriedadesDoAjuste";
import { FILTRO_POR_ID, type Valores } from "@/lib/imagem/filtros/catalogo";
import { OpcoesDoFiltro } from "../filtros/OpcoesDoFiltro";

export type OperacaoDosPixels =
  | { tipo: "ajuste"; ajuste: AjusteDaImagem }
  | { tipo: "sombrasRealces"; opcoes: SombrasRealces }
  | { tipo: "hdr"; opcoes: Hdr }
  | { tipo: "corresponder"; opcoes: Corresponder; origem: string }
  | { tipo: "substituir"; opcoes: Substituir }
  | { tipo: "filtro"; filtro: string; opcoes: Valores };

export const NOME_DA_OPERACAO = (operacao: OperacaoDosPixels) =>
  operacao.tipo === "ajuste"
    ? NOMES_DOS_AJUSTES[operacao.ajuste.tipo]
    : operacao.tipo === "filtro"
      ? (FILTRO_POR_ID.get(operacao.filtro)?.nome ?? "Filtro")
      : { sombrasRealces: "Sombras/Realces", hdr: "Tonalização HDR", corresponder: "Corresponder cor", substituir: "Substituir cor" }[operacao.tipo];

/** Uma janela que flutua ao lado dos painéis, sem escurecer nem bloquear o resto (os conta-gotas clicam na imagem). */
export function JanelaFlutuante({ titulo, children, aoConfirmar, aoCancelar, rodape }: { titulo: string; children: ReactNode; aoConfirmar: () => void; aoCancelar: () => void; rodape?: ReactNode }) {
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      const alvo = evento.target as HTMLElement;
      if (evento.key === "Escape") {
        evento.preventDefault();
        aoCancelar();
      } else if (evento.key === "Enter" && !alvo.closest("input, select, textarea, button")) {
        evento.preventDefault();
        aoConfirmar();
      }
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [aoConfirmar, aoCancelar]);
  return (
    <div role="dialog" aria-label={titulo} className="fixed right-[336px] top-20 z-50 flex max-h-[calc(100vh-6rem)] w-80 flex-col rounded-lg border border-borda bg-painel shadow-2xl">
      <div className="flex items-center justify-between border-b border-borda px-3 py-2">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <button type="button" className="botao-icone" onClick={aoCancelar} aria-label="Fechar">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <div className="flex items-center justify-end gap-2 border-t border-borda px-3 py-2 text-xs">
        {rodape}
        <button type="button" className="botao-secundario ml-auto px-3 py-1 text-xs" onClick={aoCancelar}>
          Cancelar
        </button>
        <button type="button" className="botao-principal px-3 py-1 text-xs" onClick={aoConfirmar}>
          OK
        </button>
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, minimo, maximo, passo, sufixo = "", aoMudar }: { rotulo: string; valor: number; minimo: number; maximo: number; passo?: number; sufixo?: string; aoMudar: (valor: number) => void }) {
  return <ControleNumerico rotulo={rotulo} valor={valor} minimo={minimo} maximo={maximo} passo={passo} sufixo={sufixo} aoPrever={aoMudar} aoConfirmar={aoMudar} />;
}

const METODOS_HDR: { id: MetodoHdr; nome: string }[] = [
  { id: "adaptacao", nome: "Adaptação local" },
  { id: "exposicao_gama", nome: "Exposição e gama" },
  { id: "compressao", nome: "Compressão de realces" },
  { id: "equalizar", nome: "Equalizar o histograma" },
];

export function JanelaDeAjusteNosPixels({
  operacao,
  visualizar,
  imagem,
  origens,
  primeiroPlano,
  fundo,
  degradesDoEspaco,
  amostrando,
  aoPedirAmostra,
  aoMudar,
  aoVisualizar,
  aoConfirmar,
  aoCancelar,
  canais,
}: {
  operacao: OperacaoDosPixels;
  /** Os canais alfa do documento (o mapa de profundidade do desfoque de lente). */
  canais?: { id: string; nome: string }[];
  visualizar: boolean;
  /** Os pixels da camada, pequenos (o histograma e os automáticos). */
  imagem: ImagemRgba | null;
  /** As camadas (e o documento) de onde o Corresponder cor tira a cor. */
  origens: { id: string; nome: string }[];
  primeiroPlano: string;
  fundo: string;
  degradesDoEspaco: Degrade[];
  amostrando: boolean;
  aoPedirAmostra: (receber: ((cor: Rgb) => void) | null) => void;
  aoMudar: (operacao: OperacaoDosPixels) => void;
  aoVisualizar: (ver: boolean) => void;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  const rodape = (
    <label className="flex items-center gap-1.5">
      <input type="checkbox" checked={visualizar} onChange={(evento) => aoVisualizar(evento.currentTarget.checked)} />
      Visualizar
    </label>
  );
  let conteudo: ReactNode = null;
  if (operacao.tipo === "ajuste") {
    conteudo = (
      <PropriedadesDoAjuste
        clipeId=""
        ajuste={operacao.ajuste}
        imagem={imagem}
        primeiroPlano={primeiroPlano}
        fundo={fundo}
        degradesDoEspaco={degradesDoEspaco}
        aoPedirAmostra={aoPedirAmostra}
        amostrando={amostrando}
        aoPrever={() => undefined}
        aoExecutar={() => undefined}
        mudancasLocais={{ prever: (ajuste) => aoMudar({ tipo: "ajuste", ajuste }), confirmar: (ajuste) => aoMudar({ tipo: "ajuste", ajuste }) }}
        semTitulo
      />
    );
  } else if (operacao.tipo === "filtro") {
    const definicao = FILTRO_POR_ID.get(operacao.filtro);
    conteudo = definicao ? (
      <div className="p-3 text-xs">
        <OpcoesDoFiltro definicao={definicao} valores={operacao.opcoes} aoPrever={(opcoes) => aoMudar({ ...operacao, opcoes })} aoMudar={(opcoes) => aoMudar({ ...operacao, opcoes })} canais={canais} />
      </div>
    ) : null;
  } else if (operacao.tipo === "sombrasRealces") {
    const o = operacao.opcoes;
    const com = (mudanca: Partial<SombrasRealces>) => aoMudar({ ...operacao, opcoes: { ...o, ...mudanca } });
    conteudo = (
      <div className="flex flex-col gap-2 p-3 text-xs">
        <h3 className="font-semibold">Sombras</h3>
        <Numero rotulo="Quantidade" valor={o.sombras.quantidade} minimo={0} maximo={100} sufixo="%" aoMudar={(quantidade) => com({ sombras: { ...o.sombras, quantidade } })} />
        <Numero rotulo="Tom" valor={o.sombras.tom} minimo={0} maximo={100} sufixo="%" aoMudar={(tom) => com({ sombras: { ...o.sombras, tom } })} />
        <Numero rotulo="Raio" valor={o.sombras.raio} minimo={0} maximo={500} sufixo="px" aoMudar={(raio) => com({ sombras: { ...o.sombras, raio } })} />
        <h3 className="mt-1 font-semibold">Realces</h3>
        <Numero rotulo="Quantidade" valor={o.realces.quantidade} minimo={0} maximo={100} sufixo="%" aoMudar={(quantidade) => com({ realces: { ...o.realces, quantidade } })} />
        <Numero rotulo="Tom" valor={o.realces.tom} minimo={0} maximo={100} sufixo="%" aoMudar={(tom) => com({ realces: { ...o.realces, tom } })} />
        <Numero rotulo="Raio" valor={o.realces.raio} minimo={0} maximo={500} sufixo="px" aoMudar={(raio) => com({ realces: { ...o.realces, raio } })} />
        <h3 className="mt-1 font-semibold">Ajustes</h3>
        <Numero rotulo="Cor" valor={o.cor} minimo={-100} maximo={100} aoMudar={(cor) => com({ cor })} />
        <Numero rotulo="Meios-tons" valor={o.meios} minimo={-100} maximo={100} aoMudar={(meios) => com({ meios })} />
      </div>
    );
  } else if (operacao.tipo === "hdr") {
    const o = operacao.opcoes;
    const com = (mudanca: Partial<Hdr>) => aoMudar({ ...operacao, opcoes: { ...o, ...mudanca } });
    conteudo = (
      <div className="flex flex-col gap-2 p-3 text-xs">
        <label className="flex items-center gap-2 text-suave">
          Método:
          <select className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-texto" value={o.metodo} onChange={(evento) => com({ metodo: evento.currentTarget.value as MetodoHdr })} aria-label="Método">
            {METODOS_HDR.map((metodo) => (
              <option key={metodo.id} value={metodo.id}>
                {metodo.nome}
              </option>
            ))}
          </select>
        </label>
        {o.metodo === "adaptacao" ? (
          <>
            <Numero rotulo="Raio" valor={o.raio} minimo={1} maximo={500} sufixo="px" aoMudar={(raio) => com({ raio })} />
            <Numero rotulo="Força" valor={o.forca} minimo={0.1} maximo={4} passo={0.01} aoMudar={(forca) => com({ forca })} />
            <Numero rotulo="Detalhe" valor={o.detalhe} minimo={-100} maximo={300} sufixo="%" aoMudar={(detalhe) => com({ detalhe })} />
          </>
        ) : null}
        {o.metodo === "adaptacao" || o.metodo === "exposicao_gama" ? (
          <>
            <Numero rotulo="Gama" valor={o.gama} minimo={0.1} maximo={2} passo={0.01} aoMudar={(gama) => com({ gama })} />
            <Numero rotulo="Exposição" valor={o.exposicao} minimo={-5} maximo={5} passo={0.01} aoMudar={(exposicao) => com({ exposicao })} />
          </>
        ) : null}
        <Numero rotulo="Vibração" valor={o.vibracao} minimo={-100} maximo={100} sufixo="%" aoMudar={(vibracao) => com({ vibracao })} />
        <Numero rotulo="Saturação" valor={o.saturacao} minimo={-100} maximo={100} sufixo="%" aoMudar={(saturacao) => com({ saturacao })} />
      </div>
    );
  } else if (operacao.tipo === "corresponder") {
    const o = operacao.opcoes;
    const com = (mudanca: Partial<Corresponder>) => aoMudar({ ...operacao, opcoes: { ...o, ...mudanca } });
    conteudo = (
      <div className="flex flex-col gap-2 p-3 text-xs">
        <label className="flex items-center gap-2 text-suave">
          Origem:
          <select className="flex-1 rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-texto" value={operacao.origem} onChange={(evento) => aoMudar({ ...operacao, origem: evento.currentTarget.value })} aria-label="Origem">
            {origens.map((origem) => (
              <option key={origem.id} value={origem.id}>
                {origem.nome}
              </option>
            ))}
          </select>
        </label>
        <Numero rotulo="Luminância" valor={o.luminancia} minimo={1} maximo={200} aoMudar={(luminancia) => com({ luminancia })} />
        <Numero rotulo="Intensidade da cor" valor={o.intensidade} minimo={0} maximo={200} aoMudar={(intensidade) => com({ intensidade })} />
        <Numero rotulo="Atenuar" valor={o.atenuar} minimo={0} maximo={100} aoMudar={(atenuar) => com({ atenuar })} />
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={o.neutralizar} onChange={(evento) => com({ neutralizar: evento.currentTarget.checked })} />
          Neutralizar
        </label>
      </div>
    );
  } else {
    const o = operacao.opcoes;
    const com = (mudanca: Partial<Substituir>) => aoMudar({ ...operacao, opcoes: { ...o, ...mudanca } });
    conteudo = (
      <div className="flex flex-col gap-2 p-3 text-xs">
        <div className="flex items-center gap-2 text-suave">
          Cor:
          <input type="color" className="h-6 w-12 cursor-pointer rounded border border-borda" aria-label="Cor a substituir" value={o.cor} onChange={(evento) => com({ cor: evento.currentTarget.value })} />
          <button
            type="button"
            className={`botao-secundario px-2 py-1 text-xs ${amostrando ? "ring-1 ring-destaque" : ""}`}
            onClick={() =>
              aoPedirAmostra(amostrando ? null : (cor) => com({ cor: `#${cor.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}` }))
            }
          >
            {amostrando ? "Clique na imagem…" : "Pegar na imagem"}
          </button>
        </div>
        <Numero rotulo="Imprecisão" valor={o.imprecisao} minimo={0} maximo={200} aoMudar={(imprecisao) => com({ imprecisao })} />
        <h3 className="mt-1 font-semibold">Substituição</h3>
        <Numero rotulo="Matiz" valor={o.matiz} minimo={-180} maximo={180} sufixo="°" aoMudar={(matiz) => com({ matiz })} />
        <Numero rotulo="Saturação" valor={o.saturacao} minimo={-100} maximo={100} aoMudar={(saturacao) => com({ saturacao })} />
        <Numero rotulo="Luminosidade" valor={o.luminosidade} minimo={-100} maximo={100} aoMudar={(luminosidade) => com({ luminosidade })} />
      </div>
    );
  }
  return (
    <JanelaFlutuante titulo={NOME_DA_OPERACAO(operacao)} aoConfirmar={aoConfirmar} aoCancelar={aoCancelar} rodape={rodape}>
      {conteudo}
    </JanelaFlutuante>
  );
}
