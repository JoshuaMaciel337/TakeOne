"use client";

// A imagem que chega a uma camada (o que está embaixo dela) ou o documento inteiro, numa cópia de até 512 pixels de
// lado, desenhada pela exportação com as cópias leves das fotos: o histograma dos ajustes e do painel Histograma, os
// conta-gotas e os automáticos leem dela. Refaz meio segundo depois de o projeto parar de mudar.
import { useEffect, useState } from "react";

import { arquivoDaMidia } from "@/lib/api";
import { exportarImagem } from "@/lib/exportacao/imagem";
import { carregarBitmap } from "@/lib/previa/bitmaps";
import { ancestrais, faixasEmOrdem } from "@/lib/projeto/arvore";
import { tamanhoDaImagem } from "@/lib/projeto/imagem";
import type { Projeto } from "@/lib/projeto/modelo";
import type { ImagemRgba } from "@/lib/selecao/varinha";
import type { Midia } from "@/lib/tipos";

const LADO = 512;

/** O projeto só com o que fica embaixo da camada: ela e as de cima (menos as pastas em que ela está) somem. */
export function projetoAbaixo(projeto: Projeto, faixaId: string | null): Projeto {
  if (!faixaId) return projeto;
  const ordem = faixasEmOrdem(projeto);
  const indice = ordem.findIndex((faixa) => faixa.id === faixaId);
  if (indice < 0) return projeto;
  const propria = ordem[indice];
  const pastas = new Set(ancestrais(projeto, propria).map((faixa) => faixa.id));
  const somem = new Set(ordem.slice(0, indice + 1).filter((faixa) => !pastas.has(faixa.id)).map((faixa) => faixa.id));
  return { ...projeto, faixas: projeto.faixas.map((faixa) => (somem.has(faixa.id) ? { ...faixa, oculta: true } : faixa)) };
}

export function useImagemAbaixo(projeto: Projeto | null, midias: ReadonlyMap<string, Midia>, faixaId: string | null, ativo: boolean): ImagemRgba | null {
  const [imagem, setImagem] = useState<ImagemRgba | null>(null);
  useEffect(() => {
    if (!ativo || !projeto) return;
    let cancelado = false;
    const espera = window.setTimeout(() => {
      const documento = tamanhoDaImagem(projeto);
      const escala = Math.min(1, LADO / Math.max(documento.largura, documento.altura));
      exportarImagem(projetoAbaixo(projeto, faixaId), midias, { formato: "png", escala, fonteDa: (midia) => carregarBitmap(arquivoDaMidia(midia.id, "proxy.webp")) })
        .then((blob) => createImageBitmap(blob))
        .then((bitmap) => {
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          if (!cancelado) setImagem({ largura: canvas.width, altura: canvas.height, dados: ctx.getImageData(0, 0, canvas.width, canvas.height).data });
        })
        .catch(() => undefined);
    }, 500);
    return () => {
      cancelado = true;
      window.clearTimeout(espera);
    };
  }, [projeto, midias, faixaId, ativo]);
  return ativo ? imagem : null;
}
