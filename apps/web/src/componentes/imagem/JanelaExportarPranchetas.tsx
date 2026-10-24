"use client";

// Arquivo › Exportar › Camadas em arquivos e Pranchetas em arquivos: o formato, o tamanho e a qualidade; cada camada
// ou prancheta vira um arquivo (vários, um ZIP; as pranchetas também num PDF, uma página cada).
import { useState } from "react";

import { baixarBlob, type FontesDaExportacao, formatoDe, FORMATOS_DE_EXPORTACAO, type FormatoDeExportacao, OPCOES_PADRAO_DE_EXPORTACAO } from "@/lib/exportacao/exportarComo";
import { exportarCamadas, exportarPranchetasComo } from "@/lib/exportacao/varios";
import type { Projeto } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

import { Moldura } from "./JanelasDePixels";

type Props = FontesDaExportacao & {
  midias: ReadonlyMap<string, Midia>;
  /** O projeto com a pintura que ainda não subiu (como a exportação da imagem). */
  aoPreparar: () => Promise<Projeto>;
  aoFechar: () => void;
  aoAvisar: (mensagem: string) => void;
};

const CAMPO = "rounded border border-borda bg-painel-2 px-1.5 py-0.5 text-xs text-texto";

/** O formato, o tamanho e a qualidade (os campos comuns às duas janelas). */
function CamposDoFormato({ formato, escala, qualidade, aoMudar, comPdf }: { formato: FormatoDeExportacao; escala: number; qualidade: number; aoMudar: (mudanca: { formato?: FormatoDeExportacao; escala?: number; qualidade?: number }) => void; comPdf: boolean }) {
  return (
    <>
      <label className="flex items-center gap-2">
        Formato:
        <select className={`${CAMPO} flex-1`} value={formato} onChange={(evento) => aoMudar({ formato: evento.currentTarget.value as FormatoDeExportacao })} aria-label="Formato">
          {FORMATOS_DE_EXPORTACAO.filter((item) => item.id !== "ico" && (comPdf || item.id !== "pdf")).map((item) => (
            <option key={item.id} value={item.id}>
              {item.id === "pdf" ? "PDF (todas num arquivo, uma página cada)" : item.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        Tamanho:
        <select className={`${CAMPO} flex-1`} value={escala} onChange={(evento) => aoMudar({ escala: Number(evento.currentTarget.value) })} aria-label="Tamanho">
          <option value={0.25}>25%</option>
          <option value={0.5}>Metade</option>
          <option value={1}>Inteiro</option>
          <option value={2}>O dobro</option>
        </select>
      </label>
      {formatoDe(formato).qualidade ? (
        <label className="flex items-center gap-2">
          Qualidade:
          <input type="range" className="flex-1" min={0.1} max={1} step={0.01} value={qualidade} onChange={(evento) => aoMudar({ qualidade: Number(evento.currentTarget.value) })} aria-label="Qualidade" />
          <span className="w-9 text-right tabular-nums">{Math.round(qualidade * 100)}%</span>
        </label>
      ) : null}
    </>
  );
}

export function JanelaExportarPranchetas({ quantas, midias, aoPreparar, aoFechar, aoAvisar, ...fontes }: Props & { quantas: number }) {
  const [opcoes, setOpcoes] = useState({ ...OPCOES_PADRAO_DE_EXPORTACAO });
  const [gerando, setGerando] = useState("");
  const exportar = async () => {
    setGerando("Gerando…");
    try {
      const { nome, blob } = await exportarPranchetasComo(await aoPreparar(), midias, opcoes, fontes, setGerando);
      baixarBlob(blob, nome);
      aoFechar();
    } catch (e) {
      aoAvisar(e instanceof Error ? e.message : "Não foi possível exportar as pranchetas.");
    } finally {
      setGerando("");
    }
  };
  return (
    <Moldura titulo="Exportar pranchetas" aoFechar={aoFechar} aoConfirmar={() => void exportar()}>
      <p className="text-suave">
        {opcoes.formato === "pdf" ? "As pranchetas saem num PDF, uma página cada, no tamanho delas." : quantas === 1 ? "A prancheta sai num arquivo." : `As ${quantas} pranchetas saem num ZIP, um arquivo por prancheta, com o nome dela.`}
      </p>
      <CamposDoFormato formato={opcoes.formato} escala={opcoes.escala} qualidade={opcoes.qualidade} comPdf aoMudar={(mudanca) => setOpcoes({ ...opcoes, ...mudanca })} />
      {gerando ? <p className="text-suave">{gerando}</p> : null}
    </Moldura>
  );
}

export function JanelaCamadasEmArquivos({ midias, aoPreparar, aoFechar, aoAvisar, ...fontes }: Props) {
  const [opcoes, setOpcoes] = useState({ ...OPCOES_PADRAO_DE_EXPORTACAO });
  const [soVisiveis, setSoVisiveis] = useState(true);
  const [cortar, setCortar] = useState(false);
  const [prefixo, setPrefixo] = useState("");
  const [gerando, setGerando] = useState("");
  const exportar = async () => {
    setGerando("Gerando…");
    try {
      const { nome, blob } = await exportarCamadas(await aoPreparar(), midias, { exportacao: opcoes, soVisiveis, cortar, prefixo }, fontes, setGerando);
      baixarBlob(blob, nome);
      aoFechar();
    } catch (e) {
      aoAvisar(e instanceof Error ? e.message : "Não foi possível exportar as camadas.");
    } finally {
      setGerando("");
    }
  };
  return (
    <Moldura titulo="Camadas em arquivos" aoFechar={aoFechar} aoConfirmar={() => void exportar()}>
      <p className="text-suave">Cada camada sai sozinha, com o estilo e as máscaras dela, num ZIP com o número e o nome dela.</p>
      <label className="flex items-center gap-2">
        Prefixo:
        <input className={`${CAMPO} flex-1`} value={prefixo} maxLength={40} onChange={(evento) => setPrefixo(evento.currentTarget.value)} aria-label="Prefixo dos arquivos" />
      </label>
      <CamposDoFormato formato={opcoes.formato} escala={opcoes.escala} qualidade={opcoes.qualidade} comPdf={false} aoMudar={(mudanca) => setOpcoes({ ...opcoes, ...mudanca })} />
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={soVisiveis} onChange={(evento) => setSoVisiveis(evento.currentTarget.checked)} />
        Só as camadas visíveis
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={cortar} onChange={(evento) => setCortar(evento.currentTarget.checked)} />
        Cortar no conteúdo (sem a parte transparente em volta)
      </label>
      {gerando ? <p className="text-suave">{gerando}</p> : null}
    </Moldura>
  );
}
