// Pede a transcrição de várias mídias ao worker de GPU e espera ficarem prontas. Usado pelas
// legendas automáticas e pela ferramenta Transcrição.
import { chamarApi, ErroApi } from "./api";
import type { Palavra } from "./projeto/fala";
import type { IdiomaTranscricao, Transcricao } from "./tipos";

const INTERVALO_MS = 2000;

/**
 * As palavras de cada mídia (id → palavras). Mídia sem áudio fica de fora. Lança erro com a mensagem
 * para a pessoa se alguma transcrição falhar; devolve null se `ativo()` virar falso no meio.
 * aoAndamento: texto curto do que está acontecendo, para mostrar no botão.
 */
export async function transcreverMidias(
  midiaIds: string[],
  idioma: IdiomaTranscricao,
  aoAndamento: (texto: string) => void,
  ativo: () => boolean,
): Promise<Map<string, Palavra[]> | null> {
  aoAndamento("Pedindo a transcrição");
  let transcricoes = await Promise.all(
    midiaIds.map((id) =>
      chamarApi<Transcricao>(`/midias/${id}/transcricao`, { metodo: "POST", corpo: { idioma } }).catch((erro: unknown) => {
        if (erro instanceof ErroApi && erro.status === 409) return null;
        throw erro;
      }),
    ),
  );
  while (ativo() && transcricoes.some((t) => t?.status === "processando")) {
    const prontas = transcricoes.filter((t) => t?.status === "pronta").length;
    const andando = transcricoes.find((t) => t?.status === "processando")?.processamento;
    const progresso = andando ? ` · ${andando.status === "pendente" ? "na fila do worker de GPU" : `${andando.progresso}%`}` : "";
    aoAndamento(`Transcrevendo ${prontas + 1} de ${midiaIds.length}${progresso}`);
    await new Promise((ok) => setTimeout(ok, INTERVALO_MS));
    transcricoes = await Promise.all(
      transcricoes.map((t) => (t?.status === "processando" ? chamarApi<Transcricao>(`/midias/${t.midia_id}/transcricao`) : Promise.resolve(t))),
    );
  }
  if (!ativo()) return null;
  const falha = transcricoes.find((t) => t?.status === "erro");
  if (falha) throw new Error(`A transcrição falhou: ${falha.erro ?? "erro desconhecido"}`);
  return new Map(transcricoes.flatMap((t) => (t ? [[t.midia_id, t.palavras] as const] : [])));
}
