// O pedido da legenda animada (POST /api/legendas-animadas) e a espera pela gravação, fora do editor (o Clipar
// monta o corte antes de abrir o projeto). No editor, a mídia entra pela fila de pendências dele.
import { chamarApi } from "@/lib/api";
import type { PedidoDaLegenda } from "@/lib/projeto/legendaAnimada";
import type { Proporcao } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

const INTERVALO_MS = 2000;

/** A página da prévia, com a frase de exemplo, para o iframe do painel. */
export function enderecoDaPrevia(estilo: string, proporcao: Proporcao, cores: PedidoDaLegenda["cores"], posicao: number): string {
  return `/api/legendas-animadas/previa?${new URLSearchParams({ estilo, proporcao, cores: JSON.stringify(cores), posicao: String(posicao) })}`;
}

export function pedirLegendaAnimada(pedido: PedidoDaLegenda, estilo: string, proporcao: Proporcao): Promise<Midia> {
  return chamarApi<Midia>("/legendas-animadas", {
    metodo: "POST",
    corpo: { palavras: pedido.palavras, estilo, proporcao, duracao: pedido.duracao, cores: pedido.cores, posicao: pedido.posicao },
  });
}

/** Espera a gravação e a ingestão da trilha; null se ativo() ficou falso no meio. */
export async function esperarLegenda(midia: Midia, aoAndamento: (texto: string) => void, ativo: () => boolean): Promise<Midia | null> {
  let atual = midia;
  while (ativo() && (atual.status === "processando" || atual.status === "enviando")) {
    const andando = atual.processamento;
    aoAndamento(andando?.status === "pendente" ? "Gravando a legenda animada · na fila" : `Gravando a legenda animada · ${andando?.progresso ?? 0}%`);
    await new Promise((ok) => setTimeout(ok, INTERVALO_MS));
    atual = await chamarApi<Midia>(`/midias/${midia.id}`);
  }
  if (!ativo()) return null;
  if (atual.status === "erro") throw new Error(`A legenda animada não foi gravada: ${atual.erro ?? "erro desconhecido"}`);
  return atual;
}
