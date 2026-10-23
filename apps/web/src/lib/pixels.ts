// Camadas de pixels do editor de imagem (api/rotas/pixels.py, ADR 0003, decisão 2): a camada é uma mídia fora da
// biblioteca, e cada versão é um PNG que sobe em partes de 8 MB (o proxy do Next corta o corpo em 10 MB).
import { chamarApi, ErroApi, mensagemPadrao } from "./api";
import type { Midia } from "./tipos";

/** O tamanho de cada parte do envio, o mesmo da API (core/utils/pixels.py). */
export const BYTES_DA_PARTE = 8 * 1024 * 1024;
const TENTATIVAS = 3;

/** A mídia é uma camada de pixels (fica fora da biblioteca, como as formas). */
export function ehCamadaDePixels(midia: Midia | null | undefined): boolean {
  return Boolean(midia?.camada_pixels);
}

/** O arquivo de uma versão (a 0 é a camada vazia, sem arquivo). */
export function arquivoDaVersao(versao: number): string {
  return `v${versao}.png`;
}

export function criarCamadaDePixels(largura: number, altura: number, nome?: string): Promise<Midia> {
  return chamarApi<Midia>("/camadas-pixels", { metodo: "POST", corpo: { largura, altura, ...(nome ? { nome } : {}) } });
}

function idDoEnvio(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Sobe o PNG de uma versão nova e devolve o número dela. Cada parte tenta de novo até três vezes (repetir uma parte
 * já recebida não estraga o envio).
 */
export async function enviarVersao(midiaId: string, png: Blob): Promise<number> {
  const envio = idDoEnvio();
  const total = Math.max(1, Math.ceil(png.size / BYTES_DA_PARTE));
  for (let parte = 0; parte < total; parte++) {
    const corpo = png.slice(parte * BYTES_DA_PARTE, (parte + 1) * BYTES_DA_PARTE);
    for (let tentativa = 1; ; tentativa++) {
      let resposta: Response;
      try {
        resposta = await fetch(`/api/midias/${midiaId}/pixels?envio=${envio}&parte=${parte}&total=${total}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: corpo,
          credentials: "same-origin",
        });
      } catch {
        if (tentativa < TENTATIVAS) continue;
        throw new ErroApi(0, "Sem conexão com o servidor. A pintura continua aqui; tente de novo.");
      }
      const dados = await resposta.json().catch(() => null);
      if (resposta.ok) {
        if (parte === total - 1) return dados.versao as number;
        break;
      }
      // Erro do servidor tenta de novo; o resto (tamanho errado, PNG estragado) não vai melhorar
      if (resposta.status >= 500 && tentativa < TENTATIVAS) continue;
      throw new ErroApi(resposta.status, typeof dados?.detail === "string" ? dados.detail : mensagemPadrao(resposta.status));
    }
  }
  throw new ErroApi(0, "O envio da camada não terminou.");
}
