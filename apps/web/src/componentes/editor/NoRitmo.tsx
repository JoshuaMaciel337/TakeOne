"use client";

import { Drum, LoaderCircle, MoveHorizontal, Scissors, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { buscarBatidas, useBatidas } from "@/lib/batidas";
import type { Comando } from "@/lib/projeto/comandos";
import type { Clipe, Faixa } from "@/lib/projeto/modelo";
import { aCada, batidasNaLinha, CADENCIAS } from "@/lib/projeto/ritmo";

type Props = {
  clipe: Clipe;
  /** A faixa principal, que o "Cortar no ritmo" corta. */
  faixa: Faixa;
  /** A faixa do próprio clipe: numa faixa de áudio, aparece o "Ajustar à duração do vídeo". */
  faixaDoClipe: Faixa;
  aoExecutar: (comando: Comando) => void;
  aoAvisar: (mensagem: string) => void;
};

const NOMES_DAS_CADENCIAS: Record<number, string> = { 1: "toda batida", 2: "a cada 2 batidas", 4: "a cada compasso", 8: "a cada 2 compassos" };

/**
 * Ritmo, na aba Áudio de um clipe com som (a música): acha as batidas (worker de CPU), corta a faixa
 * principal nelas e põe um pulso de zoom nos tempos fortes. As marcas aparecem na linha do tempo.
 */
export function NoRitmo({ clipe, faixa, faixaDoClipe, aoExecutar, aoAvisar }: Props) {
  const midiaId = clipe.midia_id;
  const batidas = useBatidas(midiaId);
  const [cadencia, setCadencia] = useState<number>(2);
  const [andamento, setAndamento] = useState<string | null>(null);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);
  if (!midiaId) return null;

  function achar() {
    setAndamento("Procurando as batidas");
    buscarBatidas(midiaId!, setAndamento, () => ativo.current)
      .then((achadas) => {
        if (achadas) aoAvisar(achadas.batidas.length ? `${achadas.batidas.length} batidas, ${achadas.bpm.toLocaleString("pt-BR")} BPM.` : "Não achei um ritmo marcado neste som.");
      })
      .catch((erro: unknown) => aoAvisar(erro instanceof Error ? erro.message : "Não foi possível achar as batidas."))
      .finally(() => {
        if (ativo.current) setAndamento(null);
      });
  }

  const naLinha = batidas ? batidasNaLinha(clipe, batidas.batidas) : [];
  const fortes = batidas ? batidasNaLinha(clipe, batidas.fortes) : [];
  const executar = (comando: Comando, aviso: string) => {
    aoExecutar(comando);
    aoAvisar(aviso);
  };

  if (!batidas?.batidas.length) {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" className="botao-secundario px-3 py-1.5 text-xs" disabled={!!andamento} onClick={achar}>
          {andamento ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Drum className="size-4" aria-hidden />}
          {andamento ?? "Achar as batidas"}
        </button>
        <p className="text-[11px] text-suave">
          Acha o ritmo deste som para cortar os vídeos da faixa principal e animar a imagem nas batidas{faixaDoClipe.tipo === "audio" ? ", e para ajustar a música à duração do vídeo" : ""}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs">
        <span className="font-semibold tabular-nums">{batidas.bpm.toLocaleString("pt-BR")} BPM</span>
        <span className="text-suave"> · {naLinha.length} batidas neste clipe</span>
      </p>
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-suave">Cortar</span>
        <select
          value={cadencia}
          onChange={(evento) => setCadencia(Number(evento.currentTarget.value))}
          className="min-w-0 flex-1 rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-xs outline-none focus:border-destaque"
        >
          {CADENCIAS.map((n) => (
            <option key={n} value={n}>
              {NOMES_DAS_CADENCIAS[n]}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="botao-secundario px-3 py-1.5 text-xs"
          disabled={faixa.travada || naLinha.length < 2}
          onClick={() => executar({ comando: "linha.cortarNoRitmo", parametros: { batidas: aCada(naLinha, cadencia) } }, "Cortes da principal nas batidas. Ctrl+Z desfaz.")}
        >
          <Scissors className="size-4" aria-hidden />
          Cortar no ritmo
        </button>
        <button
          type="button"
          className="botao-secundario px-3 py-1.5 text-xs"
          disabled={!fortes.length}
          onClick={() => executar({ comando: "linha.pulsarNoRitmo", parametros: { batidas: fortes } }, "Pulso de zoom em cada tempo forte. Ctrl+Z desfaz.")}
        >
          <Zap className="size-4" aria-hidden />
          Pulsar no ritmo
        </button>
      </div>
      <p className="text-[11px] text-suave">Cortar no ritmo faz cada vídeo da principal acabar numa batida. Pulsar dá um zoom curto nos tempos fortes.</p>
      {faixaDoClipe.tipo === "audio" ? (
        <>
          <button
            type="button"
            className="botao-secundario px-3 py-1.5 text-xs"
            disabled={faixaDoClipe.travada}
            onClick={() =>
              executar(
                { comando: "musica.ajustar", parametros: { clipeId: clipe.id, fortes: batidas.fortes } },
                "A música agora acaba junto com o vídeo, com os cortes nos tempos fortes. Ctrl+Z desfaz.",
              )
            }
          >
            <MoveHorizontal className="size-4" aria-hidden />
            Ajustar à duração do vídeo
          </button>
          <p className="text-[11px] text-suave">Tira ou repete compassos do meio para a música acabar no final dela, junto com o vídeo.</p>
        </>
      ) : null}
    </div>
  );
}

/**
 * As batidas do clipe na linha do tempo (só depois de achadas): um traço curto em cada batida e um mais
 * alto nos tempos fortes. Batidas a menos de 4 px umas das outras só mostram os tempos fortes.
 */
export function MarcasDoRitmo({ clipe, px }: { clipe: Clipe; px: (t: number) => number }) {
  const batidas = useBatidas(clipe.midia_id);
  if (!batidas?.batidas.length) return null;
  const todas = batidasNaLinha(clipe, batidas.batidas);
  const fortes = new Set(batidasNaLinha(clipe, batidas.fortes));
  const apertadas = todas.length > 1 && px(todas[1]) - px(todas[0]) < 4;
  return (
    <>
      {todas
        .filter((t) => !apertadas || fortes.has(t))
        .map((t) => (
          <span
            key={`b-${clipe.id}-${t}`}
            className={`pointer-events-none absolute top-0 z-10 w-px -translate-x-1/2 ${fortes.has(t) ? "h-1/2 bg-amber-300/90" : "h-1/4 bg-amber-200/60"}`}
            style={{ left: px(t) }}
            aria-hidden
          />
        ))}
    </>
  );
}
