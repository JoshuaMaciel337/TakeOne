// Pede ao worker a nota de cada instante de um vídeo e espera ficar pronta. Usado pela montagem automática.
import { chamarApi } from "./api";
import type { Qualidade } from "./projeto/montagem";
import type { StatusJob } from "./tipos";

type Resposta = Qualidade & {
  midia_id: string;
  status: "nenhuma" | "processando" | "pronto" | "erro";
  erro: string | null;
  processamento: { status: StatusJob; progresso: number; mensagem: string } | null;
};

const INTERVALO_MS = 1500;

/** A nota do vídeo (avaliada uma vez por mídia), ou null se `ativo()` virar falso. Lança erro com a mensagem para a pessoa. */
export async function buscarQualidade(midiaId: string, aoAndamento: (progresso: number) => void, ativo: () => boolean): Promise<Qualidade | null> {
  let resposta = await chamarApi<Resposta>(`/midias/${midiaId}/qualidade`, { metodo: "POST" });
  while (ativo() && resposta.status === "processando") {
    aoAndamento(resposta.processamento?.progresso ?? 0);
    await new Promise((ok) => setTimeout(ok, INTERVALO_MS));
    resposta = await chamarApi<Resposta>(`/midias/${midiaId}/qualidade`);
  }
  if (!ativo()) return null;
  if (resposta.status === "erro") throw new Error(`A avaliação de um vídeo falhou: ${resposta.erro ?? "erro desconhecido"}`);
  aoAndamento(100);
  return resposta;
}
