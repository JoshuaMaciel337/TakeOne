"use client";

// O aviso do navegador quando uma exportação termina (ADR 0007, 17.7): a janela Exportar guarda aqui as que a pessoa
// pediu para avisar, e o editor (que fica aberto mesmo com a janela fechada) mostra a notificação quando o render acaba.
import { useEventosJobs } from "./eventos";

const avisar = new Map<string, string>();

/** Pede a permissão (uma vez) e marca a exportação para avisar quando terminar. */
export async function avisarQuandoTerminar(exportacaoId: string, nome: string): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  const permissao = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permissao !== "granted") return false;
  avisar.set(exportacaoId, nome);
  return true;
}

/** No editor: a notificação do render que termina (com sucesso ou com erro). */
export function useAvisoDasExportacoes() {
  useEventosJobs((job) => {
    const id = typeof job.entrada?.exportacao_id === "string" ? job.entrada.exportacao_id : null;
    if (job.tipo !== "renderizacao" || !id || !avisar.has(id) || (job.status !== "concluido" && job.status !== "erro")) return;
    const nome = avisar.get(id)!;
    avisar.delete(id);
    try {
      new Notification(job.status === "concluido" ? "Exportação pronta" : "A exportação falhou", {
        body: job.status === "concluido" ? `${nome}: o vídeo está pronto para baixar.` : `${nome}: ${job.erro ?? "erro desconhecido"}`,
        tag: `takeone-exportacao-${id}`,
      });
    } catch {
      // Sem notificação (o navegador recusou): a janela Exportar mostra do mesmo jeito
    }
  });
}
