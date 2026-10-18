// Pede ao worker o caminho de um objeto marcado num vídeo e espera ficar pronto. Usado pelo "Seguir um objeto".
import { chamarApi } from "./api";
import type { CaixaNaImagem, PontoDoObjeto } from "./projeto/seguirObjeto";
import type { StatusJob } from "./tipos";

type Rastreio = {
  id: string;
  midia_id: string;
  status: "processando" | "pronto" | "erro";
  pontos: PontoDoObjeto[];
  erro: string | null;
  processamento: { status: StatusJob; progresso: number; mensagem: string } | null;
};

export type PedidoDeRastreio = { arquivo: string; t: number; caixa: CaixaNaImagem; de: number; ate: number };

const INTERVALO_MS = 1000;

/** Os pontos do objeto, ou null se `ativo()` virar falso no meio. Lança erro com a mensagem para a pessoa. */
export async function seguirObjetoNoWorker(midiaId: string, pedido: PedidoDeRastreio, aoAndamento: (texto: string) => void, ativo: () => boolean): Promise<PontoDoObjeto[] | null> {
  aoAndamento("Seguindo o objeto");
  let rastreio = await chamarApi<Rastreio>(`/midias/${midiaId}/rastreios`, { metodo: "POST", corpo: pedido });
  while (ativo() && rastreio.status === "processando") {
    const andando = rastreio.processamento;
    aoAndamento(andando?.status === "pendente" ? "Seguindo o objeto · na fila" : `Seguindo o objeto · ${andando?.progresso ?? 0}%`);
    await new Promise((ok) => setTimeout(ok, INTERVALO_MS));
    rastreio = await chamarApi<Rastreio>(`/midias/${midiaId}/rastreios/${rastreio.id}`);
  }
  if (!ativo()) return null;
  if (rastreio.status === "erro") throw new Error(`Não foi possível seguir o objeto: ${rastreio.erro ?? "erro desconhecido"}`);
  return rastreio.pontos;
}
