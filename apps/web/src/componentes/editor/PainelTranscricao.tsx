"use client";

import { Eraser, LoaderCircle, ScrollText, Scissors } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Comando, ResultadoDoComando } from "@/lib/projeto/comandos";
import { falaDosClipes, type Palavra, palavrasDaLinha, trechoDasPalavras } from "@/lib/projeto/fala";
import { OPCOES_DE_LIMPEZA, type OpcoesDeLimpeza, segundosDosTrechos, trechosParaLimpar } from "@/lib/projeto/limpezaDeFala";
import type { Projeto } from "@/lib/projeto/modelo";
import { formatarTimecode, type Tick } from "@/lib/tempo";
import type { IdiomaTranscricao, Midia } from "@/lib/tipos";
import { transcreverMidias } from "@/lib/transcricao";

import { ControleNumerico } from "./ControleNumerico";
import { CriarAutomaticamente } from "./CriarAutomaticamente";
import { PecaUmaEdicao } from "./PecaUmaEdicao";
import { IDIOMAS } from "./LegendasDaFala";

export type PropsTranscricao = {
  projeto: Projeto;
  tempo: Tick;
  aoExecutar: (comando: Comando) => ResultadoDoComando;
  aoBuscar: (tempo: Tick) => void;
  aoAvisar: (mensagem: string) => void;
  aoPedirAnimacao: (midia: Midia, inicio: Tick) => void;
  /** A biblioteca: o "Peça uma edição" precisa do tamanho e do som das mídias. */
  midias: Midia[];
};

/** Quantos trechos a lista mostra; o botão remove todos. */
const LISTA_MAXIMA = 60;

function segundos(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`;
}

/** Ferramenta Transcrição: pedir uma edição em palavras, o "Criar automaticamente" e a fala da faixa principal, para limpar pausas e vícios e editar pelo texto. */
export function PainelTranscricao({ projeto, tempo, aoExecutar, aoBuscar, aoAvisar, aoPedirAnimacao, midias }: PropsTranscricao) {
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
  const texto = useMemo(() => (palavras ? palavrasDaLinha(falaDosClipes(clipes, palavras)) : []), [clipes, palavras]);
  // A seleção vale só para a linha do tempo em que foi feita: depois de qualquer corte, some
  const [selecao, setSelecao] = useState<{ clipes: typeof clipes; de: number; ate: number } | null>(null);
  const selecionadas = selecao && selecao.clipes === clipes ? { de: Math.min(selecao.de, selecao.ate), ate: Math.max(selecao.de, selecao.ate) } : null;
  const pausas = trechos.filter((t) => t.tipo === "pausa");
  const vicios = trechos.filter((t) => t.tipo === "vicio");
  const repetidas = trechos.filter((t) => t.tipo === "retake");
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

  function clicarPalavra(indice: number, estender: boolean) {
    if (estender && selecionadas) setSelecao({ clipes, de: selecao!.de, ate: indice });
    else setSelecao({ clipes, de: indice, ate: indice });
    if (!estender) aoBuscar(texto[indice].inicio);
  }

  function apagarSelecionadas() {
    if (!selecionadas) return;
    const quantas = selecionadas.ate - selecionadas.de + 1;
    aoExecutar({ comando: "linha.removerIntervalos", parametros: { intervalos: [trechoDasPalavras(texto, selecionadas.de, selecionadas.ate)] } });
    setSelecao(null);
    aoAvisar(`${quantas === 1 ? "1 palavra apagada" : `${quantas} palavras apagadas`} do vídeo. Ctrl+Z desfaz.`);
  }

  if (!palavras) {
    return (
      <div className="flex flex-col gap-3 text-xs">
        <PecaUmaEdicao projeto={projeto} midias={midias} aoExecutar={aoExecutar} aoAvisar={aoAvisar} />
        <CriarAutomaticamente projeto={projeto} aoExecutar={aoExecutar} aoAvisar={aoAvisar} aoPedirAnimacao={aoPedirAnimacao} />
        <p className="text-suave">
          A fala da faixa principal é transcrita no worker de GPU. Depois dá para tirar as pausas longas, as hesitações (“ahn”, “hum”) e os retakes de uma vez, e
          editar o vídeo pelo texto.
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
      <PecaUmaEdicao projeto={projeto} midias={midias} aoExecutar={aoExecutar} aoAvisar={aoAvisar} />
      <CriarAutomaticamente projeto={projeto} aoExecutar={aoExecutar} aoAvisar={aoAvisar} aoPedirAnimacao={aoPedirAnimacao} />
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
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={opcoes.retakes} onChange={(evento) => setOpcoes({ ...opcoes, retakes: evento.currentTarget.checked })} />
          <span className="flex-1">Retakes (frase começada de novo)</span>
          <span className="tabular-nums text-suave">{repetidas.length}</span>
        </label>
        <button type="button" className="botao-principal px-3 py-2" disabled={!trechos.length} onClick={remover}>
          <Scissors className="size-4" aria-hidden />
          {trechos.length ? `Remover ${trechos.length} trechos (${segundos(total)})` : "Nada para remover"}
        </button>
        <button type="button" className="text-left text-[11px] text-suave underline-offset-2 hover:underline" disabled={andamento !== null} onClick={() => void analisar()}>
          {andamento ?? "Analisar de novo"}
        </button>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-borda p-2" aria-label="Editar pelo texto">
        <h3 className="font-semibold uppercase tracking-wide text-suave">Editar pelo texto</h3>
        <p className="text-[11px] text-suave">Clique numa palavra para ir até ela. Com Shift, marque um trecho e apague: o vídeo é cortado junto.</p>
        <button type="button" className="botao-secundario px-3 py-1.5" disabled={!selecionadas} onClick={apagarSelecionadas}>
          <Eraser className="size-4" aria-hidden />
          {selecionadas ? `Apagar ${selecionadas.ate - selecionadas.de + 1} palavras do vídeo` : "Marque as palavras para apagar"}
        </button>
        <p className="max-h-80 overflow-y-auto rounded-md bg-painel-2 p-2 text-sm leading-relaxed" aria-label="Transcrição da faixa principal">
          {texto.map((palavra, indice) => {
            const marcada = selecionadas !== null && indice >= selecionadas.de && indice <= selecionadas.ate;
            const falando = tempo >= palavra.inicio && tempo < palavra.fim;
            const novoClipe = indice > 0 && texto[indice - 1].clipeId !== palavra.clipeId;
            return (
              <span key={`${palavra.clipeId}-${indice}`}>
                {novoClipe ? <span className="mx-1 text-suave" aria-hidden>¦</span> : indice > 0 ? " " : null}
                <button
                  type="button"
                  aria-pressed={marcada}
                  onClick={(evento) => clicarPalavra(indice, evento.shiftKey)}
                  className={`rounded px-0.5 ${marcada ? "bg-destaque/40 line-through" : falando ? "bg-painel-3 underline" : "hover:bg-painel-3"}`}
                >
                  {palavra.texto}
                </button>
              </span>
            );
          })}
        </p>
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
                <span className="flex-1 truncate">{trecho.tipo === "pausa" ? "Pausa" : trecho.tipo === "retake" ? `Retake: “${trecho.texto}”` : `“${trecho.texto}”`}</span>
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
