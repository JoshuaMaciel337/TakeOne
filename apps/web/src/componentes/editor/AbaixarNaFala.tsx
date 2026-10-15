"use client";

import { LoaderCircle, Volume1 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { abaixamentoNaFala, DB_LIMITES, DB_PADRAO, mudarProfundidade, type TrechoDeFala } from "@/lib/projeto/abaixar";
import type { Comando } from "@/lib/projeto/comandos";
import { falaDosClipes } from "@/lib/projeto/fala";
import type { Clipe, Faixa } from "@/lib/projeto/modelo";
import { transcreverMidias } from "@/lib/transcricao";

import { ControleNumerico } from "./ControleNumerico";

type Props = {
  clipe: Clipe;
  faixa: Faixa;
  /** Todas as faixas do projeto: a fala vem das outras. */
  faixas: Faixa[];
  aoPrever: (comando: Comando | null) => void;
  aoExecutar: (comando: Comando) => void;
  aoAvisar: (mensagem: string) => void;
};

/**
 * Abaixar na fala: transcreve as outras faixas com som, acha onde alguém fala no trecho deste clipe
 * e grava a curva que abaixa o som dele ali (lib/projeto/abaixar.ts).
 */
export function AbaixarNaFala({ clipe, faixa, faixas, aoPrever, aoExecutar, aoAvisar }: Props) {
  const [andamento, setAndamento] = useState<string | null>(null);
  const [db, setDb] = useState(clipe.abaixamento?.db ?? DB_PADRAO);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);
  const travada = faixa.travada;
  const abaixamento = clipe.abaixamento;
  const comando = (valor: typeof abaixamento): Comando => ({ comando: "clipe.abaixar", parametros: { clipeId: clipe.id, abaixamento: valor ?? null } });

  async function abaixar() {
    // A fala vem das outras faixas que tocam (as silenciadas não contam)
    const outras = faixas.filter((item) => item.id !== faixa.id && !item.muda && item.tipo !== "texto" && item.tipo !== "legenda");
    const midias = [...new Set(outras.flatMap((item) => item.clipes.flatMap((c) => (c.midia_id ? [c.midia_id] : []))))];
    if (!midias.length) {
      aoAvisar("Não há outra faixa com som para achar a fala.");
      return;
    }
    try {
      const palavras = await transcreverMidias(midias, "auto", setAndamento, () => ativo.current);
      if (!palavras) return;
      const falas: TrechoDeFala[] = outras.flatMap((item) => falaDosClipes(item.clipes, palavras).flatMap((fala) => fala.palavras.map((p) => ({ inicio: p.inicio, fim: p.fim }))));
      const curva = abaixamentoNaFala(clipe, falas, db);
      if (!curva) {
        aoAvisar("Não achei fala nas outras faixas durante este clipe.");
        return;
      }
      aoExecutar(comando(curva));
      aoAvisar("O som deste clipe agora abaixa quando alguém fala. Ctrl+Z desfaz.");
    } catch (erro) {
      if (ativo.current) aoAvisar(erro instanceof Error ? erro.message : "Não foi possível achar a fala agora.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-1">
      <ControleNumerico
        rotulo="Quanto abaixa"
        valor={abaixamento?.db ?? db}
        minimo={DB_LIMITES.minimo}
        maximo={DB_LIMITES.maximo}
        passo={1}
        sufixo="dB"
        desativado={travada}
        aoPrever={(valor) => (abaixamento ? aoPrever(comando(mudarProfundidade(abaixamento, valor))) : setDb(valor))}
        aoConfirmar={(valor) => {
          setDb(valor);
          if (!abaixamento) return;
          if (valor === abaixamento.db) aoPrever(null);
          else aoExecutar(comando(mudarProfundidade(abaixamento, valor)));
        }}
      />
      <div className="flex gap-1.5">
        <button type="button" className="botao-secundario flex-1 px-3 py-1.5 text-xs" disabled={travada || andamento !== null} onClick={() => void abaixar()}>
          {andamento ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Volume1 className="size-4" aria-hidden />}
          {andamento ?? (abaixamento ? "Refazer pela fala" : "Abaixar quando falam")}
        </button>
        {abaixamento ? (
          <button type="button" className="botao-secundario px-3 py-1.5 text-xs" disabled={travada} onClick={() => aoExecutar(comando(null))}>
            Tirar
          </button>
        ) : null}
      </div>
    </div>
  );
}
