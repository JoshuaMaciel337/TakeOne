// Formatos que a API devolve. Espelham apps/api/esquemas.py.
import type { PedidoDeForma } from "./elementos";

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  papel: string;
};

export type Organizacao = {
  id: string;
  nome: string;
  slug: string;
};

export type Sessao = {
  usuario: Usuario;
  organizacao: Organizacao;
};

export type StatusJob = "pendente" | "executando" | "concluido" | "erro";

export type Job = {
  id: string;
  tipo: string;
  recurso: "cpu" | "gpu";
  status: StatusJob;
  progresso: number;
  mensagem: string;
  tentativas: number;
  max_tentativas: number;
  erro: string | null;
  entrada: Record<string, unknown>;
  saida: Record<string, unknown> | null;
  criado_em: string;
  atualizado_em: string;
  iniciado_em: string | null;
  concluido_em: string | null;
  disponivel_em: string | null;
};

export type StatusMidia = "enviando" | "processando" | "pronta" | "erro";

export type Miniaturas = {
  total: number;
  colunas: number;
  linhas: number;
  intervalo: number;
  largura: number;
  altura: number;
};

export type Midia = {
  id: string;
  nome: string;
  nome_original: string;
  status: StatusMidia;
  tamanho_total: number;
  bytes_recebidos: number;
  duracao: number | null;
  /** transparente: só nas imagens paradas (PNG ou WebP com fundo transparente). */
  video: { codec: string; largura: number; altura: number; fps: number | null; rotacao: number; transparente?: boolean } | null;
  /** lufs: loudness medido na ingestão (falta nas mídias enviadas antes da medição). */
  audio: { codec: string; canais: number; taxa: number; lufs?: number | null } | null;
  miniaturas: Miniaturas | null;
  /** Imagem parada (JPG, PNG, WebP): sem duração e sem som; proxy.webp para a prévia. */
  imagem?: boolean;
  arquivos: string[];
  erro: string | null;
  processamento: { status: StatusJob; progresso: number; mensagem: string } | null;
  /** A voz sem ruído (worker de CPU); null se nunca foi pedida. O progresso vem dos eventos do job. */
  voz_limpa: { status: "processando" | "pronta" | "erro"; erro: string | null; progresso?: number } | null;
  /** A imagem sem ruído (limpo.mp4 para o render, limpo_proxy.mp4 para a prévia). */
  imagem_limpa?: { status: "processando" | "pronta" | "erro"; erro: string | null; progresso?: number } | null;
  /** A máscara da pessoa em cada quadro (recorte do fundo). */
  recorte_fundo?: { status: "processando" | "pronta" | "erro"; erro: string | null; progresso?: number } | null;
  /** A imagem estável, por chave (estavel, estavel_limpo sobre a imagem sem ruído). */
  estabilizacoes?: Record<string, { status: "processando" | "pronta" | "erro"; erro: string | null }>;
  /** A voz em outro tom, por chave (tom_p3, tom_m2_limpa). */
  tons?: Record<string, { status: "processando" | "pronta" | "erro"; erro: string | null }>;
  /** Forma desenhada (lib/elementos.ts): o pedido que a gerou. Não aparece na biblioteca. */
  elemento?: PedidoDeForma | null;
  /** Vídeo gerado com IA (Wan 2.2): o pedido que o gerou. */
  gerada?: { descricao: string; formato: string; duracao: number; imagem_id?: string | null } | null;
  /** Animação em HTML gravada pelo worker (traz a transparência em mascara.mp4). */
  animacao?: { modelo: string; campos: Record<string, string>; proporcao: string; duracao: number } | null;
  criado_em: string;
  atualizado_em: string;
  enviado_em: string | null;
};

export type ProjetoResumo = {
  id: string;
  nome: string;
  proporcao: string;
  /** Em ticks (lib/tempo.ts). */
  duracao: number;
  capa_midia_id: string | null;
  atualizado_em: string;
};

export type Worker = {
  id: string;
  recursos: string[];
  tipos: string[];
  iniciado_em: string | null;
  visto_em: string;
};

export type Sistema = {
  mongo: boolean;
  modo_ia: string;
  workers: Worker[];
};

export type Exportacao = {
  id: string;
  projeto_id: string;
  nome: string;
  resolucao: "720p" | "1080p" | "4k";
  largura: number;
  altura: number;
  status: "processando" | "pronta" | "erro";
  arquivos: string[];
  tamanho: number | null;
  duracao: number | null;
  erro: string | null;
  processamento: { status: StatusJob; progresso: number; mensagem: string } | null;
  criado_em: string;
  concluido_em: string | null;
};

export type LinkCelular = { caminho: string; expira_em: string };

export type IdiomaTranscricao = "auto" | "pt" | "en" | "es";

/** A fala de uma mídia, com o tempo de cada palavra em segundos da mídia (worker de GPU). */
export type Transcricao = {
  midia_id: string;
  status: "processando" | "pronta" | "erro";
  idioma: string;
  palavras: { texto: string; inicio: number; fim: number }[];
  erro: string | null;
  processamento: { status: StatusJob; progresso: number; mensagem: string } | null;
};
