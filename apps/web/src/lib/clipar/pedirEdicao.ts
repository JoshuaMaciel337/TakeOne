// Pede ao LLM local (job de GPU) o plano de um pedido de edição em palavras e espera (o "Peça uma edição").
import { chamarApi } from "@/lib/api";
import type { StatusJob } from "@/lib/tipos";
import { TICKS_POR_SEGUNDO } from "@/lib/tempo";

import type { EstadoDoProjeto, FraseDaLinha, PlanoDaEdicao } from "./pedidoDeEdicao";

type Job = { id: string; status: StatusJob; progresso: number; mensagem: string; erro: string | null; saida: { plano?: PlanoDaEdicao } | null };

/** O plano do pedido, ou null se `ativo()` virar falso no meio. Lança erro com a mensagem para a pessoa. */
export async function pedirPlanoDaEdicao(
  pedido: string,
  frases: FraseDaLinha[],
  estado: EstadoDoProjeto,
  aoAndamento: (texto: string) => void,
  ativo: () => boolean,
): Promise<PlanoDaEdicao | null> {
  const corpo = {
    pedido,
    // As primeiras 160 frases (o limite da API); a API e o worker ainda cortam pelo tamanho do contexto
    frases: frases.slice(0, 160).map((frase) => ({ n: frase.n, texto: frase.texto.slice(0, 600), inicio: frase.inicio / TICKS_POR_SEGUNDO })),
    estado,
  };
  let job = await chamarApi<Job>("/direcoes/pedido", { metodo: "POST", corpo });
  while (ativo() && job.status !== "concluido" && job.status !== "erro") {
    aoAndamento(job.status === "pendente" ? "Pedido na fila do worker de GPU" : `${job.mensagem || "O modelo está lendo o pedido"} · ${job.progresso}%`);
    await new Promise((ok) => setTimeout(ok, 1500));
    job = await chamarApi<Job>(`/jobs/${job.id}`);
  }
  if (!ativo()) return null;
  if (job.status === "erro" || !job.saida?.plano) throw new Error(`O pedido falhou: ${job.erro ?? "sem resposta do modelo"}`);
  return job.saida.plano;
}
