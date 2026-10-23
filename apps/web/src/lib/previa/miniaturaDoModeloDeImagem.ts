"use client";

// A miniatura de um modelo de imagem, desenhada como ele vai sair: as camadas do modelo (camadasDoModelo), o
// comando que o editor usa (aplicarModeloDeImagem) e a exportação do editor de imagem, com as formas desenhadas
// na hora pela API (sem criar mídia) e os textos do servidor. Uma de cada vez, porque cada uma abre um contexto
// WebGL; ficam guardadas pela página.
import type { PedidoDeForma } from "@/lib/elementos";
import type { Contexto } from "@/lib/projeto/edicao";
import { aplicarModeloDeImagem } from "@/lib/projeto/imagem";
import type { Projeto } from "@/lib/projeto/modelo";
import { camadasDoModelo, fundoDoModelo, type MidiasDoModelo, type ModeloDeImagem, pedidosDoModelo } from "@/lib/projeto/modelosDeImagem";
import type { Midia } from "@/lib/tipos";

import { exportarImagem } from "../exportacao/imagem";
import { carregarBitmap } from "./bitmaps";

/** O lado maior da miniatura, em pixels. */
const LADO = 540;

const feitas = new Map<string, Promise<string>>();
let fila: Promise<unknown> = Promise.resolve();

/** O endereço do desenho de uma forma, sem criar mídia. */
export function enderecoDaForma(forma: PedidoDeForma): string {
  const busca = new URLSearchParams({ tipo: forma.tipo, contorno_cor: forma.contorno_cor, contorno: String(forma.contorno) });
  if (forma.cor) busca.set("cor", forma.cor);
  if (forma.proporcao !== null) busca.set("proporcao", String(forma.proporcao));
  return `/api/elementos/formas/imagem?${busca}`;
}

function projetoVazio(modelo: ModeloDeImagem): Projeto {
  return {
    id: "",
    nome: modelo.nome,
    proporcao: "1:1",
    tipo: "imagem",
    tamanho: modelo.tamanho,
    taxa: { num: 30, den: 1 },
    fundo: { cor: "#ffffff" },
    faixas: [{ id: "principal", tipo: "principal", oculta: false, muda: false, travada: false, clipes: [] }],
    versao: 1,
    duracao: 0,
    criado_em: "",
    atualizado_em: "",
  };
}

async function desenhar(modelo: ModeloDeImagem, cores: string[]): Promise<string> {
  const pedidos = pedidosDoModelo(modelo, cores, new Set());
  const bitmaps = new Map<string, ImageBitmap>();
  await Promise.all(pedidos.map(async ({ chave, forma }) => bitmaps.set(chave, await carregarBitmap(enderecoDaForma(forma)))));
  const doModelo: MidiasDoModelo = {};
  // Só o que a prévia e a exportação leem de uma mídia: pronta, imagem e o tamanho
  const midias = new Map<string, Midia>();
  for (const [chave, bitmap] of bitmaps) {
    doModelo[chave] = { id: chave, largura: bitmap.width, altura: bitmap.height };
    midias.set(chave, { id: chave, nome: chave, status: "pronta", imagem: true, arquivos: [], video: { largura: bitmap.width, altura: bitmap.height, transparente: true } } as unknown as Midia);
  }
  let numero = 0;
  const ctx: Contexto = {
    novoId: () => `m${++numero}`,
    midia: (id) => (bitmaps.has(id) ? { duracao: Number.POSITIVE_INFINITY, video: true, audio: false, transparente: true, imagem: true } : null),
  };
  const projeto = aplicarModeloDeImagem(projetoVazio(modelo), ctx, { camadas: camadasDoModelo(modelo, cores, doModelo), tamanho: modelo.tamanho, fundo: fundoDoModelo(modelo, cores) });
  const escala = LADO / Math.max(modelo.tamanho.largura, modelo.tamanho.altura);
  const blob = await exportarImagem(projeto, midias, { formato: "webp", qualidade: 0.88, escala, fonteDa: (midia) => Promise.resolve(bitmaps.get(midia.id)!) });
  return URL.createObjectURL(blob);
}

/** O endereço (blob:) da miniatura; a mesma chamada devolve a mesma imagem. */
export function miniaturaDoModeloDeImagem(modelo: ModeloDeImagem, cores: string[]): Promise<string> {
  const chave = `${modelo.id}|${cores.join(",")}`;
  let feita = feitas.get(chave);
  if (!feita) {
    feita = fila.then(() => desenhar(modelo, cores));
    fila = feita.catch(() => undefined);
    // Se falhar (a API caiu), a próxima vez tenta de novo
    feita.catch(() => feitas.delete(chave));
    feitas.set(chave, feita);
  }
  return feita;
}
