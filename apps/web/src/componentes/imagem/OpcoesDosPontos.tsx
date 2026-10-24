"use client";

// As opções da barra para o Degradê, o Balde de tinta e a Borracha mágica (ADR 0003, onda 13.5).
import { Fragment } from "react";

import { type Degrade, DEGRADES_PRONTOS, type FormaDoDegrade, FORMAS_DO_DEGRADE } from "@/lib/pintura/degrade";
import { type IdDoPadrao, PADROES } from "@/lib/pintura/padroes";
import type { ModoDaPintura } from "@/lib/pintura/traco";
import { MESCLAGENS_DA_IMAGEM } from "@/lib/projeto/modelo";

import { AmostraDoDegrade } from "./Degrades";

export type OpcoesDoBalde = { preencher: "primeiroPlano" | "padrao"; padrao: IdDoPadrao; modo: ModoDaPintura; opacidade: number; tolerancia: number; suavizar: boolean; contigua: boolean; todasAsCamadas: boolean };
export type OpcoesDaBorrachaMagica = { tolerancia: number; suavizar: boolean; contigua: boolean; todasAsCamadas: boolean; opacidade: number };
export type OpcoesDoDegrade = { degrade: Degrade; forma: FormaDoDegrade; modo: ModoDaPintura; opacidade: number; inverter: boolean; pontilhar: boolean; transparencia: boolean };

export const BALDE_PADRAO: OpcoesDoBalde = { preencher: "primeiroPlano", padrao: "xadrez", modo: "normal", opacidade: 1, tolerancia: 32, suavizar: true, contigua: true, todasAsCamadas: false };
export const BORRACHA_MAGICA_PADRAO: OpcoesDaBorrachaMagica = { tolerancia: 32, suavizar: true, contigua: true, todasAsCamadas: false, opacidade: 1 };
export const DEGRADE_PADRAO: OpcoesDoDegrade = { degrade: DEGRADES_PRONTOS[0].degrades[0], forma: "linear", modo: "normal", opacidade: 1, inverter: false, pontilhar: true, transparencia: true };

const campo = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";
const SEPARADOR = <span className="mx-1 h-5 w-px shrink-0 bg-borda" aria-hidden />;

function Modo({ valor, aoMudar }: { valor: ModoDaPintura; aoMudar: (modo: ModoDaPintura) => void }) {
  return (
    <label className="flex items-center gap-1 text-suave">
      Modo:
      <select className={campo} value={valor} onChange={(evento) => aoMudar(evento.currentTarget.value as ModoDaPintura)} aria-label="Modo">
        {MESCLAGENS_DA_IMAGEM.map((grupo, indice) => (
          <Fragment key={grupo[0].id}>
            {indice > 0 ? <option disabled>──────────</option> : null}
            {grupo.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </Fragment>
        ))}
      </select>
    </label>
  );
}

function Porcentagem({ rotulo, valor, aoMudar }: { rotulo: string; valor: number; aoMudar: (valor: number) => void }) {
  return (
    <label className="flex items-center gap-1 text-suave">
      {rotulo}:
      <input type="number" min={1} max={100} value={Math.round(valor * 100)} onChange={(evento) => aoMudar(Math.min(1, Math.max(0.01, Number(evento.currentTarget.value) / 100)))} className={`${campo} w-12 text-right`} aria-label={rotulo} />%
    </label>
  );
}

function Amostragem({ tolerancia, suavizar, contigua, todasAsCamadas, aoMudar }: { tolerancia: number; suavizar: boolean; contigua: boolean; todasAsCamadas: boolean; aoMudar: (mudanca: { tolerancia?: number; suavizar?: boolean; contigua?: boolean; todasAsCamadas?: boolean }) => void }) {
  return (
    <>
      <label className="flex items-center gap-1 text-suave">
        Tolerância:
        <input type="number" min={0} max={255} value={tolerancia} onChange={(evento) => aoMudar({ tolerancia: Math.min(255, Math.max(0, Math.round(Number(evento.currentTarget.value)))) })} className={`${campo} w-12 text-right`} aria-label="Tolerância" />
      </label>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={suavizar} onChange={(evento) => aoMudar({ suavizar: evento.currentTarget.checked })} />
        Suavização de serrilhado
      </label>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={contigua} onChange={(evento) => aoMudar({ contigua: evento.currentTarget.checked })} />
        Contígua
      </label>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={todasAsCamadas} onChange={(evento) => aoMudar({ todasAsCamadas: evento.currentTarget.checked })} />
        Todas as camadas
      </label>
    </>
  );
}

export function OpcoesDoBaldeNaBarra({ opcoes, aoMudar }: { opcoes: OpcoesDoBalde; aoMudar: (mudanca: Partial<OpcoesDoBalde>) => void }) {
  return (
    <>
      <label className="flex items-center gap-1 text-suave">
        Preencher com:
        <select className={campo} value={opcoes.preencher} onChange={(evento) => aoMudar({ preencher: evento.currentTarget.value as OpcoesDoBalde["preencher"] })} aria-label="Preencher com">
          <option value="primeiroPlano">Primeiro plano</option>
          <option value="padrao">Padrão</option>
        </select>
      </label>
      {opcoes.preencher === "padrao" ? (
        <select className={campo} value={opcoes.padrao} onChange={(evento) => aoMudar({ padrao: evento.currentTarget.value as IdDoPadrao })} aria-label="Padrão">
          {PADROES.map((padrao) => (
            <option key={padrao.id} value={padrao.id}>
              {padrao.nome}
            </option>
          ))}
        </select>
      ) : null}
      {SEPARADOR}
      <Modo valor={opcoes.modo} aoMudar={(modo) => aoMudar({ modo })} />
      <Porcentagem rotulo="Opacidade" valor={opcoes.opacidade} aoMudar={(opacidade) => aoMudar({ opacidade })} />
      {SEPARADOR}
      <Amostragem {...opcoes} aoMudar={aoMudar} />
    </>
  );
}

export function OpcoesDaBorrachaMagicaNaBarra({ opcoes, aoMudar }: { opcoes: OpcoesDaBorrachaMagica; aoMudar: (mudanca: Partial<OpcoesDaBorrachaMagica>) => void }) {
  return (
    <>
      <Amostragem {...opcoes} aoMudar={aoMudar} />
      {SEPARADOR}
      <Porcentagem rotulo="Opacidade" valor={opcoes.opacidade} aoMudar={(opacidade) => aoMudar({ opacidade })} />
    </>
  );
}

export function OpcoesDoDegradeNaBarra({
  opcoes,
  doEspaco,
  primeiroPlano,
  fundo,
  aoMudar,
  aoEditar,
}: {
  opcoes: OpcoesDoDegrade;
  doEspaco: Degrade[];
  primeiroPlano: string;
  fundo: string;
  aoMudar: (mudanca: Partial<OpcoesDoDegrade>) => void;
  aoEditar: () => void;
}) {
  const todos = [...DEGRADES_PRONTOS.flatMap((pasta) => pasta.degrades), ...doEspaco];
  return (
    <>
      <button type="button" className="w-28 rounded hover:ring-2 hover:ring-destaque" onClick={aoEditar} title="Clique para editar o degradê" aria-label="Editar o degradê">
        <AmostraDoDegrade degrade={opcoes.degrade} primeiroPlano={primeiroPlano} fundo={fundo} className="h-5 w-full" />
      </button>
      <select
        className={`${campo} w-36`}
        value={Math.max(0, todos.findIndex((item) => item.nome === opcoes.degrade.nome))}
        onChange={(evento) => aoMudar({ degrade: todos[Number(evento.currentTarget.value)] })}
        aria-label="Predefinição de degradê"
      >
        {todos.map((item, i) => (
          <option key={`${item.nome}-${i}`} value={i}>
            {item.nome}
          </option>
        ))}
      </select>
      {SEPARADOR}
      <span className="flex items-center gap-0.5" role="group" aria-label="Forma do degradê">
        {FORMAS_DO_DEGRADE.map((forma) => (
          <button key={forma.id} type="button" className={`rounded px-1.5 py-0.5 text-xs ${opcoes.forma === forma.id ? "bg-painel-3 text-texto" : "text-suave hover:text-texto"}`} aria-pressed={opcoes.forma === forma.id} onClick={() => aoMudar({ forma: forma.id })}>
            {forma.nome}
          </button>
        ))}
      </span>
      {SEPARADOR}
      <Modo valor={opcoes.modo} aoMudar={(modo) => aoMudar({ modo })} />
      <Porcentagem rotulo="Opacidade" valor={opcoes.opacidade} aoMudar={(opacidade) => aoMudar({ opacidade })} />
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={opcoes.inverter} onChange={(evento) => aoMudar({ inverter: evento.currentTarget.checked })} />
        Inverter
      </label>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={opcoes.pontilhar} onChange={(evento) => aoMudar({ pontilhar: evento.currentTarget.checked })} />
        Pontilhar
      </label>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={opcoes.transparencia} onChange={(evento) => aoMudar({ transparencia: evento.currentTarget.checked })} />
        Transparência
      </label>
    </>
  );
}
