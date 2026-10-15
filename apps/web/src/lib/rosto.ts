// Pede ao worker a busca do rosto de uma mídia e espera ficar pronta. Usado pelo "Seguir o rosto".
import { chamarApi } from "./api";
import type { AmostraDeRosto } from "./projeto/reenquadrar";
import type { StatusJob } from "./tipos";

type Rosto = {
  midia_id: string;
  status: "processando" | "pronto" | "erro";
  amostras: AmostraDeRosto[];
  erro: string | null;
  processamento: { status: StatusJob; progresso: number; mensagem: string } | null;
};

const INTERVALO_MS = 1500;

/** As amostras do rosto, ou null se `ativo()` virar falso no meio. Lança erro com a mensagem para a pessoa. */
export async function buscarRosto(midiaId: string, aoAndamento: (texto: string) => void, ativo: () => boolean): Promise<AmostraDeRosto[] | null> {
  aoAndamento("Procurando o rosto");
  let rosto = await chamarApi<Rosto>(`/midias/${midiaId}/rosto`, { metodo: "POST" });
  while (ativo() && rosto.status === "processando") {
    const andando = rosto.processamento;
    aoAndamento(andando?.status === "pendente" ? "Procurando o rosto · na fila" : `Procurando o rosto · ${andando?.progresso ?? 0}%`);
    await new Promise((ok) => setTimeout(ok, INTERVALO_MS));
    rosto = await chamarApi<Rosto>(`/midias/${midiaId}/rosto`);
  }
  if (!ativo()) return null;
  if (rosto.status === "erro") throw new Error(`A busca do rosto falhou: ${rosto.erro ?? "erro desconhecido"}`);
  return rosto.amostras;
}
