"use client";

import { Download, FileUp, Plus } from "lucide-react";
import { useRef, useState } from "react";

import type { Comando } from "@/lib/projeto/comandos";
import { ESTILOS_DE_LEGENDA, escreverSrt, escreverVtt, legendasDasFaixas, lerLegendas } from "@/lib/projeto/legendas";
import type { Projeto } from "@/lib/projeto/modelo";
import { formatarTimecode, type Tick } from "@/lib/tempo";

import { LegendasDaFala } from "./LegendasDaFala";
import { PalavrasChaveDaIA } from "./PalavrasChaveDaIA";

export type PropsLegendas = {
  projeto: Projeto;
  nome: string;
  tempo: Tick;
  selecao: string[];
  aoExecutar: (comando: Comando) => void;
  aoBuscar: (tempo: Tick) => void;
  aoSelecionar: (ids: string[]) => void;
  aoAvisar: (mensagem: string) => void;
};

function baixar(nome: string, conteudo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: `${tipo};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "Lançamento · Reels!" → "lancamento-reels". */
function nomeDeArquivo(nome: string): string {
  const base = nome
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return base || "legendas";
}

/** Painel da ferramenta Legendas: automáticas pela fala (Whisper no worker de GPU), manuais e SRT/VTT. */
export function PainelLegendas({ projeto, nome, tempo, selecao, aoExecutar, aoBuscar, aoSelecionar, aoAvisar }: PropsLegendas) {
  const [estiloId, setEstiloId] = useState(ESTILOS_DE_LEGENDA[0].id);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const estilo = ESTILOS_DE_LEGENDA.find((item) => item.id === estiloId)!.texto;
  const faixas = projeto.faixas.filter((faixa) => faixa.tipo === "legenda");
  const clipes = faixas.flatMap((faixa) => faixa.clipes.map((clipe) => ({ clipe, faixa }))).sort((a, b) => a.clipe.inicio - b.clipe.inicio);
  const legendas = legendasDasFaixas(projeto.faixas);

  async function importar(arquivo: File) {
    const lidas = lerLegendas(await arquivo.text());
    if (!lidas.length) {
      aoAvisar("Não achei legendas nesse arquivo. Ele precisa ser .srt ou .vtt.");
      return;
    }
    aoExecutar({ comando: "legenda.importar", parametros: { legendas: lidas, estilo } });
    aoAvisar(`${lidas.length} legendas importadas.`);
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-suave">Estilo</span>
        <select
          value={estiloId}
          onChange={(evento) => setEstiloId(evento.currentTarget.value)}
          className="min-w-0 flex-1 rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-xs outline-none focus:border-destaque"
        >
          {ESTILOS_DE_LEGENDA.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      </label>
      {faixas.length ? (
        <button
          type="button"
          className="botao-secundario px-3 py-1.5 text-xs"
          onClick={() => faixas.forEach((faixa) => aoExecutar({ comando: "legenda.estilo", parametros: { faixaId: faixa.id, estilo } }))}
        >
          Usar este estilo em todas as legendas
        </button>
      ) : null}

      <LegendasDaFala projeto={projeto} estilo={estilo} aoExecutar={aoExecutar} aoAvisar={aoAvisar} />
      <PalavrasChaveDaIA projeto={projeto} aoExecutar={aoExecutar} aoAvisar={aoAvisar} />

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="botao-secundario px-3 py-2 text-xs" onClick={() => aoExecutar({ comando: "legenda.adicionar", parametros: { inicio: tempo, estilo } })}>
          <Plus className="size-4" aria-hidden />
          Adicionar
        </button>
        <button type="button" className="botao-secundario px-3 py-2 text-xs" onClick={() => arquivoRef.current?.click()}>
          <FileUp className="size-4" aria-hidden />
          Importar
        </button>
        <input
          ref={arquivoRef}
          type="file"
          accept=".srt,.vtt,text/vtt,application/x-subrip"
          className="hidden"
          aria-label="Arquivo de legendas"
          onChange={(evento) => {
            const arquivo = evento.currentTarget.files?.[0];
            evento.currentTarget.value = "";
            if (arquivo) void importar(arquivo);
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="botao-secundario px-3 py-1.5 text-xs" disabled={!legendas.length} onClick={() => baixar(`${nomeDeArquivo(nome)}.srt`, escreverSrt(legendas), "application/x-subrip")}>
          <Download className="size-4" aria-hidden />
          SRT
        </button>
        <button type="button" className="botao-secundario px-3 py-1.5 text-xs" disabled={!legendas.length} onClick={() => baixar(`${nomeDeArquivo(nome)}.vtt`, escreverVtt(legendas), "text/vtt")}>
          <Download className="size-4" aria-hidden />
          VTT
        </button>
      </div>

      {clipes.length ? (
        <ol className="flex flex-col gap-1.5" aria-label="Legendas do projeto">
          {clipes.map(({ clipe, faixa }) => (
            <li
              key={clipe.id}
              className={`rounded-lg border px-2 py-1.5 ${selecao.includes(clipe.id) ? "border-destaque bg-destaque/10" : "border-borda bg-painel-2/50"}`}
            >
              <button
                type="button"
                className="text-[11px] tabular-nums text-suave hover:text-texto"
                onClick={() => {
                  aoBuscar(clipe.inicio);
                  aoSelecionar([clipe.id]);
                }}
                title="Ir para esta legenda"
              >
                {formatarTimecode(clipe.inicio, projeto.taxa)} → {formatarTimecode(clipe.inicio + clipe.duracao, projeto.taxa)}
              </button>
              <textarea
                // Remonta quando o texto muda por fora (desfazer, aba Texto)
                key={clipe.texto?.conteudo}
                defaultValue={clipe.texto?.conteudo}
                disabled={faixa.travada}
                rows={Math.min(3, clipe.texto?.conteudo.split("\n").length ?? 1)}
                aria-label="Texto da legenda"
                onBlur={(evento) => {
                  const conteudo = evento.currentTarget.value;
                  if (conteudo !== clipe.texto?.conteudo) aoExecutar({ comando: "texto.mudar", parametros: { clipeIds: [clipe.id], texto: { conteudo } } });
                }}
                className="mt-1 w-full resize-none rounded border border-transparent bg-transparent px-1 text-sm outline-none focus:border-destaque disabled:opacity-50"
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-suave">
          Nenhuma legenda ainda. Adicione no cursor ou importe um arquivo .srt ou .vtt. As legendas automáticas, pela fala, chegam com a transcrição.
        </p>
      )}
    </div>
  );
}
