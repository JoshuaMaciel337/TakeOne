"use client";

import { LoaderCircle, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { chamarApi } from "@/lib/api";
import { pedirPalavrasChave } from "@/lib/palavrasChave";
import type { Comando, ResultadoDoComando } from "@/lib/projeto/comandos";
import {
  animacoesDoPlano,
  LETRAS_POR_PALAVRA,
  palavrasDepoisDoCorte,
  palavrasParaOPlano,
  type Plano,
  planoNaFala,
  trechosDosDestaques,
} from "@/lib/projeto/direcao";
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
  aoExecutar: (comando: Comando) => ResultadoDoComando;
  aoAvisar: (mensagem: string) => void;
  /** Uma animação pedida entra no instante dado quando ficar pronta. */
  aoPedirAnimacao: (midia: Midia, inicio: Tick) => void;
};

/** O que falta fazer depois que a limpeza mudar a linha do tempo. */
type Pendente = { palavras: Map<string, Palavra[]>; plano: Plano | null; finais: PalavraDaLinha[]; duracao: Tick; opcoes: Opcoes };

const principalDe = (projeto: Projeto): Clipe[] => projeto.faixas.find((faixa) => faixa.tipo === "principal")?.clipes ?? [];
const faixasDe = (projeto: Projeto) => JSON.stringify(projeto.faixas);

/** Pede o plano ao LLM local (job de GPU) e espera. */
async function pedirPlano(palavras: PalavraDaLinha[], duracao: Tick, aoAndamento: (texto: string) => void, ativo: () => boolean): Promise<Plano | null> {
  const s = TICKS_POR_SEGUNDO;
  // O modelo lê até umas 900 palavras: numa fala longa vão o começo e o fim, e os números voltam para a fala inteira
  const enviadas = palavrasParaOPlano(palavras.length);
  let job = await chamarApi<Job>("/direcoes", {
    metodo: "POST",
    corpo: {
      palavras: enviadas.map((i) => palavras[i]).map((p) => ({ texto: p.texto.slice(0, LETRAS_POR_PALAVRA), inicio: p.inicio / s, fim: p.fim / s })),
      duracao: duracao / s,
    },
  });
  while (ativo() && job.status !== "concluido" && job.status !== "erro") {
    aoAndamento(job.status === "pendente" ? "Plano na fila do worker de GPU" : `${job.mensagem || "Montando o plano"} · ${job.progresso}%`);
    await new Promise((ok) => setTimeout(ok, 2000));
    job = await chamarApi<Job>(`/jobs/${job.id}`);
  }
  if (!ativo()) return null;
  if (job.status === "erro" || !job.saida?.plano) throw new Error(`O plano falhou: ${job.erro ?? "sem resposta do modelo"}`);
  return planoNaFala(job.saida.plano, enviadas);
}

/**
 * "Criar automaticamente": transcreve a faixa principal, limpa a fala, cria as legendas e pede ao LLM
 * local o título, a tarja, os zooms e a chamada. Tudo entra como passos normais do editor (Ctrl+Z desfaz).
 */
export function CriarAutomaticamente({ projeto, aoExecutar, aoAvisar, aoPedirAnimacao }: Props) {
  const clipes = principalDe(projeto);
  const [opcoes, setOpcoes] = useState<Opcoes>({ limpar: true, legendas: true, chaves: true, titulo: true, tarja: true, zoom: true, cta: true });
  const [andamento, setAndamento] = useState<string | null>(null);
  const ativo = useRef(true);
  // O projeto mais novo, para conferir no fim de cada espera se a pessoa mexeu na linha do tempo
  const projetoAgora = useRef(projeto);
  useEffect(() => {
    projetoAgora.current = projeto;
  });
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
    };
  }, []);

  /**
   * Legendas, zooms e animações, sobre a linha do tempo já cortada (`base`). Os zooms e as animações
   * apontam instantes dessa linha: se ela mudar enquanto as palavras-chave são escolhidas, eles ficam de
   * fora, e as legendas são refeitas sobre a linha nova.
   */
  async function aplicarResto(p: Pendente, base: Projeto) {
    const feitos: string[] = [];
    let mudou = false;
    if (p.opcoes.legendas) {
      const estilo = ESTILOS_DE_LEGENDA[0].texto;
      const opcoesDoQuadro = opcoesParaOQuadro(projeto.proporcao, estilo);
      let legendas = legendasDaFala(principalDe(base), p.palavras, opcoesDoQuadro);
      let chavesPorTexto: Map<string, number[] | null> | null = null;
      if (legendas.length && p.opcoes.chaves) {
        // As palavras-chave vêm antes de criar as legendas: elas já nascem pintadas, num passo só
        try {
          const chaves = await pedirPalavrasChave(
            legendas.map((legenda, i) => ({ id: String(i), texto: legenda.conteudo })),
            setAndamento,
            () => ativo.current,
          );
          if (chaves) chavesPorTexto = new Map(legendas.map((legenda, i) => [legenda.conteudo, chaves[String(i)] ?? null]));
        } catch (erro) {
          aoAvisar(erro instanceof Error ? erro.message : "Não foi possível escolher as palavras-chave.");
        }
        if (!ativo.current) return;
        // A espera pelo modelo é longa: se a linha mudou, as legendas são refeitas sobre a linha nova, e as
        // de mesmo texto ficam com as palavras-chave delas
        mudou = faixasDe(projetoAgora.current) !== faixasDe(base);
        if (mudou) legendas = legendasDaFala(principalDe(projetoAgora.current), p.palavras, opcoesDoQuadro);
      }
      const porTexto = chavesPorTexto;
      if (porTexto) legendas = legendas.map((legenda) => ({ ...legenda, palavras_chave: porTexto.get(legenda.conteudo) ?? null }));
      if (legendas.length) {
        aoExecutar({ comando: "legenda.importar", parametros: { legendas, estilo } });
        feitos.push(`${legendas.length} legendas`);
      }
    }
    if (mudou && p.plano) {
      if (ativo.current) setAndamento(null);
      aoAvisar(`${feitos.length ? `Pronto: ${feitos.join(", ")}. ` : ""}A linha do tempo mudou durante a espera: os zooms e as animações ficaram de fora. Clique de novo para refazer.`);
      return;
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

  async function criar() {
    const noClique = faixasDe(projeto);
    const midias = [...new Set(clipes.flatMap((clipe) => (clipe.midia_id ? [clipe.midia_id] : [])))];
    if (!midias.length) {
      aoAvisar("Coloque um vídeo com fala na faixa principal.");
      return;
    }
    // Os cortes da limpeza passam por todas as faixas com clipes: travada, uma delas faria o fluxo parar
    // no fim, minutos depois
    if (opcoes.limpar && projeto.faixas.some((faixa) => faixa.travada && faixa.clipes.length)) {
      aoAvisar("Há uma faixa travada. Destrave o cadeado para tirar as pausas, ou desmarque essa opção.");
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
      // Os cortes e o plano foram calculados na linha do clique: aplicados numa linha que mudou, cortariam fala
      if (faixasDe(projetoAgora.current) !== noClique) {
        aoAvisar("A linha do tempo mudou enquanto o vídeo era analisado. Clique de novo para criar sobre ela.");
        setAndamento(null);
        return;
      }
      const p: Pendente = { palavras, plano, finais, duracao, opcoes };
      setAndamento("Aplicando");
      let base = projetoAgora.current;
      if (trechos.length) {
        const resultado = aoExecutar({ comando: "linha.removerIntervalos", parametros: { intervalos: trechos.map(({ inicio, fim }) => ({ inicio, fim })) } });
        if (!resultado) {
          // O editor já mostrou o porquê (uma faixa travada, por exemplo); nada do resto é aplicado
          setAndamento(null);
          return;
        }
        base = resultado.projeto;
      }
      await aplicarResto(p, base);
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
