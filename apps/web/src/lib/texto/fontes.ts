"use client";

// As fontes do texto do editor de imagem (ADR 0003, onda 13.8): o catálogo da API (/api/fontes), a escolha do arquivo
// pelo peso e pelo itálico, os eixos da fonte variável e a fonte lida pelo fontkit (MIT), que formata o texto (ligaduras,
// kerning, recursos OpenType) e dá os contornos dos glifos. As fontes carregam sob demanda; quem desenha pergunta de novo
// quando a versão (useVersaoDasFontes) muda.
import { create, type Fonte as FonteDoFontkit } from "fontkit";
import { useEffect, useState } from "react";

import { chamarApi, ErroApi, mensagemPadrao } from "../api";
import { adaptarFonte } from "./fontkit";
import type { FonteCarregada } from "./layout";
import type { EstiloDoCaractere, TextoRico } from "./modelo";
import { estiloDe } from "./modelo";

/** Um arquivo da família; nas fontes do espaço, o id (para excluir) e o nome do estilo. */
export type EstiloDoCatalogo = { arquivo: string; italico: boolean; eixos: string[]; peso: number; id?: string; estilo?: string };
export type FamiliaDoCatalogo = { id: string; nome: string; categoria: string; licenca: string; estilos: EstiloDoCatalogo[] };

let catalogo: FamiliaDoCatalogo[] | null = null;
let pedidoDoCatalogo: Promise<FamiliaDoCatalogo[]> | null = null;

/** O catálogo: as do servidor, as que o espaço enviou e a biblioteca (as do espaço faltam sem sessão). */
export function carregarCatalogo(): Promise<FamiliaDoCatalogo[]> {
  if (catalogo) return Promise.resolve(catalogo);
  pedidoDoCatalogo ??= Promise.all([chamarApi<FamiliaDoCatalogo[]>("/fontes"), chamarApi<FamiliaDoCatalogo[]>("/fontes/espaco").catch(() => [])]).then(([todas, doEspaco]) => {
    const doServidor = todas.filter((familia) => ["inter", "montserrat", "caveat"].includes(familia.id));
    catalogo = [...doServidor, ...doEspaco, ...todas.filter((familia) => !doServidor.includes(familia))];
    avisar();
    return catalogo;
  });
  return pedidoDoCatalogo;
}

/** Pede o catálogo de novo (depois de enviar ou excluir uma fonte do espaço). */
export function recarregarCatalogo(): Promise<FamiliaDoCatalogo[]> {
  catalogo = null;
  pedidoDoCatalogo = null;
  return carregarCatalogo();
}

/** O catálogo (vazio até chegar; muda quando ele é pedido de novo). */
export function useCatalogoDeFontes(): FamiliaDoCatalogo[] {
  useVersaoDasFontes();
  const [, setPronto] = useState(false);
  useEffect(() => {
    let ativo = true;
    void carregarCatalogo().then(() => ativo && setPronto(true));
    return () => {
      ativo = false;
    };
  }, []);
  return catalogo ?? [];
}

/** O endereço do arquivo de uma fonte (as do espaço pedem a sessão). */
export const enderecoDaFonte = (arquivo: string) => (arquivo.startsWith("espaco/") ? `/api/fontes/espaco/arquivo/${encodeURIComponent(arquivo.slice(7))}` : `/api/fontes/arquivo/${encodeURIComponent(arquivo)}`);

/** Envia uma fonte .ttf ou .otf para o espaço; devolve o id da família dela no catálogo. */
export async function enviarFonte(arquivo: File): Promise<string> {
  if (arquivo.size > 10 * 1024 * 1024) throw new ErroApi(413, "O arquivo passa de 10 MB.");
  let resposta: Response;
  try {
    resposta = await fetch(`/api/fontes/espaco?nome=${encodeURIComponent(arquivo.name.slice(0, 200))}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: await arquivo.arrayBuffer(),
      credentials: "same-origin",
    });
  } catch {
    throw new ErroApi(0, "Sem conexão com o servidor. Verifique sua internet.");
  }
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new ErroApi(resposta.status, typeof dados?.detail === "string" ? dados.detail : mensagemPadrao(resposta.status));
  await recarregarCatalogo();
  return (dados as { familia_id: string }).familia_id;
}

/** Exclui as fontes de uma família do espaço (a API recusa a última de uma família em uso). */
export async function excluirFamiliaDoEspaco(familia: FamiliaDoCatalogo): Promise<void> {
  try {
    for (const estilo of familia.estilos) if (estilo.id) await chamarApi(`/fontes/espaco/${estilo.id}`, { metodo: "DELETE" });
  } finally {
    await recarregarCatalogo();
  }
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
    pedido = fetch(enderecoDaFonte(arquivo), { credentials: "same-origin" })
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

/**
 * Os caracteres que a fonte do estilo tem (o painel Glifos), sem os de controle e os espaços; null até o arquivo
 * chegar.
 */
export function caracteresDoEstilo(estilo: EstiloDoCaractere): number[] | null {
  const escolha = arquivoDoEstilo(estilo);
  if (!escolha) return null;
  const fonte = lidas.get(escolha.arquivo);
  if (!fonte) {
    void lerArquivo(escolha.arquivo);
    return null;
  }
  return [...new Set(fonte.characterSet ?? [])].filter((codigo) => codigo > 0x20 && !(codigo >= 0x7f && codigo <= 0xa0) && !(codigo >= 0xd800 && codigo <= 0xdfff) && codigo !== 0xad).sort((a, b) => a - b);
}

export type EixoDaFonte = { tag: string; nome: string; min: number; padrao: number; max: number };

/** Os eixos da fonte variável do estilo, fora o peso (largura, tamanho óptico, inclinação...); vazio até o arquivo chegar. */
export function eixosDoEstilo(estilo: EstiloDoCaractere): EixoDaFonte[] {
  const escolha = arquivoDoEstilo(estilo);
  if (!escolha) return [];
  const fonte = lidas.get(escolha.arquivo);
  if (!fonte) {
    void lerArquivo(escolha.arquivo);
    return [];
  }
  return Object.entries(fonte.variationAxes ?? {})
    .filter(([tag]) => tag !== "wght")
    .map(([tag, eixo]) => ({ tag, nome: eixo.name, min: eixo.min, padrao: eixo.default, max: eixo.max }));
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
