"use client";

// Arquivo › Exportar › Pranchetas em arquivos (ADR 0003, onda 13.7): cada prancheta sai sozinha (só ela e o que está
// dentro dela, como nos editores profissionais: o que fica fora das pranchetas e as outras pranchetas não entram), na
// escala pedida, recortada no retângulo dela. Uma prancheta só baixa o arquivo; várias, um ZIP.
import { comDescendentes } from "../projeto/arvore";
import { retanguloDaPrancheta, tamanhoDaImagem } from "../projeto/imagem";
import type { Clipe, Projeto } from "../projeto/modelo";
import type { Midia } from "../tipos";

import { exportarImagem, type FormatoDaImagem } from "./imagem";
import { zipSemCompressao } from "./zip";

/** As pranchetas do projeto (visíveis ou não), de cima para baixo, com o nome e o retângulo em pixels do documento. */
export function pranchetasDoProjeto(projeto: Projeto): { faixaId: string; clipeId: string; nome: string; retangulo: { x: number; y: number; largura: number; altura: number } }[] {
  const quadro = tamanhoDaImagem(projeto);
  return projeto.faixas.flatMap((faixa) => {
    const clipe = faixa.clipes[0];
    const retangulo = clipe ? retanguloDaPrancheta(clipe, quadro) : null;
    return clipe && retangulo ? [{ faixaId: faixa.id, clipeId: clipe.id, nome: faixa.nome ?? "Prancheta", retangulo }] : [];
  });
}

/** O projeto só com a prancheta (e o que está dentro dela), visível, sobre o fundo transparente. */
function soAPrancheta(projeto: Projeto, faixaId: string): Projeto {
  const dela = new Set(comDescendentes(projeto, faixaId).map((faixa) => faixa.id));
  return {
    ...projeto,
    fundo: { ...projeto.fundo, transparente: true },
    faixas: projeto.faixas.filter((faixa) => faixa.tipo === "principal" || dela.has(faixa.id)).map((faixa) => (faixa.id === faixaId ? { ...faixa, oculta: false } : faixa)),
  };
}

const EXTENSOES: Record<FormatoDaImagem, string> = { png: "png", jpeg: "jpg", webp: "webp" };

/** Os arquivos das pranchetas (o nome sem repetir e sem caracteres que os sistemas recusam) e o pacote para baixar. */
export async function exportarPranchetas(
  projeto: Projeto,
  midias: ReadonlyMap<string, Midia>,
  opcoes: { formato: FormatoDaImagem; qualidade?: number; escala?: number; fonteDosPixels?: (clipe: Clipe) => HTMLCanvasElement | null; fonteDaMascara?: (clipe: Clipe) => HTMLCanvasElement | null },
): Promise<{ nome: string; blob: Blob }> {
  const pranchetas = pranchetasDoProjeto(projeto);
  if (!pranchetas.length) throw new Error("O documento não tem pranchetas.");
  const escala = opcoes.escala ?? 1;
  const usados = new Set<string>();
  const arquivos: { nome: string; blob: Blob }[] = [];
  for (const prancheta of pranchetas) {
    // A prancheta sozinha em PNG (sem perda): o formato pedido sai no recorte
    const inteira = await createImageBitmap(await exportarImagem(soAPrancheta(projeto, prancheta.faixaId), midias, { ...opcoes, formato: "png", escala }));
    try {
      const { x, y, largura, altura } = prancheta.retangulo;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(largura * escala));
      canvas.height = Math.max(1, Math.round(altura * escala));
      const ctx = canvas.getContext("2d")!;
      // O JPG não tem transparência: o que for transparente sai branco
      if (opcoes.formato === "jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(inteira, -Math.round(x * escala), -Math.round(y * escala));
      const blob = await new Promise<Blob>((pronto, falhou) => canvas.toBlob((b) => (b ? pronto(b) : falhou(new Error("O navegador não conseguiu gravar a prancheta."))), `image/${opcoes.formato}`, opcoes.qualidade ?? 0.92));
      let base = prancheta.nome.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Prancheta";
      for (let n = 2; usados.has(base.toLowerCase()); n++) base = `${prancheta.nome} ${n}`;
      usados.add(base.toLowerCase());
      arquivos.push({ nome: `${base}.${EXTENSOES[opcoes.formato]}`, blob });
    } finally {
      inteira.close();
    }
  }
  if (arquivos.length === 1) return arquivos[0];
  const zip = zipSemCompressao(await Promise.all(arquivos.map(async (arquivo) => ({ nome: arquivo.nome, dados: new Uint8Array(await arquivo.blob.arrayBuffer()) }))));
  return { nome: "pranchetas.zip", blob: new Blob([zip], { type: "application/zip" }) };
}
