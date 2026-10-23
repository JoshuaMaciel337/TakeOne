"use client";

// Os pincéis do espaço (api/rotas/pinceis.py): os salvos pela pessoa ("Novo pincel predefinido") e os importados de
// um .abr. A ponta própria de cada um é baixada uma vez e guardada no motor (lib/pintura/pontas.ts) como
// "pincel:<id>"; as opções de um pincel importado apontam a ponta dele por "propria".
import { useCallback, useEffect, useState } from "react";

import { chamarApi } from "./api";
import { lerAbr } from "./pintura/abr";
import { registrarPonta } from "./pintura/pontas";
import type { Predefinicao } from "./pintura/predefinicoes";
import type { OpcoesDoPincel } from "./pintura/traco";

export type PincelDoEspaco = {
  id: string;
  nome: string;
  pasta: "meus" | "importados";
  opcoes: Omit<Partial<OpcoesDoPincel>, "ponta"> & { ponta?: string };
  tem_ponta: boolean;
  ponta: { largura: number; altura: number } | null;
  criado_em: string;
};

/** O lado maior de uma ponta importada (a API aceita até 2500). */
const LADO_MAXIMO = 2500;

export function criarPincel(dados: { nome: string; pasta: "meus" | "importados"; opcoes: object; ponta_png?: string }): Promise<PincelDoEspaco> {
  return chamarApi<PincelDoEspaco>("/pinceis", { metodo: "POST", corpo: dados });
}

export function excluirPincel(id: string): Promise<void> {
  return chamarApi<void>(`/pinceis/${id}`, { metodo: "DELETE" });
}

/** O pincel do espaço como predefinição do painel (a ponta "propria" vira a dele). */
export function predefinicaoDoEspaco(pincel: PincelDoEspaco): Predefinicao {
  const opcoes = { ...pincel.opcoes };
  if (opcoes.ponta === "propria") opcoes.ponta = `pincel:${pincel.id}`;
  return { id: `espaco:${pincel.id}`, nome: pincel.nome, pasta: pincel.pasta, opcoes: opcoes as Predefinicao["opcoes"] };
}

/** Baixa a ponta e guarda no motor (branco com o alfa da tinta). */
async function baixarPonta(id: string): Promise<void> {
  const resposta = await fetch(`/api/pinceis/${id}/ponta.png`, { credentials: "same-origin" });
  if (!resposta.ok) return;
  const bitmap = await createImageBitmap(await resposta.blob(), { premultiplyAlpha: "none" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  registrarPonta(`pincel:${id}`, canvas);
}

/** Os pincéis do espaço, com as pontas já guardadas no motor. */
export function usePinceisDoEspaco() {
  const [pinceis, setPinceis] = useState<PincelDoEspaco[]>([]);
  const [vez, setVez] = useState(0);
  const recarregar = useCallback(() => setVez((atual) => atual + 1), []);
  useEffect(() => {
    let ativo = true;
    chamarApi<PincelDoEspaco[]>("/pinceis")
      .then(async (lista) => {
        await Promise.all(lista.filter((pincel) => pincel.tem_ponta).map((pincel) => baixarPonta(pincel.id).catch(() => undefined)));
        if (ativo) setPinceis(lista);
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [vez]);
  return { pinceis, recarregar };
}

function paraBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((dados) => {
    const bytes = new Uint8Array(dados);
    let texto = "";
    for (let i = 0; i < bytes.length; i += 0x8000) texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(texto);
  });
}

/** Uma ponta (o alfa de 0 a 255, linha a linha) como PNG branco com o alfa, com o lado maior até 2500. */
async function pngDaPonta(ponta: { largura: number; altura: number; dados: Uint8Array }): Promise<{ png: Blob; largura: number; altura: number }> {
  const escala = Math.min(1, LADO_MAXIMO / Math.max(ponta.largura, ponta.altura));
  const original = document.createElement("canvas");
  original.width = ponta.largura;
  original.height = ponta.altura;
  const ctx = original.getContext("2d")!;
  const dados = ctx.createImageData(ponta.largura, ponta.altura);
  for (let i = 0; i < ponta.dados.length; i++) {
    dados.data[i * 4] = 255;
    dados.data[i * 4 + 1] = 255;
    dados.data[i * 4 + 2] = 255;
    dados.data[i * 4 + 3] = ponta.dados[i];
  }
  ctx.putImageData(dados, 0, 0);
  let canvas = original;
  if (escala < 1) {
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(ponta.largura * escala));
    canvas.height = Math.max(1, Math.round(ponta.altura * escala));
    canvas.getContext("2d")!.drawImage(original, 0, 0, canvas.width, canvas.height);
  }
  const png = await new Promise<Blob>((pronto, falhou) => canvas.toBlob((blob) => (blob ? pronto(blob) : falhou(new Error("O navegador não conseguiu gravar a ponta."))), "image/png"));
  return { png, largura: canvas.width, altura: canvas.height };
}

/**
 * Editar › Definir predefinição de pincel: uma ponta própria (o alfa de cada pixel) vira um pincel em "Meus pincéis",
 * com o tamanho da ponta.
 */
export async function pincelDaPonta(nome: string, ponta: { largura: number; altura: number; dados: Uint8Array }): Promise<PincelDoEspaco> {
  const { png, largura, altura } = await pngDaPonta(ponta);
  return criarPincel({ nome: nome.slice(0, 80), pasta: "meus", opcoes: { tamanho: Math.max(largura, altura), ponta: "propria", espacamento: 0.25 }, ponta_png: await paraBase64(png) });
}

/**
 * Importa as pontas de um .abr como pincéis do espaço (pasta "Importados"), cada uma com as opções padrão e o
 * tamanho da ponta. Devolve quantas entraram; lança erro com a mensagem para a pessoa.
 */
export async function importarAbr(arquivo: File, aoAndar?: (feitas: number, total: number) => void): Promise<number> {
  const pontas = lerAbr(await arquivo.arrayBuffer());
  const base = arquivo.name.replace(/\.abr$/i, "").trim() || "Pincel";
  let feitas = 0;
  for (const [indice, ponta] of pontas.entries()) {
    const { png, largura, altura } = await pngDaPonta(ponta);
    const nome = pontas.length > 1 ? `${ponta.nome.startsWith("Pincel ") ? base : ponta.nome} ${indice + 1}` : ponta.nome.startsWith("Pincel ") ? base : ponta.nome;
    await criarPincel({ nome: nome.slice(0, 80), pasta: "importados", opcoes: { tamanho: Math.max(largura, altura), ponta: "propria", espacamento: 0.25 }, ponta_png: await paraBase64(png) });
    feitas++;
    aoAndar?.(feitas, pontas.length);
  }
  return feitas;
}
