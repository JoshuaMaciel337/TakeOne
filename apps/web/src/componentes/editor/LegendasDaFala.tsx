"use client";

import { AudioLines, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { chamarApi, ErroApi } from "@/lib/api";
import type { Comando } from "@/lib/projeto/comandos";
import { legendasDaFala, opcoesParaOQuadro, type Palavra } from "@/lib/projeto/legendasDaFala";
import type { Projeto } from "@/lib/projeto/modelo";
import type { Texto } from "@/lib/projeto/texto";
import type { IdiomaTranscricao, Transcricao } from "@/lib/tipos";

import { nomeDaFaixa } from "./LinhaDoTempo";

type Props = {
  projeto: Projeto;
  estilo: Texto;
  aoExecutar: (comando: Comando) => void;
  aoAvisar: (mensagem: string) => void;
};

const IDIOMAS: { id: IdiomaTranscricao; nome: string }[] = [
  { id: "auto", nome: "Detectar" },
  { id: "pt", nome: "Português" },
  { id: "en", nome: "Inglês" },
  { id: "es", nome: "Espanhol" },
];
const INTERVALO_MS = 2000;

/** Legendas automáticas: transcreve a fala das mídias de uma faixa e cria as legendas no tempo dela. */
export function LegendasDaFala({ projeto, estilo, aoExecutar, aoAvisar }: Props) {
  const faixas = projeto.faixas.filter((faixa) => faixa.tipo !== "texto" && faixa.tipo !== "legenda" && faixa.clipes.some((clipe) => clipe.midia_id));
  const [faixaId, setFaixaId] = useState<string | null>(null);
  const [idioma, setIdioma] = useState<IdiomaTranscricao>("auto");
  const [andamento, setAndamento] = useState<string | null>(null);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);

  const faixa = faixas.find((item) => item.id === faixaId) ?? faixas[0];
  if (!faixa) return null;

  async function gerar() {
    if (!faixa) return;
    const midias = [...new Set(faixa.clipes.flatMap((clipe) => (clipe.midia_id ? [clipe.midia_id] : [])))];
    setAndamento("Pedindo a transcrição");
    try {
      let transcricoes = await Promise.all(
        midias.map((id) =>
          chamarApi<Transcricao>(`/midias/${id}/transcricao`, { metodo: "POST", corpo: { idioma } }).catch((erro: unknown) => {
            // Mídia sem áudio fica de fora; o resto continua
            if (erro instanceof ErroApi && erro.status === 409) return null;
            throw erro;
          }),
        ),
      );
      while (ativo.current && transcricoes.some((t) => t?.status === "processando")) {
        const prontas = transcricoes.filter((t) => t?.status === "pronta").length;
        const andando = transcricoes.find((t) => t?.status === "processando")?.processamento;
        const progresso = andando ? ` · ${andando.status === "pendente" ? "na fila do worker de GPU" : `${andando.progresso}%`}` : "";
        setAndamento(`Transcrevendo ${prontas + 1} de ${midias.length}${progresso}`);
        await new Promise((ok) => setTimeout(ok, INTERVALO_MS));
        transcricoes = await Promise.all(
          transcricoes.map((t) => (t?.status === "processando" ? chamarApi<Transcricao>(`/midias/${t.midia_id}/transcricao`) : Promise.resolve(t))),
        );
      }
      if (!ativo.current) return;
      const falha = transcricoes.find((t) => t?.status === "erro");
      if (falha) {
        aoAvisar(`A transcrição falhou: ${falha.erro ?? "erro desconhecido"}`);
        return;
      }
      const palavras = new Map<string, Palavra[]>(transcricoes.flatMap((t) => (t ? [[t.midia_id, t.palavras] as const] : [])));
      // As linhas cabem na largura do quadro do projeto, com o tamanho de letra do estilo escolhido
      const legendas = legendasDaFala(faixa.clipes, palavras, opcoesParaOQuadro(projeto.proporcao, estilo.tamanho));
      if (!legendas.length) {
        aoAvisar("Não achei fala nos clipes desta faixa.");
        return;
      }
      aoExecutar({ comando: "legenda.importar", parametros: { legendas, estilo } });
      aoAvisar(`${legendas.length} legendas criadas a partir da fala.`);
    } catch (erro) {
      if (ativo.current) aoAvisar(erro instanceof Error ? erro.message : "Não foi possível transcrever agora.");
    } finally {
      if (ativo.current) setAndamento(null);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-borda p-2" aria-label="Legendas automáticas">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-suave">Automáticas, pela fala</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-suave">
          Faixa
          <select
            value={faixa.id}
            disabled={andamento !== null}
            onChange={(evento) => setFaixaId(evento.currentTarget.value)}
            className="rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-xs text-texto outline-none focus:border-destaque"
          >
            {faixas.map((item) => (
              <option key={item.id} value={item.id}>
                {nomeDaFaixa(item, projeto)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-suave">
          Idioma
          <select
            value={idioma}
            disabled={andamento !== null}
            onChange={(evento) => setIdioma(evento.currentTarget.value as IdiomaTranscricao)}
            className="rounded-md border border-borda bg-painel-2 px-2 py-1.5 text-xs text-texto outline-none focus:border-destaque"
          >
            {IDIOMAS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" className="botao-principal px-3 py-2 text-xs" disabled={andamento !== null} onClick={() => void gerar()}>
        {andamento ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <AudioLines className="size-4" aria-hidden />}
        {andamento ?? "Gerar legendas da fala"}
      </button>
    </section>
  );
}
