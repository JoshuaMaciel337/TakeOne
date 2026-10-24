"use client";

// As janelas e as opções das fatias do editor de imagem (ADR 0003, onda 13.15): Dividir a fatia (em colunas e linhas
// iguais), as opções dela (o nome e o retângulo) e a barra de opções das ferramentas Fatia e Seleção de fatia.
import { useState } from "react";

import type { Fatia } from "@/lib/imagem/fatias";

import { Moldura } from "./JanelasDePixels";

const CAMPO = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";
const inteiro = (texto: string, minimo: number, maximo: number) => Math.min(maximo, Math.max(minimo, Math.round(Number(texto) || minimo)));

export function JanelaDividirFatia({ aoFechar, aoConfirmar }: { aoFechar: () => void; aoConfirmar: (colunas: number, linhas: number) => void }) {
  const [colunas, setColunas] = useState(2);
  const [linhas, setLinhas] = useState(1);
  return (
    <Moldura titulo="Dividir a fatia" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(colunas, linhas)}>
      <label className="flex items-center gap-2">
        Na vertical, em
        <input type="number" aria-label="Colunas da divisão" className={`${CAMPO} w-16`} min={1} max={50} value={colunas} autoFocus onChange={(e) => setColunas(inteiro(e.currentTarget.value, 1, 50))} />
        fatias iguais
      </label>
      <label className="flex items-center gap-2">
        Na horizontal, em
        <input type="number" aria-label="Linhas da divisão" className={`${CAMPO} w-16`} min={1} max={50} value={linhas} onChange={(e) => setLinhas(inteiro(e.currentTarget.value, 1, 50))} />
        fatias iguais
      </label>
    </Moldura>
  );
}

export function JanelaOpcoesDaFatia({ fatia, documento, aoFechar, aoConfirmar }: { fatia: Fatia; documento: { largura: number; altura: number }; aoFechar: () => void; aoConfirmar: (fatia: Fatia) => void }) {
  const [valor, setValor] = useState(fatia);
  const numero = (rotulo: string, chave: "x" | "y" | "largura" | "altura", maximo: number) => (
    <label className="flex items-center gap-1">
      {rotulo}:
      <input type="number" aria-label={`${rotulo} da fatia`} className={`${CAMPO} w-20`} value={valor[chave]} onChange={(e) => setValor({ ...valor, [chave]: inteiro(e.currentTarget.value, chave === "largura" || chave === "altura" ? 1 : 0, maximo) })} />
    </label>
  );
  return (
    <Moldura titulo="Opções da fatia" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar({ ...valor, nome: valor.nome.trim() })}>
      <label className="flex items-center gap-2">
        Nome:
        <input aria-label="Nome da fatia" className={`${CAMPO} flex-1`} value={valor.nome} maxLength={80} autoFocus placeholder="O do documento e o número" onChange={(e) => setValor({ ...valor, nome: e.currentTarget.value })} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {numero("X", "x", documento.largura - 1)}
        {numero("Y", "y", documento.altura - 1)}
        {numero("L", "largura", documento.largura)}
        {numero("A", "altura", documento.altura)}
      </div>
    </Moldura>
  );
}

type PropsDaBarra = {
  total: number;
  temGuias: boolean;
  escolhida: Fatia | null;
  aoDasGuias: () => void;
  aoDividir: () => void;
  aoOpcoes: () => void;
  aoExcluir: () => void;
  aoLimpar: () => void;
};

export function OpcoesDasFatiasNaBarra({ total, temGuias, escolhida, aoDasGuias, aoDividir, aoOpcoes, aoExcluir, aoLimpar }: PropsDaBarra) {
  const botao = "botao-secundario px-2 py-0.5 text-xs";
  return (
    <>
      <span className="tabular-nums text-suave">{total === 1 ? "1 fatia" : `${total} fatias`}</span>
      <button type="button" className={botao} disabled={!temGuias} onClick={aoDasGuias} title={temGuias ? "Uma fatia para cada espaço entre as guias" : "Ponha guias para fatiar por elas"}>
        Fatias a partir das guias
      </button>
      <button type="button" className={botao} disabled={!escolhida} onClick={aoDividir}>
        Dividir…
      </button>
      <button type="button" className={botao} disabled={!escolhida} onClick={aoOpcoes}>
        Opções da fatia…
      </button>
      <button type="button" className={botao} disabled={!escolhida} onClick={aoExcluir}>
        Excluir
      </button>
      <button type="button" className={botao} disabled={!total} onClick={aoLimpar}>
        Limpar as fatias
      </button>
    </>
  );
}
