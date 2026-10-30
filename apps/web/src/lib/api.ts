// Cliente da API. Tudo passa por /api no mesmo endereço do site,
// então o cookie de sessão vai junto sem configuração extra. Fora do navegador (a montagem dos cortes no
// worker, ADR 0004), configurarApi dá o endereço da API e a chave de acesso.

export class ErroApi extends Error {
  status: number;

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
    this.name = "ErroApi";
  }
}

type Opcoes = {
  metodo?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  corpo?: unknown;
};

export function mensagemPadrao(status: number): string {
  if (status >= 500) {
    return "O servidor do TakeOne está fora do ar no momento. Tente de novo em alguns minutos.";
  }
  if (status === 401) return "Faça login para continuar.";
  if (status === 404) return "Não encontrado.";
  return "Algo deu errado. Tente de novo.";
}

let enderecoDaApi = "";
let cabecalhosFixos: Record<string, string> = {};

/** Fora do navegador: o endereço da API (como "http://api:8000") e a chave de acesso que vai em cada pedido. */
export function configurarApi(opcoes: { endereco: string; chave: string }) {
  enderecoDaApi = opcoes.endereco.replace(/\/+$/, "");
  cabecalhosFixos = { Authorization: `Bearer ${opcoes.chave}` };
}

export async function chamarApi<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const temCorpo = opcoes.corpo !== undefined;
  let resposta: Response;
  try {
    resposta = await fetch(`${enderecoDaApi}/api${caminho}`, {
      method: opcoes.metodo ?? "GET",
      headers: { ...cabecalhosFixos, ...(temCorpo ? { "Content-Type": "application/json" } : {}) },
      body: temCorpo ? JSON.stringify(opcoes.corpo) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ErroApi(0, "Sem conexão com o servidor. Verifique sua internet.");
  }

  if (resposta.status === 204) return undefined as T;
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const detalhe = typeof dados?.detail === "string" ? dados.detail : mensagemPadrao(resposta.status);
    throw new ErroApi(resposta.status, detalhe);
  }
  return dados as T;
}

/**
 * Aceita só caminhos internos, para o parâmetro ?proximo= não virar redirecionamento para fora. O
 * caminho é lido como o navegador lê: "/\site" e "/<tab>/site" viram "//site", outro endereço.
 */
export function destinoSeguro(proximo: string | null, padrao = "/app"): string {
  if (!proximo || !proximo.startsWith("/")) return padrao;
  const base = "https://takeone.invalid";
  try {
    const url = new URL(proximo, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : padrao;
  } catch {
    return padrao;
  }
}

/** Endereço de um arquivo gerado pela ingestão (cópia leve, capa, miniaturas, forma de onda). */
export function arquivoDaMidia(midiaId: string, nome: string): string {
  return `/api/midias/${midiaId}/arquivos/${nome}`;
}
