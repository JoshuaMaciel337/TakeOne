"use client";

import { LoaderCircle, ScrollText, Scissors } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Comando } from "@/lib/projeto/comandos";
import type { Palavra } from "@/lib/projeto/fala";
import { OPCOES_DE_LIMPEZA, type OpcoesDeLimpeza, segundosDosTrechos, trechosParaLimpar } from "@/lib/projeto/limpezaDeFala";
import type { Projeto } from "@/lib/projeto/modelo";
import { formatarTimecode, type Tick } from "@/lib/tempo";
import type { IdiomaTranscricao } from "@/lib/tipos";
import { transcreverMidias } from "@/lib/transcricao";

import { ControleNumerico } from "./ControleNumerico";
import { IDIOMAS } from "./LegendasDaFala";

export type PropsTranscricao = {
  projeto: Projeto;
  aoExecutar: (comando: Comando) => void;
  aoBuscar: (tempo: Tick) => void;
  aoAvisar: (mensagem: string) => void;
};

/** Quantos trechos a lista mostra; o botão remove todos. */
const LISTA_MAXIMA = 60;

function segundos(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`;
}

/** Ferramenta Transcrição: a fala da faixa principal, para limpar pausas e vícios. */
export function PainelTranscricao({ projeto, aoExecutar, aoBuscar, aoAvisar }: PropsTranscricao) {
  const principal = projeto.faixas.find((faixa) => faixa.tipo === "principal");
  const clipes = useMemo(() => principal?.clipes ?? [], [principal]);
  const [palavras, setPalavras] = useState<Map<string, Palavra[]> | null>(null);
  const [idioma, setIdioma] = useState<IdiomaTranscricao>("auto");
  const [andamento, setAndamento] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<OpcoesDeLimpeza>(OPCOES_DE_LIMPEZA);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);

  const trechos = useMemo(() => (palavras ? trechosParaLimpar(clipes, palavras, opcoes) : []), [clipes, palavras, opcoes]);
  const pausas = trechos.filter((t) => t.tipo === "pausa");
  const vicios = trechos.filter((t) => t.tipo === "vicio");
  const total = segundosDosTrechos(trechos);

  async function analisar() {
    const midias = [...new Set(clipes.flatMap((clipe) => (clipe.midia_id ? [clipe.midia_id] : [])))];
    if (!midias.length) {
      aoAvisar("Coloque um vídeo com fala na faixa principal.");
      return;
    }
    try {
      const resultado = await transcreverMidias(midias, idioma, setAndamento, () => ativo.current);
      if (resultado) setPalavras(resultado);
    } catch (erro) {
      if (ativo.current) aoAvisar(erro instanceof Error ? erro.message : "Não foi possível transcrever agora.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  function remover() {
    aoExecutar({ comando: "linha.removerIntervalos", parametros: { intervalos: trechos.map(({ inicio, fim }) => ({ inicio, fim })) } });
    aoAvisar(`${segundos(total)} removidos. Ctrl+Z desfaz.`);
  }

  if (!palavras) {
    return (
      <div className="flex flex-col gap-3 text-xs">
        <p className="text-suave">
          A fala da faixa principal é transcrita no worker de GPU. Depois dá para tirar as pausas longas e as hesitações (“ahn”, “hum”) de uma vez.
        </p>
        <label className="flex items-center justify-between gap-2">
          <span className="text-suave">Idioma</span>
          <select
            value={idioma}
            disabled={andamento !== null}
            onChange={(evento) => setIdioma(evento.currentTarget.value as IdiomaTranscricao)}
            className="min-w-0 flex-1 rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-xs outline-none focus:border-destaque"
          >
            {IDIOMAS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="botao-principal px-3 py-2 text-xs" disabled={andamento !== null} onClick={() => void analisar()}>
          {andamento ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ScrollText className="size-4" aria-hidden />}
          {andamento ?? "Analisar a fala"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-xs">
      <section className="flex flex-col gap-2 rounded-lg border border-borda p-2" aria-label="Limpeza de fala">
        <h3 className="font-semibold uppercase tracking-wide text-suave">Limpeza de fala</h3>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={opcoes.pausas} onChange={(evento) => setOpcoes({ ...opcoes, pausas: evento.currentTarget.checked })} />
          <span className="flex-1">Pausas longas</span>
          <span className="tabular-nums text-suave">
            {pausas.length} · {segundos(segundosDosTrechos(pausas))}
          </span>
        </label>
        {opcoes.pausas ? (
          <ControleNumerico
            rotulo="Mais longas que"
            valor={opcoes.pausaMinima}
            minimo={0.3}
            maximo={2}
            passo={0.1}
            sufixo="s"
            aoPrever={(valor) => setOpcoes({ ...opcoes, pausaMinima: valor })}
            aoConfirmar={(valor) => setOpcoes({ ...opcoes, pausaMinima: valor })}
          />
        ) : null}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={opcoes.vicios} onChange={(evento) => setOpcoes({ ...opcoes, vicios: evento.currentTarget.checked })} />
          <span className="flex-1">Hesitações (“ahn”, “hum”)</span>
          <span className="tabular-nums text-suave">{vicios.length}</span>
        </label>
        <button type="button" className="botao-principal px-3 py-2" disabled={!trechos.length} onClick={remover}>
          <Scissors className="size-4" aria-hidden />
          {trechos.length ? `Remover ${trechos.length} trechos (${segundos(total)})` : "Nada para remover"}
        </button>
        <button type="button" className="text-left text-[11px] text-suave underline-offset-2 hover:underline" disabled={andamento !== null} onClick={() => void analisar()}>
          {andamento ?? "Analisar de novo"}
        </button>
      </section>

      {trechos.length ? (
        <ol className="flex flex-col gap-1" aria-label="Trechos para remover">
          {trechos.slice(0, LISTA_MAXIMA).map((trecho) => (
            <li key={`${trecho.tipo}-${trecho.inicio}`}>
              <button
                type="button"
                onClick={() => aoBuscar(trecho.inicio)}
                className="flex w-full items-center justify-between gap-2 rounded-md bg-painel-2 px-2 py-1.5 text-left hover:bg-painel-3"
              >
                <span className="tabular-nums text-suave">{formatarTimecode(trecho.inicio, projeto.taxa)}</span>
                <span className="flex-1 truncate">{trecho.tipo === "pausa" ? "Pausa" : `“${trecho.texto}”`}</span>
                <span className="tabular-nums text-suave">{segundos(segundosDosTrechos([trecho]))}</span>
              </button>
            </li>
          ))}
          {trechos.length > LISTA_MAXIMA ? <li className="px-2 text-suave">e mais {trechos.length - LISTA_MAXIMA}</li> : null}
        </ol>
      ) : null}
    </div>
  );
}
