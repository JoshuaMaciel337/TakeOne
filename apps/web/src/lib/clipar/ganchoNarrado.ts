// O gancho narrado do corte (ADR 0004, 14.8), a parte que fala com o servidor: a frase escrita pelo LLM local (job
// de GPU), a fala do Kokoro (o texto em fala de sempre, marcada como gancho) e a espera; gancho.ts põe no projeto.
import { contextoDasMidias } from "@/componentes/editor/contexto";
import { chamarApi } from "@/lib/api";
import type { Projeto } from "@/lib/projeto/modelo";
import { segundosParaTicks, type Tick } from "@/lib/tempo";
import type { Midia, StatusJob } from "@/lib/tipos";

import { esperarProntas } from "./aplicarPregacao";
import { comGancho, ehMidiaDeGancho, textoDoProjeto, VELOCIDADE_DO_GANCHO, type VOZES_DO_GANCHO } from "./gancho";

type Job = { id: string; status: StatusJob; progresso: number; mensagem: string; erro: string | null; saida: { frase?: string } | null };

/** A frase do gancho escrita pelo LLM local. Lança erro com a mensagem para a pessoa; null se `ativo()` virar falso. */
export async function escreverGancho(titulo: string, texto: string, aoAndamento: (texto: string) => void, ativo: () => boolean): Promise<string | null> {
  let job = await chamarApi<Job>("/direcoes/gancho", { metodo: "POST", corpo: { titulo: titulo.slice(0, 300), texto: texto.slice(0, 20000) } });
  while (ativo() && job.status !== "concluido" && job.status !== "erro") {
    aoAndamento(job.status === "pendente" ? "Gancho na fila do worker de GPU" : `${job.mensagem || "Escrevendo o gancho"} · ${job.progresso}%`);
    await new Promise((ok) => setTimeout(ok, 2000));
    job = await chamarApi<Job>(`/jobs/${job.id}`);
  }
  if (!ativo()) return null;
  if (job.status === "erro" || !job.saida?.frase) throw new Error(job.erro ?? "O modelo não escreveu o gancho.");
  return job.saida.frase;
}

/**
 * Fala a frase (sem frase, pede ao modelo antes, pelo título e pelas legendas) e põe no começo. Devolve null se a
 * pessoa saiu no meio.
 */
export async function ganchoNoProjeto(opcoes: {
  projeto: Projeto;
  midias: Map<string, Midia>;
  frase?: string;
  titulo: string;
  voz: (typeof VOZES_DO_GANCHO)[number]["id"];
  aoAndamento: (texto: string) => void;
  ativo: () => boolean;
}): Promise<{ projeto: Projeto; frase: string; duracao: Tick } | null> {
  const { projeto, titulo, voz, aoAndamento, ativo } = opcoes;
  const frase = opcoes.frase?.trim() || (await escreverGancho(titulo, textoDoProjeto(projeto), aoAndamento, ativo));
  if (!frase) return null;
  aoAndamento("Falando o gancho");
  const pedida = await chamarApi<Midia>("/midias/fala", { metodo: "POST", corpo: { texto: frase, voz, velocidade: VELOCIDADE_DO_GANCHO, gancho: true } });
  const prontas = await esperarProntas([pedida.id], aoAndamento, ativo, "Falando o gancho");
  if (!prontas) return null;
  const fala = prontas.get(pedida.id);
  if (!fala?.duracao) throw new Error("A fala do gancho não ficou pronta.");
  const midias = new Map(opcoes.midias);
  midias.set(fala.id, fala);
  const ehGancho = (id: string) => ehMidiaDeGancho(midias.get(id));
  return { projeto: comGancho(projeto, contextoDasMidias(midias), fala.id, ehGancho), frase, duracao: segundosParaTicks(fala.duracao) };
}
