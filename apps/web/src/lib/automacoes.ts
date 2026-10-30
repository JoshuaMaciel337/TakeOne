// As automações do Clipar (ADR 0004, 14.9): a esteira, que leva um vídeo do link (ou do envio, ou do canal) até os
// melhores cortes exportados sem a página aberta, e os canais do YouTube acompanhados, em que cada vídeo novo vira
// uma esteira. O servidor faz tudo (core/utils/esteiras.py); aqui só se pede, se lê e se para.
import { chamarApi } from "./api.ts";
import type { OpcoesDaClipagem } from "./clipagens.ts";

export type StatusDaEsteira = "importando" | "esperando" | "procurando" | "montando" | "pronta" | "erro" | "cancelada";

export type Esteira = {
  id: string;
  origem: "link" | "envio" | "canal";
  titulo: string;
  status: StatusDaEsteira;
  midia_id: string | null;
  clipagem_id: string | null;
  automacao_id: string | null;
  quantos: number;
  horario: string | null;
  comecar_em: string | null;
  videos: number;
  erro: string | null;
  criado_em: string;
  concluida_em: string | null;
};

export type Automacao = {
  id: string;
  tipo: "canal";
  ativa: boolean;
  canal: { id: string | null; handle: string | null; nome: string | null };
  opcoes: OpcoesDaClipagem;
  quantos: number;
  resolucao: "720p" | "1080p" | "4k";
  horario: string | null;
  duracao_minima: number;
  ultima_verificacao: string | null;
  ultimo_erro: string | null;
  criado_em: string;
};

export type PedidoDeEsteira = {
  url?: string;
  titulo?: string;
  midia_id?: string;
  opcoes: OpcoesDaClipagem;
  quantos: number;
  horario: string | null;
};

export const ATIVAS: StatusDaEsteira[] = ["importando", "esperando", "procurando", "montando"];

export function criarEsteira(pedido: PedidoDeEsteira): Promise<Esteira> {
  return chamarApi<Esteira>("/esteiras", { metodo: "POST", corpo: pedido });
}

export function listarEsteiras(): Promise<Esteira[]> {
  return chamarApi<Esteira[]>("/esteiras");
}

/** A que anda para; a que acabou sai da lista. */
export function pararEsteira(id: string): Promise<void> {
  return chamarApi<void>(`/esteiras/${id}`, { metodo: "DELETE" });
}

export function listarAutomacoes(): Promise<Automacao[]> {
  return chamarApi<Automacao[]>("/automacoes");
}

export function criarAutomacao(pedido: { canal: string; opcoes: OpcoesDaClipagem; quantos: number; horario: string | null; duracao_minima: number }): Promise<Automacao> {
  return chamarApi<Automacao>("/automacoes", { metodo: "POST", corpo: pedido });
}

/** horario "" tira o horário. */
export function mudarAutomacao(id: string, mudanca: Partial<Pick<Automacao, "ativa" | "quantos" | "duracao_minima">> & { horario?: string }): Promise<Automacao> {
  return chamarApi<Automacao>(`/automacoes/${id}`, { metodo: "PATCH", corpo: mudanca });
}

export function verificarAutomacao(id: string): Promise<Automacao> {
  return chamarApi<Automacao>(`/automacoes/${id}/verificar`, { metodo: "POST" });
}

export function excluirAutomacao(id: string): Promise<void> {
  return chamarApi<void>(`/automacoes/${id}`, { metodo: "DELETE" });
}

/** "às 23:00" ou "amanhã às 02:00", pelo relógio de quem lê. */
function quando(iso: string, agora: Date): string {
  const data = new Date(iso);
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const amanha = new Date(agora);
  amanha.setDate(agora.getDate() + 1);
  if (data.toDateString() === agora.toDateString()) return `às ${hora}`;
  if (data.toDateString() === amanha.toDateString()) return `amanhã às ${hora}`;
  return `em ${data.toLocaleDateString("pt-BR")} às ${hora}`;
}

/** O que a lista mostra de cada esteira: o texto, se ainda anda (a página olha de novo) e se deu erro. */
export function situacaoDaEsteira(esteira: Esteira, agora: Date = new Date()): { texto: string; andando: boolean; erro: boolean } {
  const andando = ATIVAS.includes(esteira.status);
  const sem = { andando, erro: false };
  switch (esteira.status) {
    case "importando":
      return { ...sem, texto: "Baixando e preparando o vídeo" };
    case "esperando":
      return { ...sem, texto: esteira.comecar_em ? `Procura os cortes ${quando(esteira.comecar_em, agora)}` : "Esperando o horário" };
    case "procurando":
      return { ...sem, texto: "Procurando os cortes" };
    case "montando":
      return { ...sem, texto: "Montando e exportando os cortes" };
    case "pronta":
      if (!esteira.videos) return { ...sem, texto: esteira.erro || "Nenhum corte saiu." };
      return { ...sem, texto: esteira.videos === 1 ? "1 corte pronto" : `${esteira.videos} cortes prontos` };
    case "cancelada":
      return { ...sem, texto: "Parada" };
    default:
      return { ...sem, texto: esteira.erro || "A esteira falhou.", erro: true };
  }
}
