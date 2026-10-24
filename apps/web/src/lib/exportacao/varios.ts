"use client";

// Os arquivos de uma vez do editor de imagem (ADR 0003, onda 13.13): Camadas em arquivos (cada camada sozinha, no
// tamanho do documento ou cortada no conteúdo), Pranchetas em arquivos (em qualquer formato, ou todas num PDF) e Gerar
// ativos de imagem (as camadas e grupos com o nome terminado numa extensão). Um arquivo só baixa direto; vários, um ZIP.
import { comDescendentes } from "../projeto/arvore";
import { tamanhoDaImagem } from "../projeto/imagem";
import type { Faixa, Projeto } from "../projeto/modelo";
import { projetoSoCom } from "../projeto/rasterizar";
import type { Midia } from "../tipos";

import { pedidosDoNome, tamanhoDoAtivo } from "./ativos";
import { caixaDoConteudo, codificarCanvas, type FontesDaExportacao, formatoDe, infoDoPdf, nomesSemRepetir, OPCOES_PADRAO_DE_EXPORTACAO, type OpcoesDeExportacao, paginaDoPdf, pixelsDoBlob, recortarCanvas } from "./exportarComo";
import { temInformacoes } from "./metadados";
import { codificarPdf } from "./formatos/pdf";
import { exportarImagem } from "./imagem";
import { pranchetasDoProjeto, soAPrancheta } from "./pranchetas";
import { zipSemCompressao } from "./zip";

type Arquivo = { nome: string; blob: Blob };

async function pacote(arquivos: Arquivo[], nomeDoZip: string): Promise<Arquivo> {
  if (!arquivos.length) throw new Error("Nada para exportar.");
  if (arquivos.length === 1 && !arquivos[0].nome.includes("/")) return arquivos[0];
  const zip = zipSemCompressao(await Promise.all(arquivos.map(async (arquivo) => ({ nome: arquivo.nome, dados: new Uint8Array(await arquivo.blob.arrayBuffer()) }))));
  return { nome: nomeDoZip, blob: new Blob([zip], { type: "application/zip" }) };
}

/** O projeto desenhado num canvas, na escala pedida. */
async function desenhar(projeto: Projeto, midias: ReadonlyMap<string, Midia>, escala: number, fontes: FontesDaExportacao): Promise<HTMLCanvasElement> {
  return (await pixelsDoBlob(await exportarImagem(projeto, midias, { formato: "png", escala, ...fontes }))).canvas;
}

const nomeDaFaixa = (faixa: Faixa) => faixa.nome?.trim() || "Camada";

export type OpcoesDasCamadas = { exportacao: OpcoesDeExportacao; soVisiveis: boolean; cortar: boolean; prefixo: string };

/**
 * Camadas em arquivos: cada camada (as de dentro dos grupos também; os grupos e os ajustes não desenham nada
 * sozinhos) com o estilo e as máscaras dela, sem a opacidade e o modo, que dependem do que está embaixo.
 */
export async function exportarCamadas(projeto: Projeto, midias: ReadonlyMap<string, Midia>, opcoes: OpcoesDasCamadas, fontes: FontesDaExportacao, aoProgresso: (texto: string) => void): Promise<Arquivo> {
  const camadas = projeto.faixas.filter((faixa) => {
    const clipe = faixa.clipes[0];
    return faixa.tipo !== "principal" && clipe && !clipe.pasta && !clipe.ajuste && (!opcoes.soVisiveis || !faixa.oculta);
  });
  if (!camadas.length) throw new Error(opcoes.soVisiveis ? "Nenhuma camada visível para exportar." : "Nenhuma camada para exportar.");
  const exportacao: OpcoesDeExportacao = { ...opcoes.exportacao, informacoes: projeto.informacoes ?? null };
  const { escala } = exportacao;
  const ppi = (projeto.tamanho?.resolucao ?? 72) * escala;
  const comPpi = projeto.tamanho?.resolucao ? ppi : null;
  const nome = nomesSemRepetir();
  const extensao = formatoDe(opcoes.exportacao.formato).extensao;
  const arquivos: Arquivo[] = [];
  for (const [indice, faixa] of camadas.entries()) {
    aoProgresso(`Exportando a camada ${indice + 1} de ${camadas.length}…`);
    let canvas = await desenhar(projetoSoCom(projeto, [faixa.id], { neutras: new Set([faixa.id]) }), midias, escala, fontes);
    if (opcoes.cortar) {
      const caixa = caixaDoConteudo(canvas);
      // A camada vazia não vira arquivo
      if (!caixa) continue;
      canvas = recortarCanvas(canvas, caixa);
    }
    const numero = String(indice + 1).padStart(String(camadas.length).length, "0");
    arquivos.push({ nome: nome(`${opcoes.prefixo}${numero} ${nomeDaFaixa(faixa)}`.trim(), extensao), blob: await codificarCanvas(canvas, exportacao, ppi, comPpi) });
  }
  return pacote(arquivos, "camadas.zip");
}

/** Pranchetas em arquivos: cada prancheta sozinha no formato pedido, ou todas num PDF, uma página cada. */
export async function exportarPranchetasComo(projeto: Projeto, midias: ReadonlyMap<string, Midia>, pedidas: OpcoesDeExportacao, fontes: FontesDaExportacao, aoProgresso: (texto: string) => void): Promise<Arquivo> {
  const exportacao: OpcoesDeExportacao = { ...pedidas, informacoes: projeto.informacoes ?? null };
  const pranchetas = pranchetasDoProjeto(projeto);
  if (!pranchetas.length) throw new Error("O documento não tem pranchetas.");
  const { escala } = exportacao;
  const ppi = (projeto.tamanho?.resolucao ?? 72) * escala;
  const comPpi = projeto.tamanho?.resolucao ? ppi : null;
  const nome = nomesSemRepetir();
  const arquivos: Arquivo[] = [];
  const paginas = [];
  for (const [indice, prancheta] of pranchetas.entries()) {
    aoProgresso(`Exportando a prancheta ${indice + 1} de ${pranchetas.length}…`);
    const inteira = await desenhar(soAPrancheta(projeto, prancheta.faixaId), midias, escala, fontes);
    const { x, y, largura, altura } = prancheta.retangulo;
    const canvas = recortarCanvas(inteira, { x: x * escala, y: y * escala, largura: largura * escala, altura: altura * escala });
    if (exportacao.formato === "pdf") {
      const dados = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data;
      paginas.push(await paginaDoPdf(canvas, dados, ppi, exportacao.pdf, exportacao.qualidade));
    } else arquivos.push({ nome: nome(prancheta.nome, formatoDe(exportacao.formato).extensao), blob: await codificarCanvas(canvas, exportacao, ppi, comPpi) });
  }
  if (exportacao.formato === "pdf") return { nome: "pranchetas.pdf", blob: new Blob([codificarPdf(paginas, { ...infoDoPdf(temInformacoes(projeto.informacoes) ? projeto.informacoes : null), titulo: projeto.informacoes?.titulo || "Pranchetas" }) as Uint8Array<ArrayBuffer>], { type: "application/pdf" }) };
  return pacote(arquivos, "pranchetas.zip");
}

/** As camadas e os grupos que pedem ativos pelo nome. */
export function camadasComAtivos(projeto: Projeto): Faixa[] {
  return projeto.faixas.filter((faixa) => faixa.tipo !== "principal" && faixa.clipes[0] && !faixa.clipes[0].ajuste && pedidosDoNome(faixa.nome ?? "").length);
}

/**
 * Gerar ativos de imagem: cada pedido do nome de uma camada ou grupo (com o que está dentro dele) vira um arquivo,
 * cortado no conteúdo e no tamanho pedido. A camada é desenhada como aparece (com a opacidade), mesmo escondida.
 */
export async function gerarAtivos(projeto: Projeto, midias: ReadonlyMap<string, Midia>, fontes: FontesDaExportacao, aoProgresso: (texto: string) => void): Promise<Arquivo> {
  const faixas = camadasComAtivos(projeto);
  if (!faixas.length) throw new Error('Nenhuma camada pede ativos. Dê à camada um nome terminado na extensão, como "logo.png" ou "200% logo@2x.png".');
  const base = tamanhoDaImagem(projeto);
  const usados = new Set<string>();
  const arquivos: Arquivo[] = [];
  for (const [indice, faixa] of faixas.entries()) {
    aoProgresso(`Gerando os ativos de "${faixa.nome}" (${indice + 1} de ${faixas.length})…`);
    const ids = comDescendentes(projeto, faixa.id).map((item) => item.id);
    const sozinha = projetoSoCom({ ...projeto, faixas: projeto.faixas.map((item) => (item.id === faixa.id ? { ...item, oculta: false } : item)) }, ids);
    // A caixa do conteúdo na escala 1 dá o tamanho de cada pedido
    const normal = await desenhar(sozinha, midias, 1, fontes);
    const caixa = caixaDoConteudo(normal);
    if (!caixa) continue;
    for (const pedido of pedidosDoNome(faixa.nome ?? "")) {
      if (usados.has(pedido.arquivo.toLowerCase())) continue;
      usados.add(pedido.arquivo.toLowerCase());
      const medida = tamanhoDoAtivo(pedido, caixa.largura, caixa.altura);
      // Para crescer, desenha de novo na escala (textos e formas ficam nítidos); para diminuir, reduz o desenho
      const escala = Math.min(medida.escala, 8192 / Math.max(base.largura, base.altura));
      const fonte = escala > 1 ? await desenhar(sozinha, midias, escala, fontes) : normal;
      const k = escala > 1 ? escala : 1;
      const recorte = recortarCanvas(fonte, { x: caixa.x * k, y: caixa.y * k, largura: caixa.largura * k, altura: caixa.altura * k });
      const final = document.createElement("canvas");
      final.width = medida.largura;
      final.height = medida.altura;
      const contexto = final.getContext("2d")!;
      contexto.imageSmoothingQuality = "high";
      contexto.drawImage(recorte, 0, 0, medida.largura, medida.altura);
      const exportacao: OpcoesDeExportacao = { ...OPCOES_PADRAO_DE_EXPORTACAO, formato: pedido.formato, qualidade: pedido.qualidade ?? OPCOES_PADRAO_DE_EXPORTACAO.qualidade, informacoes: projeto.informacoes ?? null };
      arquivos.push({ nome: pedido.arquivo, blob: await codificarCanvas(final, exportacao) });
    }
  }
  return pacote(arquivos, "ativos.zip");
}
