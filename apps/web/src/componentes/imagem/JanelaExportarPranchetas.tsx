"use client";

// Arquivo › Exportar › Pranchetas em arquivos: o formato e a escala; cada prancheta vira um arquivo (várias, um ZIP).
import { useState } from "react";

import { FORMATOS_DA_IMAGEM, type FormatoDaImagem } from "@/lib/exportacao/imagem";
import { exportarPranchetas } from "@/lib/exportacao/pranchetas";
import type { Clipe, Projeto } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

import { Moldura } from "./JanelasDePixels";

export function JanelaExportarPranchetas({
  quantas,
  midias,
  aoPreparar,
  fonteDosPixels,
  fonteDaMascara,
  aoFechar,
  aoAvisar,
}: {
  quantas: number;
  midias: ReadonlyMap<string, Midia>;
  /** O projeto com a pintura que ainda não subiu (como a exportação da imagem). */
  aoPreparar: () => Promise<Projeto>;
  fonteDosPixels?: (clipe: Clipe) => HTMLCanvasElement | null;
  fonteDaMascara?: (clipe: Clipe) => HTMLCanvasElement | null;
  aoFechar: () => void;
  aoAvisar: (mensagem: string) => void;
}) {
  const [formato, setFormato] = useState<FormatoDaImagem>("png");
  const [escala, setEscala] = useState(1);
  const [gerando, setGerando] = useState(false);
  const campo = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";
  const exportar = async () => {
    setGerando(true);
    try {
      const projeto = await aoPreparar();
      const { nome, blob } = await exportarPranchetas(projeto, midias, { formato, escala, fonteDosPixels, fonteDaMascara });
      const endereco = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = endereco;
      link.download = nome;
      link.click();
      setTimeout(() => URL.revokeObjectURL(endereco), 10_000);
      aoFechar();
    } catch (e) {
      aoAvisar(e instanceof Error ? e.message : "Não foi possível exportar as pranchetas.");
    } finally {
      setGerando(false);
    }
  };
  return (
    <Moldura titulo="Exportar pranchetas" aoFechar={aoFechar} aoConfirmar={() => void exportar()}>
      <p className="text-suave">
        {quantas === 1 ? "A prancheta sai num arquivo." : `As ${quantas} pranchetas saem num ZIP, um arquivo por prancheta, com o nome dela.`}
      </p>
      <label className="flex items-center gap-2">
        Formato:
        <select className={`${campo} flex-1`} value={formato} onChange={(evento) => setFormato(evento.currentTarget.value as FormatoDaImagem)} aria-label="Formato das pranchetas">
          {FORMATOS_DA_IMAGEM.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        Tamanho:
        <select className={`${campo} flex-1`} value={escala} onChange={(evento) => setEscala(Number(evento.currentTarget.value))} aria-label="Tamanho das pranchetas">
          <option value={0.5}>Metade</option>
          <option value={1}>Inteiro</option>
          <option value={2}>O dobro</option>
        </select>
      </label>
      {gerando ? <p className="text-suave">Gerando…</p> : null}
    </Moldura>
  );
}
