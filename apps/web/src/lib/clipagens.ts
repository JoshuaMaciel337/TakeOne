// O Clipar (ADR 0004): as opções da clipagem, os cortes achados e as contas da página (o tempo estimado).
import { chamarApi } from "./api.ts";
import type { PlanoDaEdicao } from "./clipar/pedidoDeEdicao.ts";
import { lerLegendas, lerTextoDeLegenda } from "./projeto/legendas.ts";
import { TICKS_POR_SEGUNDO } from "./tempo.ts";

export type Faixa = "auto" | "curto" | "medio" | "longo" | "extra" | "muito_longo";
export type IdEstrategia = "ganchos" | "historias" | "ideia" | "dicas" | "humor" | "pregacao" | "propria";

export type OpcoesDaClipagem = {
  estrategia: IdEstrategia;
  instrucoes: string;
  genero: string;
  faixa: Faixa;
  inicio: number;
  fim: number | null;
  idioma: "auto" | "pt" | "en" | "es";
  momentos: string;
  /** Como a pessoa quer a edição dos cortes, nas palavras dela. */
  edicao: string;
  formato: "9:16" | "1:1" | "4:5" | "16:9";
  maximo: number | null;
  /** O estilo da legenda animada dos cortes (ESTILOS_ANIMADOS); null: as legendas de sempre. */
  legenda_animada: string | null;
  /** O modelo de edição dos cortes: "pregacao" (lib/clipar/modeloDePregacao.ts) ou nenhum. */
  modelo_edicao: "nenhum" | "pregacao";
};

export const OPCOES_PADRAO: OpcoesDaClipagem = {
  estrategia: "ganchos",
  instrucoes: "",
  genero: "auto",
  faixa: "auto",
  inicio: 0,
  fim: null,
  idioma: "auto",
  momentos: "",
  edicao: "",
  formato: "9:16",
  maximo: null,
  legenda_animada: null,
  modelo_edicao: "nenhum",
};

export const FAIXAS: { id: Faixa; nome: string; segundos: [number, number] }[] = [
  { id: "auto", nome: "Pela estratégia", segundos: [20, 90] },
  { id: "curto", nome: "Menos de 30 s", segundos: [15, 30] },
  { id: "medio", nome: "30 s a 1 min", segundos: [30, 60] },
  { id: "longo", nome: "1 a 1,5 min", segundos: [60, 90] },
  { id: "extra", nome: "1,5 a 3 min", segundos: [90, 180] },
  { id: "muito_longo", nome: "3 a 5 min", segundos: [180, 300] },
];

export const GENEROS: { id: string; nome: string }[] = [
  { id: "auto", nome: "Descobrir sozinho" },
  { id: "podcast", nome: "Podcast" },
  { id: "entrevista", nome: "Entrevista" },
  { id: "palestra", nome: "Palestra" },
  { id: "aula", nome: "Aula ou curso" },
  { id: "pregação", nome: "Pregação" },
  { id: "vlog", nome: "Vlog" },
  { id: "comentário", nome: "Comentário" },
  { id: "notícia", nome: "Notícia" },
  { id: "tutorial", nome: "Tutorial" },
  { id: "humor", nome: "Humor" },
  { id: "esporte", nome: "Esporte" },
  { id: "jogo", nome: "Jogo" },
  { id: "outro", nome: "Outro" },
];

export const CATEGORIAS: Record<string, string> = {
  historia: "História",
  dica: "Dica",
  opiniao: "Opinião forte",
  revelacao: "Revelação",
  humor: "Humor",
  explicacao: "Explicação",
  emocao: "Momento emocionante",
  polemica: "Polêmica",
};

export const CRITERIOS: { id: "gancho" | "fluxo" | "valor" | "autonomia"; nome: string; dica: string }[] = [
  { id: "gancho", nome: "Gancho", dica: "Os primeiros segundos prendem?" },
  { id: "fluxo", nome: "Fluxo", dica: "Começa e termina no lugar certo, sem cortar a ideia?" },
  { id: "valor", nome: "Valor", dica: "Ensina, emociona ou diverte?" },
  { id: "autonomia", nome: "Autonomia", dica: "Quem não viu o vídeo entende?" },
];

export type Estrategia = { id: IdEstrategia; nome: string; faixa: Faixa; descricao: string };

export type Corte = {
  id: string;
  trechos: { inicio: number; fim: number }[];
  duracao: number;
  titulo: string;
  foco: string[];
  resumo: string;
  categoria: string;
  /** null na parte 2: o modelo não avaliou a continuação. */
  notas: Record<"gancho" | "fluxo" | "valor" | "autonomia", number> | null;
  motivos: Record<"gancho" | "fluxo" | "valor" | "autonomia", string> | null;
  medidas?: { ritmo?: number };
  nota: number | null;
  propaganda: boolean;
  /** O texto falado no corte (a busca da lista). */
  texto?: string;
  /** Os outros cortes que dividem um pedaço do tempo ou do texto com este. */
  parecidos?: string[];
  /** A parte 2: o corte que este continua. */
  parte_de?: string | null;
  /** A cópia: o corte de que ela saiu. */
  copia_de?: string | null;
  avaliacao?: "gostei" | "nao_gostei" | null;
  /** O começo (segundos da mídia) das palavras de ênfase, que a montagem pinta nas legendas. */
  enfase?: number[];
  /** O projeto em que o corte foi montado (abrir de novo vai a ele). */
  projeto_id?: string | null;
};

export type Clipagem = {
  id: string;
  midia_id: string;
  nome: string;
  duracao: number;
  opcoes: OpcoesDaClipagem;
  fala: "transcricao" | "legendas";
  status: "processando" | "pronta" | "erro";
  erro: string | null;
  andamento: { etapa: "transcricao" | "cortes"; progresso: number; mensagem: string } | null;
  /** O "Como quer a edição" em plano, que a montagem de todos os cortes segue. */
  plano_da_edicao: PlanoDaEdicao | null;
  cortes: Corte[];
  total_de_cortes: number;
  criado_em: string;
  atualizado_em: string;
};

export const listarEstrategias = () => chamarApi<Estrategia[]>("/clipagens/estrategias");
/** Quantos pedidos estão na frente na placa de vídeo (de qualquer espaço: a placa é uma só). */
export const filaDaPlaca = () => chamarApi<{ na_frente: number }>("/clipagens/fila");
/** Uma legenda do .srt da pessoa, em segundos da mídia. */
export type LegendaDaFala = { inicio: number; fim: number; texto: string };

export const pedirClipagem = (midiaId: string, opcoes: OpcoesDaClipagem, legendas?: LegendaDaFala[] | null) =>
  chamarApi<Clipagem>("/clipagens", { metodo: "POST", corpo: { midia_id: midiaId, opcoes, legendas: legendas ?? null } });
export const falaDaClipagem = (id: string, de: number, ate: number) =>
  chamarApi<{ texto: string; inicio: number; fim: number }[]>(`/clipagens/${id}/fala?de=${de}&ate=${ate}`);

/** A estratégia guardada no espaço (os recursos do tipo "estrategia"). */
export type EstrategiaDoEspaco = { instrucoes: string; faixa: Faixa };

/** O .srt ou .vtt da pessoa, em qualquer codificação, em legendas de segundos (no máximo 20 mil, o limite da API). */
export function legendasDoArquivo(bytes: Uint8Array): LegendaDaFala[] {
  return lerLegendas(lerTextoDeLegenda(bytes))
    .slice(0, 20000)
    .map((legenda) => ({
      inicio: legenda.inicio / TICKS_POR_SEGUNDO,
      fim: legenda.fim / TICKS_POR_SEGUNDO,
      texto: legenda.conteudo.replace(/\s+/g, " ").slice(0, 1000),
    }));
}

/**
 * A forma de onda da página de opções: o pico de cada coluna, de 0 a 1, pelos níveis da ingestão (o pico em dB a
 * cada 10 ms). De -60 dB (0) a 0 dB (1), que é a faixa em que a fala aparece.
 */
export function picosDaOnda(niveis: Int8Array, colunas: number): number[] {
  const picos: number[] = [];
  for (let coluna = 0; coluna < colunas; coluna++) {
    const de = Math.floor((coluna * niveis.length) / colunas);
    const ate = Math.max(de + 1, Math.floor(((coluna + 1) * niveis.length) / colunas));
    let maior = -127;
    for (let i = de; i < ate && i < niveis.length; i++) maior = Math.max(maior, niveis[i]);
    picos.push(Math.min(1, Math.max(0, (maior + 60) / 60)));
  }
  return picos;
}
export const listarClipagens = (midiaId?: string) => chamarApi<Clipagem[]>(`/clipagens${midiaId ? `?midia_id=${midiaId}` : ""}`);
export const verClipagem = (id: string) => chamarApi<Clipagem>(`/clipagens/${id}`);
export const excluirClipagem = (id: string) => chamarApi<void>(`/clipagens/${id}`, { metodo: "DELETE" });
export const avaliarCorte = (id: string, corteId: string, avaliacao: Corte["avaliacao"]) =>
  chamarApi<Clipagem>(`/clipagens/${id}/cortes/${corteId}/avaliacao`, { metodo: "PUT", corpo: { avaliacao } });
/** A cópia do corte, logo depois dele (para montar o mesmo trecho com outra edição). */
export const duplicarCorte = (id: string, corteId: string) => chamarApi<Clipagem>(`/clipagens/${id}/cortes/${corteId}/copia`, { metodo: "POST" });
/** A parte 2: as frases logo depois do corte, na faixa pedida. */
export const continuarCorte = (id: string, corteId: string) => chamarApi<Clipagem>(`/clipagens/${id}/cortes/${corteId}/continuacao`, { metodo: "POST" });
export const apagarCorte = (id: string, corteId: string) => chamarApi<Clipagem>(`/clipagens/${id}/cortes/${corteId}`, { metodo: "DELETE" });

/**
 * Quanto a clipagem deve levar, em segundos, pelas medidas do Nitro (TEDx de 10 min, 26/10/2026): a transcrição
 * com o Whisper subindo (92 s para 10 min), o Qwen3 subindo na placa (uns 130 s), uns 30 s por janela de 4 min
 * (que andam de 3 em 3 min) e as palavras de ênfase dos cortes no fim.
 */
export function tempoEstimado(segundosAnalisados: number, transcrito: boolean): number {
  const transcricao = transcrito ? 0 : 45 + segundosAnalisados / 12;
  const janelas = Math.max(1, Math.ceil(Math.max(0, segundosAnalisados - 60) / 180));
  return Math.round(transcricao + 15 + 130 + janelas * 30 + 30);
}

/** "uns 3 min", "menos de 1 min". */
export function tempoLegivel(segundos: number): string {
  if (segundos < 60) return "menos de 1 min";
  return `uns ${Math.round(segundos / 60)} min`;
}

/** O título com as palavras de foco marcadas, em pedaços: [{texto, foco}]. */
export function pedacosDoTitulo(titulo: string, foco: string[]): { texto: string; foco: boolean }[] {
  const alvos = foco.map((palavra) => palavra.trim()).filter(Boolean);
  if (!alvos.length) return [{ texto: titulo, foco: false }];
  const escapados = alvos.map((palavra) => palavra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const partes = titulo.split(new RegExp(`(${escapados.join("|")})`, "i"));
  return partes.filter(Boolean).map((texto) => ({ texto, foco: alvos.some((alvo) => alvo.toLowerCase() === texto.toLowerCase()) }));
}

/** A ordem da lista: pela nota (o padrão), pela ordem do vídeo, pelos mais longos ou pelos mais curtos. */
export type Ordem = "nota" | "video" | "longos" | "curtos";
export function ordenarCortes(cortes: Corte[], ordem: Ordem): Corte[] {
  const copia = [...cortes];
  if (ordem === "video") return copia.sort((a, b) => a.trechos[0].inicio - b.trechos[0].inicio);
  if (ordem === "longos") return copia.sort((a, b) => b.duracao - a.duracao);
  if (ordem === "curtos") return copia.sort((a, b) => a.duracao - b.duracao);
  // A parte 2 (sem nota) vem logo depois do corte que ela continua
  const porId = new Map(cortes.map((corte) => [corte.id, corte]));
  const chave = (corte: Corte, profundidade = 0): [number, number] => {
    if (corte.nota !== null) return [corte.nota, profundidade];
    const pai = corte.parte_de ? porId.get(corte.parte_de) : undefined;
    return pai && profundidade < 50 ? chave(pai, profundidade + 1) : [-1, profundidade];
  };
  return copia.sort((a, b) => {
    const [na, pa] = chave(a);
    const [nb, pb] = chave(b);
    return nb - na || pa - pb || a.trechos[0].inicio - b.trechos[0].inicio;
  });
}
