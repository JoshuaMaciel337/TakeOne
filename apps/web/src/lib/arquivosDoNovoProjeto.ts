"use client";

// Criar um projeto soltando arquivos (ADR 0007, 17.7): a página guarda os arquivos aqui, cria o projeto na proporção
// da primeira mídia e abre o editor, que os envia e põe na linha do tempo conforme ficam prontos. Fica na memória da
// aba (a navegação do Next não recarrega a página).
import { PROPORCOES, type Proporcao } from "./projeto/modelo.ts";

const guardados = new Map<string, File[]>();

export function guardarArquivos(projetoId: string, arquivos: File[]) {
  guardados.set(projetoId, arquivos);
}

/** Os arquivos esperando o editor deste projeto (uma vez só). */
export function pegarArquivos(projetoId: string): File[] {
  const arquivos = guardados.get(projetoId) ?? [];
  guardados.delete(projetoId);
  return arquivos;
}

/** A proporção pronta mais perto de largura ÷ altura (na escala do logaritmo, para 9:16 e 16:9 pesarem igual). */
export function proporcaoMaisPerto(largura: number, altura: number): Proporcao {
  const alvo = Math.log(largura / altura);
  let melhor: Proporcao = "16:9";
  let distancia = Number.POSITIVE_INFINITY;
  for (const proporcao of PROPORCOES) {
    const [l, a] = proporcao.split(":").map(Number);
    const d = Math.abs(Math.log(l / a) - alvo);
    if (d < distancia) {
      distancia = d;
      melhor = proporcao;
    }
  }
  return melhor;
}

/** A proporção da primeira foto ou vídeo entre os arquivos (o navegador lê só o cabeçalho). Sem nenhuma, 9:16. */
export async function proporcaoDosArquivos(arquivos: File[]): Promise<Proporcao> {
  for (const arquivo of arquivos) {
    try {
      if (arquivo.type.startsWith("image/")) {
        const bitmap = await createImageBitmap(arquivo);
        const proporcao = proporcaoMaisPerto(bitmap.width, bitmap.height);
        bitmap.close();
        return proporcao;
      }
      if (arquivo.type.startsWith("video/")) {
        const url = URL.createObjectURL(arquivo);
        try {
          const tamanho = await new Promise<[number, number]>((pronto, falhou) => {
            const video = document.createElement("video");
            video.preload = "metadata";
            video.onloadedmetadata = () => pronto([video.videoWidth, video.videoHeight]);
            video.onerror = () => falhou(new Error("vídeo"));
            video.src = url;
          });
          if (tamanho[0] && tamanho[1]) return proporcaoMaisPerto(tamanho[0], tamanho[1]);
        } finally {
          URL.revokeObjectURL(url);
        }
      }
    } catch {
      // Um arquivo que o navegador não lê não decide a proporção
    }
  }
  return "9:16";
}
