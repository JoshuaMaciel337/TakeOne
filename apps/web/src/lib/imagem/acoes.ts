// As Ações do editor de imagem (ADR 0003, onda 13.15): gravar os comandos que a pessoa faz e tocá-los de novo, em
// outro documento ou noutra camada. Cada passo guarda o comando e as camadas escolhidas antes e depois dele; ao tocar,
// as camadas da gravação viram as camadas da vez (a escolhida no começo vira a escolhida agora, a criada por um passo
// vira a que o mesmo passo criou), e os ids que aparecem no comando são trocados. Os passos que só trocam os pixels de
// uma camada por uma versão já pintada (o pincel, os filtros nos pixels) não são gravados, como os traços lá.
import type { Comando } from "../projeto/comandos.ts";
import type { AjusteDaImagem } from "./ajustes.ts";
import type { ModoDeCor } from "./modos.ts";

export type CamadasEscolhidas = { clipes: string[]; faixas: string[] };

export type PassoDaAcao =
  | { tipo: "comando"; nome: string; comando: Comando; antes: CamadasEscolhidas; depois: CamadasEscolhidas; ligado: boolean }
  | { tipo: "parada"; mensagem: string; continuar: boolean; ligado: boolean };

/** A tecla de função que toca a ação (F2 a F12, com Shift ou Ctrl). */
export type TeclaDaAcao = { tecla: string; shift: boolean; ctrl: boolean };

export type Acao = { id: string; nome: string; passos: PassoDaAcao[]; tecla?: TeclaDaAcao | null; cor?: string | null };
export type ConjuntoDeAcoes = { id: string; nome: string; acoes: Acao[] };

// As que o navegador deixa a página pegar e que o editor não usa (F5 é o painel do pincel, F8 as informações, Ctrl+F6
// troca de documento)
export const TECLAS_DAS_ACOES = ["F2", "F3", "F4", "F9", "F10"];
export const CORES_DAS_ACOES = [
  { id: "", nome: "Nenhuma" },
  { id: "#ff453a", nome: "Vermelho" },
  { id: "#ff9f0a", nome: "Laranja" },
  { id: "#ffd60a", nome: "Amarelo" },
  { id: "#32d74b", nome: "Verde" },
  { id: "#0a84ff", nome: "Azul" },
  { id: "#bf5af2", nome: "Violeta" },
  { id: "#8e8e93", nome: "Cinza" },
];

/** Os comandos que não entram na gravação: trocam pixels por uma versão pronta, ou restauram um estado inteiro. */
const FORA_DA_GRAVACAO = new Set<Comando["comando"]>(["camada.pixels", "imagem.substituirPorPixels", "imagem.retificar", "imagem.alinhar", "imagem.tamanhoComPixels", "projeto.restaurar"]);

export function gravavel(comando: Comando): boolean {
  if (FORA_DA_GRAVACAO.has(comando.comando)) return false;
  if (comando.comando === "canal.mudar" && comando.parametros.mudanca.versao !== undefined) return false;
  if (comando.comando === "imagem.adicionarPixels" && comando.parametros.versao) return false;
  if (comando.comando === "imagem.cortar" && comando.parametros.pixels?.length) return false;
  return true;
}

/** Troca, em qualquer lugar do comando, os textos que são ids da gravação pelos ids da vez. */
export function trocarIds<T>(valor: T, mapa: ReadonlyMap<string, string>): T {
  if (!mapa.size) return valor;
  const trocar = (v: unknown): unknown => {
    if (typeof v === "string") return mapa.get(v) ?? v;
    if (Array.isArray(v)) return v.map(trocar);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, w]) => [mapa.get(k) ?? k, trocar(w)]));
    return v;
  };
  return trocar(valor) as T;
}

/** Junta ao mapa os pares (gravado → da vez), na ordem; os que já estão ligados ficam. */
export function ligarCamadas(mapa: Map<string, string>, gravadas: CamadasEscolhidas, daVez: CamadasEscolhidas) {
  gravadas.clipes.forEach((id, i) => daVez.clipes[i] && id !== daVez.clipes[i] && mapa.set(id, daVez.clipes[i]));
  gravadas.faixas.forEach((id, i) => daVez.faixas[i] && id !== daVez.faixas[i] && mapa.set(id, daVez.faixas[i]));
}

/** Um passo novo da gravação. */
export function passoGravado(comando: Comando, nome: string, antes: CamadasEscolhidas, depois: CamadasEscolhidas): PassoDaAcao {
  return { tipo: "comando", nome, comando: JSON.parse(JSON.stringify(comando)) as Comando, antes, depois, ligado: true };
}

export function nomeDoPasso(passo: PassoDaAcao): string {
  return passo.tipo === "parada" ? `Parar: ${passo.mensagem || "(sem mensagem)"}` : passo.nome;
}

/** A tecla do evento como a das ações, ou null. */
export function teclaDoEventoDaAcao(evento: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): TeclaDaAcao | null {
  if (evento.altKey || !TECLAS_DAS_ACOES.includes(evento.key)) return null;
  return { tecla: evento.key, shift: evento.shiftKey, ctrl: evento.ctrlKey || evento.metaKey };
}

export const mesmaTecla = (a: TeclaDaAcao | null | undefined, b: TeclaDaAcao | null | undefined) => Boolean(a && b && a.tecla === b.tecla && a.shift === b.shift && a.ctrl === b.ctrl);

export function textoDaTecla(tecla: TeclaDaAcao | null | undefined): string {
  return tecla ? [tecla.ctrl ? "Ctrl" : "", tecla.shift ? "Shift" : "", tecla.tecla].filter(Boolean).join("+") : "";
}

// ——— Salvar e carregar (um arquivo .json do TakeOne; o formato de lá é fechado) ———
const FORMATO = "takeone-acoes";

export function arquivoDoConjunto(conjunto: ConjuntoDeAcoes): string {
  return JSON.stringify({ formato: FORMATO, versao: 1, nome: conjunto.nome, acoes: conjunto.acoes }, null, 1);
}

/** O conjunto de um arquivo salvo, conferido; os ids das ações são refeitos (o arquivo pode vir de outro espaço). */
export function conjuntoDoArquivo(texto: string, novoId: () => string): { nome: string; acoes: Acao[] } {
  let lido: unknown;
  try {
    lido = JSON.parse(texto);
  } catch {
    throw new Error("O arquivo não é um conjunto de ações do TakeOne.");
  }
  const dados = lido as { formato?: unknown; nome?: unknown; acoes?: unknown };
  if (!dados || dados.formato !== FORMATO || !Array.isArray(dados.acoes)) throw new Error("O arquivo não é um conjunto de ações do TakeOne.");
  const acoes = dados.acoes.map((acao: Partial<Acao>): Acao => {
    if (!acao || typeof acao.nome !== "string" || !Array.isArray(acao.passos)) throw new Error("Uma ação do arquivo veio estragada.");
    const passos = acao.passos.filter((passo): passo is PassoDaAcao => Boolean(passo) && (passo.tipo === "parada" ? typeof passo.mensagem === "string" : passo.tipo === "comando" && typeof passo.comando?.comando === "string"));
    return { id: novoId(), nome: acao.nome.slice(0, 80) || "Ação", passos, tecla: null, cor: typeof acao.cor === "string" ? acao.cor : null };
  });
  return { nome: (typeof dados.nome === "string" && dados.nome.trim().slice(0, 80)) || "Ações carregadas", acoes };
}

/**
 * A ação no Lote, que trabalha nos pixels de cada imagem: valem as camadas de ajuste que ela cria (com o ajuste
 * final de cada uma, depois dos passos que o mudam) e o modo de cor; os outros passos são pulados.
 */
export function ajustesDaAcao(acao: Acao): { ajustes: AjusteDaImagem[]; modo: ModoDeCor | null; pulados: number } {
  const criados: { clipe: string | null; ajuste: AjusteDaImagem }[] = [];
  let modo: ModoDeCor | null = null;
  let pulados = 0;
  for (const passo of acao.passos) {
    if (!passo.ligado || passo.tipo === "parada") continue;
    const { comando } = passo;
    if (comando.comando === "imagem.adicionarAjuste" && comando.parametros.ajuste) criados.push({ clipe: passo.depois.clipes[0] ?? null, ajuste: comando.parametros.ajuste });
    else if (comando.comando === "imagem.ajuste" && criados.some((c) => c.clipe === comando.parametros.clipeId)) {
      const alvo = criados.find((c) => c.clipe === comando.parametros.clipeId)!;
      alvo.ajuste = comando.parametros.ajuste;
    } else if (comando.comando === "imagem.modo") modo = comando.parametros.modo;
    else pulados++;
  }
  return { ajustes: criados.map((c) => c.ajuste), modo, pulados };
}
