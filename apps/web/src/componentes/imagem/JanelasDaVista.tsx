"use client";

// Exibir › Nova guia, Novo layout de guias e Grade do editor de imagem (ADR 0003, onda 13.14).
import { useState } from "react";

import { LAYOUT_PADRAO, type LayoutDeGuias, pixelsDaUnidade, UNIDADES_DA_REGUA, type UnidadeDaRegua } from "@/lib/imagem/vista";

import { Moldura } from "./JanelasDePixels";

const CAMPO = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";

export function JanelaNovaGuia({ unidade, ppi, documento, aoFechar, aoConfirmar }: { unidade: UnidadeDaRegua; ppi: number; documento: { largura: number; altura: number }; aoFechar: () => void; aoConfirmar: (tipo: "v" | "h", pos: number) => void }) {
  const [tipo, setTipo] = useState<"v" | "h">("v");
  const [valor, setValor] = useState(0);
  const [emUnidade, setEmUnidade] = useState<UnidadeDaRegua>(unidade);
  const lado = tipo === "v" ? documento.largura : documento.altura;
  return (
    <Moldura titulo="Nova guia" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(tipo, valor * pixelsDaUnidade(emUnidade, ppi, lado))}>
      <fieldset className="flex gap-3">
        <legend className="mb-1">Orientação</legend>
        <label className="flex items-center gap-1">
          <input type="radio" name="orientacao-guia" checked={tipo === "h"} onChange={() => setTipo("h")} />
          Horizontal
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name="orientacao-guia" checked={tipo === "v"} onChange={() => setTipo("v")} />
          Vertical
        </label>
      </fieldset>
      <label className="flex items-center gap-2">
        Posição:
        <input type="number" className={`${CAMPO} w-24`} step="any" value={valor} autoFocus onChange={(e) => setValor(Number(e.currentTarget.value) || 0)} aria-label="Posição da guia" />
        <select className={CAMPO} value={emUnidade} onChange={(e) => setEmUnidade(e.currentTarget.value as UnidadeDaRegua)} aria-label="Unidade da posição">
          {UNIDADES_DA_REGUA.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>
      </label>
    </Moldura>
  );
}

export function JanelaLayoutDeGuias({ aoFechar, aoConfirmar }: { aoFechar: () => void; aoConfirmar: (layout: LayoutDeGuias, limpar: boolean) => void }) {
  const [layout, setLayout] = useState<LayoutDeGuias>(LAYOUT_PADRAO);
  const [limpar, setLimpar] = useState(true);
  const numero = (rotulo: string, valor: number | null, mudar: (v: number | null) => void, vazio = false) => (
    <label className="flex flex-col gap-0.5">
      {rotulo}
      <input type="number" className={`${CAMPO} w-20`} min={0} step="any" value={valor ?? ""} placeholder={vazio ? "auto" : undefined} onChange={(e) => mudar(e.currentTarget.value === "" && vazio ? null : Math.max(0, Number(e.currentTarget.value) || 0))} aria-label={rotulo} />
    </label>
  );
  return (
    <Moldura titulo="Novo layout de guias" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(layout, limpar)}>
      <p className="text-suave">Em pixels. Sem a largura (ou a altura), as colunas (ou as linhas) dividem o espaço.</p>
      <div className="grid grid-cols-3 gap-2">
        {numero("Colunas", layout.colunas, (v) => setLayout({ ...layout, colunas: Math.min(100, Math.round(v ?? 0)) }))}
        {numero("Largura", layout.largura, (v) => setLayout({ ...layout, largura: v }), true)}
        {numero("Medianiz", layout.medianiz, (v) => setLayout({ ...layout, medianiz: v ?? 0 }))}
        {numero("Linhas", layout.linhas, (v) => setLayout({ ...layout, linhas: Math.min(100, Math.round(v ?? 0)) }))}
        {numero("Altura", layout.altura, (v) => setLayout({ ...layout, altura: v }), true)}
        {numero("Medianiz das linhas", layout.medianizDasLinhas, (v) => setLayout({ ...layout, medianizDasLinhas: v ?? 0 }))}
      </div>
      <fieldset className="grid grid-cols-4 gap-2">
        <legend className="mb-1">Margens</legend>
        {(["topo", "esquerda", "base", "direita"] as const).map((lado) =>
          numero({ topo: "Em cima", esquerda: "À esquerda", base: "Embaixo", direita: "À direita" }[lado], layout.margens[lado], (v) => setLayout({ ...layout, margens: { ...layout.margens, [lado]: v ?? 0 } })),
        )}
      </fieldset>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={layout.centralizar} onChange={(e) => setLayout({ ...layout, centralizar: e.currentTarget.checked })} />
        Centralizar as colunas de largura fixa
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={limpar} onChange={(e) => setLimpar(e.currentTarget.checked)} />
        Tirar as guias que já existem
      </label>
    </Moldura>
  );
}

export function JanelaGrade({ espaco, subdivisoes, aoFechar, aoConfirmar }: { espaco: number; subdivisoes: number; aoFechar: () => void; aoConfirmar: (espaco: number, subdivisoes: number) => void }) {
  const [linha, setLinha] = useState(espaco);
  const [partes, setPartes] = useState(subdivisoes);
  return (
    <Moldura titulo="Grade" aoFechar={aoFechar} aoConfirmar={() => aoConfirmar(linha, partes)}>
      <label className="flex items-center gap-2">
        Uma linha a cada
        <input type="number" className={`${CAMPO} w-20`} min={1} max={4096} value={linha} onChange={(e) => setLinha(Math.max(1, Math.min(4096, Number(e.currentTarget.value) || 1)))} aria-label="Espaço da grade" />
        px
      </label>
      <label className="flex items-center gap-2">
        Subdivisões
        <input type="number" className={`${CAMPO} w-20`} min={1} max={32} value={partes} onChange={(e) => setPartes(Math.max(1, Math.min(32, Math.round(Number(e.currentTarget.value) || 1))))} aria-label="Subdivisões da grade" />
      </label>
    </Moldura>
  );
}
