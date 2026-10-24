"use client";

// As fontes do texto do editor de imagem (ADR 0003, onda 13.8): o catálogo da API (/api/fontes), a escolha do arquivo
// pelo peso e pelo itálico, os eixos da fonte variável e a fonte lida pelo fontkit (MIT), que formata o texto (ligaduras,
// kerning, recursos OpenType) e dá os contornos dos glifos. As fontes carregam sob demanda; quem desenha pergunta de novo
// quando a versão (useVersaoDasFontes) muda.
import { create, type Fonte as FonteDoFontkit } from "fontkit";
import { useEffect, useState } from "react";

import { chamarApi } from "../api";
import { adaptarFonte } from "./fontkit";
import type { FonteCarregada } from "./layout";
import type { EstiloDoCaractere, TextoRico } from "./modelo";
import { estiloDe } from "./modelo";

export type EstiloDoCatalogo = { arquivo: string; italico: boolean; eixos: string[]; peso: number };
export type FamiliaDoCatalogo = { id: string; nome: string; categoria: string; licenca: string; estilos: EstiloDoCatalogo[] };

let catalogo: FamiliaDoCatalogo[] | null = null;
let pedidoDoCatalogo: Promise<FamiliaDoCatalogo[]> | null = null;

export function carregarCatalogo(): Promise<FamiliaDoCatalogo[]> {
  if (catalogo) return Promise.resolve(catalogo);
  pedidoDoCatalogo ??= chamarApi<FamiliaDoCatalogo[]>("/fontes").then((lista) => {
    catalogo = lista;
    avisar();
    return lista;
  });
  return pedidoDoCatalogo;
}

/** O catálogo (vazio até chegar). */
export function useCatalogoDeFontes(): FamiliaDoCatalogo[] {
  const [lista, setLista] = useState<FamiliaDoCatalogo[]>(catalogo ?? []);
  useEffect(() => {
    let ativo = true;
    void carregarCatalogo().then((itens) => ativo && setLista(itens));
    return () => {
      ativo = false;
    };
  }, []);
  return lista;
}

// ——— Quem espera as fontes ———

let versao = 0;
const ouvintes = new Set<(versao: number) => void>();
function avisar() {
  versao++;
  for (const ouvinte of ouvintes) ouvinte(versao);
}

/** Um número que muda cada vez que uma fonte (ou o catálogo) chega: quem desenha texto depende dele. */
export function useVersaoDasFontes(): number {
  const [atual, setAtual] = useState(versao);
  useEffect(() => {
    ouvintes.add(setAtual);
    return () => {
      ouvintes.delete(setAtual);
    };
  }, []);
  return atual;
}

// ——— Os arquivos ———

const lidas = new Map<string, FonteDoFontkit>();
const pedidas = new Map<string, Promise<FonteDoFontkit | null>>();

function lerArquivo(arquivo: string): Promise<FonteDoFontkit | null> {
  let pedido = pedidas.get(arquivo);
  if (!pedido) {
    pedido = fetch(`/api/fontes/arquivo/${encodeURIComponent(arquivo)}`)
      .then((resposta) => (resposta.ok ? resposta.arrayBuffer() : Promise.reject(new Error(`A fonte ${arquivo} não carregou.`))))
      .then((dados) => {
        const fonte = create(new Uint8Array(dados));
        lidas.set(arquivo, fonte);
        avisar();
        return fonte;
      })
      .catch(() => null);
    pedidas.set(arquivo, pedido);
  }
  return pedido;
}

/** O arquivo e os eixos de um estilo: o itálico pedido (se a família tem), a variável no peso ou a estática mais perto. */
export function arquivoDoEstilo(estilo: EstiloDoCaractere, familias: FamiliaDoCatalogo[] | null = catalogo): { arquivo: string; eixos: Record<string, number> } | null {
  const familia = familias?.find((item) => item.id === estilo.familia) ?? familias?.[0];
  if (!familia) return null;
  const doItalico = familia.estilos.filter((item) => item.italico === estilo.italico);
  const candidatos = doItalico.length ? doItalico : familia.estilos;
  const variavel = candidatos.find((item) => item.eixos.includes("wght"));
  if (variavel) {
    const eixos: Record<string, number> = { ...estilo.eixos, wght: estilo.peso };
    // Os eixos que o arquivo não tem saem
    for (const tag of Object.keys(eixos)) if (!variavel.eixos.includes(tag)) delete eixos[tag];
    return { arquivo: variavel.arquivo, eixos };
  }
  const maisPerto = [...candidatos].sort((a, b) => Math.abs(a.peso - estilo.peso) - Math.abs(b.peso - estilo.peso))[0];
  return maisPerto ? { arquivo: maisPerto.arquivo, eixos: {} } : null;
}

// ——— A fonte para a disposição ———

const instancias = new Map<string, FonteCarregada>();

/** A fonte de um estilo, se já carregou; senão pede e devolve null (a versão muda quando chegar). */
export function fonteDoEstilo(estilo: EstiloDoCaractere): FonteCarregada | null {
  if (!catalogo) {
    void carregarCatalogo();
    return null;
  }
  const escolha = arquivoDoEstilo(estilo);
  if (!escolha) return null;
  const chave = `${escolha.arquivo}|${JSON.stringify(escolha.eixos)}`;
  const pronta = instancias.get(chave);
  if (pronta) return pronta;
  const fonte = lidas.get(escolha.arquivo);
  if (!fonte) {
    void lerArquivo(escolha.arquivo);
    return null;
  }
  const instancia = adaptarFonte(Object.keys(escolha.eixos).length ? fonte.getVariation(escolha.eixos) : fonte, chave);
  instancias.set(chave, instancia);
  return instancia;
}

/** Espera o catálogo e as fontes de todos os trechos (a exportação, antes de desenhar). */
export async function esperarFontes(textos: TextoRico[]): Promise<void> {
  await carregarCatalogo();
  const arquivos = new Set<string>();
  for (const texto of textos) {
    for (const paragrafo of texto.paragrafos) {
      for (const trecho of paragrafo.trechos) {
        const escolha = arquivoDoEstilo(estiloDe(texto, trecho));
        if (escolha) arquivos.add(escolha.arquivo);
      }
    }
  }
  await Promise.all([...arquivos].map(lerArquivo));
}
