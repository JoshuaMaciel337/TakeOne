"use client";

// Exportação do editor de imagem, no navegador: o mesmo compositor da prévia, num canvas do tamanho final, com as
// fotos em resolução cheia (imagem.png) e os textos desenhados para esse tamanho. A prévia e o arquivo saem da
// mesma conta; muda só a nitidez das fontes (a prévia lê as cópias leves).
import { arquivoDaMidia } from "@/lib/api";
import { tamanhoDaImagem } from "@/lib/projeto/imagem";
import type { Clipe, Projeto } from "@/lib/projeto/modelo";
import { arquivoDaVersao } from "@/lib/pixels";
import type { Midia } from "@/lib/tipos";

import { vetorNoTamanho } from "../vetor/desenhar";
import { preenchimentoNoTamanho } from "../imagem/desenharPreenchimento";
import { mascaraFinal } from "../previa/mascaraCombinada";
import { textoNoTamanho } from "../texto/desenhar";
import { esperarFontes } from "../texto/fontes";
import { carregarBitmap } from "../previa/bitmaps";
import { camadaDoCompositor, documentoDaCamada, camadasDaImagem, camadasEmArvore, textosParaImagens } from "../previa/camadas";
import { Compositor, FUNDO } from "../previa/compositor";
import { type ImagemDeTexto, imagemDeTextoNoLado, soltarImagensDeTexto } from "../previa/imagensDeTexto";

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

/** A foto em resolução cheia; a cópia leve só se ela não existir (mídia antiga). */
function fonteDaMidia(midia: Midia): Promise<ImageBitmap> {
  return carregarBitmap(arquivoDaMidia(midia.id, "imagem.png")).catch(() => carregarBitmap(arquivoDaMidia(midia.id, "proxy.webp")));
}

/**
 * O arquivo da imagem. `escala` multiplica o tamanho do projeto (0,5 a 2); `qualidade` vale no JPG e no WebP.
 * Sem fundo, o JPG (que não tem transparência) sai com fundo branco. `fonteDa` troca de onde vem cada imagem
 * (a miniatura de um modelo, que ainda não tem mídias, usa as formas desenhadas na hora).
 */
export async function exportarImagem(
  projeto: Projeto,
  midias: ReadonlyMap<string, Midia>,
  {
    formato,
    qualidade = 0.92,
    escala = 1,
    fonteDa = fonteDaMidia,
    fonteDosPixels,
    fonteDaMascara,
    fonteDaMascaraDosFiltros,
  }: {
    formato: FormatoDaImagem;
    qualidade?: number;
    escala?: number;
    fonteDa?: (midia: Midia) => Promise<ImageBitmap>;
    /** O canvas de uma camada de pixels sendo pintada (com o que ainda não subiu); sem ele, a versão do servidor. */
    fonteDosPixels?: (clipe: Clipe) => HTMLCanvasElement | null;
    /** O canvas de uma máscara de camada sendo pintada; sem ele, a versão do servidor. */
    fonteDaMascara?: (clipe: Clipe) => HTMLCanvasElement | null;
    /** O mesmo, para a máscara dos filtros inteligentes. */
    fonteDaMascaraDosFiltros?: (clipe: Clipe) => HTMLCanvasElement | null;
  },
): Promise<Blob> {
  const base = tamanhoDaImagem(projeto);
  const tamanho = { largura: Math.round(base.largura * escala), altura: Math.round(base.altura * escala) };
  const transparente = Boolean(projeto.fundo.transparente) && formato !== "jpeg";
  const fundo = projeto.fundo.transparente ? (transparente ? null : "#ffffff") : projeto.fundo.cor;

  const imagensDeTexto = new Map<string, ImagemDeTexto>();
  const ladoMenor = Math.min(tamanho.largura, tamanho.altura);
  await Promise.all(textosParaImagens(projeto).map(async ({ id, texto }) => imagensDeTexto.set(id, await imagemDeTextoNoLado(texto, ladoMenor))));
  const camadas = camadasDaImagem(projeto, midias, tamanho, imagensDeTexto);
  // Os textos desenhados no navegador esperam as fontes deles
  await esperarFontes(projeto.faixas.flatMap((faixa) => faixa.clipes.flatMap((clipe) => (clipe.texto_rico ? [clipe.texto_rico] : []))));

  // A máscara de camada pintável de cada uma: o canvas sendo pintado, ou a versão do servidor
  const mascaraDe = async (clipe: Clipe) => {
    const mascara = clipe.mascara_pixels;
    const fonte = mascara && mascara.ligada ? (fonteDaMascara?.(clipe) ?? (await carregarBitmap(arquivoDaMidia(mascara.midia_id, arquivoDaVersao(mascara.versao))))) : null;
    const camada = camadas.find((item) => item.clipe.id === clipe.id);
    return camada ? mascaraFinal(clipe, camada.caixa, tamanho, base, fonte) : fonte ? { fonte, quadro: tamanho } : null;
  };
  // A máscara dos filtros inteligentes: a que está sendo pintada, ou a versão do servidor
  const mascaraDosFiltrosDe = async (clipe: Clipe) => {
    const mascara = clipe.filtros_inteligentes?.mascara;
    if (!mascara || !mascara.ligada) return null;
    const fonte = fonteDaMascaraDosFiltros?.(clipe) ?? (await carregarBitmap(arquivoDaMidia(mascara.midia_id, arquivoDaVersao(mascara.versao))));
    return { fonte, quadro: tamanho };
  };
  const prontas = await Promise.all(
    camadas.map(async (camada) => {
      if (camada.imagem) return [camada.faixa.id, camadaDoCompositor(camada, camada.imagem, null, await mascaraDe(camada.clipe), documentoDaCamada(projeto), await mascaraDosFiltrosDe(camada.clipe))] as const;
      if (camada.clipe.ajuste) return [camada.faixa.id, camadaDoCompositor(camada, FUNDO, null, await mascaraDe(camada.clipe))] as const;
      if (camada.clipe.camada_de_preenchimento) {
        const fonte = preenchimentoNoTamanho(`exportar:${camada.clipe.id}`, camada.clipe.camada_de_preenchimento, tamanho.largura, tamanho.altura, escala);
        return [camada.faixa.id, camadaDoCompositor(camada, fonte, null, await mascaraDe(camada.clipe), documentoDaCamada(projeto), await mascaraDosFiltrosDe(camada.clipe))] as const;
      }
      if (camada.clipe.texto_rico) {
        const { caixa, recorte } = camada;
        const fonte = textoNoTamanho(`exportar:${camada.clipe.id}`, camada.clipe.texto_rico, caixa.largura / recorte.largura, caixa.altura / recorte.altura);
        return fonte ? ([camada.faixa.id, camadaDoCompositor(camada, fonte, null, await mascaraDe(camada.clipe), documentoDaCamada(projeto), await mascaraDosFiltrosDe(camada.clipe))] as const) : null;
      }
      if (camada.clipe.vetor) {
        // A forma desenhada no tamanho em que sai (a caixa já está em pixels do arquivo)
        const { caixa, recorte } = camada;
        // A foto do quadro em resolução cheia (o quadro vazio sai sem nada)
        const tinta = camada.clipe.vetor.preenchimento;
        const daFoto = tinta.tipo === "imagem" ? midias.get(tinta.midia_id) : undefined;
        const foto = daFoto ? await fonteDa(daFoto) : null;
        const fonte = vetorNoTamanho(`exportar:${camada.clipe.id}`, camada.clipe.vetor, caixa.largura / recorte.largura, caixa.altura / recorte.altura, { imagem: () => foto });
        return [camada.faixa.id, camadaDoCompositor(camada, fonte, null, await mascaraDe(camada.clipe), documentoDaCamada(projeto), await mascaraDosFiltrosDe(camada.clipe))] as const;
      }
      if (camada.clipe.pixels) {
        // A camada de pixels: o canvas que está sendo pintado, ou o PNG da versão do clipe (a 0 é vazia)
        const { versao } = camada.clipe.pixels;
        const local = fonteDosPixels?.(camada.clipe);
        const fonte = local ?? (versao > 0 ? await carregarBitmap(arquivoDaMidia(camada.clipe.midia_id!, arquivoDaVersao(versao))) : null);
        return fonte ? ([camada.faixa.id, camadaDoCompositor(camada, fonte, null, await mascaraDe(camada.clipe), documentoDaCamada(projeto), await mascaraDosFiltrosDe(camada.clipe))] as const) : null;
      }
      const midia = midias.get(camada.clipe.midia_id!)!;
      const fonte = await fonteDa(midia);
      const mascara = camada.clipe.remover_fundo ? arquivoDaMascaraDaImagem(midia) : null;
      // Como o render do vídeo: sem a máscara pronta, o arquivo sairia com o fundo que a pessoa pediu para tirar
      if (camada.clipe.remover_fundo && !mascara) throw new Error(`O fundo de "${midia.nome}" ainda está sendo recortado. Espere terminar ou desligue "Remover o fundo".`);
      return [camada.faixa.id, camadaDoCompositor(camada, fonte, mascara ? await carregarBitmap(mascara) : null, await mascaraDe(camada.clipe), documentoDaCamada(projeto), await mascaraDosFiltrosDe(camada.clipe))] as const;
    }),
  );
  const arvore = camadasEmArvore(projeto, new Map(prontas.filter((item) => item !== null)), tamanho);

  const canvas = document.createElement("canvas");
  canvas.width = tamanho.largura;
  canvas.height = tamanho.altura;
  const compositor = new Compositor(canvas, { comAlfa: transparente });
  try {
    compositor.desenhar(arvore, fundo, tamanho, tamanho);
    // O primeiro desenho de uma textura recém-criada pode sair sem o mipmap (como na exportação do vídeo)
    compositor.desenhar(arvore, fundo, tamanho, tamanho);
    return await new Promise<Blob>((pronto, falhou) =>
      canvas.toBlob((blob) => (blob ? pronto(blob) : falhou(new Error("O navegador não conseguiu gerar a imagem."))), `image/${formato}`, qualidade),
    );
  } finally {
    compositor.destruir();
    soltarImagensDeTexto(imagensDeTexto.values());
  }
}
