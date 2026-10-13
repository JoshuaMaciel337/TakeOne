"use client";

// Imagens dos clipes de texto para a prévia: o PNG que a API desenha (core/utils/texto.py), o mesmo
// do render. Ficam guardadas por conteúdo, então dividir ou duplicar um texto não pede de novo.
import { useEffect, useState } from "react";

import { LADO_REFERENCIA_TEXTO } from "@/lib/projeto/geometria";
import type { Texto } from "@/lib/projeto/texto";

export type ImagemDeTexto = { bitmap: ImageBitmap; largura: number; altura: number };

/** Espera depois da última mudança antes de pedir a imagem (enquanto a pessoa digita). */
const ESPERA_MS = 120;
const LIMITE_GUARDADAS = 200;

const guardadas = new Map<string, ImagemDeTexto>();
const pedidos = new Map<string, Promise<void>>();
/** A última imagem mostrada de cada clipe: fica na tela enquanto a do texto editado não chega. */
const ultimaDoClipe = new Map<string, ImagemDeTexto>();

function chaveDoTexto(texto: Texto): string {
  return JSON.stringify(texto);
}

async function pedirImagem(chave: string, ladoMenor = LADO_REFERENCIA_TEXTO): Promise<ImagemDeTexto> {
  const resposta = await fetch("/api/textos/imagem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ texto: JSON.parse(chave), lado_menor: ladoMenor }),
  });
  if (!resposta.ok) throw new Error(`A imagem do texto respondeu ${resposta.status}.`);
  const bitmap = await createImageBitmap(await resposta.blob(), { premultiplyAlpha: "none" });
  return { bitmap, largura: bitmap.width, altura: bitmap.height };
}

/**
 * A imagem de cada clipe de texto, por id do clipe. Enquanto a imagem nova de um texto editado não
 * chega, continua a anterior daquele clipe (sem piscar).
 */
export function useImagensDeTexto(textos: { id: string; texto: Texto }[]): Map<string, ImagemDeTexto> {
  const [, setVersao] = useState(0);
  const assinatura = [...new Set(textos.map(({ texto }) => chaveDoTexto(texto)))].join("\u0000");

  useEffect(() => {
    const faltando = assinatura.split("\u0000").filter((chave) => chave && !guardadas.has(chave) && !pedidos.has(chave));
    if (!faltando.length) return;
    const espera = setTimeout(() => {
      for (const chave of faltando) {
        const pedido = pedirImagem(chave)
          .then((imagem) => {
            guardadas.set(chave, imagem);
            // Sem guardar para sempre: as mais antigas saem primeiro
            while (guardadas.size > LIMITE_GUARDADAS) guardadas.delete(guardadas.keys().next().value!);
            setVersao((versao) => versao + 1);
          })
          .catch(() => {})
          .finally(() => pedidos.delete(chave));
        pedidos.set(chave, pedido);
      }
    }, ESPERA_MS);
    return () => clearTimeout(espera);
  }, [assinatura]);

  const imagens = new Map<string, ImagemDeTexto>();
  for (const { id, texto } of textos) {
    const atual = guardadas.get(chaveDoTexto(texto));
    // Guardar a última é idempotente: renderizar de novo dá o mesmo resultado
    if (atual) ultimaDoClipe.set(id, atual);
    const imagem = atual ?? ultimaDoClipe.get(id);
    if (imagem) imagens.set(id, imagem);
  }
  return imagens;
}

/** URL de uma imagem de texto pequena, para as miniaturas dos estilos prontos. */
export async function urlDaImagemDeTexto(texto: Texto, ladoMenor: number): Promise<string> {
  const resposta = await fetch("/api/textos/imagem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ texto, lado_menor: ladoMenor }),
  });
  if (!resposta.ok) throw new Error(`A imagem do texto respondeu ${resposta.status}.`);
  return URL.createObjectURL(await resposta.blob());
}
