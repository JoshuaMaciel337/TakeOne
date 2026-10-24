"use client";

// Arquivo › Scripts › Processador de imagens e Arquivo › Automatizar › Lote (ADR 0003, onda 13.13): cada imagem
// escolhida passa pelos passos (tom, contraste e cor automáticos, as camadas de ajuste deste documento, o modo de cor)
// e sai em um ou mais formatos, cabendo no tamanho pedido, com o nome no padrão escolhido, num ZIP. As ações gravadas
// (a 13.15) entram aqui como mais um passo quando chegarem.
import { type AjusteDaImagem, aplicarAjusteNosPixels, compilarAjuste } from "../imagem/ajustes";
import { histogramas, niveisAutomaticos } from "../imagem/histograma";
import type { ModoDeCor } from "../imagem/modos";
import { redimensionar } from "../transformar/reamostragem";
import { codificarCanvas, formatoDe, type FormatoDeExportacao, OPCOES_PADRAO_DE_EXPORTACAO } from "../exportacao/exportarComo";
import { zipSemCompressao } from "../exportacao/zip";

import { carregarFontes, type FonteDaAutomacao, type Imagem } from "./executar";

export type SaidaDoLote = { formato: FormatoDeExportacao; qualidade: number; /** Cabe em largura × altura (sem aumentar); null: o tamanho dela. */ caber: { largura: number; altura: number } | null };
export type PassosDoLote = { tom: boolean; contraste: boolean; cor: boolean; ajustes: AjusteDaImagem[]; modo: ModoDeCor | null };
export type OpcoesDoLote = { saidas: SaidaDoLote[]; passos: PassosDoLote; /** "{nome}", "{n}" (o número, com zeros) e "{data}". */ padrao: string };

export const PASSOS_VAZIOS: PassosDoLote = { tom: false, contraste: false, cor: false, ajustes: [], modo: null };

/** O nome de um arquivo pelo padrão (sem os caracteres que os sistemas recusam). */
export function nomePeloPadrao(padrao: string, nome: string, numero: number, total: number, data = new Date()): string {
  const n = String(numero).padStart(String(total).length, "0");
  const dia = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
  const feito = (padrao || "{nome}").replaceAll("{nome}", nome).replaceAll("{n}", n).replaceAll("{data}", dia);
  return feito.replace(/[\\/:*?"<>|]+/g, "-").trim() || nome;
}

/** O tamanho que cabe em largura × altura, na proporção, sem aumentar. */
export function tamanhoQueCabe(imagem: { largura: number; altura: number }, caber: { largura: number; altura: number } | null): { largura: number; altura: number } {
  if (!caber) return { largura: imagem.largura, altura: imagem.altura };
  const escala = Math.min(1, caber.largura / imagem.largura, caber.altura / imagem.altura);
  return { largura: Math.max(1, Math.round(imagem.largura * escala)), altura: Math.max(1, Math.round(imagem.altura * escala)) };
}

/** Os passos nos pixels (em lugar). */
export function aplicarPassos(dados: Uint8ClampedArray, passos: PassosDoLote) {
  for (const jeito of ["tom", "contraste", "cor"] as const) if (passos[jeito]) aplicarAjusteNosPixels(dados, compilarAjuste({ tipo: "niveis", canais: niveisAutomaticos(histogramas(dados), jeito) }));
  for (const ajuste of passos.ajustes) aplicarAjusteNosPixels(dados, compilarAjuste(ajuste));
}

const canvasDe = (imagem: Imagem) => {
  const canvas = document.createElement("canvas");
  canvas.width = imagem.largura;
  canvas.height = imagem.altura;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(imagem.dados), imagem.largura, imagem.altura), 0, 0);
  return canvas;
};

/** O lote inteiro num ZIP (os arquivos de cada formato numa pasta com o nome dele, quando há mais de um formato). */
export async function processarLote(fontes: FonteDaAutomacao[], opcoes: OpcoesDoLote, aoProgresso: (texto: string) => void): Promise<{ nome: string; blob: Blob }> {
  if (!fontes.length) throw new Error("Escolha as imagens.");
  if (!opcoes.saidas.length) throw new Error("Escolha pelo menos um formato.");
  const arquivos: { nome: string; dados: Uint8Array }[] = [];
  const usados = new Set<string>();
  for (const [indice, fonte] of fontes.entries()) {
    const [{ nome, imagem }] = await carregarFontes([fonte], 8192, () => aoProgresso(`Lendo a imagem ${indice + 1} de ${fontes.length}…`));
    aoProgresso(`Processando a imagem ${indice + 1} de ${fontes.length}…`);
    aplicarPassos(imagem.dados, opcoes.passos);
    const base = nomePeloPadrao(opcoes.padrao, nome, indice + 1, fontes.length);
    for (const saida of opcoes.saidas) {
      const medida = tamanhoQueCabe(imagem, saida.caber);
      const pronta = medida.largura === imagem.largura && medida.altura === imagem.altura ? imagem : { dados: redimensionar(imagem, medida.largura, medida.altura, "automatica"), ...medida };
      const blob = await codificarCanvas(canvasDe(pronta), { ...OPCOES_PADRAO_DE_EXPORTACAO, formato: saida.formato, qualidade: saida.qualidade, modo: opcoes.passos.modo });
      const pasta = opcoes.saidas.length > 1 ? `${formatoDe(saida.formato).nome.split(" ")[0]}/` : "";
      let caminho = `${pasta}${base}.${formatoDe(saida.formato).extensao}`;
      for (let n = 2; usados.has(caminho.toLowerCase()); n++) caminho = `${pasta}${base} ${n}.${formatoDe(saida.formato).extensao}`;
      usados.add(caminho.toLowerCase());
      arquivos.push({ nome: caminho, dados: new Uint8Array(await blob.arrayBuffer()) });
    }
  }
  return { nome: "lote.zip", blob: new Blob([zipSemCompressao(arquivos)], { type: "application/zip" }) };
}
