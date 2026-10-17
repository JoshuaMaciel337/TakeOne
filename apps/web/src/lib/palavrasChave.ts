// Pede ao LLM local (job de GPU) as palavras-chave das legendas e espera. Usado pelo painel de Legendas e
// pelo "Criar automaticamente". As palavras voltam por número, contadas como em palavrasDoTexto.
import { chamarApi } from "./api";
import type { StatusJob } from "./tipos";

type Job = { id: string; status: StatusJob; progresso: number; mensagem: string; erro: string | null; saida: { chaves?: Record<string, number[]> } | null };

/**
 * id da legenda → números das palavras-chave. Lança erro com a mensagem para a pessoa se o job falhar;
 * devolve null se `ativo()` virar falso no meio.
 */
export async function pedirPalavrasChave(
  legendas: { id: string; texto: string }[],
  aoAndamento: (texto: string) => void,
  ativo: () => boolean,
): Promise<Record<string, number[]> | null> {
  let job = await chamarApi<Job>("/direcoes/palavras-chave", { metodo: "POST", corpo: { legendas } });
  while (ativo() && job.status !== "concluido" && job.status !== "erro") {
    aoAndamento(job.status === "pendente" ? "Palavras-chave na fila do worker de GPU" : `${job.mensagem || "Escolhendo as palavras-chave"} · ${job.progresso}%`);
    await new Promise((ok) => setTimeout(ok, 2000));
    job = await chamarApi<Job>(`/jobs/${job.id}`);
  }
  if (!ativo()) return null;
  if (job.status === "erro" || !job.saida?.chaves) throw new Error(`As palavras-chave falharam: ${job.erro ?? "sem resposta do modelo"}`);
  return job.saida.chaves;
}
