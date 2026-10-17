"use client";

import { LoaderCircle, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { chamarApi } from "@/lib/api";
import { pedirPalavrasChave } from "@/lib/palavrasChave";
import type { Comando } from "@/lib/projeto/comandos";
import { animacoesDoPlano, palavrasDepoisDoCorte, type Plano, trechosDosDestaques } from "@/lib/projeto/direcao";
import { falaDosClipes, type Palavra, palavrasDaLinha, type PalavraDaLinha } from "@/lib/projeto/fala";
import { ESTILOS_DE_LEGENDA } from "@/lib/projeto/legendas";
import { legendasDaFala, opcoesParaOQuadro } from "@/lib/projeto/legendasDaFala";
import { segundosDosTrechos, trechosParaLimpar } from "@/lib/projeto/limpezaDeFala";
import type { Clipe, Projeto } from "@/lib/projeto/modelo";
import { type Tick, TICKS_POR_SEGUNDO } from "@/lib/tempo";
import type { Midia, StatusJob } from "@/lib/tipos";
import { transcreverMidias } from "@/lib/transcricao";

type Opcoes = { limpar: boolean; legendas: boolean; chaves: boolean; titulo: boolean; tarja: boolean; zoom: boolean; cta: boolean };

const ROTULOS: [keyof Opcoes, string][] = [
  ["limpar", "Tirar pausas, hesitações e retakes"],
  ["legendas", "Legendas da fala"],
  ["chaves", "Palavras-chave das legendas em destaque"],
  ["titulo", "Título animado na abertura"],
  ["tarja", "Tarja com o nome de quem se apresenta"],
  ["zoom", "Zoom nas frases mais fortes"],
  ["cta", "Chamada no fim, se o vídeo pedir uma ação"],
];

type Job = { id: string; status: StatusJob; progresso: number; mensagem: string; erro: string | null; saida: { plano?: Plano } | null };

type Props = {
  projeto: Projeto;
  aoExecutar: (comando: Comando) => void;
  aoAvisar: (mensagem: string) => void;
  /** Uma animação pedida entra no instante dado quando ficar pronta. */
  aoPedirAnimacao: (midia: Midia, inicio: Tick) => void;
};

/** O que falta fazer depois que a limpeza mudar a linha do tempo. */
type Pendente = { clipesAntes: Clipe[]; palavras: Map<string, Palavra[]>; plano: Plano | null; finais: PalavraDaLinha[]; duracao: Tick; opcoes: Opcoes };

/** Pede o plano ao LLM local (job de GPU) e espera. */
async function pedirPlano(palavras: PalavraDaLinha[], duracao: Tick, aoAndamento: (texto: string) => void, ativo: () => boolean): Promise<Plano | null> {
  const s = TICKS_POR_SEGUNDO;
  let job = await chamarApi<Job>("/direcoes", {
    metodo: "POST",
    corpo: { palavras: palavras.map((p) => ({ texto: p.texto, inicio: p.inicio / s, fim: p.fim / s })), duracao: duracao / s },
  });
  while (ativo() && job.status !== "concluido" && job.status !== "erro") {
    aoAndamento(job.status === "pendente" ? "Plano na fila do worker de GPU" : `${job.mensagem || "Montando o plano"} · ${job.progresso}%`);
    await new Promise((ok) => setTimeout(ok, 2000));
    job = await chamarApi<Job>(`/jobs/${job.id}`);
  }
  if (!ativo()) return null;
  if (job.status === "erro" || !job.saida?.plano) throw new Error(`O plano falhou: ${job.erro ?? "sem resposta do modelo"}`);
  return job.saida.plano;
}

/**
 * "Criar automaticamente": transcreve a faixa principal, limpa a fala, cria as legendas e pede ao LLM
 * local o título, a tarja, os zooms e a chamada. Tudo entra como passos normais do editor (Ctrl+Z desfaz).
 */
export function CriarAutomaticamente({ projeto, aoExecutar, aoAvisar, aoPedirAnimacao }: Props) {
  const clipes = projeto.faixas.find((faixa) => faixa.tipo === "principal")?.clipes ?? [];
  const [opcoes, setOpcoes] = useState<Opcoes>({ limpar: true, legendas: true, chaves: true, titulo: true, tarja: true, zoom: true, cta: true });
  const [andamento, setAndamento] = useState<string | null>(null);
  const pendente = useRef<Pendente | null>(null);
  const ativo = useRef(true);
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);

  async function aplicarResto(p: Pendente, clipesAgora: Clipe[]) {
    const feitos: string[] = [];
    if (p.opcoes.legendas) {
      const estilo = ESTILOS_DE_LEGENDA[0].texto;
      let legendas = legendasDaFala(clipesAgora, p.palavras, opcoesParaOQuadro(projeto.proporcao, estilo.tamanho));
      if (legendas.length && p.opcoes.chaves) {
        // As palavras-chave vêm antes de criar as legendas: elas já nascem pintadas, num passo só
        try {
          const chaves = await pedirPalavrasChave(
            legendas.map((legenda, i) => ({ id: String(i), texto: legenda.conteudo })),
            setAndamento,
            () => ativo.current,
          );
          if (chaves) legendas = legendas.map((legenda, i) => ({ ...legenda, palavras_chave: chaves[String(i)] ?? null }));
        } catch (erro) {
          aoAvisar(erro instanceof Error ? erro.message : "Não foi possível escolher as palavras-chave.");
        }
      }
      if (legendas.length) {
        aoExecutar({ comando: "legenda.importar", parametros: { legendas, estilo } });
        feitos.push(`${legendas.length} legendas`);
      }
    }
    if (p.plano && p.opcoes.zoom) {
      const trechos = trechosDosDestaques(p.plano, p.finais);
      if (trechos.length) {
        aoExecutar({ comando: "linha.zoomNosTrechos", parametros: { trechos } });
        feitos.push(trechos.length === 1 ? "1 zoom" : `${trechos.length} zooms`);
      }
    }
    if (p.plano) {
      const animacoes = animacoesDoPlano(p.plano, p.finais, p.duracao).filter((a) =>
        a.modelo === "titulo" ? p.opcoes.titulo : a.modelo === "tarja" ? p.opcoes.tarja : p.opcoes.cta,
      );
      for (const animacao of animacoes) {
        try {
          const midia = await chamarApi<Midia>("/animacoes", {
            metodo: "POST",
            corpo: { modelo: animacao.modelo, campos: animacao.campos, proporcao: projeto.proporcao, duracao: animacao.duracao },
          });
          aoPedirAnimacao(midia, animacao.inicio);
        } catch (erro) {
          aoAvisar(erro instanceof Error ? erro.message : "Não foi possível pedir uma das animações.");
        }
      }
      if (animacoes.length) feitos.push(`${animacoes.length} ${animacoes.length === 1 ? "animação" : "animações"} gravando`);
    }
    if (ativo.current) setAndamento(null);
    aoAvisar(feitos.length ? `Pronto: ${feitos.join(", ")}. Ctrl+Z desfaz cada passo.` : "Nada para mudar neste vídeo.");
  }

  // A limpeza muda a linha do tempo; o resto é feito em cima dela
  useEffect(() => {
    const p = pendente.current;
    if (!p || p.clipesAntes === clipes) return;
    pendente.current = null;
    void aplicarResto(p, clipes);
  });

  async function criar() {
    const midias = [...new Set(clipes.flatMap((clipe) => (clipe.midia_id ? [clipe.midia_id] : [])))];
    if (!midias.length) {
      aoAvisar("Coloque um vídeo com fala na faixa principal.");
      return;
    }
    try {
      const palavras = await transcreverMidias(midias, "auto", setAndamento, () => ativo.current);
      if (!palavras) return;
      const texto = palavrasDaLinha(falaDosClipes(clipes, palavras));
      if (!texto.length) {
        aoAvisar("Não achei fala na faixa principal.");
        setAndamento(null);
        return;
      }
      const trechos = opcoes.limpar ? trechosParaLimpar(clipes, palavras) : [];
      const finais = palavrasDepoisDoCorte(texto, trechos);
      const duracao = Math.max(0, projeto.duracao - Math.round(segundosDosTrechos(trechos) * TICKS_POR_SEGUNDO));
      const querPlano = opcoes.titulo || opcoes.tarja || opcoes.zoom || opcoes.cta;
      const plano = querPlano ? await pedirPlano(finais, duracao, setAndamento, () => ativo.current) : null;
      if (!ativo.current || (querPlano && !plano)) return;
      const p: Pendente = { clipesAntes: clipes, palavras, plano, finais, duracao, opcoes };
      setAndamento("Aplicando");
      if (trechos.length) {
        pendente.current = p;
        aoExecutar({ comando: "linha.removerIntervalos", parametros: { intervalos: trechos.map(({ inicio, fim }) => ({ inicio, fim })) } });
      } else {
        await aplicarResto(p, clipes);
      }
    } catch (erro) {
      if (ativo.current) {
        aoAvisar(erro instanceof Error ? erro.message : "Não foi possível criar agora.");
        setAndamento(null);
      }
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-destaque/40 bg-destaque/5 p-2" aria-label="Criar automaticamente">
      <h3 className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-suave">
        <WandSparkles className="size-3.5 text-destaque" aria-hidden /> Criar automaticamente
      </h3>
      <p className="text-[11px] text-suave">
        A fala da faixa principal vira um vídeo editado. O título, a tarja, os zooms e a chamada são escolhidos por um modelo de IA que roda no servidor, sem custo.
      </p>
      {ROTULOS.map(([chave, rotulo]) => (
        <label key={chave} className="flex items-center gap-2">
          <input type="checkbox" checked={opcoes[chave]} disabled={andamento !== null || (chave === "chaves" && !opcoes.legendas)} onChange={(evento) => setOpcoes({ ...opcoes, [chave]: evento.currentTarget.checked })} />
          <span className="flex-1">{rotulo}</span>
        </label>
      ))}
      <button type="button" className="botao-principal px-3 py-2" disabled={andamento !== null} onClick={() => void criar()}>
        {andamento ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <WandSparkles className="size-4" aria-hidden />}
        {andamento ?? "Criar automaticamente"}
      </button>
    </section>
  );
}
