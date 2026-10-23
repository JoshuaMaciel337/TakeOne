"use client";

// Exportação do editor de imagem, no navegador: o mesmo compositor da prévia, num canvas do tamanho final, com as
// fotos em resolução cheia (imagem.png) e os textos desenhados para esse tamanho. A prévia e o arquivo saem da
// mesma conta; muda só a nitidez das fontes (a prévia lê as cópias leves).
import { arquivoDaMidia } from "@/lib/api";
import { tamanhoDaImagem } from "@/lib/projeto/imagem";
import type { Projeto } from "@/lib/projeto/modelo";
import type { Midia } from "@/lib/tipos";

import { carregarBitmap } from "../previa/bitmaps";
import { camadaDoCompositor, camadasDaImagem, textosParaImagens } from "../previa/camadas";
import { Compositor } from "../previa/compositor";
import { type ImagemDeTexto, imagemDeTextoNoLado } from "../previa/imagensDeTexto";

export type FormatoDaImagem = "png" | "jpeg" | "webp";

export const FORMATOS_DA_IMAGEM: { id: FormatoDaImagem; nome: string; transparencia: boolean }[] = [
  { id: "png", nome: "PNG (sem perda)", transparencia: true },
  { id: "jpeg", nome: "JPG (menor)", transparencia: false },
  { id: "webp", nome: "WebP (menor, com transparência)", transparencia: true },
];

/** A máscara do fundo de uma foto, quando o recorte está ligado e já pronto. */
export function arquivoDaMascaraDaImagem(midia: Midia | undefined): string | null {
  return midia?.arquivos.includes("mascara.png") ? arquivoDaMidia(midia.id, "mascara.png") : null;
}

/**
 * O arquivo da imagem. `escala` multiplica o tamanho do projeto (0,5 a 2); `qualidade` vale no JPG e no WebP.
 * Sem fundo, o JPG (que não tem transparência) sai com fundo branco.
 */
export async function exportarImagem(
  projeto: Projeto,
  midias: ReadonlyMap<string, Midia>,
  { formato, qualidade = 0.92, escala = 1 }: { formato: FormatoDaImagem; qualidade?: number; escala?: number },
): Promise<Blob> {
  const base = tamanhoDaImagem(projeto);
  const tamanho = { largura: Math.round(base.largura * escala), altura: Math.round(base.altura * escala) };
  const transparente = Boolean(projeto.fundo.transparente) && formato !== "jpeg";
  const fundo = projeto.fundo.transparente ? (transparente ? null : "#ffffff") : projeto.fundo.cor;

  const imagensDeTexto = new Map<string, ImagemDeTexto>();
  const ladoMenor = Math.min(tamanho.largura, tamanho.altura);
  await Promise.all(textosParaImagens(projeto).map(async ({ id, texto }) => imagensDeTexto.set(id, await imagemDeTextoNoLado(texto, ladoMenor))));
  const camadas = camadasDaImagem(projeto, midias, tamanho, imagensDeTexto);

  const prontas = await Promise.all(
    camadas.map(async (camada) => {
      if (camada.imagem) return camadaDoCompositor(camada, camada.imagem, null);
      const midia = midias.get(camada.clipe.midia_id!)!;
      // A de resolução cheia; a cópia leve só se ela não existir (mídia antiga)
      const fonte = await carregarBitmap(arquivoDaMidia(midia.id, "imagem.png")).catch(() => carregarBitmap(arquivoDaMidia(midia.id, "proxy.webp")));
      const mascara = camada.clipe.remover_fundo ? arquivoDaMascaraDaImagem(midia) : null;
      return camadaDoCompositor(camada, fonte, mascara ? await carregarBitmap(mascara) : null);
    }),
  );

  const canvas = document.createElement("canvas");
  canvas.width = tamanho.largura;
  canvas.height = tamanho.altura;
  const compositor = new Compositor(canvas, { comAlfa: transparente });
  try {
    compositor.desenhar(prontas, fundo, tamanho, tamanho);
    // O primeiro desenho de uma textura recém-criada pode sair sem o mipmap (como na exportação do vídeo)
    compositor.desenhar(prontas, fundo, tamanho, tamanho);
    return await new Promise<Blob>((pronto, falhou) =>
      canvas.toBlob((blob) => (blob ? pronto(blob) : falhou(new Error("O navegador não conseguiu gerar a imagem."))), `image/${formato}`, qualidade),
    );
  } finally {
    compositor.destruir();
  }
}
