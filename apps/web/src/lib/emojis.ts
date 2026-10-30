// O emoji automático das legendas (o Clipar, ADR 0004, 14.8): pede ao LLM local (job de GPU) o emoji de algumas
// legendas, pede à API o desenho de cada um (uma imagem da biblioteca, a mesma para o mesmo emoji) e põe acima das
// legendas pela conta de lib/projeto/emojis.ts.
import { contextoDasMidias } from "@/componentes/editor/contexto";

import { chamarApi } from "./api";
import { comEmojisNasLegendas, legendasParaEmojis } from "./projeto/emojis";
import type { Projeto } from "./projeto/modelo";
import type { Midia, StatusJob } from "./tipos";

type Job = { id: string; status: StatusJob; progresso: number; mensagem: string; erro: string | null; saida: { emojis?: Record<string, string> } | null };

/** Se a mídia é um emoji desenhado pela API. */
export const ehMidiaDeEmoji = (midia: Midia | undefined) => midia?.elemento?.tipo === "emoji";

/** id da legenda → nome do emoji. Lança erro com a mensagem para a pessoa; null se `ativo()` virar falso. */
export async function pedirEmojis(legendas: { id: string; texto: string }[], aoAndamento: (texto: string) => void, ativo: () => boolean): Promise<Record<string, string> | null> {
  let job = await chamarApi<Job>("/direcoes/emojis", { metodo: "POST", corpo: { legendas } });
  while (ativo() && job.status !== "concluido" && job.status !== "erro") {
    aoAndamento(job.status === "pendente" ? "Emojis na fila do worker de GPU" : `${job.mensagem || "Escolhendo os emojis"} · ${job.progresso}%`);
    await new Promise((ok) => setTimeout(ok, 2000));
    job = await chamarApi<Job>(`/jobs/${job.id}`);
  }
  if (!ativo()) return null;
  if (job.status === "erro" || !job.saida?.emojis) throw new Error(`Os emojis falharam: ${job.erro ?? "sem resposta do modelo"}`);
  return job.saida.emojis;
}

/**
 * O projeto com os emojis escolhidos pelo modelo acima das legendas (os de antes saem). `midias` são as do editor,
 * para achar os emojis de antes. Devolve null se a pessoa saiu; `quantos` é quantas legendas ganharam emoji.
 */
export async function emojisNoProjeto(
  projeto: Projeto,
  midias: Map<string, Midia>,
  aoAndamento: (texto: string) => void,
  ativo: () => boolean,
): Promise<{ projeto: Projeto; quantos: number } | null> {
  const legendas = legendasParaEmojis(projeto);
  if (!legendas.length) throw new Error("O vídeo não tem legendas para pôr emojis.");
  const escolhas = await pedirEmojis(legendas, aoAndamento, ativo);
  if (!escolhas) return null;
  const nomes = [...new Set(Object.values(escolhas))];
  aoAndamento("Desenhando os emojis");
  const desenhados = await Promise.all(nomes.map((nome) => chamarApi<Midia>("/elementos/emojis", { metodo: "POST", corpo: { nome } })));
  if (!ativo()) return null;
  const porNome = new Map(nomes.map((nome, i) => [nome, desenhados[i]]));
  const todas = new Map(midias);
  for (const midia of desenhados) todas.set(midia.id, midia);
  const emojis = Object.entries(escolhas).flatMap(([legendaId, nome]) => {
    const midia = porNome.get(nome);
    return midia?.video ? [{ legendaId, midiaId: midia.id, largura: midia.video.largura, altura: midia.video.altura }] : [];
  });
  const ehEmoji = (id: string) => ehMidiaDeEmoji(todas.get(id));
  if (!emojis.length) return { projeto, quantos: 0 };
  return { projeto: comEmojisNasLegendas(projeto, contextoDasMidias(todas), emojis, ehEmoji), quantos: emojis.length };
}
