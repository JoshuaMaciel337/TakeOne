// Pede ao worker as batidas de uma mídia, espera ficarem prontas e guarda o resultado para a linha do
// tempo mostrar as marcas. Usado pela seção Ritmo da aba Áudio.
import { useSyncExternalStore } from "react";

import { chamarApi } from "./api";
import type { Batidas } from "./projeto/ritmo";
import type { StatusJob } from "./tipos";

type Resposta = Batidas & {
  midia_id: string;
  status: "nenhuma" | "processando" | "pronto" | "erro";
  erro: string | null;
  processamento: { status: StatusJob; progresso: number; mensagem: string } | null;
};

const INTERVALO_MS = 1500;

// midia_id → batidas prontas (null: ainda não procuradas). Fica no módulo, para a linha do tempo e a aba
// Áudio verem o mesmo resultado sem pedir de novo.
const guardadas = new Map<string, Batidas | null>();
const pedidas = new Set<string>();
const ouvintes = new Set<() => void>();

function avisar() {
  for (const ouvinte of ouvintes) ouvinte();
}

function guardar(midiaId: string, batidas: Batidas | null) {
  guardadas.set(midiaId, batidas);
  avisar();
}

/** As batidas já achadas da mídia (GET, uma vez por mídia), ou null. Não pede a análise. */
function carregar(midiaId: string) {
  if (pedidas.has(midiaId)) return;
  pedidas.add(midiaId);
  chamarApi<Resposta>(`/midias/${midiaId}/batidas`)
    .then((resposta) => guardar(midiaId, resposta.status === "pronto" ? resposta : null))
    .catch(() => pedidas.delete(midiaId));
}

/** As batidas de uma mídia, se já foram achadas; atualiza quando a aba Áudio acha novas. */
export function useBatidas(midiaId: string | null): Batidas | null {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte);
      if (midiaId) carregar(midiaId);
      return () => ouvintes.delete(ouvinte);
    },
    () => (midiaId ? (guardadas.get(midiaId) ?? null) : null),
    () => null,
  );
}

/** Acha as batidas (job de CPU) e espera. Lança erro com a mensagem para a pessoa; null se `ativo()` virar falso. */
export async function buscarBatidas(midiaId: string, aoAndamento: (texto: string) => void, ativo: () => boolean): Promise<Batidas | null> {
  aoAndamento("Procurando as batidas");
  let resposta = await chamarApi<Resposta>(`/midias/${midiaId}/batidas`, { metodo: "POST" });
  while (ativo() && resposta.status === "processando") {
    const andando = resposta.processamento;
    aoAndamento(andando?.status === "pendente" ? "Procurando as batidas · na fila" : `Procurando as batidas · ${andando?.progresso ?? 0}%`);
    await new Promise((ok) => setTimeout(ok, INTERVALO_MS));
    resposta = await chamarApi<Resposta>(`/midias/${midiaId}/batidas`);
  }
  if (!ativo()) return null;
  if (resposta.status === "erro") throw new Error(`A busca das batidas falhou: ${resposta.erro ?? "erro desconhecido"}`);
  pedidas.add(midiaId);
  guardar(midiaId, resposta);
  return resposta;
}
