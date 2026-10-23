"use client";

// Imagens paradas (fotos, logos, formas e as máscaras do fundo das fotos) como ImageBitmap pré-multiplicado, o
// que o compositor espera. Ficam guardadas por endereço: a prévia e a exportação do editor de imagem pedem a
// mesma foto várias vezes.
import { useEffect, useState } from "react";

const guardadas = new Map<string, ImageBitmap>();
const pedidos = new Map<string, Promise<ImageBitmap>>();
const LIMITE = 60;

/** A imagem do endereço; a segunda chamada com o mesmo endereço não pede de novo. */
export function carregarBitmap(endereco: string): Promise<ImageBitmap> {
  const guardada = guardadas.get(endereco);
  if (guardada) return Promise.resolve(guardada);
  let pedido = pedidos.get(endereco);
  if (!pedido) {
    pedido = fetch(endereco, { credentials: "same-origin" })
      .then((resposta) => {
        if (!resposta.ok) throw new Error(`A imagem respondeu ${resposta.status}.`);
        return resposta.blob();
      })
      // Pré-multiplicado no bitmap: o WebGL ignora o UNPACK_PREMULTIPLY_ALPHA num ImageBitmap
      .then((blob) => createImageBitmap(blob, { premultiplyAlpha: "premultiply" }))
      .then((bitmap) => {
        guardadas.set(endereco, bitmap);
        while (guardadas.size > LIMITE) {
          const [primeira, antiga] = guardadas.entries().next().value!;
          guardadas.delete(primeira);
          antiga.close();
        }
        return bitmap;
      })
      .finally(() => pedidos.delete(endereco));
    pedidos.set(endereco, pedido);
  }
  return pedido;
}

/** As imagens dos endereços que já chegaram; a tela é desenhada de novo quando cada uma chega. */
export function useBitmaps(enderecos: string[]): Map<string, ImageBitmap> {
  const [, setVersao] = useState(0);
  const assinatura = [...new Set(enderecos)].sort().join("\n");
  useEffect(() => {
    let ativo = true;
    for (const endereco of assinatura.split("\n").filter(Boolean)) {
      if (guardadas.has(endereco)) continue;
      carregarBitmap(endereco)
        .then(() => {
          if (ativo) setVersao((versao) => versao + 1);
        })
        .catch(() => {});
    }
    return () => {
      ativo = false;
    };
  }, [assinatura]);
  const resultado = new Map<string, ImageBitmap>();
  for (const endereco of enderecos) {
    const bitmap = guardadas.get(endereco);
    if (bitmap) resultado.set(endereco, bitmap);
  }
  return resultado;
}
